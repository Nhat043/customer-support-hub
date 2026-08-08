import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { WorkspacesController } from "./workspaces.controller";
import { WorkspacesService } from "./workspaces.service";

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, JwtGuard, OrgGuard, RolesGuard],
  exports: [WorkspacesService]
})
export class WorkspacesModule {}
