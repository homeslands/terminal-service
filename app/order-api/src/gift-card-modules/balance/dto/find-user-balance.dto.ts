import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

// Buoc 7.7d (QD-T10): query cua `GET /balance` sau khi route chi con la "xem
// ho" cua nhan vien. `userSlug` BAT BUOC - khong con nhanh "khong truyen thi
// la cua toi", va bo tham so tra theo slug hang vi (`slug`): hang vi nam o
// shared-user, slug cua no chi con la field cua response.
export class FindUserBalanceDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    description: 'The slug of the customer',
    required: true,
  })
  userSlug: string;
}
