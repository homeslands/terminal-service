import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { plainToInstance } from 'class-transformer';

// How to implement role based serialization?
// With a field in response dto, need to add @Expose decorator with groups parameter
// Example:
// @Expose({ groups: [RoleEnum.Admin] })
// name: string;
// => If user is admin, the field name will be serialized
// => If user is not admin, the field name will not be serialized
@Injectable()
export class RoleBasedSerializationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const role = request.user?.scope?.role;

    return next.handle().pipe(
      map((data) => {
        // If data is StreamableFile or Buffer then return directly
        if (data instanceof StreamableFile || data instanceof Buffer) {
          return data;
        }

        // If data is not object or array then return directly
        if (typeof data !== 'object') {
          return data;
        }

        const options = {
          groups: role ? [role] : [],
          // excludeExtraneousValues: true,
        };

        // Mang phai duyet TUNG PHAN TU, khong duoc dua ca mang vao
        // plainToInstance.
        //
        // Ly do: `data.constructor` cua 1 mang la `Array`, nen
        // `plainToInstance(Array, [obj, obj])` dung MOI phan tu thanh mot
        // `Array` moi roi copy thuoc tinh vao do. JSON.stringify cua mang bo
        // het thuoc tinh khong phai chi so, nen response ra `[[],[]]` - mat
        // sach du lieu ma khong he bao loi.
        //
        // Bug that da do duoc o `shared-user` ngay 03/09/2026:
        // `POST /internal/users/batch-lookup` tra `[[],[]]` va
        // `POST /internal/users/list-recent` tra `[[],[],[]]`. He qua: ben goi
        // ghep identity theo kieu fail-open nen moi man hinh danh sach hien
        // ten rong ma khong co loi nao noi len. Xem
        // tests/manual/runs/2026-09-03-1010-local-stage1.md muc L1.
        //
        // `terminal` hom nay chua co route nao tra mang tran (moi route
        // client-facing deu boc `AppResponseDto`, `result.items` nam TRONG mot
        // object nen khong di qua nhanh mang o cap cao nhat) - van sua ngay,
        // dung ly do `trend` da ghi: giu hai ban giong nhau de dot ra soat sau
        // khong phai doi chieu lai, va chan truoc cho cac route noi bo cua
        // giai doan 4 (`/internal/balance/*`, `/internal/accumulated-points/*`)
        // - chung se tra mang.
        if (Array.isArray(data)) {
          return data.map((item) =>
            item && typeof item === 'object'
              ? plainToInstance(item.constructor ?? Object, item, options)
              : item,
          );
        }

        // Transform with plain object
        return plainToInstance(data?.constructor ?? Object, data, options);
      }),
    );
  }
}
