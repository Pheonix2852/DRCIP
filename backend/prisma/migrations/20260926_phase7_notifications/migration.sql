-- Phase 7: Notifications
-- Add a typed priority, read state, and an idempotency dedupe key to Notification.

CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

ALTER TABLE "Notification" ADD COLUMN "priority" "NotificationPriority" NOT NULL DEFAULT 'LOW';

ALTER TABLE "Notification" ADD COLUMN "readAt" TIMESTAMP(3);

ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");