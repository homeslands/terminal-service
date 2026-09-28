import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateUserRequirementDataForExistedUser1768623046945
  implements MigrationInterface
{
  name = 'MigrateUserRequirementDataForExistedUser1768623046945';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
          INSERT INTO user_requirement_tbl (
            id_column,
            slug_column,
            key_column,
            level_column,
            status_column,
            scope_column,
            user_column,
            created_at_column,
            updated_at_column
          )
          SELECT
            UUID(),
            LEFT(REPLACE(UUID(), '-', ''), 10),
            'NEED-UPDATE-PASSWORD',
            'block',
            'completed',
            'initial',
            u.id_column,
            NOW(),
            NOW()
          FROM user_tbl u
          WHERE NOT EXISTS (
            SELECT 1
            FROM user_requirement_tbl ur
            WHERE ur.user_column = u.id_column
              AND ur.key_column = 'NEED-UPDATE-PASSWORD'
          );
        `);

    await queryRunner.query(`
          INSERT INTO user_requirement_tbl (
            id_column,
            slug_column,
            key_column,
            level_column,
            status_column,
            scope_column,
            user_column,
            created_at_column,
            updated_at_column
          )
          SELECT
            UUID(),
            LEFT(REPLACE(UUID(), '-', ''), 10),
            'NEED-UPDATE-PHONE-NUMBER',
            'block',
            'completed',
            'initial',
            u.id_column,
            NOW(),
            NOW()
          FROM user_tbl u
          WHERE NOT EXISTS (
            SELECT 1
            FROM user_requirement_tbl ur
            WHERE ur.user_column = u.id_column
              AND ur.key_column = 'NEED-UPDATE-PHONE-NUMBER'
          );
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
          DELETE FROM user_requirement_tbl
          WHERE key_column = 'NEED-UPDATE-PASSWORD'
      `);
    await queryRunner.query(`
          DELETE FROM user_requirement_tbl
          WHERE key_column = 'NEED-UPDATE-PHONE-NUMBER'
      `);
  }
}
