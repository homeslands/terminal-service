import { applyDecorators, Delete, Get, HttpCode, HttpStatus, Patch, Post, UseInterceptors } from "@nestjs/common"
import { ApiBody, ApiConsumes, ApiOperation } from "@nestjs/swagger"
import { ApiResponseWithType } from "src/app/app.decorator"
import { CardResponseDto } from "./dto/card-response.dto"
import { CustomFileInterceptor } from "src/file/custom-interceptor"
import { BaseApiOptions } from "src/shared/interfaces/commons/swagger.interface"

export const PostCreateCardApi = ({ path }: BaseApiOptions) => {
    return applyDecorators(
        Post(path),
        HttpCode(HttpStatus.CREATED),
        ApiOperation({ summary: 'Create new card' }),
        ApiResponseWithType({
            status: HttpStatus.CREATED,
            description: 'The new card was created successfully',
            type: CardResponseDto,
        }),
        UseInterceptors(
            new CustomFileInterceptor('file', {
                limits: {
                    fileSize: 5 * 1024 * 1024,
                },
            }),
        ),
        ApiConsumes('multipart/form-data'),
        ApiBody({
            schema: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                    },
                    description: {
                        type: 'string',
                    },
                    price: {
                        type: 'number',
                    },
                    points: {
                        type: 'number',
                    },
                    isActive: {
                        type: 'boolean',
                    },
                    file: {
                        type: 'string',
                        format: 'binary',
                    },
                },
            },
        })
    )
}

export const GetAllCardsApi = ({ path = '' }: BaseApiOptions) => {
    return applyDecorators(
        Get(path),
        HttpCode(HttpStatus.OK),
        ApiOperation({ summary: 'Retrieve all cards' }),
        ApiResponseWithType({
            status: HttpStatus.OK,
            description: 'All cards have been retrieved successfully',
            type: CardResponseDto,
            isArray: true,
        })
    )
}

export const GetCardBySlugApi = ({ path }: BaseApiOptions) => {
    return applyDecorators(
        Get(path),
        HttpCode(HttpStatus.OK),
        ApiOperation({ summary: 'Retrieve a card by slug' }),
        ApiResponseWithType({
            status: HttpStatus.OK,
            description: 'The card was fetched successfully',
            type: CardResponseDto,
        })
    )
}

export const PatchUpdateCardApi = ({ path }: BaseApiOptions) => {
    return applyDecorators(
        Patch(path),
        HttpCode(HttpStatus.OK),
        ApiOperation({ summary: 'Update a card by slug' }),
        ApiResponseWithType({
            status: HttpStatus.OK,
            description: 'The card was updated successfully',
            type: CardResponseDto,
        }),
        UseInterceptors(
            new CustomFileInterceptor('file', {
                limits: {
                    fileSize: 5 * 1024 * 1024,
                },
            }),
        ),
        ApiConsumes('multipart/form-data'),
        ApiBody({
            schema: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                    },
                    description: {
                        type: 'string',
                    },
                    price: {
                        type: 'number',
                    },
                    points: {
                        type: 'number',
                    },
                    isActive: {
                        type: 'boolean',
                    },
                    file: {
                        type: 'string',
                        format: 'binary',
                    },
                },
            },
        })
    )
}

export const DeleteCardApi = ({ path }: BaseApiOptions) => {
    return applyDecorators(
        Delete(path),
        HttpCode(HttpStatus.OK),
        ApiOperation({ summary: 'Delete a card by slug' }),
        ApiResponseWithType({
            status: HttpStatus.OK,
            description: 'The card was deleted successfully',
            type: CardResponseDto,
        })
    )
}

