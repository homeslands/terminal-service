import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Base } from 'src/app/base.entity';
import { AutoMap } from '@automapper/classes';
import { Branch } from 'src/branch/branch.entity';
import { Order } from 'src/order/order.entity';
import { Role } from 'src/role/role.entity';
import { CardOrder } from 'src/gift-card-modules/card-order/entities/card-order.entity';
import { Recipient } from 'src/gift-card-modules/receipient/entities/receipient.entity';
import { GiftCard } from 'src/gift-card-modules/gift-card/entities/gift-card.entity';
import { UserGroupMember } from 'src/user-group-member/user-group-member.entity';
import { FirebaseDeviceToken } from 'src/notification/firebase/firebase-device-token.entity';
import { Voucher } from 'src/voucher/entity/voucher.entity';
import { CampaignRecipient } from 'src/campaign/entity/campaign-recipient.entity';

@Entity('user_tbl')
export class User extends Base {
  // Id that cua user ben shared-user (identity service) - dung de JwtStrategy
  // map JWT payload.sub sang user cuc bo cua terminal. NOT NULL tu sau
  // migration v4.0.0-01.
  //
  // ⚠️ **Khong phai hang nao cung tro dung sang mot danh tinh co that** - va
  // day la cho KHAC HAN `trend`. `trend_db` va `shared_user_db` tach ra tu
  // cung mot monolith nen giu nguyen khoa chinh, moi hang cu deu khop.
  // `terminal_db` la mot NHANH KHAC cua monolith: do 28/09/2026 tren ban dump
  // vua nap, 183 hang cuc bo / 137 hang ben shared-user, trung `id_column`
  // dung **52**, trung `phonenumber` **57**. Nghia la ~126 hang mang gia tri
  // backfill placeholder (`= id_column`) KHONG tra ra danh tinh nao.
  //
  // Nhung hang do chi dung duoc sau khi luot backfill A7-f gan lai
  // `sharedUserId` that (tra theo `phonenumber`), hoac sau khi danh tinh cua
  // ho duoc tao ben shared-user. Xem progress/terminal-api.md muc A7-f.
  @AutoMap()
  @Column({ name: 'shared_user_id_column', unique: true })
  sharedUserId: string;

  // Nullable vi user duoc tao qua duong tu cap hang cuc bo (QD19
  // UserProvisioningService) khong con di qua flow tao user + mat khau cuc bo
  // nua - mat khau thuoc ve shared-user. TODO: xoa cot nay o giai doan sau.
  // Buoc 3.4: trang thai khoa da roi entity. Khoa/mo nam o `shared-user`
  // (`UserActiveChecker`, `JwtStrategy`); `UserResponseDto.isActive` gan tu
  // identity (`user.helper.ts`). Cot cuc bo doi ten `_deprecated_*`, xoa that o
  // giai doan 10; script backfill va `user-retire.helper.ts` doc/ghi no qua
  // `user-legacy-column.helper.ts` (SQL tho, do ten cot).

  // Buoc 8.8: `user_tbl` chi con `sharedUserId` + `role` + `branch` (muc 1.6).
  // Muoi cot identity (phonenumber, password, firstName, lastName, language,
  // dob, dobDM, email, address, image) va ba quan he vi (`balance`,
  // `pointTransactions`, `accumulatedPoint` - FK `accumulated_point_column`)
  // da roi entity: identity doc o shared-user, vi / diem o shared-user. Cot
  // cuc bo doi ten `_deprecated_*` o 8.9, xoa that o giai doan 10. Dung them
  // lai cot nao o day de "tien tay" - do la mo lai ban sao identity.

  // Many to one with branch
  @AutoMap(() => Branch)
  @ManyToOne(() => Branch, (branch) => branch.users)
  @JoinColumn({ name: 'branch_id_column' })
  branch: Branch;

  // One to many with owner order
  @OneToMany(() => Order, (order) => order.owner)
  ownerOrders: Order[];

  // One to many with approval order
  @OneToMany(() => Order, (order) => order.approvalBy)
  approvalOrders: Order[];

  // One to one with role
  @ManyToOne(() => Role, (role) => role.users)
  @JoinColumn({ name: 'role_column' })
  @AutoMap(() => Role)
  role: Role;

  // Buoc 4.7: hai co xac minh (email, SDT) da roi entity. Gia tri that nam o
  // `shared-user`; DTO van khai hai field va gan tu identity (`user.helper.ts`,
  // `UserService.mergeSharedUserIdentity`, `AuthService.getProfile`). Hai cot
  // cuc bo doi ten `_deprecated_*`, xoa that o giai doan 10; script
  // backfill doc chung qua `user-legacy-column.helper.ts` (SQL tho, do ten cot).

  @OneToMany(() => CardOrder, (cardOrder) => cardOrder.customer, {
    onDelete: 'SET NULL',
  })
  customerCardOrders: CardOrder[];

  @OneToMany(() => CardOrder, (cardOrder) => cardOrder.cashier, {
    onDelete: 'SET NULL',
  })
  cashierCardOrders: CardOrder[];

  @OneToMany(() => Recipient, (receipient) => receipient.recipient, {
    onDelete: 'SET NULL',
  })
  recipientCardOrders: Recipient[];

  @OneToMany(() => Recipient, (receipient) => receipient.sender, {
    onDelete: 'SET NULL',
  })
  senderCardOrders: Recipient[];

  @OneToMany(() => GiftCard, (gc) => gc.usedBy)
  giftCards?: GiftCard[];

  // One to many with user group members
  @OneToMany(() => UserGroupMember, (userGroupMember) => userGroupMember.user)
  userGroupMembers: UserGroupMember[];

  // One to many with device tokens
  @OneToMany(
    () => FirebaseDeviceToken,
    (firebaseDeviceToken) => firebaseDeviceToken.user,
  )
  firebaseDeviceTokens: FirebaseDeviceToken[];

  @OneToMany(() => Voucher, (voucher) => voucher.assignedUser, {
    cascade: ['insert', 'update', 'remove'],
  })
  individualVouchers: Voucher[];

  // QD22 (buoc 2.5) - quan he `membershipCard` va `userRequirements` DA GO:
  // the va requirement nay o shared-user, doc qua
  // `/internal/membership-cards/lookup` va `userRequirements` cua
  // `/internal/users/lookup`. Hai bang cuc bo khong con duoc ghi; doi ten o
  // buoc 8.9, drop o 10.3 - nen entity cua chung VAN O LAI (bang that con
  // ton tai, `synchronize: false` nen khong co rui ro schema).
  //
  // Dung them lai quan he nao o day de "tien tay join": lam vay la mo lai
  // dung nguon ghi lac ma QD22 vua dong.

  @OneToMany(() => CampaignRecipient, (cr) => cr.user)
  campaignRecipients?: CampaignRecipient[];
}
