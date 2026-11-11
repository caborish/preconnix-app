-- 013: Tick-list answers that follow a question, such as which vaccines are missing (Dr Gloria, 9 Nov 2026).
-- Option ids only, never free text; stored with the assessment under its existing row-level security.
ALTER TABLE phi.assessments ADD COLUMN follow_ups jsonb NOT NULL DEFAULT '{}'::jsonb;
