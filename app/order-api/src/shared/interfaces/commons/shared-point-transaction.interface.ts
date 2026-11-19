import { CreatePointTransactionDto } from 'src/gift-card-modules/point-transaction/dto/create-point-transaction.dto';

/**
 * Kieu vao RIENG cua `SharedPointTransactionService.create` (buoc 2.13 — 2C).
 *
 * Giong `BalanceLookupPayload`: `CreatePointTransactionDto` la **body cua
 * `POST /point-transaction`**, tuc client-facing, nen muc 1.4 cam doi khuon —
 * no giu `userSlug`. Service dung chung xung ten bang `sharedUserId` (muc
 * 1.10), nen hai khuon tach ra.
 *
 * Viet bang `Omit<...>` chu khong liet ke tay bay field: giu MOT nguon su that
 * voi DTO. Ai them mot field bat buoc vao DTO thi moi cho goi noi bo (card-order,
 * gift-card, job, campaign) do ngay — chung ghi CUNG MOT BANG voi route kia,
 * nen phai di cung nhip.
 *
 * `userSlug` KHONG co o day: cot guong `user_slug_column` duoc gan tu
 * `user.slug` cua HANG VUA TRA, nen ben goi khong phai cam slug nua. Xem ghi
 * chu trong `create`.
 *
 * Dat o `shared/interfaces/commons/` cho cung cho voi `IsMaxBalancePayload`
 * (`shared-coin-policy.interface.ts`): deu la **hop dong vao cua mot service
 * dung chung**, de cho goi import duoc ma khong phai keo theo ca service.
 */
export interface CreatePointTransactionPayload
  extends Omit<CreatePointTransactionDto, 'userSlug'> {
  sharedUserId: string;
}
