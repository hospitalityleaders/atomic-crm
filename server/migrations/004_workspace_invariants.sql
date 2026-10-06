CREATE OR REPLACE FUNCTION crm_validate_workspace_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  actual_type TEXT;
  actual_owner UUID;
BEGIN
  SELECT workspace_type, owner_user_id
    INTO actual_type, actual_owner
    FROM crm_workspaces
   WHERE id = NEW.workspace_id;

  IF actual_type IS NULL OR NEW.workspace_type <> actual_type THEN
    RAISE EXCEPTION 'Workspace membership type does not match its workspace'
      USING ERRCODE = '23514';
  END IF;

  IF actual_type = 'personal' AND (
    NEW.user_id <> actual_owner OR
    NEW.role <> 'owner' OR
    NEW.status <> 'active'
  ) THEN
    RAISE EXCEPTION 'A personal workspace can contain only its active owner'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_workspace_members_validate
  ON crm_workspace_members;

CREATE TRIGGER crm_workspace_members_validate
BEFORE INSERT OR UPDATE ON crm_workspace_members
FOR EACH ROW
EXECUTE FUNCTION crm_validate_workspace_membership();

ALTER TABLE crm_sessions
  ADD CONSTRAINT crm_sessions_active_membership_fk
  FOREIGN KEY (active_workspace_id, user_id)
  REFERENCES crm_workspace_members (workspace_id, user_id)
  ON DELETE CASCADE;
