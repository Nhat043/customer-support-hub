import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { EmailModule } from "../../infrastructure/email/email.module";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { NotificationsWorker } from "./notifications.worker";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { ObservabilityModule } from "../../infrastructure/observability/observability.module";

@Module({ imports: [PrismaModule, EmailModule, ObservabilityModule, JwtModule.register({})], controllers: [NotificationsController], providers: [NotificationsWorker, NotificationsService, JwtGuard, OrgGuard] })
export class NotificationsModule {}
