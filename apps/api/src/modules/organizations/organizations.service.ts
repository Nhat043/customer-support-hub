import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  listForUser(userId: string) {
    return this.prisma.organization.findMany({
      where: {
        memberships: {
          some: { userId, status: "ACTIVE" }
        }
      },
      include: {
        workspaces: true,
        memberships: {
          where: { userId }
        }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  getBySlug(orgSlug: string) {
    return this.prisma.organization.findUnique({
      where: { slug: orgSlug },
      include: { workspaces: true }
    });
  }

  async create(input: { userId: string; name: string; slug?: string }) {
    const slug = this.uniqueSlug(input.slug ?? input.name);
    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          slug,
          name: input.name
        }
      });

      await tx.membership.create({
        data: {
          organizationId: organization.id,
          userId: input.userId,
          role: "OWNER"
        }
      });

      await tx.workspace.create({
        data: {
          organizationId: organization.id,
          slug: "general",
          name: "General"
        }
      });

      return organization;
    });
  }

  async switchActive(sessionId: string, organizationId: string, workspaceId?: string | null) {
    const workspace = workspaceId
      ? await this.prisma.workspace.findFirst({ where: { id: workspaceId, organizationId, status: "ACTIVE" }, select: { id: true } })
      : await this.prisma.workspace.findFirst({ where: { organizationId, status: "ACTIVE" }, select: { id: true }, orderBy: { createdAt: "asc" } });
    if (!workspace) throw new NotFoundException("Active workspace not found");
    return this.prisma.session.update({
      where: { id: sessionId },
      data: {
        organizationId,
        workspaceId: workspace.id
      }
    });
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  }

  private uniqueSlug(value: string) {
    const base = this.slugify(value) || "org";
    return `${base}-${Math.random().toString(36).slice(2, 8)}`.slice(0, 48);
  }
}
