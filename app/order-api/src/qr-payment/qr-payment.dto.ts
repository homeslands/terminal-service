import { ApiProperty } from '@nestjs/swagger';

export class GenerateQrPaymentResponseDto {
  @ApiProperty({ description: 'Raw token (64 hex chars)' })
  token: string;

  @ApiProperty({ description: 'Token expiration time' })
  expiresAt: string;
}
