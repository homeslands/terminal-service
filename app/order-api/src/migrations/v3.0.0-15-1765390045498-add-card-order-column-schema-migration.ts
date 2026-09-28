import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCardOrderColumnSchemaMigration1765390045498 implements MigrationInterface {
    name = 'AddCardOrderColumnSchemaMigration1765390045498'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Set the sequence column value for completed card orders. The sequence starts at 1.
        const updateSequenceQuery = `
            WITH ordered AS (
                SELECT id_column, ROW_NUMBER() OVER (ORDER BY created_at_column ASC) AS seq
                FROM card_order_tbl
                WHERE status_column = 'completed'
            )
            UPDATE card_order_tbl co
            JOIN ordered o ON co.id_column = o.id_column
            SET co.sequence_column = o.seq;
        `

        // Set the code column value for card orders. 
        // The code column with format: DHC + DD/MM/YY + order sequence (on the same day, On the next day, it starts again) + unique part
        const updateCodeQuery = `
            WITH ordered AS (
                SELECT
                    id_column,
                    created_at_column,
                    DATE_FORMAT(created_at_column, '%d') AS DD,
                    DATE_FORMAT(created_at_column, '%m') AS MM,
                    DATE_FORMAT(created_at_column, '%y') AS YY,
                    ROW_NUMBER() OVER (    
                        PARTITION BY DATE(created_at_column)
                        ORDER BY created_at_column ASC) AS seq,
                    UPPER(
                    RIGHT(
                        CONV(
                        UNIX_TIMESTAMP(created_at_column) * 1000,
                        10,
                        36
                        ),
                        3
                    )
                    ) AS suffix
                FROM card_order_tbl
                )
            UPDATE card_order_tbl co
            JOIN ordered o ON co.id_column = o.id_column
            SET co.code_column = CONCAT(
                'DHC',
                o.DD,           -- Day
                o.MM,           -- month
                o.YY,           -- year
                LPAD(o.seq, 4, '0'), -- sequence number padded
                o.suffix        -- last 3 chars of timestamp (base36)
            );
        `
        await queryRunner.query(`ALTER TABLE \`card_order_tbl\` ADD \`sequence_column\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`card_order_tbl\` ADD \`code_column\` varchar(255) NOT NULL`);
        await queryRunner.query(updateSequenceQuery);
        await queryRunner.query(updateCodeQuery);
        await queryRunner.query(`ALTER TABLE \`card_order_tbl\` ADD UNIQUE INDEX \`IDX_6b352590517adfc643126b49e4\` (\`code_column\`)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`card_order_tbl\` DROP INDEX \`IDX_6b352590517adfc643126b49e4\``);
        await queryRunner.query(`ALTER TABLE \`card_order_tbl\` DROP COLUMN \`code_column\``);
        await queryRunner.query(`ALTER TABLE \`card_order_tbl\` DROP COLUMN \`sequence_column\``);
    }

}
