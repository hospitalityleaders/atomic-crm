ALTER TABLE crm_runtime_settings
  ADD COLUMN IF NOT EXISTS header_background_color TEXT NOT NULL DEFAULT '#384677',
  ADD COLUMN IF NOT EXISTS header_text_color TEXT NOT NULL DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS privacy_settings_enabled BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF (SELECT COUNT(*) = 4 FROM crm_navigation)
     AND NOT EXISTS (
       SELECT 1
       FROM crm_navigation
       WHERE (label, url, sort_order) NOT IN (
         ('CRM', '/', 0),
         ('Contacts', '/contacts', 10),
         ('Companies', '/companies', 20),
         ('Deals', '/deals', 30)
       )
     ) THEN
    DELETE FROM crm_navigation;
    INSERT INTO crm_navigation (label, url, sort_order, enabled)
    VALUES
      ('Workspace', 'https://office.holedo.com/', 0, TRUE),
      ('Docs', 'https://docs.holedo.com/', 10, TRUE),
      ('Sheets', 'https://sheets.holedo.com/', 20, TRUE),
      ('Meet', 'https://meet.holedo.com/', 30, TRUE);
  END IF;
END $$;
