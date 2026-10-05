import { HttpService } from '@nestjs/axios';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { signInternalRequest } from 'src/common/utils/internal-signature.util';
import {
  INTERNAL_LIST_RECENT_MAX_PAGES,
  INTERNAL_LIST_RECENT_PAGE_SIZE,
  INTERNAL_SERVICE_HEADER,
  INTERNAL_SERVICE_NAME,
} from 'src/common/constants/internal-api.constant';

export interface PingResponse {
  from: string;
  message: string;
  receivedAt: string;
}

export interface SharedUserLookupResponse {
  id: string;
  phonenumber: string;
  slug: string;
  // Khoa/mo khoa tai khoan gio quy het ve shared-user (architect-http.md
  // muc 1.1) - terminal khong con giu ban isActive rieng, phai hoi qua day.
  isActive: boolean;
  // Field identity bo sung - dung de ghep vao response cua cac endpoint
  // "can du lieu ca 2 ben" (architect-http.md muc 1.1 quy tac 4), vd
  // GET/POST /user*. Khong co role/branch - shared-user khong tra field do.
  firstName?: string;
  lastName?: string;
  dob?: string;
  email?: string;
  address?: string;
  image?: string;
  isVerifiedEmail?: boolean;
  isVerifiedPhonenumber?: boolean;
  language?: string;
  // QD18 - danh tinh dung chung vs rieng cua mot service:
  //   null      = tai khoan dung chung (khach). terminal duoc tu cap hang cuc
  //               bo voi role Customer mac dinh cua no.
  //   'terminal' = rieng cua terminal - van tu cap duoc.
  //   khac      = nhan vien cua SERVICE KHAC. KHONG duoc tu cap hang cuc bo,
  //               va khong duoc cho dang nhap vao terminal nhu khach.
  // shared-user chi MO TA, quyet dinh nam o day (xem
  // UserProvisioningService.isProvisionable).
  ownerService?: string | null;
  // Ngay dang ky that ben shared-user - nguon duy nhat de ghi vao
  // user.createdAt khi tu tao row lazy cuc bo (KHONG dung gio tao row/gio
  // job chay), xem issuses/sync-user-data-with-role.md muc 6.3.
  createdAt: string;
}

// Chi gui thong tin identity (khong gui branch) - branch la du lieu cua
// terminal, shared_user_db co the da lech branch so voi terminal_db tu luc tach.
//
// KHONG con gui `role` (QD15, giai doan 2 muc A3.2): `terminal` va `shared-user`
// co hai he phan quyen DOC LAP, terminal khong duoc quyet role cua shared-user.
// Ban truoc gui role kem vi tuong shared-user con rang buoc NOT NULL len cot
// role - do la mot hieu nham nam ngay trong ma nguon: cot do luon la
// `varchar(36) NULL`. Nay shared-user tu gan role mac dinh cua chinh no.
//
// Thay vao do la `isShared` (QD18) - co truong tinh, KHONG phai role:
//   true  => owner_service = NULL  (tai khoan dung chung - khach that)
//   false => owner_service = 'terminal' (nhan vien/hang he thong cua terminal)
// Cot dich la cot BAT BIEN, gui sai la khoa cung mot danh tinh vao dung mot
// service VINH VIEN. Xem ghi chu tai UserService.createUser ben terminal - do
// la CHO DUY NHAT terminal dich role cua no thanh co trung tinh nay.
export interface CreateSharedUserRequest {
  phonenumber: string;
  password: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  isVerifiedPhonenumber?: boolean;
  isShared: boolean;
}

// POST /internal/users/import - NHAP MOT LAN nhan vien da co tu truoc o
// terminal_db (scripts/backfill-shared-user-ids.ts). Khac CreateSharedUserRequest:
// gui `passwordHash` (da bam, shared-user ghi nguyen trang - nguoi dung dang
// nhap bang mat khau cu) va giu `isActive`/`createdAt`/`email` cua hang cu.
// Bo trong `passwordHash` => shared-user sinh hash ngau nhien, nguoi do phai
// dat lai mat khau (QD16) moi vao duoc.
export interface ImportSharedUserRequest {
  phonenumber: string;
  passwordHash?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  dob?: string;
  address?: string;
  image?: string;
  isActive: boolean;
  isVerifiedPhonenumber?: boolean;
  isVerifiedEmail?: boolean;
  createdAt?: string;
  isShared: boolean;
}

