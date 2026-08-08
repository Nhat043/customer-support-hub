import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { EmailService } from "../../infrastructure/email/email.service";
import type { MembershipRoleValue } from "../../common/decorators/roles.decorator";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async listMembers(organizationId: string) {
    return this.prisma.membership.findMany({
      where: { organizationId, status: "ACTIVE" },
      include: {
        user: {
          select: { id: true, fullName: true, email: true, status: true },
        },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });
  }

  async listInvitations(organizationId: string) {
    await this.expirePendingInvitations();
    return this.prisma.invitation.findMany({
      where: { organizationId, status: "PENDING" },
      include: {
        invitedBy: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createInvitation(input: {
    organizationId: string;
    invitedById: string;
    inviterRole: MembershipRoleValue;
    email: string;
    role: MembershipRoleValue;
  }) {
    const email = input.email.trim().toLowerCase();
    if (input.inviterRole === "ADMIN" && input.role === "ADMIN") {
      throw new ForbiddenException("Admins can invite members and viewers only");
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const activeMembership = await this.prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: input.organizationId,
            userId: existingUser.id,
          },
        },
      });
      if (activeMembership?.status === "ACTIVE") {
        throw new ConflictException("This person is already on the team");
      }
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const invitation = await this.prisma.$transaction(async (tx) => {
      await tx.invitation.updateMany({
        where: {
          organizationId: input.organizationId,
          email,
          status: "PENDING",
        },
        data: { status: "REVOKED", revokedAt: new Date() },
      });

      const created = await tx.invitation.create({
        data: {
          organizationId: input.organizationId,
          email,
          role: input.role,
          tokenHash: this.hashToken(token),
          invitedById: input.invitedById,
          expiresAt,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.invitedById,
          action: "TEAM_INVITATION_CREATED",
          entityType: "Invitation",
          entityId: created.id,
          afterState: { email, role: input.role, expiresAt: expiresAt.toISOString() },
        },
      });
      return created;
    });

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: input.organizationId },
      select: { name: true },
    });
    const delivery = await this.emailService.sendTeamInvitation({
      recipient: email,
      organizationName: organization.name,
      role: input.role,
      token,
      expiresAt,
    });

    return {
      ...invitation,
      delivery,
      // The authenticated inviter can copy this only when local SMTP is unavailable.
      manualInvitationToken: delivery.sent ? undefined : token,
    };
  }

  async previewInvitation(token: string) {
    const invitation = await this.findPendingInvitation(token);
    const account = await this.prisma.user.findUnique({
      where: { email: invitation.email },
      select: { id: true },
    });
    return {
      email: invitation.email,
      hasAccount: Boolean(account),
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      organization: invitation.organization,
    };
  }

  async acceptInvitation(input: {
    token: string;
    userId: string;
    email: string;
    sessionId?: string;
  }) {
    const invitation = await this.findPendingInvitation(input.token);
    const userEmail = input.email.trim().toLowerCase() || (
      await this.prisma.user.findUniqueOrThrow({
        where: { id: input.userId },
        select: { email: true },
      })
    ).email;
    if (invitation.email !== userEmail) {
      throw new ForbiddenException("This invitation belongs to a different email address");
    }

    return this.prisma.$transaction(async (tx) => {
      const existingMembership = await tx.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: input.userId,
          },
        },
      });
      if (existingMembership?.status === "ACTIVE") {
        throw new ConflictException("You are already a member of this workspace");
      }

      const membership = await tx.membership.upsert({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: input.userId,
          },
        },
        create: {
          organizationId: invitation.organizationId,
          userId: input.userId,
          role: invitation.role,
          status: "ACTIVE",
        },
        update: {
          role: invitation.role,
          status: "ACTIVE",
        },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          status: "ACCEPTED",
          acceptedById: input.userId,
          acceptedAt: new Date(),
        },
      });
      if (input.sessionId) {
        await tx.session.updateMany({
          where: { id: input.sessionId, userId: input.userId },
          data: { organizationId: invitation.organizationId, workspaceId: null },
        });
      }
      await tx.auditLog.create({
        data: {
          organizationId: invitation.organizationId,
          actorUserId: input.userId,
          action: "TEAM_INVITATION_ACCEPTED",
          entityType: "Invitation",
          entityId: invitation.id,
          afterState: { role: invitation.role },
        },
      });

      return {
        membership,
        organization: invitation.organization,
      };
    });
  }

  async updateMembershipRole(input: {
    organizationId: string;
    actorUserId: string;
    membershipId: string;
    role: MembershipRoleValue;
  }) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        id: input.membershipId,
        organizationId: input.organizationId,
        status: "ACTIVE",
      },
    });
    if (!membership) {
      throw new NotFoundException("Team member not found");
    }
    if (membership.role === "OWNER" || input.role === "OWNER") {
      throw new ForbiddenException("Owner access cannot be changed here");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.membership.update({
        where: { id: membership.id },
        data: { role: input.role },
        include: { user: { select: { id: true, fullName: true, email: true, status: true } } },
      });
      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: "TEAM_MEMBER_ROLE_UPDATED",
          entityType: "Membership",
          entityId: membership.id,
          beforeState: { role: membership.role },
          afterState: { role: input.role },
        },
      });
      return updated;
    });
  }

  async removeMember(input: {
    organizationId: string;
    actorUserId: string;
    membershipId: string;
  }) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        id: input.membershipId,
        organizationId: input.organizationId,
        status: "ACTIVE",
      },
    });
    if (!membership) {
      throw new NotFoundException("Team member not found");
    }
    if (membership.userId === input.actorUserId || membership.role === "OWNER") {
      throw new ForbiddenException("This team member cannot be removed here");
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.membership.update({
        where: { id: membership.id },
        data: { status: "REMOVED" },
      });
      await tx.session.updateMany({
        where: {
          userId: membership.userId,
          organizationId: input.organizationId,
          status: "ACTIVE",
        },
        data: { organizationId: null, workspaceId: null },
      });
      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: "TEAM_MEMBER_REMOVED",
          entityType: "Membership",
          entityId: membership.id,
        },
      });
      return { ok: true };
    });
  }

  async revokeInvitation(input: {
    organizationId: string;
    invitationId: string;
    actorUserId: string;
    actorRole: MembershipRoleValue;
  }) {
    const invitation = await this.prisma.invitation.findFirst({
      where: {
        id: input.invitationId,
        organizationId: input.organizationId,
        status: "PENDING",
      },
    });
    if (!invitation) {
      throw new NotFoundException("Invitation not found");
    }
    if (input.actorRole !== "OWNER" && invitation.invitedById !== input.actorUserId) {
      throw new ForbiddenException("Only the invitation creator can revoke it");
    }

    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    return { ok: true };
  }

  private async findPendingInvitation(token: string) {
    await this.expirePendingInvitations();
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: {
        organization: { select: { id: true, slug: true, name: true } },
      },
    });
    if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt <= new Date()) {
      throw new NotFoundException("This invitation is no longer available");
    }
    return invitation;
  }

  private expirePendingInvitations() {
    return this.prisma.invitation.updateMany({
      where: { status: "PENDING", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    });
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }
}
