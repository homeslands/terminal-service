import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsOptional } from "class-validator";
import moment from "moment";

export class FindAllCardOrderRevenueDto {
    @ApiProperty({
        required: false,
    })
    @IsOptional()
    @Transform(({ value }) => moment(value, 'YYYY-MM-DD').startOf('day').toDate())
    fromDate: Date;

    @ApiProperty({
        required: false,
    })
    @IsOptional()
    @Transform(({ value }) => moment(value, 'YYYY-MM-DD').endOf('day').toDate())
    toDate: Date;

    @ApiProperty({
        required: false,
    })
    @IsOptional()
    type?: string;
}


