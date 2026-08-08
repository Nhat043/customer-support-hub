import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "./infrastructure/prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthModule } from "./modules/health/health.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { WorkspacesModule } from "./modules/workspaces/workspaces.module";
import { WorkflowItemsModule } from "./modules/workflow-items/workflow-items.module";
import { CommentsModule } from "./modules/comments/comments.module";
import { AgentModule } from "./modules/agent/agent.module";
import { TeamModule } from "./modules/team/team.module";
import { ObservabilityModule } from "./infrastructure/observability/observability.module";
import { RequestObservabilityMiddleware } from "./infrastructure/observability/request-observability.middleware";
import { validateEnvironment } from "./config/validate-environment";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
      validate: validateEnvironment,
    }),
    JwtModule.register({}),
    PrismaModule,
    ObservabilityModule,
    AuthModule,
    OrganizationsModule,
    WorkspacesModule,
    WorkflowItemsModule,
    CommentsModule,
    AgentModule,
    TeamModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestObservabilityMiddleware).forRoutes({ path: "*path", method: RequestMethod.ALL });
  }
}
