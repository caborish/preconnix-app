-- 001: identity, consent, assessments, results, audit. Design: docs/architecture/04_database_schema.md
-- Runs on PGlite (local) and Azure Database for PostgreSQL (staging/production).

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS phi;
CREATE SCHEMA IF NOT EXISTS audit;

-- The API runs every user-scoped query as this role, so row-level security always applies.
DO $$ BEGIN
  CREATE ROLE app_user NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============ identity ============
CREATE TABLE identity.users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idp_subject     text NOT NULL UNIQUE,           -- sign-in provider subject; no password data here
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked','pending_deletion')),
  eligibility_confirmed_at timestamptz,           -- 18+ self-attestation
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE identity.policy_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL CHECK (kind IN ('terms','privacy','health_consent','research_consent')),
  version         text NOT NULL,
  url             text NOT NULL,
  effective_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, version)
);

CREATE TABLE identity.consents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  purpose         text NOT NULL CHECK (purpose IN
                  ('terms_privacy','health_processing','history_storage','email_comms','product_analytics','research_deidentified')),
  policy_document_id uuid NOT NULL REFERENCES identity.policy_documents(id),
  granted         boolean NOT NULL,
  source          text NOT NULL CHECK (source IN ('ios','android','web','admin_dsr')),
  recorded_at     timestamptz NOT NULL DEFAULT now()
);  -- append-only: current state = latest row per (user_id, purpose)
CREATE INDEX consents_latest ON identity.consents (user_id, purpose, recorded_at DESC);

-- ============ phi ============
CREATE TABLE phi.assessments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  definition_id   text NOT NULL,
  scoring_policy_id text NOT NULL,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scored','voided')),
  pathway         text CHECK (pathway IN ('pregnancy_planning','general_wellness')),
  profile         jsonb NOT NULL DEFAULT '{}'::jsonb, -- field id → profile option id
  idempotency_key text NOT NULL,
  client_platform text CHECK (client_platform IN ('ios','android','web')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  submitted_at    timestamptz,
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX assessments_by_user ON phi.assessments (user_id, started_at DESC);

CREATE TABLE phi.assessment_answers (
  assessment_id   uuid NOT NULL REFERENCES phi.assessments(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  question_id     text NOT NULL,
  option_id       text NOT NULL,
  answered_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assessment_id, question_id)
);

CREATE TABLE phi.assessment_results (
  assessment_id   uuid PRIMARY KEY REFERENCES phi.assessments(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  overall_score   smallint NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  band_code       text NOT NULL,
  earned_points   smallint NOT NULL,
  max_points      smallint NOT NULL,
  scored_item_count smallint NOT NULL,
  result          jsonb NOT NULL,                 -- canonical ScoreResult (domains, flags, versions)
  result_sha256   char(64) NOT NULL,
  computed_at     timestamptz NOT NULL DEFAULT now()
);

-- ============ audit (append-only, never payloads) ============
CREATE TABLE audit.events (
  id              bigserial PRIMARY KEY,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  actor_type      text NOT NULL CHECK (actor_type IN ('user','admin','system')),
  actor_ref       text NOT NULL,
  action          text NOT NULL,
  resource_type   text NOT NULL,
  resource_id     text,
  outcome         text NOT NULL CHECK (outcome IN ('success','denied','error')),
  request_id      text
);

-- ============ row-level security ============
GRANT USAGE ON SCHEMA identity, phi, audit TO app_user;
GRANT SELECT ON identity.users, identity.policy_documents TO app_user;
GRANT SELECT, INSERT ON identity.consents TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON phi.assessments, phi.assessment_answers, phi.assessment_results TO app_user;
GRANT INSERT ON audit.events TO app_user;
GRANT USAGE ON SEQUENCE audit.events_id_seq TO app_user;

ALTER TABLE identity.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.users FORCE ROW LEVEL SECURITY;
CREATE POLICY own_user ON identity.users FOR SELECT TO app_user
  USING (id = current_setting('app.user_id', true)::uuid);

ALTER TABLE identity.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.consents FORCE ROW LEVEL SECURITY;
CREATE POLICY own_consents ON identity.consents TO app_user
  USING (user_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);

ALTER TABLE phi.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE phi.assessments FORCE ROW LEVEL SECURITY;
CREATE POLICY own_assessments ON phi.assessments TO app_user
  USING (user_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);

ALTER TABLE phi.assessment_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE phi.assessment_answers FORCE ROW LEVEL SECURITY;
CREATE POLICY own_answers ON phi.assessment_answers TO app_user
  USING (user_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);

ALTER TABLE phi.assessment_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE phi.assessment_results FORCE ROW LEVEL SECURITY;
CREATE POLICY own_results ON phi.assessment_results TO app_user
  USING (user_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);
