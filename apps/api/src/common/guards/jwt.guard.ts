import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { TenantAccessService } from "../security/tenant-access.service";
import type { AuthenticatedUser } from "../types/request-context";

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tenantAccess: TenantAccessService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : undefined;

    if (!token) {
      throw new UnauthorizedException("Missing access token");
    }

    try {
      const payload = this.jwtService.verify<AuthenticatedUser>(token, {
        secret: this.configService.getOrThrow<string>("JWT_ACCESS_SECRET")
      });

      // Deliberately collapses every failure reason into one message over HTTP,
      // so an unauthenticated caller cannot probe which part of the check failed.
      request.session = await this.tenantAccess.requireActiveSession(payload.sessionId);
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid access token");
    }
  }
}
