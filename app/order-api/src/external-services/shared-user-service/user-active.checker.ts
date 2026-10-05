import { Inject, Injectable, Logger } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AuthException } from 'src/auth/auth.exception';
import { AuthValidation } from 'src/auth/auth.validation';
import { User } from 'src/user/user.entity';
import { SharedUserServiceClient } from './shared-user-service.client';
// Dung lai dung helper da co thay vi tu viet lai literal 'default-customer'
// - xem ghi chu "khach vang lai" trong assertActive ben duoi.
import { isDefaultCustomer } from 'src/accumulated-point/accumulated-point.utils';

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

  async assertActive(user: User): Promise<void> {
    const context = `${UserActiveChecker.name}.${this.assertActive.name}`;

    if (!user) throw new AuthException(AuthValidation.USER_NOT_ACTIVE);

    // Khach vang lai: khong phai mot nguoi that, khong co ai de khoa. Bo qua
    // som de khong ton 1 luot goi mang tren dung duong nong nhat cua he
    // thong (moi don ban tai quay deu di qua day).
    //
    // ⚠️ Cho nay doc `user.phonenumber` - mot cot NAM TRONG DIEN SE XOA, vi
    // dich cuoi cua `user_tbl` ben terminal chi con {sharedUserId, role,
    // branch}. Co tinh KHONG tu nghi ra co che nhan dien moi o day: sentinel
    // 'default-customer' hien duoc nhan dien bang `phonenumber` o 15 cho
    // khap terminal (order, payment, auth, voucher, accumulated-point,
    // user.clause, user.scheduler...), nen no phai duoc thiet ke lai MOT
    // LAN cho ca 15 cho o giai doan 2, khong phai va rieng o day. Dung
    // chung helper `isDefaultCustomer` de cho nay di cung mot don vi di doi
    // voi 14 cho kia, thay vi them mot literal roi roi thu 15.
    // Xem danh sach chan day du o progress/terminal-api.md, giai doan 2.
    if (isDefaultCustomer(user.phonenumber)) return;

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
  }
}
