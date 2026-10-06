ALTER TABLE crm_runtime_settings
  ADD COLUMN IF NOT EXISTS hero_background_color TEXT NOT NULL DEFAULT '#384677',
  ADD COLUMN IF NOT EXISTS hero_height INTEGER NOT NULL DEFAULT 560;

ALTER TABLE crm_runtime_settings
  DROP CONSTRAINT IF EXISTS crm_runtime_settings_hero_height_check;

ALTER TABLE crm_runtime_settings
  ADD CONSTRAINT crm_runtime_settings_hero_height_check
  CHECK (hero_height BETWEEN 360 AND 1200);
