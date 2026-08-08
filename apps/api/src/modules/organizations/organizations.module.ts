import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, JwtGuard, OrgGuard],
  exports: [OrganizationsService]
})
export class OrganizationsModule {}
