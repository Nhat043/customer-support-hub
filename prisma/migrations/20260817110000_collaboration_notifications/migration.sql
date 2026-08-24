ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REQUEST_STATUS_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COMMENT_ADDED';

DROP INDEX IF EXISTS "Notification_outboxEventId_key";
CREATE UNIQUE INDEX "Notification_outboxEventId_userId_key" ON "Notification"("outboxEventId", "userId");
