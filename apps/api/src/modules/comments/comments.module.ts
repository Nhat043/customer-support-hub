import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { CommentsController } from "./comments.controller";
import { CommentsService } from "./comments.service";

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [CommentsController],
  providers: [CommentsService, JwtGuard, OrgGuard, RolesGuard]
})
export class CommentsModule {}
