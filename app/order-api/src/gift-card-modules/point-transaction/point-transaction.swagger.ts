import { applyDecorators, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ApiResponseWithType } from 'src/app/app.decorator';
import {
    AnalysisPointTransactionResponseDto,
} from './dto/point-transaction-response.dto';
import { BaseApiOptions } from 'src/shared/interfaces/commons/swagger.interface';

export const GetAnalyzePointTransactionApi = ({
    path = '',
}: BaseApiOptions) => {
    return applyDecorators(
        Get(path),
        HttpCode(HttpStatus.OK),
        ApiOperation({ summary: 'Retrieve the point transactions' }),
        ApiResponseWithType({
            status: HttpStatus.OK,
            type: AnalysisPointTransactionResponseDto,
        }),
    );
};
