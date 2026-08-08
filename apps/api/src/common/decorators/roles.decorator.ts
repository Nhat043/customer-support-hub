import { SetMetadata } from "@nestjs/common";

export const MEMBERSHIP_ROLES_KEY = "membershipRoles";
export type MembershipRoleValue = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export const Roles = (...roles: MembershipRoleValue[]) =>
  SetMetadata(MEMBERSHIP_ROLES_KEY, roles);
