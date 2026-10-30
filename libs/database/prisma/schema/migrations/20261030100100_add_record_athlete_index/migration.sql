-- CreateIndex
CREATE INDEX CONCURRENTLY "record_athlete_id_type_date_idx" ON "record"("athlete_id", "type", "date");
