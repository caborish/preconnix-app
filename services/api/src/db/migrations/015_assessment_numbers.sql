-- 015: Height, weight, gravidity and parity (Dr Gloria, Review 4), and the "Other" text typed in tick-lists, which is
-- free text and so encrypted with the member's key.
ALTER TABLE phi.assessments ADD COLUMN numbers jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE phi.assessments ADD COLUMN follow_up_other_enc bytea;
