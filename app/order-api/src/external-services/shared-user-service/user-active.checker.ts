import { Inject, Injectable, Logger } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AuthException } from 'src/auth/auth.exception';
import { AuthValidation } from 'src/auth/auth.validation';
import { User } from 'src/user/user.entity';
import {
  SharedUserLookupResponse,
  SharedUserServiceClient,
} from './shared-user-service.client';
// Dung lai dung helper da co thay vi tu viet lai phep nhan dien sentinel
// - xem ghi chu "khach vang lai" trong assertActive ben duoi.
import { isDefaultCustomer } from 'src/user/user.constant';

/**
 * Thay cho ham `checkActiveUser` cu (`src/auth/auth.utils.ts`), von doc cot
 * `is_active_column` cuc bo cua terminal.
 *
 * Vi sao phai doi: tu dot "khoa tai khoan quy han ve shared-user"
 * (architect-http.md muc 1.1), khoa/mo khoa chi con ghi o shared-user. Cot
 * cuc bo ben terminal khong con ai ghi vao nua - no la anh chup dong bang tai
 * thoi diem tach DB, va se lech dan ma khong co gi bao.
 *
 * Cho nay kiem NGUOI THU BA (chu don, khach cua don the), khong phai nguoi
 * goi - nen `JwtStrategy` (chi kiem nguoi goi) khong phu duoc: thu ngan len
 * don hoac thanh toan ho mot khach dang bi khoa van qua.
 *
 * Chinh sach loi:
 * - shared-user noi `isActive = false` -> chan.
 * - khong tra cuu duoc identity -> chan (fail-closed), va bao dung
 *   `USER_NOT_FOUND` chu khong phai `USER_NOT_ACTIVE`.
 * - loi mang -> nem nguyen (503). Khong mua them tinh san sang bang cach
 *   nuot loi: `JwtStrategy` da goi shared-user tren MOI request co auth roi,
 *   nen shared-user chet thi request khong di toi duoc day.
 *
 * ⚠️ **KHAC `trend` ve DU LIEU XUAT PHAT - doc truoc khi dieu tra mot ca
 * "khach bi chan oan".** Ben `trend`, 338/338 hang cua `trend_db.user_tbl`
 * deu tra ra mot hang co that ben `shared_user_db` (hai DB tach ra tu cung
 * mot nguon nen giu nguyen khoa chinh), nen fail-closed khong chan oan ai.
 * `terminal_db` KHONG o tinh trang do: do ngay 28/09/2026 tren ban dump vua
 * nap, `terminal_db.user_tbl` co **183 hang**, `shared_user_db.user_tbl` co
 * **137 hang**, trung `id_column` **52**, trung `phonenumber` **57** - tuc
 * **~126 hang cuc bo chua co danh tinh nao ben shared-user**. Voi nhung hang
 * do, ham nay se nem `USER_NOT_FOUND` (dung) cho toi khi luot backfill A7-f
 * gan duoc `sharedUserId` that, hoac danh tinh cua ho duoc tao ben
 * shared-user. Xem `progress/terminal-api.md` muc A7-f.
 */
@Injectable()
export class UserActiveChecker {
  constructor(
    private readonly sharedUserServiceClient: SharedUserServiceClient,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
  ) {}

  /**
   * Tra ve chinh `lookup` da goi (QD22, buoc 2.5) de ben goi dung tiep cho
   * `checkUserRequirement` - requirement nay o shared-user, va day la luot
   * goi duy nhat tren duong nong. `null` = khach vang lai: khong co danh tinh
   * ben shared-user, cung khong co requirement nao de kiem.
   */
  async assertActive(user: User): Promise<SharedUserLookupResponse | null> {
    const context = `${UserActiveChecker.name}.${this.assertActive.name}`;

    if (!user) throw new AuthException(AuthValidation.USER_NOT_ACTIVE);

    // Khach vang lai: khong phai mot nguoi that, khong co ai de khoa. Bo qua
    // som de khong ton 1 luot goi mang tren dung duong nong nhat cua he
    // thong (moi don ban tai quay deu di qua day).
    //
    // Tu buoc 2.6 cho nay doc `user.sharedUserId`, KHONG con doc
    // `phonenumber`: cot do nam trong dien se xoa, vi dich cuoi cua
    // `user_tbl` ben terminal chi con {sharedUserId, role, branch}. Ghi chu cu
    // o day noi "phai thiet ke lai MOT LAN cho ca 15 cho" - do la viec cua 2B2
    // (buoc 2.6 doi hang so + helper, 2.7 nam phep so con lai + hai cho tra
    // sentinel, 2.9 xoa `initDefaultCustomer`; terminal khong co buoc 2.8),
    // nen cho nay di cung mot don vi di doi voi nhung cho kia.
    //
    // `isDefaultCustomer` NEM LOI khi ban ghi khong mang `sharedUserId`: nguoi
    // goi `select` thieu cot thi vo o day, khong phai lang le coi khach vang
    // lai la nguoi that roi di goi `lookup` bang `undefined`.
    // Xem danh sach chan day du o progress/terminal-api.md, giai doan 2.
    if (isDefaultCustomer(user)) return null;

    const identity = await this.sharedUserServiceClient.lookupById(
      user.sharedUserId,
    );

    // shared-user tra 404 = KHONG CO danh tinh nay. Phai bao dung la
    // "not found", khong duoc bao thanh "tai khoan bi khoa": hai nguyen nhan
    // khac han nhau, va bao sai thi nguoi doc log/nguoi dung di sai huong
    // (di mo khoa mot tai khoan von khong ton tai).
    if (!identity) {
      this.logger.warn(
        `No shared-user identity for sharedUserId ${user.sharedUserId} (local user ${user.id})`,
        context,
      );
      throw new AuthException(AuthValidation.USER_NOT_FOUND);
    }

    if (!identity.isActive) {
      throw new AuthException(AuthValidation.USER_NOT_ACTIVE);
    }

    return identity;
  }
}
