import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsOptional } from "class-validator";
import moment from "moment";

export class ExportCardOrderRevenueDto {
    @ApiProperty({
        required: false,
    })
    @IsOptional()
    @Transform(({ value }) => moment(value, 'YYYY-MM-DD HH:mm:ss').toDate())
    fromDate: Date;

    @ApiProperty({
        required: false,
    })
    @IsOptional()
    @Transform(({ value }) => moment(value, 'YYYY-MM-DD HH:mm:ss').toDate())
    toDate: Date;

    @ApiProperty({
        required: false,
    })
    @IsOptional()
    type: string;
}
