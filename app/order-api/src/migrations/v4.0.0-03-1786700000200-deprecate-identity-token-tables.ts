import { MigrationInterface, QueryRunner } from 'typeorm';

// Buoc 3.3 (giai doan 3) - bon bang token identity khong con entity nao tro
// toi: `verify_email_token_tbl`, `verify_phone_number_token_tbl`,
// `forgot_password_token_tbl`, `register_otp_token_tbl`. Nghiep vu xac minh /
// quen mat khau / dang ky da thuoc ve `shared-user` tu giai doan 1, va buoc
// 3.2 da xoa sau route + sau method cuoi cung doc chung o day.
//
// ⛔ DOI TEN, KHONG `DROP`. Ly do:
//
//   1. Du lieu trong bon bang nay la token mot lan, het han sau vai phut -
//      nhung day van la DB that cua moi truong, va mot lan `DROP` thi khong
//      lay lai duoc. Doi ten de lai duong lui trong mot lenh (`down()` o duoi).
//   2. Quy uoc cua du an: `DROP` that chi xay ra o **giai doan 10**, sau khi
//      moi moi truong da chay qua va khong con ai doc. Moi giai doan truoc chi
//      duoc danh dau `_deprecated_*`.
//
// Khoa ngoai `user_column` cua bon bang KHONG phai go truoc: MySQL
// `RENAME TABLE` giu nguyen khoa ngoai va chung di theo bang con. Neu mot moi
// truong nao do bao loi khoa ngoai, go `FOREIGN KEY` cua chinh bang do roi
// chay lai - dung go khoa ngoai tren `user_tbl`.
//
// Kiem `hasTable` truoc moi lan doi ten (ca `up()` lan `down()`) la co y: bon
// bang nay sinh ra tu monolith nen moi truong di len tu ban sao deu co, nhung
// mot DB dung len tu dau (hoac da chay migration nay roi) thi khong - va
// migration khong duoc hong vi dieu do. MySQL khong co `RENAME TABLE ... IF
// EXISTS`, nen phai kiem truoc bang `hasTable`.
const TABLES = [
  'verify_email_token_tbl',
  'verify_phone_number_token_tbl',
  'forgot_password_token_tbl',
  'register_otp_token_tbl',
];

export class DeprecateIdentityTokenTables1786700000200
  implements MigrationInterface
{
  name = 'DeprecateIdentityTokenTables1786700000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const t of TABLES) {
      const existed = await queryRunner.hasTable(t);
      if (!existed) continue;
      const alreadyDone = await queryRunner.hasTable(`_deprecated_${t}`);
      if (alreadyDone) continue;
      await queryRunner.query(
        `RENAME TABLE \`${t}\` TO \`_deprecated_${t}\``,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const t of TABLES) {
      const deprecated = await queryRunner.hasTable(`_deprecated_${t}`);
      if (!deprecated) continue;
      const originalBack = await queryRunner.hasTable(t);
      if (originalBack) continue;
      await queryRunner.query(
        `RENAME TABLE \`_deprecated_${t}\` TO \`${t}\``,
      );
    }
  }
}
