/**
 * Kieu vao RIENG cua `SharedBalanceService.findOneByField` (buoc 2.12 — 2C).
 *
 * Vi sao khong dung tiep `FindByFieldDto`: do la **query cua `GET /balance`**,
 * tuc DTO client-facing, va muc 1.4 cam doi khuon client-facing. No giu
 * `userSlug`. Service dung chung thi xung ten bang `sharedUserId` (muc 1.10),
 * nen hai khuon phai tach ra — tu buoc 2.12 `FindByFieldDto` chi con nguoi doc
 * la ban module `gift-card-modules/balance/balance.service.ts`.
 *
 * CA HAI khoa deu tuy chon: "khong co khoa nao" la dau vao HOP LE o day (than
 * `findOneByField` bat bang `IsNull()`), nen ham do CO Y khong goi
 * `assertUserKeyLoaded` — khac `create` / `validate` / `calcBalance`. Xem muc
 * 1.10.
 *
 * Dat o `shared/interfaces/commons/` cho cung cho voi `IsMaxBalancePayload`
 * (`shared-coin-policy.interface.ts`): deu la **hop dong vao cua mot service
 * dung chung**, de cho goi import duoc ma khong phai keo theo ca service.
 */
export interface BalanceLookupPayload {
  slug?: string;
  sharedUserId?: string;
}
