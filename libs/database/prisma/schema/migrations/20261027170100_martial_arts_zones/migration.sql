-- Zone values stored with every sport mean "all sports" (default zones are
-- created that way): include the new sport too. Explicit subsets are kept.
-- A separate migration: a new enum value cannot be used in the transaction
-- that adds it.
UPDATE "training_zone_value"
SET "sports" = array_append("sports", 'MARTIAL_ARTS')
WHERE NOT ('MARTIAL_ARTS' = ANY("sports"))
  AND NOT EXISTS (
    SELECT 1
    FROM unnest(enum_range(NULL::"sport_type")) AS sport
    WHERE sport <> 'MARTIAL_ARTS' AND NOT (sport = ANY("sports"))
  );
