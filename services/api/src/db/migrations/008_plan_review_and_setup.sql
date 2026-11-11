-- 008: Plan set-up (design handoff: intentions → priorities → actions → review). The person chooses a date to
-- review their plan; the plan records when they finished setting it up, so the app can resume the set-up.
ALTER TABLE phi.rlp_plans
  ADD COLUMN review_date        date,
  ADD COLUMN setup_completed_at timestamptz;
