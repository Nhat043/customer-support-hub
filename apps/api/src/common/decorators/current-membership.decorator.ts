import { createParamDecorator, ExecutionContext, InternalServerErrorException } from "@nestjs/common";
import type { Request } from "express";
import type { RequestMembership } from "../types/request-context";

/** Caller's membership in the active organization, attached by OrgGuard. */
export const CurrentMembership = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestMembership => {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.membership) {
      throw new InternalServerErrorException("Membership context is missing. This route requires OrgGuard.");
    }
    return request.membership;
  }
);
