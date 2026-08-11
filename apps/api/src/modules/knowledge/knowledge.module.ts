import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MemoryModule } from "../../infrastructure/memory/memory.module";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { KnowledgeController } from "./knowledge.controller";
import { WorkspaceKnowledgeService } from "./knowledge.service";

@Module({
  imports: [PrismaModule, MemoryModule, JwtModule.register({})],
  controllers: [KnowledgeController],
  providers: [WorkspaceKnowledgeService, JwtGuard, OrgGuard, RolesGuard],
  exports: [WorkspaceKnowledgeService]
})
export class KnowledgeModule {}
