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
import { AuthService } from "./auth.service";
import { LoginDto, RegisterDto } from "./dto/auth.dto";
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
  }
}
