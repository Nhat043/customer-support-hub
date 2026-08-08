import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import {
  Prisma,
  RefreshTokenStatus,
  SessionStatus,
  UserStatus,
} from "../../../node_modules/.prisma/client";
import * as bcrypt from "bcryptjs";
import { randomUUID, randomBytes, randomInt, createHash, createHmac, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { EmailService } from "../../infrastructure/email/email.service";
import {
  ConfirmPasswordResetDto,
  LoginDto,
  RegisterDto,
  RequestPasswordResetDto,
  VerifyPasswordResetOtpDto,
} from "./dto/auth.dto";

const PASSWORD_RESET_OTP_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;

type TokenPayload = {
  userId: string;
  sessionId: string;
  organizationId?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      throw new BadRequestException("Email already exists");
    }

    const invitation = dto.invitationToken?.trim()
      ? await this.prisma.invitation.findUnique({
          where: { tokenHash: this.hashInvitationToken(dto.invitationToken.trim()) },
          include: { organization: true },
        })
      : null;
    if (
      dto.invitationToken &&
      (!invitation ||
        invitation.status !== "PENDING" ||
        invitation.expiresAt <= new Date())
    ) {
      throw new BadRequestException("This invitation is no longer available");
    }
    if (invitation && invitation.email !== email) {
      throw new ForbiddenException("This invitation belongs to a different email address");
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const organizationName =
      dto.organizationName?.trim() || `${dto.fullName}'s Workspace`;
    const organizationSlug = this.uniqueSlug(organizationName);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName: dto.fullName,
        },
      });

      if (invitation) {
        await tx.membership.create({
          data: {
            organizationId: invitation.organizationId,
            userId: user.id,
            role: invitation.role,
          },
        });
        await tx.invitation.update({
          where: { id: invitation.id },
          data: {
            status: "ACCEPTED",
            acceptedById: user.id,
            acceptedAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: invitation.organizationId,
            actorUserId: user.id,
            action: "TEAM_INVITATION_ACCEPTED",
            entityType: "Invitation",
            entityId: invitation.id,
            afterState: { role: invitation.role },
          },
        });
        return {
          user,
          organization: invitation.organization,
          membershipRole: invitation.role,
        };
      }

      const organization = await tx.organization.create({
        data: { slug: organizationSlug, name: organizationName },
      });
      await tx.membership.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: "OWNER",
        },
      });
      await tx.workspace.create({
        data: { organizationId: organization.id, slug: "general", name: "General" },
      });

      return { user, organization, membershipRole: "OWNER" as const };
    });

    const session = await this.createSession(
      created.user.id,
      created.organization.id,
    );
    return this.buildAuthSession(
      created.user.id,
      session.id,
      created.organization.id,
      created.organization.slug,
      session.refreshToken,
      created.membershipRole,
    );
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: { organization: true },
        },
      },
    });

    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const membership = user.memberships[0];
    const organizationId = membership?.organizationId;
    const session = await this.createSession(user.id, organizationId);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return this.buildAuthSession(
      user.id,
      session.id,
      organizationId,
      membership?.organization.slug,
      session.refreshToken,
      membership?.role,
    );
  }

  async requestPasswordReset(dto: RequestPasswordResetDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    });

    // Keep this response identical for unknown or disabled accounts.
    if (!user || user.status !== UserStatus.ACTIVE) {
      return { ok: true };
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + PASSWORD_RESET_OTP_TTL_MS);
    const code = this.generatePasswordResetOtp();
    const reset = await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetOtp.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: now },
      });
      return tx.passwordResetOtp.create({
        data: {
          userId: user.id,
          otpHash: this.hashPasswordResetValue(code),
          expiresAt,
        },
      });
    });

    const delivery = await this.emailService.sendPasswordResetOtp({
      recipient: email,
      code,
      expiresAt,
    });
    if (!delivery.sent) {
      await this.prisma.passwordResetOtp.updateMany({
        where: { id: reset.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
    }

    return { ok: true };
  }

  async verifyPasswordResetOtp(dto: VerifyPasswordResetOtpDto) {
    const now = new Date();
    const reset = await this.prisma.passwordResetOtp.findFirst({
      where: {
        user: { email: dto.email.trim().toLowerCase() },
        consumedAt: null,
        verifiedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!reset || reset.attempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
      throw new BadRequestException("This reset code is invalid or expired");
    }

    const otpHash = this.hashPasswordResetValue(dto.otp);
    const isValid = timingSafeEqual(
      Buffer.from(otpHash, "utf8"),
      Buffer.from(reset.otpHash, "utf8"),
    );
    if (!isValid) {
      const attempts = reset.attempts + 1;
      await this.prisma.passwordResetOtp.update({
        where: { id: reset.id },
        data: {
          attempts,
          ...(attempts >= PASSWORD_RESET_MAX_ATTEMPTS ? { consumedAt: now } : {}),
        },
      });
      throw new BadRequestException("This reset code is invalid or expired");
    }

    const resetToken = randomBytes(32).toString("base64url");
    const verified = await this.prisma.passwordResetOtp.updateMany({
      where: {
        id: reset.id,
        consumedAt: null,
        verifiedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        verifiedAt: now,
        resetTokenHash: this.hashPasswordResetValue(resetToken),
      },
    });
    if (verified.count !== 1) {
      throw new BadRequestException("This reset code is invalid or expired");
    }

    return { resetToken };
  }

  async confirmPasswordReset(dto: ConfirmPasswordResetDto) {
    const now = new Date();
    const resetTokenHash = this.hashPasswordResetValue(dto.resetToken);
    const passwordHash = await bcrypt.hash(dto.password, 12);

    await this.prisma.$transaction(async (tx) => {
      const reset = await tx.passwordResetOtp.findUnique({
        where: { resetTokenHash },
      });
      if (
        !reset ||
        reset.consumedAt ||
        !reset.verifiedAt ||
        reset.expiresAt <= now
      ) {
        throw new BadRequestException("This password reset is invalid or expired");
      }

      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash },
      });
      await tx.passwordResetOtp.update({
        where: { id: reset.id },
        data: { consumedAt: now },
      });
      await this.revokeAllSessions(tx, reset.userId, now);
    });

    return { ok: true };
  }

  async refresh(sessionId: string, refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const now = new Date();
    const refreshed = await this.prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({
        where: { id: sessionId },
        include: { user: true, organization: true },
      });

      if (
        !session ||
        session.status !== SessionStatus.ACTIVE ||
        session.expiresAt <= now ||
        session.absoluteExpiresAt <= now ||
        session.user.status !== UserStatus.ACTIVE
      ) {
        if (
          session?.status === SessionStatus.ACTIVE &&
          (session.expiresAt <= now || session.absoluteExpiresAt <= now)
        ) {
          await this.expireSession(tx, session.id, now);
        }
        throw new UnauthorizedException("Session is not active");
      }

      const token = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!token || token.sessionId !== session.id) {
        throw new UnauthorizedException("Refresh token mismatch");
      }

      if (
        token.status !== RefreshTokenStatus.ACTIVE ||
        token.expiresAt <= now
      ) {
        await this.revokeSession(tx, session.id, now);
        throw new UnauthorizedException("Refresh token reuse detected");
      }

      // Only one concurrent refresh can consume an active refresh token.
      const consumed = await tx.refreshToken.updateMany({
        where: { id: token.id, status: RefreshTokenStatus.ACTIVE },
        data: { status: RefreshTokenStatus.USED, usedAt: now },
      });
      if (consumed.count !== 1) {
        await this.revokeSession(tx, session.id, now);
        throw new UnauthorizedException("Refresh token reuse detected");
      }

      const nextRefreshToken = this.generateRefreshToken();
      const nextExpiresAt = this.nextRefreshExpiry(
        now,
        session.absoluteExpiresAt,
      );
      await tx.session.update({
        where: { id: session.id },
        data: {
          refreshTokenHash: this.hashToken(nextRefreshToken),
          expiresAt: nextExpiresAt,
        },
      });
      await tx.refreshToken.create({
        data: {
          sessionId: session.id,
          tokenHash: this.hashToken(nextRefreshToken),
          expiresAt: nextExpiresAt,
        },
      });

      return { session, nextRefreshToken };
    });

    const accessToken = await this.signAccessToken({
      userId: refreshed.session.userId,
      sessionId: refreshed.session.id,
      organizationId: refreshed.session.organizationId ?? undefined,
    });

    return {
      accessToken,
      refreshToken: refreshed.nextRefreshToken,
      user: {
        id: refreshed.session.user.id,
        email: refreshed.session.user.email,
        fullName: refreshed.session.user.fullName,
      },
      activeOrganizationSlug: refreshed.session.organization?.slug ?? null,
      activeMembershipRole: refreshed.session.organizationId
        ? (
            await this.prisma.membership.findUnique({
              where: {
                organizationId_userId: {
                  organizationId: refreshed.session.organizationId,
                  userId: refreshed.session.userId,
                },
              },
              select: { role: true },
            })
          )?.role ?? null
        : null,
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.$transaction((tx) =>
      this.revokeSession(tx, sessionId, new Date()),
    );
  }

  async logoutAll(userId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction((tx) =>
      this.revokeAllSessions(tx, userId, now),
    );
  }

  async deactivateUser(userId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { status: UserStatus.DISABLED },
      });
      await this.revokeAllSessions(tx, userId, now);
    });
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: { organization: { include: { workspaces: true } } },
        },
      },
    });
  }

  private async createSession(userId: string, organizationId?: string) {
    const refreshToken = this.generateRefreshToken();
    const now = new Date();
    const absoluteExpiresAt = this.addDuration(
      now,
      "REFRESH_TOKEN_ABSOLUTE_TTL",
      "90d",
    );
    const expiresAt = this.nextRefreshExpiry(now, absoluteExpiresAt);
    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          userId,
          organizationId,
          refreshTokenHash: this.hashToken(refreshToken),
          status: SessionStatus.ACTIVE,
          expiresAt,
          absoluteExpiresAt,
        },
      });
      await tx.refreshToken.create({
        data: {
          sessionId: created.id,
          tokenHash: this.hashToken(refreshToken),
          expiresAt,
        },
      });
      return created;
    });

    return { ...session, refreshToken };
  }

  private async buildAuthSession(
    userId: string,
    sessionId: string,
    organizationId?: string,
    activeOrganizationSlug?: string,
    refreshToken?: string,
    activeMembershipRole?: string,
  ) {
    const accessToken = await this.signAccessToken({
      userId,
      sessionId,
      organizationId,
    });
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session) {
      throw new UnauthorizedException("Session not found");
    }

    return {
      accessToken,
      refreshToken,
      session,
      user: {
        id: session.user.id,
        email: session.user.email,
        fullName: session.user.fullName,
      },
      activeOrganizationSlug: activeOrganizationSlug ?? null,
      activeMembershipRole: activeMembershipRole ?? null,
    };
  }

  private async signAccessToken(payload: TokenPayload) {
    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>("JWT_ACCESS_SECRET"),
      expiresIn: (this.configService.get<string>("ACCESS_TOKEN_TTL") ??
        "15m") as JwtSignOptions["expiresIn"],
    });
  }

  private generateRefreshToken() {
    return randomUUID() + "." + randomUUID();
  }

  private hashToken(token: string) {
    const pepper =
      this.configService.get<string>("REFRESH_TOKEN_PEPPER") ??
      this.configService.getOrThrow<string>("JWT_REFRESH_SECRET");
    return createHmac("sha256", pepper).update(token).digest("hex");
  }

  private hashInvitationToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private hashPasswordResetValue(value: string) {
    const pepper =
      this.configService.get<string>("PASSWORD_RESET_TOKEN_PEPPER") ??
      this.configService.get<string>("REFRESH_TOKEN_PEPPER") ??
      this.configService.getOrThrow<string>("JWT_REFRESH_SECRET");
    return createHmac("sha256", pepper).update(value).digest("hex");
  }

  private generatePasswordResetOtp() {
    return randomInt(0, 1_000_000).toString().padStart(6, "0");
  }

  private nextRefreshExpiry(now: Date, absoluteExpiresAt: Date) {
    const slidingExpiresAt = this.addDuration(now, "REFRESH_TOKEN_TTL", "30d");
    return slidingExpiresAt < absoluteExpiresAt
      ? slidingExpiresAt
      : absoluteExpiresAt;
  }

  private addDuration(date: Date, variable: string, fallback: string) {
    const raw = this.configService.get<string>(variable) ?? fallback;
    const match = /^(\d+)(m|h|d)$/.exec(raw);
    if (!match) {
      throw new Error(
        `${variable} must use a whole-number m, h, or d duration`,
      );
    }
    const amount = Number(match[1]);
    const unitMs = { m: 60_000, h: 3_600_000, d: 86_400_000 }[
      match[2] as "m" | "h" | "d"
    ];
    const next = new Date(date);
    next.setTime(next.getTime() + amount * unitMs);
    return next;
  }

  private async revokeSession(
    tx: Prisma.TransactionClient,
    sessionId: string,
    now: Date,
  ) {
    await tx.session.updateMany({
      where: { id: sessionId, status: SessionStatus.ACTIVE },
      data: { status: SessionStatus.REVOKED, revokedAt: now },
    });
    await tx.refreshToken.updateMany({
      where: { sessionId, status: RefreshTokenStatus.ACTIVE },
      data: { status: RefreshTokenStatus.REVOKED, revokedAt: now },
    });
  }

  private async revokeAllSessions(
    tx: Prisma.TransactionClient,
    userId: string,
    now: Date,
  ) {
    const sessions = await tx.session.findMany({
      where: { userId, status: SessionStatus.ACTIVE },
      select: { id: true },
    });
    if (sessions.length === 0) return;

    const sessionIds = sessions.map((session) => session.id);
    await tx.session.updateMany({
      where: { id: { in: sessionIds }, status: SessionStatus.ACTIVE },
      data: { status: SessionStatus.REVOKED, revokedAt: now },
    });
    await tx.refreshToken.updateMany({
      where: {
        sessionId: { in: sessionIds },
        status: RefreshTokenStatus.ACTIVE,
      },
      data: { status: RefreshTokenStatus.REVOKED, revokedAt: now },
    });
  }

  private async expireSession(
    tx: Prisma.TransactionClient,
    sessionId: string,
    now: Date,
  ) {
    await tx.session.updateMany({
      where: { id: sessionId, status: SessionStatus.ACTIVE },
      data: { status: SessionStatus.EXPIRED },
    });
    await tx.refreshToken.updateMany({
      where: { sessionId, status: RefreshTokenStatus.ACTIVE },
      data: { status: RefreshTokenStatus.EXPIRED, revokedAt: now },
    });
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  }

  private uniqueSlug(value: string) {
    const base = this.slugify(value) || "org";
    return `${base}-${randomUUID().slice(0, 6)}`.slice(0, 48);
  }
}
