import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  listByOrganizationId(organizationId: string) {
    return this.prisma.workspace.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" }
    });
  }

  create(organizationId: string, name: string, slug?: string) {
    return this.prisma.workspace.create({
      data: {
        organizationId,
        name,
        slug: `${(slug ?? name)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40)}-${Math.random().toString(36).slice(2, 6)}`
      }
    });
  }

  getBySlug(organizationId: string, slug: string) {
    return this.prisma.workspace.findUnique({
      where: {
        organizationId_slug: {
          organizationId,
          slug
        }
      }
    });
  }

  async switchActive(sessionId: string, organizationId: string, slug: string) {
    const workspace = await this.getBySlug(organizationId, slug);
    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }

    return this.prisma.session.update({
      where: { id: sessionId },
      data: { organizationId, workspaceId: workspace.id }
    });
  }
}
