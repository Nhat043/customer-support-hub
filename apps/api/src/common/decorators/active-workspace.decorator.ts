import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/**
 * Workspace the caller's session is currently switched into, or null when the
 * session is not scoped to one. Callers treat null as "resolve the default
 * workspace", so this stays nullable rather than throwing.
 */
export const ActiveWorkspaceId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | null => {
    const request = context.switchToHttp().getRequest<Request>();
    return request.session?.workspaceId ?? null;
  }
);
