import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { verifyCsrfToken } from "../security/csrf";

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<any>();
    const sessionId = request.cookies?.sessionId;
    const cookieToken = request.cookies?.csrfToken;
    const headerToken = request.header?.("x-csrf-token") ?? request.headers?.["x-csrf-token"];
    const secret = this.config.get<string>("CSRF_SECRET") ?? this.config.get<string>("REFRESH_TOKEN_PEPPER") ?? this.config.get<string>("JWT_REFRESH_SECRET");

    if (
      typeof sessionId !== "string" ||
      typeof cookieToken !== "string" ||
      typeof headerToken !== "string" ||
      !secret ||
      cookieToken !== headerToken ||
      !verifyCsrfToken(secret, sessionId, cookieToken)
    ) {
      throw new ForbiddenException("Invalid CSRF token");
    }
    return true;
  }
}
