-- Corrections of an activity's recording, over the original kept aside
ALTER TABLE "event_activity" ADD COLUMN "original_stream" JSONB,
ADD COLUMN "original_summary" JSONB,
ADD COLUMN "corrections" JSONB;
