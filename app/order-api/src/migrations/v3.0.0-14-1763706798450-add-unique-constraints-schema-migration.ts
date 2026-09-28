/* eslint-disable prettier/prettier */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueConstraintsSchemaMigration1763706798450
    implements MigrationInterface {
    private readonly CARD_TABLE = 'card_tbl';
    private readonly CARD_ORDER_TABLE = 'card_order_tbl';
    private readonly TEMP_DUPLICATE_CARD_TABLE = 'temp_duplicate_card_tbl';
    name = 'AddUniqueConstraintsSchemaMigration1763706798450';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const createTmpTableQuery = `
            CREATE TABLE IF NOT EXISTS ${this.TEMP_DUPLICATE_CARD_TABLE} LIKE ${this.CARD_TABLE}
        `;
        const truncateTmpTableQuery = `
            TRUNCATE TABLE ${this.TEMP_DUPLICATE_CARD_TABLE}
        `;
        const selectDistinctPointQuery = `
            SELECT points_column, MIN(created_at_column) AS first_created FROM ${this.CARD_TABLE} GROUP BY points_column
       `;
        const insertDuplicateRowToTmpCardQuery = `
            INSERT INTO ${this.TEMP_DUPLICATE_CARD_TABLE}
            SELECT t.* FROM ${this.CARD_TABLE} t JOIN (${selectDistinctPointQuery}) x 
            ON x.points_column = t.points_column AND x.first_created <> t.created_at_column
       `;
        const deleteDuplicateCardQuery = `
           DELETE FROM ${this.CARD_TABLE} WHERE id_column IN (SELECT id_column FROM ${this.TEMP_DUPLICATE_CARD_TABLE})
        `;

        await queryRunner.query(`ALTER TABLE \`card_order_tbl\` DROP FOREIGN KEY \`FK_8c74955cd943f2dae6d84aeac24\``);
        await queryRunner.query(`ALTER TABLE \`card_order_tbl\` ADD CONSTRAINT \`FK_8c74955cd943f2dae6d84aeac24\` FOREIGN KEY (\`card_column\`) REFERENCES \`card_tbl\`(\`id_column\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(createTmpTableQuery);
        await queryRunner.query(truncateTmpTableQuery);
        try {
            await queryRunner.query(insertDuplicateRowToTmpCardQuery);
        } catch (error) {
            JSON.stringify(error);
            await queryRunner.rollbackTransaction();
        }
        await queryRunner.query(deleteDuplicateCardQuery);
        // await queryRunner.query(`ALTER TABLE \`card_tbl\` ADD UNIQUE INDEX \`IDX_313dcf7ed5c78e067a151463dd\` (\`points_column\`)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const updateCardOrderQuery = `
            UPDATE ${this.CARD_ORDER_TABLE} SET card_column = card_id_column WHERE card_column IS NULL
        `;
        const insertDuplicateRowToCardQuery = `
            INSERT INTO ${this.CARD_TABLE} SELECT * FROM ${this.TEMP_DUPLICATE_CARD_TABLE}
        `;
        const deleteTmpTableQuery = `
            DROP TABLE ${this.TEMP_DUPLICATE_CARD_TABLE}
        `;
        // const deleteUniqueConstraintQuery = `ALTER TABLE \`card_tbl\` DROP INDEX \`IDX_313dcf7ed5c78e067a151463dd\``;

        // await queryRunner.query(deleteUniqueConstraintQuery);
        try {
            await queryRunner.query(insertDuplicateRowToCardQuery);
            await queryRunner.query(updateCardOrderQuery);
        } catch (error) {
            JSON.stringify(error);
            await queryRunner.rollbackTransaction();
        }
        await queryRunner.query(deleteTmpTableQuery);
        await queryRunner.query(`ALTER TABLE \`card_order_tbl\` DROP FOREIGN KEY \`FK_8c74955cd943f2dae6d84aeac24\``);
        await queryRunner.query(`ALTER TABLE \`card_order_tbl\` ADD CONSTRAINT \`FK_8c74955cd943f2dae6d84aeac24\` FOREIGN KEY (\`card_column\`) REFERENCES \`card_tbl\`(\`id_column\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }
}
