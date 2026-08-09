import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { EmailModule } from "../../infrastructure/email/email.module";
import { NotificationsWorker } from "./notifications.worker";
import { NotificationsController } from "./notifications.controller";

@Module({ imports: [PrismaModule, EmailModule], controllers: [NotificationsController], providers: [NotificationsWorker] })
export class NotificationsModule {}
