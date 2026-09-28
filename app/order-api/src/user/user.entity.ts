import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { Base } from 'src/app/base.entity';
import { AutoMap } from '@automapper/classes';
import { Branch } from 'src/branch/branch.entity';
import { Order } from 'src/order/order.entity';
import { ForgotPasswordToken } from 'src/auth/entity/forgot-password-token.entity';
import { Role } from 'src/role/role.entity';
import { VerifyEmailToken } from 'src/auth/entity/verify-email-token.entity';
import { CardOrder } from 'src/gift-card-modules/card-order/entities/card-order.entity';
import { Recipient } from 'src/gift-card-modules/receipient/entities/receipient.entity';
import { VerifyPhoneNumberToken } from 'src/auth/entity/verify-phone-number-token.entity';
import { PointTransaction } from 'src/gift-card-modules/point-transaction/entities/point-transaction.entity';
import { GiftCard } from 'src/gift-card-modules/gift-card/entities/gift-card.entity';
import { AccumulatedPoint } from 'src/accumulated-point/entities/accumulated-point.entity';
import { UserGroupMember } from 'src/user-group-member/user-group-member.entity';
import { FirebaseDeviceToken } from 'src/notification/firebase/firebase-device-token.entity';
import { UserLanguage } from './user.constant';
import { Voucher } from 'src/voucher/entity/voucher.entity';
import { Balance } from 'src/gift-card-modules/balance/entities/balance.entity';
import { MembershipCard } from 'src/membership-card/membership-card.entity';
import { UserRequirement } from './user-requirement.entity';
import { CampaignRecipient } from 'src/campaign/entity/campaign-recipient.entity';

@Entity('user_tbl')
export class User extends Base {
  @AutoMap()
  @Column({ name: 'phonenumber_column', unique: true })
  phonenumber: string;

  @Column({ name: 'password_column' })
  password: string;

  @Column({ name: 'first_name_column', nullable: true })
  @AutoMap()
  firstName: string;

  @Column({ name: 'last_name_column', nullable: true })
  @AutoMap()
  lastName: string;

  @AutoMap()
  @Column({ name: 'language_column', default: UserLanguage.VI })
  language: string;

  @Column({ name: 'is_active_column', default: true })
  @AutoMap()
  isActive: boolean;

  @Column({ name: 'dob_column', nullable: true })
  @AutoMap()
  dob?: string;

  @Column({ name: 'dob_day_month', nullable: true })
  @AutoMap()
  dobDM?: string;

  @AutoMap()
  @Column({ name: 'email_column', nullable: true, unique: true })
  email?: string;

  @AutoMap()
  @Column({ name: 'address_column', nullable: true })
  address?: string;

  @AutoMap()
  @Column({ name: 'image_column', nullable: true })
  image?: string;

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

  @OneToMany(() => ForgotPasswordToken, (token) => token.user)
  forgotPasswordTokens: ForgotPasswordToken[];

  // One to one with role
  @ManyToOne(() => Role, (role) => role.users)
  @JoinColumn({ name: 'role_column' })
  @AutoMap(() => Role)
  role: Role;

  @Column({ name: 'is_verified_email_column', default: false })
  @AutoMap()
  isVerifiedEmail: boolean;

  @OneToMany(() => VerifyEmailToken, (token) => token.user)
  verifyEmailTokens: VerifyEmailToken[];

  @Column({ name: 'is_verified_phonenumber_column', default: false })
  @AutoMap()
  isVerifiedPhonenumber: boolean;

  @OneToMany(
    () => VerifyPhoneNumberToken,
    (verifyPhoneNumberToken) => verifyPhoneNumberToken.user,
  )
  verifyPhoneNumberTokens: VerifyPhoneNumberToken[];

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

  @OneToMany(() => PointTransaction, (pt) => pt.user)
  pointTransactions: PointTransaction[];

  @OneToMany(() => GiftCard, (gc) => gc.usedBy)
  giftCards?: GiftCard[];

  @OneToOne(() => AccumulatedPoint, (accumulatedPoint) => accumulatedPoint.user)
  @JoinColumn({ name: 'accumulated_point_column' })
  @AutoMap(() => AccumulatedPoint)
  accumulatedPoint: AccumulatedPoint;

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

  @OneToOne(() => Balance, (b) => b.user)
  balance: Balance;

  @OneToOne(() => MembershipCard, (m) => m.user, {
    cascade: ['insert', 'update', 'remove'],
  })
  membershipCard: MembershipCard;

  @OneToMany(() => UserRequirement, (ur) => ur.user, {
    cascade: ['insert', 'update', 'remove'],
  })
  @AutoMap(() => UserRequirement)
  userRequirements: UserRequirement[];

  @OneToMany(() => CampaignRecipient, (cr) => cr.user)
  campaignRecipients?: CampaignRecipient[];
}
