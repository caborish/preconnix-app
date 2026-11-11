-- 010: AI-assisted explanation of a saved result (ADR-018, owner 4 Nov 2026). A separate consent purpose, asked the
-- first time a member taps the button. One explanation per result, removed with it. The text is the checked output;
-- the input sent to the AI is never stored.

ALTER TABLE identity.consents DROP CONSTRAINT consents_purpose_check;
ALTER TABLE identity.consents ADD CONSTRAINT consents_purpose_check CHECK (purpose IN
  ('terms_privacy','health_processing','history_storage','email_comms','product_analytics','research_deidentified','ai_explanation'));

CREATE TABLE phi.assessment_explanations (
  assessment_id   uuid PRIMARY KEY REFERENCES phi.assessments(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  rules_version   text NOT NULL,                  -- the approved AI rules used
  model           text NOT NULL,                  -- provider and model, e.g. 'stand-in' locally
  result_sha256   text NOT NULL,                  -- the result it explains
  body            jsonb NOT NULL,                 -- { summary, areas: [{ code, explanation, askYourProvider[] }] }
  created_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON phi.assessment_explanations TO app_user;

ALTER TABLE phi.assessment_explanations ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_explanations ON phi.assessment_explanations TO app_user
  USING (user_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);

-- An AI reply that fails the safety checks is audited as 'rejected' (never shown, never stored).
ALTER TABLE audit.events DROP CONSTRAINT events_outcome_check;
ALTER TABLE audit.events ADD CONSTRAINT events_outcome_check CHECK (outcome IN ('success','denied','error','rejected'));
