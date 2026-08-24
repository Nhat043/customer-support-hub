import { ConfigService } from "@nestjs/config";
import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { PrismaService } from "../prisma/prisma.service";

export type WorkspaceChange = {
  organizationId: string;
  workspaceId: string | null;
  workflowItemId: string;
  entity: "workflow_item" | "comment" | "attachment";
  action: "created" | "updated" | "deleted";
};

@Injectable()
@WebSocketGateway({ namespace: "/workspace", cors: { origin: true, credentials: true } })
export class WorkspaceRealtimeGateway {
  @WebSocketServer()
  private server?: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  @SubscribeMessage("workspace.subscribe")
  async subscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { orgSlug?: string }
  ) {
    try {
      const organizationId = await this.authenticate(socket, payload.orgSlug);
      socket.join(this.organizationRoom(organizationId));
      socket.emit("workspace.ready", { organizationId });
      return { ok: true };
    } catch (error) {
      socket.emit("workspace.error", { message: error instanceof Error ? error.message : "Workspace subscription failed" });
      socket.disconnect(true);
      return { ok: false };
    }
  }

  publish(change: WorkspaceChange) {
    this.server?.to(this.organizationRoom(change.organizationId)).emit("workspace.changed", change);
  }

  private organizationRoom(organizationId: string) {
    return `organization:${organizationId}`;
  }

  private async authenticate(socket: Socket, orgSlug: string | undefined) {
    const accessToken = socket.handshake.auth?.accessToken as string | undefined;
    if (!accessToken || !orgSlug) throw new UnauthorizedException("Missing workspace authentication");

    let token: { userId: string; sessionId: string };
    try {
      token = this.jwtService.verify(accessToken, { secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET") });
    } catch {
      throw new UnauthorizedException("Invalid access token");
    }

    const session = await this.prisma.session.findUnique({
      where: { id: token.sessionId },
      include: { user: true }
    });
    if (!session || session.status !== "ACTIVE" || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") {
      throw new UnauthorizedException("Session is not active");
    }

    const organization = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!organization) throw new UnauthorizedException("Organization not found");
    const membership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: organization.id, userId: token.userId } }
    });
    if (!membership || membership.status !== "ACTIVE") throw new ForbiddenException("No organization access");
    return organization.id;
  }
}
