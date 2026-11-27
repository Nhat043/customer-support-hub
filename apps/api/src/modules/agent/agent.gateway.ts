import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway
} from "@nestjs/websockets";
import { ConfigService } from "@nestjs/config";
import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Socket } from "socket.io";
import { TenantAccessService } from "../../common/security/tenant-access.service";
import type { AuthenticatedUser } from "../../common/types/request-context";
import { AgentService } from "./agent.service";
import { CreateAgentRunDto } from "./dto/agent.dto";
import { AgentRateLimitGuard } from "../../common/guards/agent-rate-limit.guard";

type AgentSocketPayload = CreateAgentRunDto & {
  orgSlug?: string;
  idempotencyKey?: string;
};

type AgentPrincipal = {
  userId: string;
  sessionId: string;
  organizationId: string;
  membershipRole: string;
};

@Injectable()
@WebSocketGateway({ namespace: "/agent", cors: { origin: true, credentials: true } })
export class AgentGateway implements OnGatewayConnection {
  constructor(
    private readonly agentService: AgentService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly tenantAccess: TenantAccessService,
    private readonly agentRateLimit: AgentRateLimitGuard
  ) {}

  handleConnection(socket: Socket) {
    socket.emit("agent.ready", { protocol: "agent-stream-v1" });
  }

  @SubscribeMessage("agent.run")
  async run(@ConnectedSocket() socket: Socket, @MessageBody() payload: AgentSocketPayload) {
    try {
      const principal = await this.authenticate(socket, payload.orgSlug);
      if (!["OWNER", "ADMIN", "MEMBER"].includes(principal.membershipRole)) {
        throw new ForbiddenException("Your role cannot run the AI assistant");
      }
      if (!payload.idempotencyKey?.trim()) throw new ForbiddenException("Idempotency-Key is required");
      if (typeof payload.message !== "string" || payload.message.trim().length < 1 || payload.message.length > 4000) {
        throw new ForbiddenException("A valid agent message is required");
      }
      await this.agentRateLimit.enforce(principal.organizationId, principal.userId);

      return await this.agentService.run(
        principal.organizationId,
        principal.userId,
        principal.sessionId,
        principal.membershipRole,
        payload.idempotencyKey.trim(),
        {
          message: payload.message,
          workspaceId: payload.workspaceId,
          workflowItemId: payload.workflowItemId
        },
        {
          onStarted: (event) => { socket.emit("run.started", event); },
          onToolCalled: (event) => { socket.emit("tool.called", event); },
          onToolResult: (event) => { socket.emit("tool.result", event); },
          onCompleted: (event) => { socket.emit("run.completed", event); },
          onFailed: (event) => { socket.emit("run.failed", event); }
        }
      );
    } catch (error) {
      socket.emit("run.failed", { message: error instanceof Error ? error.message : "Agent run failed" });
      return { accepted: false };
    }
  }

  private async authenticate(socket: Socket, orgSlug: string | undefined): Promise<AgentPrincipal> {
    const accessToken = socket.handshake.auth?.accessToken as string | undefined;
    if (!accessToken || !orgSlug) throw new UnauthorizedException("Missing agent authentication");
    let payload: AuthenticatedUser;
    try {
      payload = this.jwtService.verify<AuthenticatedUser>(accessToken, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET")
      });
    } catch {
      throw new UnauthorizedException("Invalid access token");
    }

    // Same session and membership rules the HTTP guards apply, so a socket
    // client cannot reach a tenant that the REST API would refuse.
    await this.tenantAccess.requireActiveSession(payload.sessionId);
    const { organization, membership } = await this.tenantAccess.requireMembership(
      payload.userId,
      orgSlug
    );

    return {
      userId: payload.userId,
      sessionId: payload.sessionId,
      organizationId: organization.id,
      membershipRole: membership.role
    };
  }
}
