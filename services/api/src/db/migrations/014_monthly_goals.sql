-- 014: Goals can repeat every month (Dr Gloria, 9 Nov 2026: "Talk to someone I trust", every month).
ALTER TABLE phi.rlp_goals DROP CONSTRAINT IF EXISTS rlp_goals_rhythm_check;
ALTER TABLE phi.rlp_goals ADD CONSTRAINT rlp_goals_rhythm_check CHECK (rhythm IN ('once','daily','weekly','monthly'));
