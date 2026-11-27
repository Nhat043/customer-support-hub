import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type {
  AuthenticatedSession,
  RequestMembership,
  RequestOrganization
} from "../types/request-context";

export type TenantAccess = {
  organization: RequestOrganization;
  membership: RequestMembership;
};

/**
 * Single source of truth for "is this caller allowed into this tenant".
 *
 * Both the HTTP guards (JwtGuard, OrgGuard) and the Socket.IO agent gateway
 * resolve access through this service, so the two transports cannot drift apart
 * when the session or membership rules change.
 */
@Injectable()
export class TenantAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Loads the session behind an already-verified access token. The session and
   * its user must both still be active, so revoking either one takes effect
   * immediately rather than at access-token expiry.
   */
  async requireActiveSession(sessionId: string): Promise<AuthenticatedSession> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true }
    });

    if (
      !session ||
      session.status !== "ACTIVE" ||
      session.expiresAt <= new Date() ||
      session.user.status !== "ACTIVE"
    ) {
      throw new UnauthorizedException("Session is not active");
    }

    return session;
  }

  /** Resolves the organization behind a slug and the caller's active membership in it. */
  async requireMembership(userId: string, orgSlug: string): Promise<TenantAccess> {
    const organization = await this.prisma.organization.findUnique({
      where: { slug: orgSlug }
    });

    if (!organization) {
      throw new NotFoundException("Organization not found");
    }

    const membership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: organization.id, userId } }
    });

    if (!membership || membership.status !== "ACTIVE") {
      throw new ForbiddenException("No access to this organization");
    }

    return { organization, membership };
  }
}
