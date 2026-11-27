import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from "@nestjs/common";
import type { Request } from "express";
import { TenantAccessService } from "../security/tenant-access.service";

@Injectable()
export class OrgGuard implements CanActivate {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const orgSlug = request.params.orgSlug as string | undefined;

    if (!request.user?.userId || !orgSlug) {
      throw new ForbiddenException("Missing tenant context");
    }

    const { organization, membership } = await this.tenantAccess.requireMembership(
      request.user.userId,
      orgSlug
    );

    request.organization = organization;
    request.membership = membership;
    return true;
  }
}
