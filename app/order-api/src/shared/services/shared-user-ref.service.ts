import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { User } from 'src/user/user.entity';
import { assertUserKeyLoaded } from 'src/user/user.constant';

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
   * 1. **`slug` rong/`undefined`** - day la lop loi da xay ra that hai lan
   *    (buoc 2.3 `findOneByField`, buoc 2.4 `lookup` the): `findOne({ where: {
   *    slug: undefined } })` lam TypeORM **bo han dieu kien** va tra **hang dau
   *    bang**, tuc `sharedUserId` cua mot nguoi la. "Khong co slug" KHONG phai
   *    dau vao hop le o day nen khong roi ve `IsNull()`.
   * 2. **Khong co hang nao** - ben goi dang chuan bi GHI mot dong so cai mang
   *    khoa nguoi dung; khong biet nguoi do la ai thi khong duoc ghi.
   * 3. **Co hang nhung thieu `sharedUserId`** - `assertUserKeyLoaded` lo ra
   *    ngay (quan he chua nap / `select:` hep tay).
   */
  async toSharedUserId(slug: string): Promise<string> {
    const context = `${SharedUserRefService.name}.${this.toSharedUserId.name}`;

    if (!slug) {
      throw new Error(
        `${context}: slug is empty or undefined. A \`where: { slug: undefined }\` ` +
          `is DROPPED by TypeORM, which then returns the FIRST ROW of the table - ` +
          `that is another person's sharedUserId. "No slug at all" is not valid ` +
          `input here.`,
      );
    }

    const user = await this.userRepository.findOne({
      where: { slug },
      select: ['id', 'slug', 'sharedUserId'],
    });

    if (!user) {
      this.logger.error(`User not found: ${slug}`, null, context);
      throw new Error(
        `${context}: no user carries slug=${slug}. The caller is about to WRITE a ` +
          `ledger row keyed by this user - not knowing who they are means not writing.`,
      );
    }

    return assertUserKeyLoaded(user.sharedUserId, context);
  }
}
