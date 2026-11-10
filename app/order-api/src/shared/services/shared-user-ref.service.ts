import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { User } from 'src/user/user.entity';
import { assertUserKeyLoaded } from 'src/user/user.constant';
import { UserException } from 'src/user/user.exception';
import { UserValidation } from 'src/user/user.validation';

/**
 * Dich **slug cuc bo** sang `sharedUserId` (buoc 2.11 — nhom 2C, muc 1.10).
 *
 * ## Vi sao can mot service rieng cho mot phep tra
 *
 * Muc 1.10 chot: ben trong `terminal` dung **id cuc bo**, `sharedUserId` chi xuat
 * hien **o bien** - tuc dung luc goi sang `shared-user` hoac ghi vao bang se
 * doi chu o giai doan 8. Phan lon cho goi da cam san ban ghi `user` (da tra vi
 * ly do khac) nen chi can `user.sharedUserId`.
 *
 * Nhung co nhung cho **chi cam mot chuoi slug**, khong co ban ghi - vd
 * `giftCard.usedBySlug`. Chung can mot phep tra, va phep tra do phai o DUNG
 * MOT cho: lam tay o moi cho goi thi moi cho tu quyet dinh "khong tim thay thi
 * sao", va lich su du an nay cho thay cau tra loi hay roi vao "tra rong roi di
 * tiep".
 *
 * ## Chua ai goi o giai doan 2 - CO Y, khong phai sot
 *
 * Buoc 2.12 (C3) lay `sharedUserId` **thang tu ban ghi `user` da tra**, khong
 * qua day. Noi dung dau tien la **giai doan 5** (duong the qua / campaign, noi
 * chi co `usedBySlug`). Ke hoach chot dung som o buoc 2.11 de ba dot 2C/5/7.4
 * dung cung mot phep tra.
 */
@Injectable()
export class SharedUserRefService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
  ) {}

  /**
   * `slug` cuc bo -> `sharedUserId`.
   *
   * NEM o ca ba duong hong, khong duong nao tra rong:
   *
   * 1. **`slug` rong/`undefined`** - `UserException(USER_NOT_FOUND)` ⇒ **400 /
   *    137000**, kem mot dong log muc `error`. Day la lop loi da xay ra that
   *    hai lan (buoc 2.3 `findOneByField`, buoc 2.4 `lookup` the):
   *    `findOne({ where: { slug: undefined } })` lam TypeORM **bo han dieu
   *    kien** va tra **hang dau bang**, tuc `sharedUserId` cua mot nguoi la.
   *    Khach khong gui duoc slug rong (hai DTO deu `@IsNotEmpty()`) nen den
   *    day thuong la ma noi bo truyen thieu - vi vay van **ghi log**, nhung
   *    khong de no roi ra `Error` tran: khong co filter catch-all nao bat
   *    `Error`, no se thanh 500 khong ma loi.
   * 2. **Khong co hang nao** - `UserException(UserValidation.USER_NOT_FOUND)`
   *    ⇒ **400 / 137000 "User not found"**, dung ma san co cua module `user`
   *    (ma nay da dung ~27 cho moi repo, va ca hai UI deu co ban dich
   *    `toast.userNotFound`). Ben goi dang chuan bi GHI mot dong so cai mang
   *    khoa nguoi dung; khong biet nguoi do la ai thi khong duoc ghi.
   * 3. **Co hang nhung thieu `sharedUserId`** - `assertUserKeyLoaded` cung nem
   *    `UserException(USER_NOT_FOUND)` ⇒ **400 / 137000** (doi 09/11/2026),
   *    kem mot dong log muc `error` giu cau chuan doan "quan he chua nap /
   *    `select:` hep tay". Nghia la **ca ba duong hong cua ham nay deu ra
   *    400 / 137000**, khong con duong nao roi ra 500 khong ma loi.
   */
  async toSharedUserId(slug: string): Promise<string> {
    const context = `${SharedUserRefService.name}.${this.toSharedUserId.name}`;

    if (!slug) {
      // Khong co slug thi KHONG duoc di tiep: `findOne({ where: { slug:
      // undefined } })` bi TypeORM bo han dieu kien va tra HANG DAU BANG, tuc
      // `sharedUserId` cua mot nguoi la (lop loi nay da xay ra that hai lan -
      // buoc 2.3 `findOneByField`, buoc 2.4 `lookup` the).
      //
      // Nem cung mot ma voi duong "khong co hang nao": ca hai deu la "khong
      // biet nguoi nay la ai", va mot `Error` tran o day thi **khong ai bat**
      // (khong co filter catch-all) => 500 khong ma loi. Nhung day thuong la
      // loi lap trinh chu khong phai khach gui sai - hai truong slug client
      // gui len deu `@IsNotEmpty()` - nen van ghi log muc `error` de con
      // duong lan ra, thay vi im lang tra 400.
      this.logger.error(
        `${context}: slug is empty or undefined - no client can send that ` +
          `(DTOs are @IsNotEmpty), so this is a bug in the calling code. ` +
          `Returning 400 / 137000 USER_NOT_FOUND instead of reading the FIRST ROW.`,
        null,
        context,
      );
      throw new UserException(UserValidation.USER_NOT_FOUND);
    }

    const user = await this.userRepository.findOne({
      where: { slug },
      select: ['id', 'slug', 'sharedUserId'],
    });

    if (!user) {
      // Chi tiet nam o LOG, khong nam o message tra ve cho client: message cua
      // `AppException` di thang vao body (`HttpExceptionFilter`), nen de nguyen
      // cau mac dinh cua bang ma ("User not found").
      this.logger.error(
        `${context}: no user carries slug=${slug}. The caller is about to WRITE a ` +
          `ledger row keyed by this user - not knowing who they are means not writing. ` +
          `Returning 400 / 137000 USER_NOT_FOUND.`,
        null,
        context,
      );
      throw new UserException(UserValidation.USER_NOT_FOUND);
    }

    return assertUserKeyLoaded(user.sharedUserId, context);
  }
}
