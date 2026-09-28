import { applyDecorators, Controller } from "@nestjs/common"
import { BaseRestControllerOptions } from "../interfaces/commons/swagger.interface"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"

export const RestController = ({ path, tags }: BaseRestControllerOptions) => {
    return applyDecorators(
        Controller(path),
        ApiBearerAuth(),
        ApiTags(...tags),
    )
}