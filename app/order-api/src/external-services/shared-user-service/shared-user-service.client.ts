import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { signInternalRequest } from 'src/common/utils/internal-signature.util';
import { SharedUserUnavailableException } from './shared-user-service.exception';
import { UserException } from 'src/user/user.exception';
import { UserValidation } from 'src/user/user.validation';
import {
  INTERNAL_BATCH_LOOKUP_MAX,
  INTERNAL_SEARCH_BY_PHONENUMBER_MAX,
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
  // QD22.c - CHI co o `lookup` / `batch-lookup` (va `user` cua bulk-issue
  // the). Ben goi tu loc khoa BLOCK dang PENDING de chan len don.
  userRequirements?: SharedUserRequirement[];
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

// QD22.c - mot requirement trong `userRequirements` cua lookup user.
export interface SharedUserRequirement {
  slug: string;
  key: string;
  status: string;
  level: string;
  scope: string;
  expiredAt: string | null;
  lastUpdatedAt: string | null;
  createdAt: string;
}

// QD22.c - hop dong the cua /internal/membership-cards/* (du field de ben goi
// tu anh xa ra MembershipCardResponseDto dang dung - muc 1.4).
export interface SharedMembershipCard {
  id: string;
  slug: string;
  code: string;
  userId: string | null;
  isActive: boolean;
  expiredAt: string | null;
  createdAt: string;
}

// QD22.b - `user` du shape lookup de truyen thang vao `ensureLocalUsers`.
// Buoc 7.6 (QD10): mot dong so cai vi cua CHINH service goi, tra bang khoa
// idempotent qua `POST /internal/balance/lookup-transaction` (dung o 6.6).
// `type` = 'in' | 'out'; `balance` = so du ngay sau dong do.
export interface SharedBalanceTransaction {
  transactionId: string;
  userId: string;
  type: string;
  points: number;
  balance: number;
  objectType: string;
  objectId: string;
  objectSlug: string;
  createdAt: string;
}

// Buoc 7.7b/c: body cua `internal/balance/credit` / `debit` (shared-user
// `CreditBalanceRequestDto`). `transactionId` = khoa idempotent
// (`shared/constants/service-ref.constant.ts`). Dong so cai di CUNG lenh nay
// (`objectType` / `objectId` / `objectSlug` / `desc`) - khong con lenh tao
// dong `point_transaction` rieng. `points`: so nguyen >= 1.
export interface SharedBalanceMoveRequest {
  userId: string;
  points: number;
  transactionId: string;
  objectType: string;
  objectId: string;
  objectSlug: string;
  desc?: string;
}

// Hau to khoa cua lenh hoan (`release`) - khop `WALLET_RELEASE_SUFFIX` o
// shared-user (`balance-internal.dto.ts`).
export const WALLET_RELEASE_SUFFIX = ':release';

// Tra loi cua credit / debit / release: so du SAU giao dich (dung luon, khong
// doc lai). `replayed` = khoa da ghi tu truoc, lan nay khong ghi them.
export interface SharedBalanceMove {
  transactionId: string;
  userId: string;
  points: number;
  balance: number;
  replayed: boolean;
  createdAt: string;
}

// Buoc 7.7d: than lenh `add` / `reserve` sang `/internal/accumulated-points/*`
// (shared-user 6.7). `objectSlug` la slug cua don o service nay.
export interface SharedAccumulatedPointMoveRequest {
  userId: string;
  points: number;
  transactionId: string;
  objectType: string;
  objectId: string;
  objectSlug: string;
  // Chi `add`: ti le da dung de tinh `points`, luu kem dong lich su.
  pointsPercentage?: number;
}

// Dong lich su diem shared-user vua ghi. `transactionId` la khoa cua dong:
// khoa gui di voi add / reserve, `<khoa giu>:confirm` / `:cancel` voi hai lenh
// kia. `replayed` = khoa da ghi tu truoc, lan nay khong doi gi.
export interface SharedAccumulatedPointMove {
  transactionId: string;
  userId: string;
  type: string;
  status: string;
  points: number;
  totalPoints: number;
  objectType: string | null;
  objectId: string | null;
  objectSlug: string | null;
  expiresAt: string | null;
  replayed: boolean;
  createdAt: string;
}

// Buoc 7.7d: bo loc cua nhom route "xem ho" (`/internal/point-transactions/*`).
export type SharedPointTransactionViewRequest = Record<string, unknown>;

export interface SharedMembershipCardIssued {
  cardId: string;
  code: string;
  userId: string;
  user: SharedUserLookupResponse;
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
   * Vi sao chuyen thanh `SharedUserUnavailableException` ngay tai day thay vi
   * de tung noi goi tu bat: loi axios KHONG phai `HttpException`, ma
   * `HttpExceptionFilter` lai `@Catch(HttpException)` - nen neu de nguyen, no
   * roi xuong bo xu ly mac dinh cua Nest va ra **500 "Internal server error"**.
   * `JwtStrategy` da tu chuyen thanh 503 tu truoc, con `updateUserRole`,
   * `UserActiveChecker` va `updateUserLanguage` thi chua - cung mot nguyen
   * nhan lai ra hai ma khac nhau tuy endpoint. Gom vao day de moi ham doc
   * hanh xu giong nhau, dung sai lech **D9** da ghi giay to (503 khi
   * shared-user khong tra loi). Tu buoc 2.4: HTTP van 503, body mang ma
   * nghiep vu **162001** `SHARED_USER_UNAVAILABLE` de UI dich duoc.
   *
   * Ghi log NGUYEN NHAN GOC o day (path, status, ma loi mang): exception moi
   * khong mang loi axios theo, va nhieu noi goi khong tu bat - thieu dong nay
   * thi `shared-user` sap ma `terminal` chi tra 503, khong de lai dau vet nao.
   *
   * KHONG ap dung cho cac ham GHI (`createUser`, `importUser`,
   * `updateIdentity`, `revertCreatedUser`): ben goi con doc `error.response.status` de phan biet
   * 400/409 (trung SDT) - boc lai se lam hong nhanh do.
   */
  private toReadError(error: unknown): never {
    const err = error as {
      response?: { status?: number };
      config?: { url?: string };
      code?: string;
      message?: string;
    };
    const status = err?.response?.status;
    if (status === 404) throw error;
    this.logger.error(
      `shared-user read failed: url=${err?.config?.url ?? '-'} status=${status ?? '-'} code=${err?.code ?? '-'} ${err?.message ?? ''}`,
    );
    throw new SharedUserUnavailableException();
  }

  private readonly logger = new Logger(SharedUserServiceClient.name);

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

  // QD4 (buoc 7.1) - mang `id` cua moi nguoi co SDT CHUA chuoi `fragment`
  // (khop chuoi con o shared-user), de loc `sharedUserId IN (...)` thay cho
  // `Like` tren cot SDT cuc bo (cot nay bi drop o giai doan 8).
  //
  // CHI DE LOC danh sach - khong dung thay `lookupByPhonenumber` (khop
  // tuyet doi) o duong ghi nao.
  //
  // - Vuot tran => shared-user tra 400 ma 137007; nem lai
  //   `PHONENUMBER_SEARCH_TOO_BROAD` (400, cung ma) de UI bao "tim hep lai",
  //   khong bao "khong co du lieu".
  // - Loi khac (mang, 5xx, chu ky) => 503 qua `toReadError` (fail-closed: day
  //   la bo loc chinh cua response, roi ve cot cuc bo la sai lech D9).
  async searchIdsByPhonenumber(fragment: string): Promise<string[]> {
    try {
      return await this.post<string[]>('internal/users/search-by-phonenumber', {
        phonenumber: fragment,
        limit: INTERNAL_SEARCH_BY_PHONENUMBER_MAX,
      });
    } catch (error) {
      const response = (
        error as {
          response?: { status?: number; data?: { statusCode?: number } };
        }
      )?.response;
      if (
        response?.status === 400 &&
        response?.data?.statusCode ===
          UserValidation.PHONENUMBER_SEARCH_TOO_BROAD.code
      ) {
        throw new UserException(UserValidation.PHONENUMBER_SEARCH_TOO_BROAD);
      }
      this.toReadError(error);
    }
  }

  // Batch cua lookupById - dung khi terminal can ghep identity vao ca 1 trang
  // danh sach user (UserService.getAllUsers), tranh goi lookup N+1 lan
  // theo tung dong. Tra mang rong neu ids rong hoac shared-user khong tra
  // duoc dong nao khop.
  //
  // A4 - shared-user tu choi (400) lo vuot INTERNAL_BATCH_LOOKUP_MAX, nen o
  // day tu chia lo theo dung hang so do roi gop ket qua. Goi TUAN TU de mot
  // trang lon khong ban nhieu lo cung luc vao shared-user. Mot lo hong thi ca
  // lan goi hong (fail-closed nhu truoc) - khong tra nua danh sach.
  async lookupByIds(ids: string[]): Promise<SharedUserLookupResponse[]> {
    if (!ids.length) return [];
    const all: SharedUserLookupResponse[] = [];
    for (let i = 0; i < ids.length; i += INTERNAL_BATCH_LOOKUP_MAX) {
      let batch: SharedUserLookupResponse[];
      try {
        batch = await this.post<SharedUserLookupResponse[]>(
          'internal/users/batch-lookup',
          {
            ids: ids.slice(i, i + INTERNAL_BATCH_LOOKUP_MAX),
          },
        );
      } catch (error) {
        this.toReadError(error);
      }
      all.push(...batch);
    }
    return all;
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

  // ==========================================================================
  // QD22 (buoc 2.4) - /internal/membership-cards/*. CHUA AI GOI: buoc 2.5 moi
  // doi nguon the + requirement sang day. Quyen phat/khoa/thay the kiem o
  // service nay (role cua no) truoc khi goi - ben kia khong kiem quyen nua.
  // Lenh GHI khong qua toReadError: ben goi doc error.response.status de bao
  // loi dung (vd trung ma the).
  // ==========================================================================

  bulkIssueMembershipCards(
    codes: string[],
    expiredAt?: Date | string | null,
  ): Promise<SharedMembershipCardIssued[]> {
    return this.post<SharedMembershipCardIssued[]>(
      'internal/membership-cards/bulk-issue',
      { codes, expiredAt: expiredAt ?? undefined },
    );
  }

  assignMembershipCard(data: {
    userId: string;
    code: string;
    expiredAt?: Date | string | null;
  }): Promise<SharedMembershipCard> {
    return this.post<SharedMembershipCard>('internal/membership-cards', {
      ...data,
      expiredAt: data.expiredAt ?? undefined,
    });
  }

  // Doc: 404 = "khong co the nay" => null. Moi loi khac => 503 (toReadError).
  // Khoa rong (vd quet RFID ra chuoi rong) = "khong co the nao" => null ngay,
  // khong goi: shared-user tra 400 cho khoa rong, va 400 o day se bi doc
  // thanh 503 - sai nghia.
  async lookupMembershipCardByCode(
    code: string,
  ): Promise<SharedMembershipCard | null> {
    if (!code) return null;
    try {
      return await this.post<SharedMembershipCard>(
        'internal/membership-cards/lookup',
        { code },
      );
    } catch (error) {
      if (error?.response?.status === 404) return null;
      this.toReadError(error);
    }
  }

  async lookupMembershipCardByUserId(
    userId: string,
  ): Promise<SharedMembershipCard | null> {
    if (!userId) return null;
    try {
      return await this.post<SharedMembershipCard>(
        'internal/membership-cards/lookup',
        { userId },
      );
    } catch (error) {
      if (error?.response?.status === 404) return null;
      this.toReadError(error);
    }
  }

  // Ghep field `membershipCard` cho ca mot trang - chia lo theo cung tran
  // INTERNAL_BATCH_LOOKUP_MAX nhu lookupByIds. Nguoi khong co the thi vang mat.
  async lookupMembershipCardsByUserIds(
    userIds: string[],
  ): Promise<SharedMembershipCard[]> {
    if (!userIds.length) return [];
    const all: SharedMembershipCard[] = [];
    for (let i = 0; i < userIds.length; i += INTERNAL_BATCH_LOOKUP_MAX) {
      let batch: SharedMembershipCard[];
      try {
        batch = await this.post<SharedMembershipCard[]>(
          'internal/membership-cards/lookup',
          { userIds: userIds.slice(i, i + INTERNAL_BATCH_LOOKUP_MAX) },
        );
      } catch (error) {
        this.toReadError(error);
      }
      all.push(...batch);
    }
    return all;
  }

  // Truyen trang thai DICH, khong de ben kia tu dao.
  setMembershipCardActive(
    id: string,
    isActive: boolean,
  ): Promise<SharedMembershipCard> {
    return this.post<SharedMembershipCard>(
      `internal/membership-cards/${id}/toggle-active`,
      { isActive },
    );
  }

  replaceMembershipCard(data: {
    userId: string;
    code: string;
    expiredAt?: Date | string | null;
  }): Promise<SharedMembershipCard> {
    return this.post<SharedMembershipCard>(
      'internal/membership-cards/replace',
      { ...data, expiredAt: data.expiredAt ?? undefined },
    );
  }

  removeMembershipCard(id: string): Promise<SharedMembershipCard> {
    return this.post<SharedMembershipCard>(
      `internal/membership-cards/${id}/remove`,
      {},
    );
  }

  // Buoc 7.7a (trend-api.md 7.4(a)): so du xu cua MOT nguoi o vi shared-user.
  // Nguoi chua co hang vi => 0 (shared-user tu tra 0). 404 = shared-user
  // khong co user nay => `null`, ben goi tu quyet. Loi khac => 503/162001
  // (`toReadError`) - KHONG duoc hieu thanh "so du 0".
  async lookupBalancePoints(userId: string): Promise<number | null> {
    try {
      const { points } = await this.post<{ userId: string; points: number }>(
        'internal/balance/lookup',
        { userId },
      );
      return Number(points);
    } catch (error) {
      if (
        (error as { response?: { status?: number } })?.response?.status === 404
      ) {
        return null;
      }
      this.toReadError(error);
    }
  }

  // Buoc 7.7b (trend-api.md 7.4(b)): cong xu vao vi shared-user, idempotent
  // theo `transactionId` (goi lai cung khoa => `replayed`, khong cong them).
  // Hong hai lan => phan dinh bang lookup-transaction (`postMoney`). 4xx (sai
  // body, user la, khoa da dung cho giao dich khac - 409) nem nguyen loi
  // axios: loi lap trinh, goi lai van hong.
  creditBalance(body: SharedBalanceMoveRequest): Promise<SharedBalanceMove> {
    return this.postMoney<SharedBalanceMove>(
      'internal/balance/credit',
      body,
      (transaction) => this.moveFromLedger(transaction),
    );
  }

  // Buoc 7.7c (trend-api.md 7.4(c), QD9): tru xu MOT nhip o vi shared-user,
  // idempotent theo `transactionId` (`<service>:<orderSlug>:debit`). Thieu xu
  // => shared-user tra 400/158205 (chan am o tang DB), nem nguyen loi axios.
  debitBalance(body: SharedBalanceMoveRequest): Promise<SharedBalanceMove> {
    return this.postMoney<SharedBalanceMove>(
      'internal/balance/debit',
      body,
      (transaction) => this.moveFromLedger(transaction),
    );
  }

  // Buoc 7.7c (Z-7): tra lai mot lan tru (`<khoa debit>` => dong cong
  // `<khoa debit>:release`, idempotent: hoan hai lan chi tra mot lan). Hong
  // hai lan => tra so cai bang khoa `:release` (KHONG phai khoa debit - dong
  // debit luon co san).
  releaseBalance(debitTransactionId: string): Promise<SharedBalanceMove> {
    return this.postMoney<SharedBalanceMove>(
      'internal/balance/release',
      { transactionId: debitTransactionId },
      (transaction) => this.moveFromLedger(transaction),
      `${debitTransactionId}${WALLET_RELEASE_SUFFIX}`,
    );
  }

  // Buoc 7.7c: lan tru mang khoa nay da bi hoan (Z-7) chua. Khoa da hoan thi
  // `debit` cung khoa chi con tra `replayed` - khong tru them - nen ben goi
  // KHONG duoc coi do la "da tra". shared-user khong tra loi => 503.
  async isDebitReleased(debitTransactionId: string): Promise<boolean> {
    return (
      (await this.lookupBalanceTransaction(
        `${debitTransactionId}${WALLET_RELEASE_SUFFIX}`,
      )) !== null
    );
  }

  // Buoc 7.7d (trend-api.md 7.4(d)): so diem tich luy tieu duoc ngay cua MOT
  // nguoi (giu cho da tru san). Nguoi chua co hang diem => 0. 404 => `null`.
  // Loi khac => 503/162001 - KHONG duoc hieu thanh "0 diem".
  async lookupAccumulatedPoints(userId: string): Promise<number | null> {
    try {
      const { points } = await this.post<{ userId: string; points: number }>(
        'internal/accumulated-points/lookup',
        { userId },
      );
      return Number(points);
    } catch (error) {
      if (
        (error as { response?: { status?: number } })?.response?.status === 404
      ) {
        return null;
      }
      this.toReadError(error);
    }
  }

  // Buoc 7.7d: bon lenh GHI diem qua `postMoney` (goi lai mot lan; 4xx nem
  // nguyen loi axios). shared-user chua co lookup theo khoa cho diem => hong
  // hai lan la 503 "khong biet" (7.6); goi lai cung khoa sau do la `replayed`.
  addAccumulatedPoints(
    body: SharedAccumulatedPointMoveRequest,
  ): Promise<SharedAccumulatedPointMove> {
    return this.postMoney<SharedAccumulatedPointMove>(
      'internal/accumulated-points/add',
      body,
    );
  }

  // Khoa MOI moi lan giu (`<service>:<orderSlug>:reserve:<seq>`). Khong gui
  // `expiresAt` => shared-user dat 30 phut (QD11, gap doi 15 phut service tu
  // xoa don PENDING).
  reserveAccumulatedPoints(
    body: SharedAccumulatedPointMoveRequest,
  ): Promise<SharedAccumulatedPointMove> {
    return this.postMoney<SharedAccumulatedPointMove>(
      'internal/accumulated-points/reserve',
      body,
    );
  }

  // Hai lenh duoi nhan KHOA CUA LAN GIU; vi tu ghi `<khoa>:confirm` /
  // `<khoa>:cancel` (lam hai lan = mot lan). 409 = giu cho khong con mo.
  confirmAccumulatedPointsReservation(
    reservationKey: string,
  ): Promise<SharedAccumulatedPointMove> {
    return this.postMoney<SharedAccumulatedPointMove>(
      'internal/accumulated-points/confirm',
      { transactionId: reservationKey },
    );
  }

  cancelAccumulatedPointsReservation(
    reservationKey: string,
  ): Promise<SharedAccumulatedPointMove> {
    return this.postMoney<SharedAccumulatedPointMove>(
      'internal/accumulated-points/cancel-reservation',
      { transactionId: reservationKey },
    );
  }

  // Buoc 7.7d (QD17): nhom route "xem ho" doc tu shared-user SAU KHI service
  // nay da kiem role (`@HasRoles`). Co `userId` => cua mot nguoi; khong co =>
  // moi giao dich cua service nay (QD-T5). 400 cua shared-user (vd export qua
  // so dong) => 400 kem cau cua no; loi khac => 503/162001.
  queryPointTransactions<T>(
    body: SharedPointTransactionViewRequest,
  ): Promise<T> {
    return this.readView<T>('internal/point-transactions/query', body);
  }

  analyzePointTransactions<T>(
    body: SharedPointTransactionViewRequest,
  ): Promise<T> {
    return this.readView<T>('internal/point-transactions/analysis', body);
  }

  // `{ items, total }`, cu nhat truoc; ben goi dung file. Cham hon => 30 giay.
  exportPointTransactions<T>(
    body: SharedPointTransactionViewRequest,
  ): Promise<T> {
    return this.readView<T>('internal/point-transactions/export', body, 30000);
  }

  // So du lon nhat / nho nhat toan vi (man chinh sach xu).
  analyzeBalances<T>(): Promise<T> {
    return this.readView<T>('internal/balance/analysis', {});
  }

  private async readView<T>(
    relativePath: string,
    body: unknown,
    timeoutMs?: number,
  ): Promise<T> {
    try {
      return await this.post<T>(relativePath, body, timeoutMs);
    } catch (error) {
      const response = (
        error as {
          response?: { status?: number; data?: { message?: string } };
        }
      )?.response;
      if (response?.status === 400) {
        throw new BadRequestException(response.data?.message ?? 'Bad request');
      }
      this.toReadError(error);
    }
  }

  // Dong so cai tim thay sau hai lan hong => tra loi nhu mot lan `replayed`.
  private moveFromLedger(
    transaction: SharedBalanceTransaction,
  ): SharedBalanceMove {
    return {
      transactionId: transaction.transactionId,
      userId: transaction.userId,
      points: transaction.points,
      balance: transaction.balance,
      replayed: true,
      createdAt: transaction.createdAt,
    };
  }

  // Buoc 7.6 (QD10): dong so cai vi da ghi duoi khoa `transactionId`, hoac
  // `null` khi chua co (404). shared-user chi tra loi khoa cua CHINH service
  // goi - khoa mang tien to service khac cung ra 404. Moi loi khac => 503
  // (`toReadError`). Dung trong `postMoney`; doi soat Z-8 (GD9) dung lai.
  async lookupBalanceTransaction(
    transactionId: string,
  ): Promise<SharedBalanceTransaction | null> {
    try {
      return await this.post<SharedBalanceTransaction>(
        'internal/balance/lookup-transaction',
        { transactionId },
      );
    } catch (error) {
      if (
        (error as { response?: { status?: number } })?.response?.status === 404
      ) {
        return null;
      }
      this.toReadError(error);
    }
  }

  /**
   * Buoc 7.6 (QD10) - lenh GHI tien / diem sang shared-user. CHUA AI GOI: buoc
   * 7.7 doi tung cho goi vi / diem sang day.
   *
   * - Goi lai **dung mot lan** khi shared-user khong tra loi duoc: timeout,
   *   mat mang (loi khong co `response`), hoac 5xx. Body giu nguyen => cung
   *   khoa idempotent => lan goi lai vo hai (lan dau da ghi thi shared-user
   *   tra `replayed: true`, khong ghi them). `post` ky HMAC lai voi timestamp
   *   moi.
   * - **Khong** goi lai 4xx: loi cua chinh request (thieu xu, sai khoa, sai
   *   chu ky...), goi lai van hong. Nem nguyen loi axios - ben goi doc
   *   `response.status` / `message` nhu moi ham GHI khac.
   * - **Giu `timeout: 5000`** (mac dinh cua `post`): rut ngan chi de ra them
   *   trang thai "da ghi hay chua?", ma mo ho ve tien dat hon cham ve tien.
   * - Hong lan hai:
   *   - co `fromLedger` (route vi `internal/balance/*`): hoi
   *     `lookup-transaction` bang CHINH khoa de **phan dinh**:
   *     - thay dong so cai => lenh DA GHI => tra `fromLedger(dong do)`;
   *     - 404 => CHUA ghi => nem 503 (162001). Neu lenh dau van dang chay va
   *       ghi muon hon, lan goi lai sau (job.recovery, doi soat Z-8) cung khoa
   *       se thanh `replayed` - khong ghi hai lan;
   *     - lookup cung hong => KHONG BIET => log loi kem khoa, nem 503.
   *   - khong co `fromLedger` (route diem - shared-user chua co lookup theo
   *     khoa cho diem): nem 503, ben goi coi nhu "khong biet".
   *
   * Quyet dinh nghiep vu sau do (chan chot don, bu tru Z-7...) la cua ben goi
   * theo chinh sach 7.3 (QD6/QD7/QD8), khong nam o day.
   */
  private async postMoney<T>(
    relativePath: string,
    body: { transactionId: string },
    fromLedger?: (transaction: SharedBalanceTransaction) => T,
    // Buoc 7.7c: khoa cua DONG SO CAI ma lenh nay ghi - mac dinh la
    // `transactionId`; `release` ghi duoi `<khoa debit>:release`.
    ledgerKey: string = body.transactionId,
  ): Promise<T> {
    const key = body.transactionId;
    const describe = (error: unknown): string => {
      const err = error as {
        response?: { status?: number };
        code?: string;
        message?: string;
      };
      return `status=${err?.response?.status ?? '-'} code=${err?.code ?? '-'} ${err?.message ?? ''}`;
    };

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await this.post<T>(relativePath, body);
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response
          ?.status;
        // Co response va < 500 => 4xx: loi cua request, khong goi lai.
        // Buoc 7.7b: ghi lai kem khoa truoc khi nem (4xx cua lenh tien la
        // dau vet doi soat; vd 409 = khoa da dung cho giao dich khac).
        if (status !== undefined && status < 500) {
          this.logger.warn(
            `shared-user money write refused (not retried): path=${relativePath} key=${key} ${describe(error)}`,
          );
          throw error;
        }
        // Khong response (timeout ECONNABORTED, ECONNREFUSED, ECONNRESET...)
        // hoac 5xx => shared-user khong tra loi duoc => goi lai mot lan.
        this.logger.warn(
          `shared-user money write attempt ${attempt}/2 failed: path=${relativePath} key=${key} ${describe(error)}`,
        );
      }
    }

    if (!fromLedger) {
      this.logger.error(
        `shared-user money write failed twice, no lookup by key for this route - outcome UNKNOWN: path=${relativePath} key=${key}`,
      );
      throw new SharedUserUnavailableException();
    }

    let transaction: SharedBalanceTransaction | null;
    try {
      transaction = await this.lookupBalanceTransaction(ledgerKey);
    } catch (error) {
      this.logger.error(
        `shared-user money write failed twice and lookup-transaction failed too - outcome UNKNOWN, reconcile by key: path=${relativePath} key=${key} ledgerKey=${ledgerKey} ${describe(error)}`,
      );
      throw new SharedUserUnavailableException();
    }
    if (!transaction) {
      this.logger.error(
        `shared-user money write failed twice, lookup-transaction says NOT written yet (a write held up at shared-user can still land after this lookup - reconcile by key): path=${relativePath} key=${key} ledgerKey=${ledgerKey}`,
      );
      throw new SharedUserUnavailableException();
    }
    this.logger.warn(
      `shared-user money write failed twice but lookup-transaction found it WRITTEN: path=${relativePath} key=${key} balance=${transaction.balance}`,
    );
    return fromLedger(transaction);
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
