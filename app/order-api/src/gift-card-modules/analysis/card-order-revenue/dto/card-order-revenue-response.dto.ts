import { AutoMap } from "@automapper/classes";
import { ApiProperty } from "@nestjs/swagger";
import { BaseResponseDto } from "src/app/base.dto";

export class CardOrderRevenueResponseDto extends BaseResponseDto {
    @AutoMap(() => Date)
    @ApiProperty()
    date: Date;

    @ApiProperty()
    @AutoMap()
    totalCardOrders: number;

    @ApiProperty()
    @AutoMap()
    totalRevenue: number;

    @ApiProperty()
    @AutoMap()
    bankRevenue: number;

    @ApiProperty()
    @AutoMap()
    cashRevenue: number;

    @ApiProperty()
    @AutoMap()
    cardCount: number;

    @ApiProperty()
    @AutoMap()
    selfTopupOrderCount: number;

    @ApiProperty()
    @AutoMap()
    giftTopupOrderCount: number;

    @ApiProperty()
    @AutoMap()
    cardPurchaseOrderCount: number;

    @ApiProperty()
    @AutoMap()
    totalCardOrdersByBank: number;

    @ApiProperty()
    @AutoMap()
    totalCardOrdersByCash: number;

    @ApiProperty()
    @AutoMap()
    minOrderSequence: number;

    @ApiProperty()
    @AutoMap()
    maxOrderSequence: number;
}