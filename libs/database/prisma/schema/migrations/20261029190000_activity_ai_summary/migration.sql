-- What the AI reads in an activity, written in the background after import
ALTER TYPE "ai_task" ADD VALUE 'ACTIVITY_SUMMARY';

ALTER TABLE "event_activity" ADD COLUMN "ai_summary" JSONB,
ADD COLUMN "ai_summary_at" TIMESTAMP(3);
