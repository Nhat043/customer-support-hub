import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/** Reads one cookie parsed by cookie-parser. */
export const Cookie = createParamDecorator(
  (name: string, context: ExecutionContext): string | undefined => {
    const request = context.switchToHttp().getRequest<Request>();
    const value = (request.cookies as Record<string, unknown> | undefined)?.[name];
    return typeof value === "string" ? value : undefined;
  }
);
