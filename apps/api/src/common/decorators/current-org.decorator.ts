import { createParamDecorator, ExecutionContext, InternalServerErrorException } from "@nestjs/common";
import type { Request } from "express";
import type { RequestOrganization } from "../types/request-context";

/**
 * Active organization resolved by OrgGuard from the :orgSlug route parameter.
 * Routes that use it must be guarded by OrgGuard; otherwise the context is
 * missing and the request fails loudly instead of silently losing tenant scope.
 */
export const CurrentOrg = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestOrganization => {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.organization) {
      throw new InternalServerErrorException("Organization context is missing. This route requires OrgGuard.");
    }
    return request.organization;
  }
);
