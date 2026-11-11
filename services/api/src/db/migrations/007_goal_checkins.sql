-- 007: Goals with a rhythm and check-ins (owner request, 30 Oct 2026). A goal is done once ("Book a check-up"),
-- daily ("Take my folic acid supplement") or weekly with an optional target the person sets ("Walk 10 km a week").
-- Check-ins record one entry per goal per day: done, or an amount in the goal's unit. Units are a fixed list so
-- no free text is stored outside the encrypted columns.

ALTER TABLE phi.rlp_goals
  ADD COLUMN rhythm        text NOT NULL DEFAULT 'once' CHECK (rhythm IN ('once','daily','weekly')),
  ADD COLUMN target_amount numeric CHECK (target_amount > 0 AND target_amount <= 100000),
  ADD COLUMN target_unit   text CHECK (target_unit IN ('km','minutes','days','times')),
  ADD CONSTRAINT rlp_goals_target_pair CHECK ((target_amount IS NULL) = (target_unit IS NULL)),
  ADD CONSTRAINT rlp_goals_target_repeats CHECK (target_amount IS NULL OR rhythm <> 'once');

CREATE TABLE phi.rlp_checkins (
  goal_id         uuid NOT NULL REFERENCES phi.rlp_goals(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  day             date NOT NULL,                  -- the person's local date
  amount          numeric CHECK (amount > 0 AND amount <= 100000), -- null = done, without an amount
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (goal_id, day)
);
CREATE INDEX rlp_checkins_by_user ON phi.rlp_checkins (user_id, day);

GRANT SELECT, INSERT, UPDATE, DELETE ON phi.rlp_checkins TO app_user;

-- Same wall as goals (the API's own connection is the table owner, see 006).
ALTER TABLE phi.rlp_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_checkins ON phi.rlp_checkins TO app_user
  USING (user_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);
