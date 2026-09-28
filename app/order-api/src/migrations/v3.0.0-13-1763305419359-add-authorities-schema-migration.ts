/* eslint-disable prettier/prettier */
import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import _ from 'lodash';
import { getRandomString } from 'src/helper';
import { AuthorityGroup } from 'src/authority-group/authority-group.entity';
import { Authority } from 'src/authority/authority.entity';

export class AddAuthoritiesSchemaMigration1763305419359
    implements MigrationInterface {
    private readonly AUTHORITY_GROUP_TABLE = 'authority_group_tbl';
    private readonly AUTHORITY_TABLE = 'authority_tbl';
    private readonly PERMISSION_TABLE = 'permission_tbl';

    private buildAuthorityGroups() {
        const data = [
            {
                code: 'CARD_MENU',
                name: 'Menu thẻ quà tặng',
                description: ''
            },
            {
                code: 'CARD_ORDER',
                name: 'Đơn hàng thẻ quà tặng',
            },
            {
                code: 'CARD_MANAGEMENT',
                name: 'Quản lý thẻ quà tặng',
            },
        ];

        return data.map((item) => {
            const id = uuidv4();
            const slug = getRandomString();
            const authorityGroup: AuthorityGroup = {
                id,
                slug,
                name: item.name,
                code: item.code,
                authorities: [],
                createdAt: new Date(),
                updatedAt: new Date(),
                description: item.description ?? null,
            };
            return authorityGroup;
        })

    }

    private buildAuthorities(authorityGroups: AuthorityGroup[]): Authority[] {
        const data = [
            {
                code: 'VIEW_CARD_MENU',
                name: 'Hiển thị menu thẻ quà tặng',
                authorityGroupCode: 'CARD_MENU',
            },
            {
                code: 'VIEW_CARD_ORDER',
                name: 'Hiển thị danh sách đơn hàng thẻ quà tặng',
                authorityGroupCode: 'CARD_ORDER',
            },
            {
                code: 'VIEW_POINT_TRANSACTION',
                name: 'Hiển thị danh sách lịch sử giao dịch',
                authorityGroupCode: 'CARD_ORDER',
            },
            {
                code: 'UPDATE_CARD_ORDER',
                name: 'Cập nhât đơn hàng thẻ quà tặng',
                authorityGroupCode: 'CARD_ORDER',
            },
            {
                code: 'VIEW_CARD',
                name: 'Hiển thị danh sách thẻ',
                authorityGroupCode: 'CARD_MANAGEMENT',
            },
            {
                code: 'CREATE_CARD',
                name: 'Tạo mới thẻ',
                authorityGroupCode: 'CARD_MANAGEMENT',
            },
            {
                code: 'UPDATE_CARD',
                name: 'Cập nhật thẻ',
                authorityGroupCode: 'CARD_MANAGEMENT',
            },
            {
                code: 'DELETE_CARD',
                name: 'Xóa thẻ',
                authorityGroupCode: 'CARD_MANAGEMENT',
            },
            {
                code: 'VIEW_CARD_CONFIGURATION',
                name: 'Hiển thị danh sách cấu hình thẻ quà tặng',
                authorityGroupCode: 'CARD_MANAGEMENT',
            },
            {
                code: 'UPDATE_CARD_CONFIGURATION',
                name: 'Cập nhật cấu hình thẻ quà tặng',
                authorityGroupCode: 'CARD_MANAGEMENT',
            },
            {
                code: 'VIEW_LOCK_FEATURE',
                name: 'Hiển thị danh sách khoá tính năng',
                authorityGroupCode: 'CARD_MANAGEMENT',
            },
            {
                code: 'UPDATE_LOCK_FEATURE',
                name: 'Cập nhật danh sách khoá tính năng',
                authorityGroupCode: 'CARD_MANAGEMENT',
            },
        ];
        const authorities = data.map((item) => {
            const ag = authorityGroups.find(agItem => item.authorityGroupCode === agItem.code);
            const id = uuidv4();
            const slug = getRandomString();
            const authority: Authority = {
                id,
                slug,
                authorityGroup: ag,
                code: item.code,
                name: item.name,
                permissions: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            return authority;
        });
        return authorities;
    }

    public async up(queryRunner: QueryRunner): Promise<void> {
        const authorityGroups = this.buildAuthorityGroups();
        const authorities = this.buildAuthorities(authorityGroups);

        const agQuery = `
            INSERT INTO 
                ${this.AUTHORITY_GROUP_TABLE} (id_column, slug_column, name_column, code_column, description_column) 
            VALUES (?, ?, ?, ?, ?)
        `;
        const authQuery = `
         INSERT INTO 
                ${this.AUTHORITY_TABLE} (id_column, slug_column, name_column, code_column, authority_group_column, description_column) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        await queryRunner.startTransaction();
        try {
            for (const ag of authorityGroups) {
                await queryRunner.query(agQuery, [
                    ag.id,
                    ag.slug,
                    ag.name,
                    ag.code,
                    ag.description ?? null,
                ]);
            }

            for (const auth of authorities) {
                await queryRunner.query(authQuery, [
                    auth.id,
                    auth.slug,
                    auth.name,
                    auth.code,
                    auth.authorityGroup.id,
                    auth.description ?? null,
                ]);
            }
            await queryRunner.commitTransaction();
        } catch (error) {
            JSON.stringify(error);
            await queryRunner.rollbackTransaction();
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const authorityGroups = this.buildAuthorityGroups();
        const placeholders = authorityGroups.map(() => '?').join(', ');

        const selectGroupQuery = `
            SELECT id_column as id FROM ${this.AUTHORITY_GROUP_TABLE} WHERE code_column IN (${placeholders})
        `;
        const selectAuthoritiesQuery = `
            SELECT id_column as id FROM ${this.AUTHORITY_TABLE} WHERE authority_group_column IN (${placeholders})
        `;

        const deleteAuthorityGroupQuery = `
            DELETE FROM ${this.AUTHORITY_GROUP_TABLE} WHERE id_column = ?
        `;
        const deleteAuthorityQuery = `
            DELETE FROM ${this.AUTHORITY_TABLE} WHERE authority_group_column = ?
        `;
        const deletePermissionsRelatedToAuthorityQuery = `
            DELETE FROM ${this.PERMISSION_TABLE} WHERE authority_column = ?
        `

        const authorityGroupRows = await queryRunner.query(selectGroupQuery, authorityGroups.map(item => item.code) || []);
        const authorityRows = await queryRunner.query(selectAuthoritiesQuery, authorityGroupRows?.map(item => item?.id) || []);


        await queryRunner.startTransaction();
        try {
            // Delete permissions
            if (!_.isEmpty(authorityRows)) {
                for (const auth of authorityRows) {
                    await queryRunner.query(deletePermissionsRelatedToAuthorityQuery, [
                        auth?.id,
                    ]);
                }
            }

            if (!_.isEmpty(authorityGroupRows)) {
                for (const item of authorityGroupRows) {
                    // Delete authorities
                    await queryRunner.query(deleteAuthorityQuery, [
                        item?.id,
                    ]);
                    // Delete authority groups
                    await queryRunner.query(deleteAuthorityGroupQuery, [
                        item?.id,
                    ]);
                }
            }

            await queryRunner.commitTransaction();
        } catch (error) {
            JSON.stringify(error);
            await queryRunner.rollbackTransaction();
        }
    }
}
