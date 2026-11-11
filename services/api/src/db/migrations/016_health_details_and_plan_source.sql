-- 016: Height, weight and pregnancy numbers she can see and change in Account, and which assessment her plan was last
-- generated from, so a retake can prompt an update (owner, 9 Nov 2026).
CREATE TABLE phi.health_details (
  user_id    uuid PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
  numbers    jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON phi.health_details TO app_user;
ALTER TABLE phi.health_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE phi.health_details FORCE ROW LEVEL SECURITY;
CREATE POLICY own_health_details ON phi.health_details TO app_user
  USING (user_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);

ALTER TABLE phi.rlp_plans ADD COLUMN source_assessment_id uuid;
-- The essentials her answers called for. NULL for plans made before generated plans existed.
ALTER TABLE phi.rlp_plans ADD COLUMN essentials_focus text[];
