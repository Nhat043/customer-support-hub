import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  ForbiddenException
} from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

@Injectable()
export class OrgGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { userId?: string } | undefined;
    const orgSlug = request.params.orgSlug as string | undefined;

    if (!user?.userId || !orgSlug) {
      throw new ForbiddenException("Missing tenant context");
    }

    const organization = await this.prisma.organization.findUnique({
      where: { slug: orgSlug }
    });

    if (!organization) {
      throw new NotFoundException("Organization not found");
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: user.userId
        }
      }
    });

    if (!membership || membership.status !== "ACTIVE") {
      throw new ForbiddenException("No access to this organization");
    }

    request.organization = organization;
    request.membership = membership;
    return true;
  }
}