// Thong diep 409 cua POST /internal/users/import - PHAI GIU GIONG HET ben
// shared-user (UserService: IMPORT_CONFLICT_*). Body loi chi con `message`
// (HttpExceptionFilter cua shared-user bo moi field khac), nen day la cach
// duy nhat phan biet trung SDT voi trung email.
export const IMPORT_CONFLICT_PHONENUMBER = 'Phonenumber already exists';
export const IMPORT_CONFLICT_EMAIL = 'Email already exists';

// Field identity co the sua qua UpdateIdentityRequest - KHONG co role/branch,
// 2 field do khong con thuoc ve shared-user (xem CreateSharedUserRequest).
export interface UpdateSharedUserIdentityRequest {
  phonenumber?: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  email?: string;
  address?: string;
  image?: string;
  language?: string;
}

// Client wrapper goi HTTP noi bo sang shared-user (/internal/*). Cac module
// khac khong tu dung HttpService truc tiep - luon qua wrapper nay.
@Injectable()
export class SharedUserServiceClient {
  /**
   * Dung cho cac ham DOC (lookupById, lookupByPhonenumber, lookupByIds,
   * listRecent): phan biet ro hai thu ma truoc day bi tron lam mot o vai
   * noi goi.
   *
   * - **404** = shared-user tra loi binh thuong, va cau tra loi la "khong co
   *   user nay". Ben goi tu quyet dinh (chan, hay bo qua buoc ghep).
   * - **Moi thu khac** (mat mang, timeout, 5xx, 403 sai chu ky) = shared-user
   *   KHONG tra loi duoc. Day khong phai "khong tim thay", va tuyet doi khong
   *   duoc de ben goi hieu nham thanh vay.
   *
   * Vi sao chuyen thanh `ServiceUnavailableException` ngay tai day thay vi de
   * tung noi goi tu bat: loi axios KHONG phai `HttpException`, ma
   * `HttpExceptionFilter` lai `@Catch(HttpException)` - nen neu de nguyen, no
   * roi xuong bo xu ly mac dinh cua Nest va ra **500 "Internal server error"**.
   * `JwtStrategy` da tu chuyen thanh 503 tu truoc, con `updateUserRole`,
   * `UserActiveChecker` va `updateUserLanguage` thi chua - cung mot nguyen
   * nhan lai ra hai ma khac nhau tuy endpoint. Gom vao day de moi ham doc
   * hanh xu giong nhau, dung sai lech **D9** da ghi giay to (503 khi
   * shared-user khong tra loi).
   *
   * KHONG ap dung cho cac ham GHI (`createUser`, `importUser`,
   * `updateIdentity`, `revertCreatedUser`): ben goi con doc `error.response.status` de phan biet
   * 400/409 (trung SDT) - boc lai se lam hong nhanh do.
   */
  private toReadError(error: unknown): never {
    const status = (error as { response?: { status?: number } })?.response
      ?.status;
    if (status === 404) throw error;
    throw new ServiceUnavailableException();
  }

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  ping(message: string): Promise<PingResponse> {
    return this.post<PingResponse>('internal/test/ping', {
      from: 'terminal',
      message,
    });
  }

  // Tao identity moi ben shared-user (dung khi terminal tao user - vd admin
  // tao nhan vien/khach hang). Nem loi nguyen si tu shared-user (vd trung
  // SDT) de tang goi (UserService.createUser) tu quyet dinh cach bao loi.
  createUser(data: CreateSharedUserRequest): Promise<SharedUserLookupResponse> {
    return this.post<SharedUserLookupResponse>('internal/users', data);
  }

  // Nhap mot nhan vien cu cua terminal sang shared-user - xem
  // ImportSharedUserRequest. La lenh GHI: nem loi nguyen si (409 trung
  // SDT/email) de script tu quyet dinh gan, doi email rac hay bo hang. Bu tru
  // bang `revertCreatedUser` nhu createUser.
  importUser(data: ImportSharedUserRequest): Promise<SharedUserLookupResponse> {
    return this.post<SharedUserLookupResponse>('internal/users/import', data);
  }

