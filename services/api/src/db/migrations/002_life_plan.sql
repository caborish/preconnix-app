-- 002: Reproductive Life Plan (PRD F9) and per-user data keys for app-level encryption (doc 04 §6).

-- Per-user data encryption keys, wrapped by the master key (Key Vault in Azure; a local file in dev).
-- Separate schema, never granted to app_user. Deleting a user deletes the key, which makes their
-- encrypted free text unreadable everywhere, including database backups (crypto-shredding).
CREATE SCHEMA IF NOT EXISTS keys;
CREATE TABLE keys.user_data_keys (
  user_id         uuid PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
  wrapped_dek     bytea NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE phi.rlp_plans (
  user_id         uuid PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
  intention       text CHECK (intention IN ('planning_now','planning_later','unsure','not_planning','prefer_not_say')),
  horizon         text CHECK (horizon IN ('within_1y','1_2y','3_5y','5y_plus','not_sure')),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE phi.rlp_goals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  category        text NOT NULL CHECK (category IN
                  ('checkups_screening','nutrition_supplements','lifestyle','mental_wellbeing',
                   'relationships_support','contraception_planning','finances_housing','learning','other')),
  title_enc       bytea NOT NULL,                 -- AES-256-GCM with the user's data key
  notes_enc       bytea,
  target_date     date,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','archived')),
  source_domain   text,                           -- set when created from a result's focus area
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rlp_goals_by_user ON phi.rlp_goals (user_id, created_at);

CREATE TABLE phi.rlp_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id         uuid NOT NULL REFERENCES phi.rlp_goals(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  title_enc       bytea NOT NULL,
  due_date        date,
  done_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rlp_actions_by_goal ON phi.rlp_actions (goal_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON phi.rlp_plans, phi.rlp_goals, phi.rlp_actions TO app_user;

ALTER TABLE phi.rlp_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE phi.rlp_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY own_plan ON phi.rlp_plans TO app_user
  USING (user_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);

ALTER TABLE phi.rlp_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE phi.rlp_goals FORCE ROW LEVEL SECURITY;
CREATE POLICY own_goals ON phi.rlp_goals TO app_user
  USING (user_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);

ALTER TABLE phi.rlp_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE phi.rlp_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY own_actions ON phi.rlp_actions TO app_user
  USING (user_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);
