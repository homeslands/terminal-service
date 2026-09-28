import { Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { Base } from 'src/app/base.entity';
import { Column } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { User } from './user.entity';

@Entity('user_requirement_tbl')
@Unique('UQ_user_requirement_key_user', ['key', 'user'])
export class UserRequirement extends Base {
  @AutoMap()
  @Column({ name: 'key_column' })
  key: string;

  // The level of the requirement
  // block => isActive (in user table): false
  @AutoMap()
  @Column({ name: 'level_column' })
  level: string;

  @AutoMap()
  @Column({ name: 'status_column' })
  status: string;

  // The scope of the requirement
  // initial: the requirement is initial, it will be checked when the user is created
  // => level: block
  // periodic: the requirement is periodic, it will be checked when the user is updated
  // => level: warning
  @AutoMap()
  @Column({ name: 'scope_column' })
  scope: string;

  @AutoMap()
  @Column({ name: 'expired_at_column', nullable: true })
  expiredAt?: Date;

  @AutoMap()
  @Column({ name: 'last_updated_at_column', nullable: true })
  lastUpdatedAt?: Date;

  @AutoMap(() => User)
  @ManyToOne(() => User, (user) => user.userRequirements)
  @JoinColumn({ name: 'user_column' })
  user: User;
}
