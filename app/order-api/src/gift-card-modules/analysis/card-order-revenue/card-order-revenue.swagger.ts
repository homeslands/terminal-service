import { applyDecorators, Get, HttpCode, HttpStatus, Post, StreamableFile } from "@nestjs/common"
import { ApiOperation } from "@nestjs/swagger"
import { ApiResponseWithType } from "src/app/app.decorator"
import { BaseApiOptions } from "src/shared/interfaces/commons/swagger.interface"
import { CardOrderRevenueResponseDto } from "./dto/card-order-revenue-response.dto"

export const GetAllCardOrderRevenueApi = ({ path = '' }: BaseApiOptions) => {
    return applyDecorators(
        Get(path),
        HttpCode(HttpStatus.OK),
        ApiOperation({ summary: 'Retrieve card order revenue' }),
        ApiResponseWithType({
            status: HttpStatus.OK,
            description: 'Card order revenues have been retrieved successfully',
            type: CardOrderRevenueResponseDto,
            isArray: true,
        })
    )
}

export const PostExportExcelCardOrderRevenueApi = ({ path = '' }: BaseApiOptions) => {
    return applyDecorators(
        Post(path),
        HttpCode(HttpStatus.OK),
        ApiOperation({ summary: 'Export excel card order revenue' }),
        ApiResponseWithType({
            status: HttpStatus.OK,
            description: 'Card order revenues have been exported successfully',
            type: StreamableFile,
        })
    )
}

export const PostExportPdfCardOrderRevenueApi = ({ path = '' }: BaseApiOptions) => {
    return applyDecorators(
        Post(path),
        HttpCode(HttpStatus.OK),
        ApiOperation({ summary: 'Export pdf card order revenue' }),
        ApiResponseWithType({
            status: HttpStatus.OK,
            description: 'Card order revenues have been exported successfully',
            type: StreamableFile,
        })
    )
}

