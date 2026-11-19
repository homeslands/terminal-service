import { Repository, In, IsNull } from 'typeorm';
import { LoggerService } from '@nestjs/common';
import { User } from './user.entity';
import {
  SharedUserLookupResponse,
  SharedUserServiceClient,
} from 'src/external-services/shared-user-service/shared-user-service.client';
import { SharedUserUnavailableException } from 'src/external-services/shared-user-service/shared-user-service.exception';

/**
 * Attach createdBy user to array entity
 * @param entities - Array of entities
 * @param userRepo - User repository
 * @param mapField - Field name to map createdBy user
 * @returns Array of entities with createdBy user
 */
export const attachCreatedByForArrayEntity = async <
  T extends { createdBy?: string | null },
>(
  entities: T[],
  userRepo: Repository<User>,
): Promise<Array<T & { createdBy: User | null }>> => {
  if (!entities || entities.length === 0) return [];

  const ids = Array.from(
    new Set(entities.map((e) => e.createdBy).filter(Boolean)),
  ) as string[];

  if (ids.length === 0) {
    return entities.map((e) => ({ ...e, ['createdBy']: null }));
  }

  // Query user
  const users = await userRepo.find({
    where: { id: In(ids) },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  return entities.map((e) => ({
    ...e,
    ['createdBy']: e.createdBy ? (userMap.get(e.createdBy) ?? null) : null,
  }));
};

/**
 * Attach createdBy user to single entity
 * @param entities - Single entity
 * @param userRepo - User repository
 * @param mapField - Field name to map createdBy user
 * @returns Single entity with createdBy user
 */
export const attachCreatedByForSingleEntity = async <
  T extends { createdBy?: string | null },
>(
  entity: T,
  userRepo: Repository<User>,
): Promise<T & { createdBy: User | null }> => {
  if (!entity) return null;

  // Query user
  const user = await userRepo.findOne({
    where: { id: entity.createdBy ?? IsNull() },
  });

  return { ...entity, ['createdBy']: user ?? null };
};

// Bo field dung de ghep vao createdBy (GeneralUserResponseDto) - CHI 3 field
// nay, khong duoc them field khac vao day vi DTO dich chi khai bao dung 3
// field (architect-http.md muc 1.4 - khong tu y doi shape response).
export const GENERAL_IDENTITY_FIELDS = [
  'phonenumber',
  'firstName',
  'lastName',
] as const;

// Bo field day du dung khi dich la UserResponseDto (vd
// UserGroupMemberResponseDto.user) - cung danh sach field dang dung o
// UserService.mergeSharedUserIdentity.
//
// KHONG co `isActive` o day: no phai duoc gan trong MOI truong hop, ke ca
// khi khong tim thay identity, nen di rieng qua `applyUserIdentity` ben duoi
// thay vi la 1 field bo qua duoc.
export const FULL_IDENTITY_FIELDS = [
  'phonenumber',
  'firstName',
  'lastName',
  'dob',
  'email',
  'address',
  'image',
  'isVerifiedEmail',
  'isVerifiedPhonenumber',
] as const;

/**
 * Gan de tung field trong `fields` tu `identity` vao `target` neu gia tri
 * tuong ung ben identity khong phai undefined. Dung chung cho ca merge rut
 * gon (createdBy) lan day du (user) - chi khac danh sach field truyen vao.
 */
export const mergeSharedUserIdentityInto = <T extends Record<string, any>>(
  target: T,
  identity: Partial<SharedUserLookupResponse> | null | undefined,
  fields: readonly string[],
): T => {
  if (!identity) return target;
  for (const field of fields) {
    if (identity[field] !== undefined) target[field as keyof T] = identity[field];
  }
  return target;
};

/**
 * Ghep identity cua shared-user vao 1 doi tuong se duoc map sang
 * UserResponseDto (vd `UserGroupMemberResponseDto.user`).
 *
 * `isActive` gan RIENG va gan LUON, ke ca khi `identity` la null. Khoa/mo
 * khoa tai khoan quy het ve shared-user (architect-http.md muc 1.1), nen cot
 * `is_active_column` ben terminal la du lieu chet: khong con ai ghi vao no, mac
 * dinh `true`, va se bi xoa khi ket thuc chuyen doi (user_tbl chi con
 * sharedUserId + role + branch). Giu no lam gia tri du phong nghia la bao
 * "dang hoat dong" cho ca tai khoan vua bi khoa - dung lo hong tester ghi
 * ngay 03/09/2026 O BEN `trend` (tests/tester-issues/1.3.9.xlsx dong 38);
 * `terminal` chep san quyet dinh nay de khong mac lai.
 *
 * Khong co identity => `false`. Day la su that chu khong phai gia tri an
 * toan tuy tien: khong co ban ghi ben shared-user thi tai khoan do khong xac
 * thuc duoc (JwtStrategy tra theo sharedUserId roi chan neu khong thay).
 *
 * Tu buoc 3.4: neu `target` la entity `User` se dem di automapper thi
 * `isActive` gan o day KHONG toi duoc DTO (entity da bo field, automapper bo
 * qua) - phai gan them tren DTO sau khi map bang `assignNestedUserFlags`. Hai
 * co xac minh trong `FULL_IDENTITY_FIELDS` cung vay tu buoc 4.7.
 *
 * Luu y: UserService.mergeSharedUserIdentity CO CHU DICH khong dung ham nay
 * - danh sach field cua no khong co `image`, con UserResponseDto cung khong
 * khai bao `image`, nen dung chung se them field la vao response cua
 * GET /user (architect-http.md muc 1.4 - khong tu y doi shape response).
 */
export const applyUserIdentity = <T extends Record<string, any>>(
  target: T,
  identity: Partial<SharedUserLookupResponse> | null | undefined,
): T => {
  mergeSharedUserIdentityInto(target, identity, FULL_IDENTITY_FIELDS);
  (target as Record<string, unknown>).isActive = identity?.isActive ?? false;
  return target;
};

/**
 * Batch tra identity nhieu user cung luc theo sharedUserId, dung khi can
 * ghep identity vao 1 trang danh sach/chi tiet (tranh goi lookup N+1 lan).
 *
 * Fail-closed: goi hong thi nem 503, KHONG tra Map rong roi de ben goi hien
 * du lieu cuc bo.
 *
 * Fail-open o day khong mua them tinh san sang nao: JwtStrategy da goi
 * `POST /internal/users/lookup` va nem 503 tren MOI request co auth, nen
 * shared-user chet thi request khong bao gio di toi duoc day. Nhanh catch cu
 * chi bat duoc dung truong hop "shared-user song nhung rieng loi goi batch
 * nay hong" - va trong dung truong hop do no bien 1 loi tam thoi thanh du
 * lieu sai mot cach im lang (chinh la cach lo hong `isActive` song sot).
 * Sau khi ket thuc chuyen doi thi con vo nghia han: khong con cot cuc bo nao
 * de fallback ve.
 */
export const batchLookupSharedUserIdentities = async (
  sharedUserIds: Array<string | null | undefined>,
  sharedUserServiceClient: SharedUserServiceClient,
  // Chi can `error` - nhan ca logger cua Nest lan logger winston ma vai service
  // khai kieu (vd `PointTransactionService`).
  logger: Pick<LoggerService, 'error'>,
  context: string,
): Promise<Map<string, SharedUserLookupResponse>> => {
  const ids = Array.from(
    new Set(sharedUserIds.filter((id): id is string => Boolean(id))),
  );
  if (!ids.length) return new Map();

  try {
    const identities = await sharedUserServiceClient.lookupByIds(ids);
    return new Map(identities.map((identity) => [identity.id, identity]));
  } catch (error) {
    logger.error(
      `Failed to batch-lookup shared-user identities: ${error?.message}`,
      error?.stack,
      context,
    );
    throw new SharedUserUnavailableException();
  }
};

/** Ba co trang thai cua `UserResponseDto` khong con cot tren entity `User`. */
type NestedUserFlags = {
  isActive?: boolean;
  isVerifiedEmail?: boolean;
  isVerifiedPhonenumber?: boolean;
};

/** Mot cap (user entity da nap, user DTO da map tu chinh entity do). */
export type NestedUserPair = readonly [
  Pick<User, 'sharedUserId'> | null | undefined,
  NestedUserFlags | null | undefined,
];

/**
 * Gan ba co trang thai cho user LONG trong response SAU khi map: `isActive`
 * (buoc 3.4) va hai co xac minh email/SDT (buoc 4.7).
 *
 * Vi sao phai gan tren DTO chu khong tren entity: entity `User` da bo ca ba
 * field, ma automapper (`@automapper/core` 8, `createInitialMapping`) chi map
 * nhung field co trong METADATA cua class nguon - gan len entity truoc khi map
 * (`applyUserIdentity`, `mergeSharedUserIdentityInto` voi
 * `FULL_IDENTITY_FIELDS`) thi bi bo qua im lang, key bien mat khoi JSON (muc
 * 1.4). Nen gan sau khi map, len chinh DTO.
 *
 * Lay tu identity cua shared-user; khong co identity => `false` ca ba (cung
 * luat voi `applyUserIdentity`): khong co ban ghi ben shared-user thi tai
 * khoan khong dung duoc va khong co gi da duoc xac minh.
 */
export const assignNestedUserFlags = (
  pairs: ReadonlyArray<NestedUserPair>,
  identityById: Map<string, SharedUserLookupResponse>,
): void => {
  for (const [user, dto] of pairs) {
    if (!user || !dto) continue;
    const identity = identityById.get(user.sharedUserId);
    dto.isActive = identity?.isActive ?? false;
    dto.isVerifiedEmail = identity?.isVerifiedEmail ?? false;
    dto.isVerifiedPhonenumber = identity?.isVerifiedPhonenumber ?? false;
  }
};

/**
 * Nhu `assignNestedUserFlags` nhung tu tra identity - MOT lan batch cho ca
 * trang (khong N+1), fail-closed 503 nhu `batchLookupSharedUserIdentities`.
 * Khong cap nao co user => khong goi shared-user.
 *
 * CHI dung o duong DOC co dang nhap. Ly do "503 khong mat gi" cua
 * `batchLookupSharedUserIdentities` dua tren hai gia dinh, sai o hai noi
 * (sua sau review buoc 3.4, 15/11/2026):
 * - Duong GHI: goi SAU khi ghi thi shared-user hong => client nhan 503 cho
 *   mot thao tac DA thanh cong, goi lai la ghi trung (vd cong diem hai lan).
 *   Phai `batchLookupSharedUserIdentities` TRUOC lenh ghi dau tien, roi
 *   `assignNestedUserFlags` sau khi map.
 * - Route `@Public`: khong qua `JwtStrategy`, goi o day la THEM mot phu
 *   thuoc shared-user cho route cong khai => route cong khai khong ghep
 *   co trang thai (vd `VoucherService.findOnePublic`).
 */
export const applyNestedUserFlags = async (
  pairs: ReadonlyArray<NestedUserPair>,
  sharedUserServiceClient: SharedUserServiceClient,
  logger: Pick<LoggerService, 'error'>,
  context: string,
): Promise<void> => {
  const present = pairs.filter(([user, dto]) => user && dto);
  if (!present.length) return;
  const identityById = await batchLookupSharedUserIdentities(
    present.map(([user]) => user.sharedUserId),
    sharedUserServiceClient,
    logger,
    context,
  );
  assignNestedUserFlags(present, identityById);
};

