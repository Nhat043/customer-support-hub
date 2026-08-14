import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { AgentRateLimitGuard } from "../../common/guards/agent-rate-limit.guard";
import { RateLimitModule } from "../../infrastructure/rate-limit/rate-limit.module";
import { AGENT_PROVIDER } from "./agent.provider";
import { AgentController } from "./agent.controller";
import { AgentService } from "./agent.service";
import { AgentToolsService } from "./agent-tools.service";
import { MockAgentProvider } from "./mock-agent.provider";
import { GeminiAgentProvider } from "./gemini-agent.provider";
import { AgentGateway } from "./agent.gateway";
import { AgentKnowledgeService } from "./agent-knowledge.service";
import { ObservabilityModule } from "../../infrastructure/observability/observability.module";
import { MemoryModule } from "../../infrastructure/memory/memory.module";
import { KnowledgeModule } from "../knowledge/knowledge.module";

@Module({
  imports: [ConfigModule, PrismaModule, ObservabilityModule, MemoryModule, KnowledgeModule, RateLimitModule, JwtModule.register({})],
  controllers: [AgentController],
  providers: [
    AgentService,
    AgentToolsService,
    AgentGateway,
    AgentKnowledgeService,
    MockAgentProvider,
    GeminiAgentProvider,
    JwtGuard,
    OrgGuard,
    RolesGuard,
    AgentRateLimitGuard,
    {
      provide: AGENT_PROVIDER,
      inject: [ConfigService, MockAgentProvider, GeminiAgentProvider],
      useFactory: (config: ConfigService, mock: MockAgentProvider, gemini: GeminiAgentProvider) => {
        const provider = config.get<string>("AI_PROVIDER", "mock");
        if (provider === "mock") return mock;
        if (provider === "gemini") return gemini;
        throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
      }
    }
  ]
})
export class AgentModule {}
