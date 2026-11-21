import { LoggerService } from '@nestjs/common';
import { SharedUserServiceClient } from 'src/external-services/shared-user-service/shared-user-service.client';
import { isDefaultCustomer } from 'src/user/user.constant';
import { User } from 'src/user/user.entity';
import {
  assignNestedUserFlags,
  batchLookupSharedUserIdentities,
  mergeSharedUserIdentityInto,
} from 'src/user/user.helper';
import { OrderResponseDto, OwnerResponseDto } from './order.dto';
import { Order } from './order.entity';

/**
 * Buoc 7.3 (ban terminal, cung khuon trend - 13 cho map: 11 o
 * `order.service.ts` gom `getActiveOrderByTable` + `changeTable` cua man POS
 * ban, 2 o `work-shift.service.ts`) - `owner` / `approvalBy` trong `OrderResponseDto`
 * lay `phonenumber`, `firstName`, `lastName` tu shared-user (nguon that), KHONG
 * tu `user_tbl` cuc bo (cot do bi drop o giai doan 8).
 *
 * Mot ham cho MOI cho map ra `OrderResponseDto`: ghep le o tung cho la moi cho
 * mot co hoi bo sot, va voi `mapArray` thi thanh N+1 luot goi mang.
 *
 * - Doc `sharedUserId` tu ENTITY goc (`orders[i]`), vi `OwnerResponseDto` khong
 *   co field do - va khong duoc them vao (muc 1.4). `orders[i]` va `dtos[i]`
 *   phai la cung mot don.
 * - Gom owner + approvalBy cua CA MANG vao MOT luot batch-lookup
 *   (`batchLookupSharedUserIdentities`: trung id thi mot id, chia lo theo
 *   tran cua shared-user, khong co id nao thi khong goi).
 * - Chi ghi DUNG 3 field DTO khai. `role` / `branch` giu nguyen tu trend.
 *   Ghep them field (`dob`, `email`...) la them key vao response.
 * - Khach vang lai (`isDefaultCustomer`): KHONG dua id sentinel vao lo va KHONG
 *   ghi de - giu dung gia tri hang sentinel ma mapper da dat (`Default` /
 *   `Customer` / SDT sentinel, trung voi hang sentinel ben shared-user). Hai UI
 *   nhan dien khach vang lai bang chinh hai gia tri do (`owner.firstName !==
 *   'Default'`, `owner.phonenumber !== <SDT sentinel>` - vd khoi diem tich luy
 *   cua man thanh toan); doi thanh "Khach vang lai" la doi gia tri UI dang dua
 *   vao. `approvalBy` o terminal la thu ngan (`payment.service.ts` gan khi
 *   thu tien) - van di qua cung nhanh kiem sentinel cho dong bo voi trend.
 * - FAIL-CLOSED: shared-user khong tra loi => `SharedUserUnavailableException`
 *   (503), khong roi ve ten cuc bo (cung loai sai lech D9).
 * - Co `sharedUserId` ma shared-user khong tra ve (hang da xoa mem ben do):
 *   giu gia tri mapper da dat + log `warn` - cung cach `GET /user`
 *   (`UserService.mergeSharedUserIdentity`). Nem loi o day la lam hong ca
 *   trang danh sach vi mot hang.
 *
 * - `voucher.assignedUser` (chi co o chi tiet don - `getOrder` nap
 *   `voucher.assignedUser`): cung lo batch-lookup, KHONG them luot goi. Ghi cac
 *   field identity ma `UserResponseDto` khai (`ASSIGNED_USER_IDENTITY_FIELDS`,
 *   khong co `image`) + ba co `isActive` / `isVerifiedEmail` /
 *   `isVerifiedPhonenumber` bang `assignNestedUserFlags` - nhu `GET /voucher`
 *   (buoc 4.6, D18, D19). Ke hoach giao viec nay cho 7.2; bo sot o buoc 7.3, va
 *   tu 3.4 / 4.7 user long nay con mat ba key co (entity bo field). Bo sung
 *   trong luot nghiem thu giai doan 7 (TC-ST-176).
 *
 * Ghi THANG vao `dtos` (khong tao ban moi) - cho goi giu nguyen bien da co.
 */

/**
 * Identity cua `voucher.assignedUser` (`UserResponseDto`): chi field DTO khai.
 * `FULL_IDENTITY_FIELDS` co them `image` (DTO khong khai => them key la, muc
 * 1.4) va hai co xac minh (gan rieng bang `assignNestedUserFlags`).
 */
const ASSIGNED_USER_IDENTITY_FIELDS = [
  'phonenumber',
  'firstName',
  'lastName',
  'dob',
  'email',
  'address',
] as const;

export const mergeOrderOwnerIdentity = async (
  orders: Order[],
  dtos: OrderResponseDto[],
  sharedUserServiceClient: SharedUserServiceClient,
  logger: Pick<LoggerService, 'error' | 'warn'>,
  context: string,
): Promise<OrderResponseDto[]> => {
  const realPeople = (order: Order | null | undefined): User[] =>
    [order?.owner, order?.approvalBy, order?.voucher?.assignedUser].filter(
      (person): person is User => Boolean(person) && !isDefaultCustomer(person),
    );

  const identities = await batchLookupSharedUserIdentities(
    orders.flatMap((order) =>
      realPeople(order).map((person) => person.sharedUserId),
    ),
    sharedUserServiceClient,
    logger,
    context,
  );

  const missing = new Set<string>();
  const merge = (
    person: User | null | undefined,
    dto: OwnerResponseDto | null | undefined,
  ): void => {
    if (!person || !dto || isDefaultCustomer(person)) return;
    const identity = person.sharedUserId
      ? identities.get(person.sharedUserId)
      : undefined;
    if (!identity) {
      missing.add(`${person.id}:${person.sharedUserId}`);
      return;
    }
    dto.phonenumber = identity.phonenumber;
    dto.firstName = identity.firstName ?? null;
    dto.lastName = identity.lastName ?? null;
  };

  orders.forEach((order, index) => {
    merge(order?.owner, dtos[index]?.owner);
    merge(order?.approvalBy, dtos[index]?.approvalBy);
    const assigned = order?.voucher?.assignedUser;
    const assignedDto = dtos[index]?.voucher?.assignedUser;
    if (assigned && assignedDto && !isDefaultCustomer(assigned)) {
      const identity = assigned.sharedUserId
        ? identities.get(assigned.sharedUserId)
        : undefined;
      if (identity) {
        mergeSharedUserIdentityInto(
          assignedDto,
          identity,
          ASSIGNED_USER_IDENTITY_FIELDS,
        );
      } else {
        missing.add(`${assigned.id}:${assigned.sharedUserId}`);
      }
    }
  });
  assignNestedUserFlags(
    orders.map(
      (order, index) =>
        [
          order?.voucher?.assignedUser,
          dtos[index]?.voucher?.assignedUser,
        ] as const,
    ),
    identities,
  );

  if (missing.size) {
    logger.warn(
      `Order owner identity not found at shared-user, local values kept for user:sharedUserId ${[...missing].join(', ')}`,
      context,
    );
  }
  return dtos;
};
