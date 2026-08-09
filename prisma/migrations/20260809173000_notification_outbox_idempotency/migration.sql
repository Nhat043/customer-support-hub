ALTER TABLE "Notification" ADD COLUMN "outboxEventId" UUID;
UPDATE "Notification" SET "outboxEventId" = gen_random_uuid() WHERE "outboxEventId" IS NULL;
ALTER TABLE "Notification" ALTER COLUMN "outboxEventId" SET NOT NULL;
CREATE UNIQUE INDEX "Notification_outboxEventId_key" ON "Notification"("outboxEventId");
