import { AuthorityGroup } from 'src/authority-group/authority-group.entity';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { getRandomString } from 'src/helper';
import { Authority } from 'src/authority/authority.entity';
import _ from 'lodash';

export class AddAuthorityForVatRequest1782524158125
  implements MigrationInterface
{
  name = 'AddAuthorityForVatRequest1782524158125';

  private readonly AUTHORITY_GROUP_TABLE = 'authority_group_tbl';
  private readonly AUTHORITY_TABLE = 'authority_tbl';
  private readonly PERMISSION_TABLE = 'permission_tbl';

  private buildAuthorityGroups() {
    const data = [
      {
        code: 'VAT_REQUEST',
        name: 'Yêu cầu xuất VAT',
        description: '',
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
    });
  }

  private buildAuthorities(authorityGroups: AuthorityGroup[]): Authority[] {
    const data = [
      {
        code: 'VIEW_VAT_REQUEST',
        name: 'Xem yêu cầu xuất VAT',
        authorityGroupCode: 'VAT_REQUEST',
      },
      {
        code: 'EDIT_VAT_REQUEST',
        name: 'Chỉnh sửa yêu cầu xuất VAT',
        authorityGroupCode: 'VAT_REQUEST',
      },
      {
        code: 'EDIT_ACCOUNTANT_INFO',
        name: 'Chỉnh sửa thông tin kế toán',
        authorityGroupCode: 'VAT_REQUEST',
      },
      {
        code: 'UPDATE_VAT_STATUS',
        name: 'Cập nhật trạng thái VAT',
        authorityGroupCode: 'VAT_REQUEST',
      },
    ];

    const authorities = data.map((item) => {
      const ag = authorityGroups.find(
        (agItem) => item.authorityGroupCode === agItem.code,
      );
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
        `;

    const authorityGroupRows = await queryRunner.query(
      selectGroupQuery,
      authorityGroups.map((item) => item.code) || [],
    );
    const authorityRows = await queryRunner.query(
      selectAuthoritiesQuery,
      authorityGroupRows?.map((item) => item?.id) || [],
    );

    await queryRunner.startTransaction();
    try {
      if (!_.isEmpty(authorityRows)) {
        for (const auth of authorityRows) {
          await queryRunner.query(deletePermissionsRelatedToAuthorityQuery, [
            auth?.id,
          ]);
        }
      }

      if (!_.isEmpty(authorityGroupRows)) {
        for (const item of authorityGroupRows) {
          await queryRunner.query(deleteAuthorityQuery, [item?.id]);
          await queryRunner.query(deleteAuthorityGroupQuery, [item?.id]);
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      JSON.stringify(error);
      await queryRunner.rollbackTransaction();
    }
  }
}
