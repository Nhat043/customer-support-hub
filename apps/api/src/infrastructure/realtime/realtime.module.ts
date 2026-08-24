import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { WorkspaceRealtimeGateway } from "./workspace-realtime.gateway";

@Global()
@Module({
  imports: [ConfigModule, PrismaModule, JwtModule.register({})],
  providers: [WorkspaceRealtimeGateway],
  exports: [WorkspaceRealtimeGateway]
})
export class RealtimeModule {}
