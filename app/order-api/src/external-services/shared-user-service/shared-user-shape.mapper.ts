import { MembershipCardResponseDto } from 'src/membership-card/membership-card.dto';
import { UserRequirementResponseDto } from 'src/user/user.dto';
import {
  SharedMembershipCard,
  SharedUserRequirement,
} from './shared-user-service.client';

// QD22 (buoc 2.5) - the + requirement nay song o shared-user, nhung shape
// response client-facing cua trend KHONG duoc doi (architect-http.md muc 1.4).
// Hai ham duoi la mot cho duy nhat lam phep anh xa do, dung cho ca
// `GET /user`, `GET /user/:slug`, `GET /auth/profile`, danh sach thanh vien
// nhom va 5 route cua `membership-card.controller.ts`.

/**
 * `SharedMembershipCard` -> `MembershipCardResponseDto`.
 *
 * DTO dich chi co {slug, createdAt, isActive, expiredAt} - KHONG co `code`
 * (do lai 26/10/2026: `trend-ui` chi doc `membershipCard` co/khong va
 * `membershipCard.isActive`, khong doc `code` hay `slug`). Giu dung bon field
 * do, khong them `code` vao: them field la doi shape.
 *
 * `slug` nay la slug the ben shared-user. Truoc 2.5 no la slug the cuc bo -
 * hai gia tri co the khac nhau, nhung khong noi nao dung slug the lam khoa
 * goi tiep, nen khong anh huong.
 */
export const toMembershipCardResponse = (
  card: SharedMembershipCard | null | undefined,
): MembershipCardResponseDto | null => {
  if (!card) return null;
  return {
    slug: card.slug,
    createdAt: card.createdAt,
    isActive: card.isActive,
    expiredAt: card.expiredAt ?? undefined,
  } as MembershipCardResponseDto;
};

/**
 * `userRequirements` cua `/internal/users/lookup` -> `UserRequirementResponseDto[]`.
 *
 * Tra `[]` khi khong co (khach vang lai, hoac lookup fail-open o profile) -
 * KHONG tra `undefined`: giao dien doc `.find(...)` tren field nay
 * (`customer-columns.tsx`), `undefined` la no no.
 */
export const toUserRequirementResponses = (
  requirements: SharedUserRequirement[] | null | undefined,
): UserRequirementResponseDto[] => {
  if (!requirements?.length) return [];
  return requirements.map(
    (requirement) =>
      ({
        slug: requirement.slug,
        createdAt: requirement.createdAt,
        key: requirement.key,
        status: requirement.status,
        level: requirement.level,
        scope: requirement.scope,
        expiredAt: requirement.expiredAt ?? undefined,
        lastUpdatedAt: requirement.lastUpdatedAt ?? undefined,
      }) as UserRequirementResponseDto,
  );
};
