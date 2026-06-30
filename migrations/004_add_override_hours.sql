-- Replace single hours column with per-operator hours columns
ALTER TABLE schedule_overrides DROP COLUMN IF EXISTS hours;
ALTER TABLE schedule_overrides ADD COLUMN IF NOT EXISTS st1_hours DOUBLE PRECISION;
ALTER TABLE schedule_overrides ADD COLUMN IF NOT EXISTS st2_hours DOUBLE PRECISION;
ALTER TABLE schedule_overrides ADD COLUMN IF NOT EXISTS night_hours DOUBLE PRECISION;