  // Bu tru cho createUser (architect-http.md muc 1.2 quy tac 5): goi khi da
  // tao identity thanh cong ben shared-user nhung buoc luu row cuc bo o
  // terminal that bai. Ben shared-user tra lai so dien thoai va tat isActive
  // (khong xoa cung hang) - xem UserService.revertCreatedIdentityById.
  revertCreatedUser(id: string): Promise<SharedUserLookupResponse> {
    return this.post<SharedUserLookupResponse>(
      `internal/users/${id}/revert-create`,
      {},
    );
  }

  // Tra ve null neu shared-user khong co user voi phonenumber nay (404),
  // nem loi cho moi truong hop khac (mang, signature sai, 5xx...).
  //
  // `timeout` cho duong NONG (lop 1b trong getAllUsers - nhan vien dang cho o
  // quay), giong listRecent.
  async lookupByPhonenumber(
    phonenumber: string,
    options?: { timeout?: number },
  ): Promise<SharedUserLookupResponse | null> {
    try {
      return await this.post<SharedUserLookupResponse>(
        'internal/users/lookup',
        {
          phonenumber,
        },
        options?.timeout,
      );
    } catch (error) {
      if (error?.response?.status === 404) return null;
      this.toReadError(error);
    }
  }

  // Dung trong JwtStrategy: payload JWT chi co `sub` (id that ben
  // shared-user), khong co phonenumber, nen phai tra theo id khi phat hien
  // user chua tung xuat hien o terminal_db (lan dau tu dang ky/dang nhap) - xem
  // issuses/sync-user-data-with-role.md.
  async lookupById(id: string): Promise<SharedUserLookupResponse | null> {
    try {
      return await this.post<SharedUserLookupResponse>(
        'internal/users/lookup',
        {
          id,
        },
      );
    } catch (error) {
      if (error?.response?.status === 404) return null;
      this.toReadError(error);
    }
  }

  // Sua identity (KHONG sua role/branch) cho 1 user da co (theo id that ben
  // shared-user) - dung khi terminal can ghi thay doi identity ho user (vd
  // admin sua thong tin nhan vien/khach hang qua PATCH /user/:slug, hoac
  // hoan tat dang ky qua PATCH /user/:slug/complete-registration). Nem loi
  // nguyen si (vd 409 trung SDT) de tang goi tu quyet dinh cach bao loi.
  updateIdentity(
    id: string,
    data: UpdateSharedUserIdentityRequest,
  ): Promise<SharedUserLookupResponse> {
    return this.post<SharedUserLookupResponse>(
      `internal/users/${id}/update-identity`,
      data,
    );
  }

  // Batch cua lookupById - dung khi terminal can ghep identity vao ca 1 trang
  // danh sach user (UserService.getAllUsers), tranh goi lookup N+1 lan
  // theo tung dong. Tra mang rong neu ids rong hoac shared-user khong tra
  // duoc dong nao khop.
  async lookupByIds(ids: string[]): Promise<SharedUserLookupResponse[]> {
    if (!ids.length) return [];
    try {
      return await this.post<SharedUserLookupResponse[]>(
        'internal/users/batch-lookup',
        {
          ids,
        },
      );
    } catch (error) {
      this.toReadError(error);
    }
  }

