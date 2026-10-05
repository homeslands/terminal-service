import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bang sao luu cho luot backfill user terminal <-> shared-user
 * (`scripts/backfill-shared-user-ids.ts`).
 *
 * Moi lan script GHI DE identity cua mot hang `user_tbl` - retire (SDT rac,
 * xoa sach identity, khoa), doi `root` -> `root-terminal`, go lien ket gia,
 * hoac ghi de cache khi gan vao danh tinh shared - no chep **gia tri cu** cua
 * hang do vao day TRUOC, trong cung transaction.
 *
 * Vi sao can: retire lam y nhu `deleteAccount`, ma `deleteAccount` khong luu
 * gi - lam y het la mat dau SDT/ten cua nguoi bi retire vinh vien. Bang nay
 * la duong dao nguoc tung hang tren production ma khong phai khoi phuc ca
 * dump.
 *
 * Co tinh KHONG dat khoa ngoai sang `user_tbl`: day la nhat ky, phai song
 * sot ke ca khi hang goc doi/xoa ve sau.
 */
export class AddUserRetireBackupTable1786700000100
  implements MigrationInterface
{
  name = 'AddUserRetireBackupTable1786700000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`user_retire_backup_tbl\` (
        \`id_column\` varchar(36) NOT NULL,
        \`run_id_column\` varchar(36) NOT NULL,
        \`action_column\` varchar(32) NOT NULL,
        \`reason_column\` varchar(255) NOT NULL,
        \`user_id_column\` varchar(36) NOT NULL,
        \`user_slug_column\` varchar(255) NULL,
        \`role_column\` varchar(64) NULL,
        \`old_phonenumber_column\` varchar(255) NULL,
        \`old_shared_user_id_column\` varchar(36) NULL,
        \`old_first_name_column\` varchar(255) NULL,
        \`old_last_name_column\` varchar(255) NULL,
        \`old_email_column\` varchar(255) NULL,
        \`old_dob_column\` varchar(255) NULL,
        \`old_dob_day_month_column\` varchar(255) NULL,
        \`old_address_column\` varchar(255) NULL,
        \`old_image_column\` varchar(255) NULL,
        \`old_is_active_column\` tinyint NULL,
        \`created_at_column\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`IDX_user_retire_backup_user_id\` (\`user_id_column\`),
        INDEX \`IDX_user_retire_backup_run_id\` (\`run_id_column\`),
        PRIMARY KEY (\`id_column\`)
      ) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`user_retire_backup_tbl\``);
  }
}
