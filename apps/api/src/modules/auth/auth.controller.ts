import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { AuthRateLimitGuard } from "../../common/guards/auth-rate-limit.guard";
import { CsrfGuard } from "../../common/guards/csrf.guard";
import { createCsrfToken } from "../../common/security/csrf";
import { AuthService } from "./auth.service";
import {
  ConfirmPasswordResetDto,
  LoginDto,
  RegisterDto,
  RequestPasswordResetDto,
  VerifyPasswordResetOtpDto,
} from "./dto/auth.dto";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Post("register")
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    this.setSessionCookies(res, result.refreshToken ?? "", result.session.id);
    return {
      accessToken: result.accessToken,
      user: result.user,
      sessionId: result.session.id,
      activeOrganizationSlug: result.activeOrganizationSlug,
      activeMembershipRole: result.activeMembershipRole,
    };
  }

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    this.setSessionCookies(res, result.refreshToken ?? "", result.session.id);
    return {
      accessToken: result.accessToken,
      user: result.user,
      sessionId: result.session.id,
      activeOrganizationSlug: result.activeOrganizationSlug,
      activeMembershipRole: result.activeMembershipRole,
    };
  }

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Post("password-reset/request")
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Post("password-reset/verify")
  verifyPasswordResetOtp(@Body() dto: VerifyPasswordResetOtpDto) {
    return this.authService.verifyPasswordResetOtp(dto);
  }

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Post("password-reset/confirm")
  confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto) {
    return this.authService.confirmPasswordReset(dto);
  }

  @Public()
  @UseGuards(AuthRateLimitGuard, CsrfGuard)
  @Post("refresh")
  async refresh(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    const sessionId = req.cookies?.sessionId as string | undefined;
    if (!refreshToken || !sessionId) {
      throw new UnauthorizedException("Missing session cookie");
    }

    const result = await this.authService.refresh(sessionId, refreshToken);
    this.setSessionCookies(res, result.refreshToken, sessionId);
    return {
      accessToken: result.accessToken,
      user: result.user,
      activeOrganizationSlug: result.activeOrganizationSlug,
      activeMembershipRole: result.activeMembershipRole,
    };
  }

  @UseGuards(JwtGuard)
  @Post("logout")
  async logout(
    @CurrentUser() user: { sessionId: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(user.sessionId);
    this.clearSessionCookies(res);
    return { ok: true };
  }

  @UseGuards(JwtGuard)
  @Post("logout-all")
  async logoutAll(
    @CurrentUser() user: { userId: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(user.userId);
    this.clearSessionCookies(res);
    return { ok: true };
  }

  @UseGuards(JwtGuard)
  @Post("deactivate")
  async deactivate(
    @CurrentUser() user: { userId: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.deactivateUser(user.userId);
    this.clearSessionCookies(res);
    return { ok: true };
  }

  @UseGuards(JwtGuard)
  @Get("me")
  async me(@CurrentUser() user: { userId: string }) {
    const result = await this.authService.me(user.userId);
    return { user: result };
  }

  private setSessionCookies(
    res: Response,
    refreshToken: string,
    sessionId: string,
  ) {
    const cookieOptions = {
      httpOnly: true,
      secure: this.configService.get("COOKIE_SECURE") === "true",
      sameSite: "lax" as const,
      domain: this.getCookieDomain(),
      path: "/api/auth",
      maxAge: 1000 * 60 * 60 * 24 * 30,
    };

    res.cookie("refreshToken", refreshToken, {
      ...cookieOptions,
    });
    res.cookie("sessionId", sessionId, cookieOptions);
    res.cookie("csrfToken", createCsrfToken(this.getCsrfSecret(), sessionId), {
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      domain: cookieOptions.domain,
      path: "/",
      maxAge: cookieOptions.maxAge,
    });
  }

  private getCsrfSecret() {
    const secret = this.configService.get<string>("CSRF_SECRET")
      ?? this.configService.get<string>("REFRESH_TOKEN_PEPPER")
      ?? this.configService.get<string>("JWT_REFRESH_SECRET");
    if (!secret) throw new Error("CSRF_SECRET or refresh token pepper is required");
    return secret;
  }

  private getCookieDomain() {
    const domain = this.configService.get<string>("COOKIE_DOMAIN");
    if (!domain || domain === "localhost") {
      return undefined;
    }
    return domain;
  }

  private clearSessionCookies(res: Response) {
    const cookieOptions = {
      path: "/api/auth",
      domain: this.getCookieDomain(),
      httpOnly: true,
      secure: this.configService.get("COOKIE_SECURE") === "true",
      sameSite: "lax" as const,
    };
    res.clearCookie("refreshToken", cookieOptions);
    res.clearCookie("sessionId", cookieOptions);
    res.clearCookie("csrfToken", {
      path: "/",
      domain: this.getCookieDomain(),
      secure: this.configService.get("COOKIE_SECURE") === "true",
      sameSite: "lax" as const,
    });
  }
}
