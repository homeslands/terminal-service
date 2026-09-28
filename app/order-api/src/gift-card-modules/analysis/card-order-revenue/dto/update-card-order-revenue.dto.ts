import { PartialType } from '@nestjs/swagger';
import { CreateCardOrderRevenueDto } from './create-card-order-revenue.dto';

export class UpdateCardOrderRevenueDto extends PartialType(CreateCardOrderRevenueDto) {}
