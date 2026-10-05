import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Them cot tham chieu id that cua user ben shared-user (identity service).
 *
 * Doi cung mot nhip voi `trend` (hai migration `v4.0.0-01` / `v4.0.0-02` ben
 * do), nhung gop lam MOT o day: `terminal` khong co giai doan "them cot roi
 * doi mot dot phat hanh moi backfill" - cot sinh ra va duoc backfill trong
 * cung mot lan chay.
 *
 * ### Backfill placeholder = `id_column`, va CHO NAY KHAC `trend`
 *
 * Ben `trend`, backfill nay khop TUYET DOI: `trend_db` va `shared_user_db`
 * tach ra tu cung mot monolith nen giu nguyen khoa chinh, 338/338 hang tra ra
 * dung mot hang co that ben shared-user.
 *
 * `terminal_db` la mot NHANH KHAC cua monolith, khong phai nhanh ma
 * `shared_user_db` duoc tach ra. Do ngay 28/09/2026 tren ban dump vua nap:
 *
 *   terminal_db.user_tbl      183 hang
 *   shared_user_db.user_tbl   137 hang
 *   trung `id_column`          52
 *   trung `phonenumber`        57
 *
 * ⇒ khoang **126 hang** sau backfill se mang mot `shared_user_id` KHONG tra
 * ra danh tinh nao. Day khong phai loi cua migration: cot phai NOT NULL +
 * UNIQUE truoc khi co bat ky duong ghi moi nao, va migration khong duoc goi
 * mang sang service khac. Viec gan lai `sharedUserId` THAT (tra theo
 * `phonenumber`) thuoc ve luot backfill A7-f
 * (`scripts/backfill-shared-user-ids.ts`), phai chay TRUOC khi cho nhan vien
 * dung - xem progress/terminal-api.md muc A7-f.
 *
 * Trong khoang giua, nhung hang do hanh xu dung theo muc 1.7: `JwtStrategy`
 * ra 401, `GET /user/:slug` ra "not found" - KHONG phai 200 kem du lieu cu.
 */
export class AddSharedUserIdForUserEntity1786700000000
  implements MigrationInterface
{
  name = 'AddSharedUserIdForUserEntity1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user_tbl\` ADD \`shared_user_id_column\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_tbl\` ADD UNIQUE INDEX \`IDX_user_tbl_shared_user_id_column\` (\`shared_user_id_column\`)`,
    );
    // Hang duoc tao qua duong tu cap cuc bo (QD19 UserProvisioningService)
    // khong co mat khau cuc bo - password_column khong con la bat buoc.
    await queryRunner.query(
      `ALTER TABLE \`user_tbl\` CHANGE \`password_column\` \`password_column\` varchar(255) NULL`,
    );
    // Backfill placeholder. Dung `id_column` chu khong phai NULL/chuoi rong:
    // cot la UNIQUE nen moi hang phai co mot gia tri KHAC NHAU, va `id_column`
    // la gia tri duy nhat san co thoa dieu kien do. Xem canh bao tren dau tep
    // ve 126 hang khong tra ra danh tinh.
    await queryRunner.query(
      `UPDATE \`user_tbl\` SET \`shared_user_id_column\` = \`id_column\` WHERE \`shared_user_id_column\` IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_tbl\` CHANGE \`shared_user_id_column\` \`shared_user_id_column\` varchar(36) NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Luu y: revert that bai neu co hang nao duoc tao KHONG co mat khau sau
    // khi migration nay chay (hang tu cap qua QD19) - xoa/backfill chung
    // truoc.
    await queryRunner.query(
      `ALTER TABLE \`user_tbl\` CHANGE \`password_column\` \`password_column\` varchar(255) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_tbl\` DROP INDEX \`IDX_user_tbl_shared_user_id_column\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_tbl\` DROP COLUMN \`shared_user_id_column\``,
    );
  }
}
