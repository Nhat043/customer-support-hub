import type { Membership, Organization, Session, User } from "../../infrastructure/prisma/prisma.types";

/** Payload carried by a verified access token and attached by JwtGuard. */
export type AuthenticatedUser = {
  userId: string;
  sessionId: string;
  organizationId?: string;
};

/** Active session row attached by JwtGuard, with its owning user eagerly loaded. */
export type AuthenticatedSession = Session & { user: User };

/** Tenant context attached by OrgGuard once the caller's membership is verified. */
export type RequestOrganization = Organization;
export type RequestMembership = Membership;
