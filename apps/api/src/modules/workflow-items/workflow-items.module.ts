import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { WorkflowItemsController } from "./workflow-items.controller";
import { WorkflowItemsService } from "./workflow-items.service";

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [WorkflowItemsController],
  providers: [WorkflowItemsService, JwtGuard, OrgGuard, RolesGuard],
  exports: [WorkflowItemsService]
})
export class WorkflowItemsModule {}
