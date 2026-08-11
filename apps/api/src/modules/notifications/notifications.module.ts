import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { EmailModule } from "../../infrastructure/email/email.module";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { NotificationsWorker } from "./notifications.worker";
import { NotificationsController } from "./notifications.controller";

@Module({ imports: [PrismaModule, EmailModule, JwtModule.register({})], controllers: [NotificationsController], providers: [NotificationsWorker, JwtGuard, OrgGuard] })
export class NotificationsModule {}