  // Duong DONG BO USER CHINH giua hai service (QD19 + QD21): luoi nhanh 10
  // phut, luoi rong 48 gio, va sync-on-read trong getAllUsers. Lay user tao
  // trong khoang [createdFrom, createdTo] kem createdAt that.
  //
  // TU PHAN TRANG: cua so 48 gio co the la vai nghin hang sau mot dot su co.
  // Lap cho toi khi tra ve it hon mot trang - va co chan tren so trang de
  // mot loi phia ben kia (luon tra du `limit`) khong thanh vong lap vo tan.
  //
  // `timeout` truyen xuong cho duong NONG (sync-on-read trong getAllUsers):
  // o day nguoi dung dang cho go, 1-2 giay la tran, khong phai 5 giay mac
  // dinh cua cac lenh goi nen.
  async listRecent(
    createdFrom: Date,
    createdTo: Date,
    options?: { timeout?: number; maxPages?: number },
  ): Promise<SharedUserLookupResponse[]> {
    const maxPages = options?.maxPages ?? INTERNAL_LIST_RECENT_MAX_PAGES;
    const all: SharedUserLookupResponse[] = [];
    for (let page = 0; page < maxPages; page++) {
      let batch: SharedUserLookupResponse[];
      try {
        batch = await this.post<SharedUserLookupResponse[]>(
          'internal/users/list-recent',
          {
            createdFrom: createdFrom.toISOString(),
            createdTo: createdTo.toISOString(),
            limit: INTERNAL_LIST_RECENT_PAGE_SIZE,
            offset: page * INTERNAL_LIST_RECENT_PAGE_SIZE,
          },
          options?.timeout,
        );
      } catch (error) {
        this.toReadError(error);
      }
      all.push(...batch);
      if (batch.length < INTERNAL_LIST_RECENT_PAGE_SIZE) return all;
    }
    // Het tran trang ma van con du mot trang. Nem RA NGOAI vong try, de
    // `toReadError` khong nuot mat thong diep - day khong phai loi mang, ma
    // la dau hieu phia shared-user dang tra sai (vd lo `limit`), va nguoi di
    // dieu tra can doc duoc dung cau nay.
    throw new Error(
      `list-recent exceeded ${maxPages} pages for window ${createdFrom.toISOString()}..${createdTo.toISOString()} - shared-user may be ignoring the limit/offset parameters`,
    );
  }

  // QD16 - dat lai mat khau HO mot user, tra theo `id` that ben shared-user.
  // Quyen da duoc kiem o terminal (role cua terminal) truoc khi goi vao day; route
  // noi bo ben kia co tinh KHONG kiem quyen nua.
  //
  // La lenh GHI nen KHONG di qua toReadError: ben goi con doc
  // error.response.status de phan biet 404 (khong co user) voi loi khac.
  resetPassword(id: string): Promise<SharedUserLookupResponse> {
    return this.post<SharedUserLookupResponse>(
      `internal/users/${id}/reset-password`,
      {},
    );
  }

  // QD16 - khoa/mo khoa tai khoan. Truyen gia tri DICH (`isActive`), khong de
  // ben kia tu dao: goi lai hai lan phai ra cung mot ket qua.
  //
  // Trang thai khoa van chi co MOT NGUON THAT la shared_user_db - terminal khong
  // ghi cot nao cua no o duong nay (khac han route toggle-active cu cua terminal,
  // thu da bi xoa vi ghi vao cot isActive cuc bo).
  toggleActive(
    id: string,
    isActive: boolean,
  ): Promise<SharedUserLookupResponse> {
    return this.post<SharedUserLookupResponse>(
      `internal/users/${id}/toggle-active`,
      { isActive },
    );
  }

  // Moi path, ke ca /internal/*, deu mang tien to api/${version} - phai
  // khop chinh xac voi path that su ma InternalApiGuard cua shared-user
  // nhan duoc (request.originalUrl), neu khong chu ky HMAC se sai.
  private async post<T>(
    relativePath: string,
    body: unknown,
    timeoutMs?: number,
  ): Promise<T> {
    const baseUrl =
      this.configService.get<string>('SHARED_USER_API_URL') ||
      'http://localhost:8086';
    const version = this.configService.get<string>('VERSION') || 'v1.0.0';
    const path = `/api/${version}/${relativePath}`;
    const secret = this.configService.get<string>('INTERNAL_API_SECRET');
    const timestamp = Date.now().toString();
    const rawBody = JSON.stringify(body);
    const signature = signInternalRequest(
      secret,
      'POST',
      path,
      rawBody,
      timestamp,
    );

    const { data } = await firstValueFrom(
      this.httpService.post<T>(`${baseUrl}${path}`, body, {
        timeout: timeoutMs ?? 5000,
        headers: {
          'X-Signature': signature,
          'X-Timestamp': timestamp,
          // QD18 - ten service goi. shared-user ghi gia tri nay vao
          // owner_service khi `isShared: false`. Co tinh lay tu header chu
          // khong tu body, de mot service khong khai duoc hang thuoc ve
          // service khac. KHONG nam trong chu ky HMAC - xem ghi chu tai
          // INTERNAL_SERVICE_HEADER.
          [INTERNAL_SERVICE_HEADER]: INTERNAL_SERVICE_NAME,
        },
      }),
    );
    return data;
  }
}
