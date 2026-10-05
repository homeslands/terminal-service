import { Repository, In, IsNull } from 'typeorm';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { User } from './user.entity';
import {
  SharedUserLookupResponse,
  SharedUserServiceClient,
} from 'src/external-services/shared-user-service/shared-user-service.client';

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
  logger: Logger,
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
    throw new ServiceUnavailableException();
  }
};

