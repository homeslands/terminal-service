import { MigrationInterface, QueryRunner } from 'typeorm';

// Buoc 7.7d (trend-api.md 7.4(d)) - khoa cua lan giu diem tich luy tren don.
//
// shared-user (buoc 6.7) xac nhan / huy mot giu cho theo KHOA CUA LAN GIU
// (`{ transactionId: K }`, vi tu ghi `K:confirm` / `K:cancel`), nen terminal phai
// nho K tu luc ap diem toi luc job chot don hoac mot trong cac cho huy giu cho
// chay. Cot moi, NULL duoc: don cu va don khong ap diem de NULL.
//
// Chi THEM cot (dot A, quy dinh 1 cua bon quy dinh migration x script
// 14/11/2026). Khong script nao doc/ghi cot nay. Timestamp sau moi migration da
// co cua terminal (TypeORM chay theo timestamp). Chay lai duoc: co cot roi thi bo qua.
const TABLE = 'order_tbl';
const COLUMN = 'points_reservation_key_column';

export class AddPointsReservationKeyForOrderEntity1787300000000
  implements MigrationInterface
{
  name = 'AddPointsReservationKeyForOrderEntity1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn(TABLE, COLUMN)) return;
    await queryRunner.query(
      `ALTER TABLE \`${TABLE}\` ADD \`${COLUMN}\` varchar(191) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn(TABLE, COLUMN))) return;
    await queryRunner.query(
      `ALTER TABLE \`${TABLE}\` DROP COLUMN \`${COLUMN}\``,
    );
  }
}
