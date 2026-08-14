import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { StorageModule } from "../../infrastructure/storage/storage.module";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";

@Module({
  imports: [PrismaModule, StorageModule, JwtModule.register({})],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, JwtGuard, OrgGuard, RolesGuard]
})
export class AttachmentsModule {}
