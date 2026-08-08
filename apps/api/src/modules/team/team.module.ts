import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { InvitationsController } from "./invitations.controller";
import { TeamController } from "./team.controller";
import { TeamService } from "./team.service";

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [TeamController, InvitationsController],
  providers: [TeamService, JwtGuard, OrgGuard, RolesGuard],
  exports: [TeamService],
})
export class TeamModule {}
