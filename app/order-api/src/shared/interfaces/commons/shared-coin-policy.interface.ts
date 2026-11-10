export interface IsMaxBalancePayload {
  // Khoa nguoi dung theo muc 1.10 (buoc 2.13 — 2C). Truoc day la `userSlug`;
  // sau chi nhanh nao chi cam slug thi dich qua `SharedUserRefService`.
  sharedUserId: string;
  totalPoints: number;
}
