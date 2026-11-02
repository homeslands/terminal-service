import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';
import { User } from 'src/user/user.entity';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';

@Entity('membership_card_tbl')
export class MembershipCard extends Base {
  @AutoMap()
  @Column({ name: 'code_column', unique: true })
  code: string;

  @AutoMap()
  @Column({ name: 'is_active_column', default: true })
  isActive: boolean;

  // nullable means the card is unlimited
  @AutoMap()
  @Column({ type: 'timestamp', name: 'expired_at_column', nullable: true })
  expiredAt?: Date;

  // Mot chieu tu buoc 2.5: `User.membershipCard` da go (QD22). Bang nay con
  // ton tai (doi ten o 8.9, drop o 10.3) nen entity giu nguyen.
  @OneToOne(() => User)
  @JoinColumn({ name: 'user_column' })
  @AutoMap(() => User)
  user: User;
}
