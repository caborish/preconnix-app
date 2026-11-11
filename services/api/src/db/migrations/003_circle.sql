-- 003: Circle (weekly question, poll, moderated answers). Global for all countries (owner, 29 Oct 2026).
-- Members appear only under a system-generated username; nothing links to results, answers or plans.

CREATE TABLE identity.user_handles (
  user_id         uuid PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
  handle          text NOT NULL UNIQUE CHECK (handle ~ '^[A-Za-z]{3,20}[0-9]{2,4}$'),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE SCHEMA IF NOT EXISTS circle;

-- Questions are written by the coordinator; they contain no personal data.
CREATE TABLE circle.questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt          text NOT NULL CHECK (length(prompt) BETWEEN 5 AND 300),
  poll_options    jsonb NOT NULL DEFAULT '[]'::jsonb,   -- 0 or 2..5 short option labels
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
  response        text,                                  -- moderator's general educational response
  response_reviewed_by text,                             -- clinical reviewer for the response
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX circle_questions_published ON circle.questions (published_at DESC) WHERE status <> 'draft';

-- Members' contributions: personal, kept with the other health-adjacent data.
CREATE TABLE phi.circle_votes (
  question_id     uuid NOT NULL REFERENCES circle.questions(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  option_index    smallint NOT NULL CHECK (option_index BETWEEN 0 AND 4),
  voted_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, user_id)
);

CREATE TABLE phi.circle_answers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id     uuid NOT NULL REFERENCES circle.questions(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  body            text NOT NULL CHECK (length(body) BETWEEN 2 AND 1000),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  needs_attention boolean NOT NULL DEFAULT false,       -- safety keywords: moderators see these first
  created_at      timestamptz NOT NULL DEFAULT now(),
  moderated_at    timestamptz,
  moderated_by    text
);
CREATE INDEX circle_answers_by_question ON phi.circle_answers (question_id, status, created_at);

CREATE TABLE phi.circle_reports (
  answer_id       uuid NOT NULL REFERENCES phi.circle_answers(id) ON DELETE CASCADE,
  reporter_id     uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  reason          text NOT NULL CHECK (reason IN ('harmful','offensive','spam','personal_info','other')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (answer_id, reporter_id)
);

CREATE TABLE phi.circle_blocks (
  user_id         uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, blocked_user_id),
  CHECK (user_id <> blocked_user_id)
);

GRANT USAGE ON SCHEMA circle TO app_user;
GRANT SELECT ON circle.questions TO app_user;
GRANT SELECT ON identity.user_handles TO app_user;
GRANT SELECT, INSERT, UPDATE ON phi.circle_votes TO app_user;
GRANT SELECT, INSERT ON phi.circle_answers TO app_user;
GRANT SELECT, INSERT ON phi.circle_reports TO app_user;
GRANT SELECT, INSERT, DELETE ON phi.circle_blocks TO app_user;

-- Members see published questions only.
ALTER TABLE circle.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle.questions FORCE ROW LEVEL SECURITY;
CREATE POLICY published_only ON circle.questions FOR SELECT TO app_user USING (status <> 'draft');

-- Handles are public within the Circle (they identify nobody).
ALTER TABLE identity.user_handles ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.user_handles FORCE ROW LEVEL SECURITY;
CREATE POLICY handles_readable ON identity.user_handles FOR SELECT TO app_user USING (true);

-- Votes: only your own. Totals are computed by the system role, never row by row.
ALTER TABLE phi.circle_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE phi.circle_votes FORCE ROW LEVEL SECURITY;
CREATE POLICY own_votes ON phi.circle_votes TO app_user
  USING (user_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);

-- Answers: your own (any status) or anyone's approved answers. Members can only insert their own.
ALTER TABLE phi.circle_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE phi.circle_answers FORCE ROW LEVEL SECURITY;
CREATE POLICY read_answers ON phi.circle_answers FOR SELECT TO app_user
  USING (status = 'approved' OR user_id = current_setting('app.user_id', true)::uuid);
CREATE POLICY add_own_answer ON phi.circle_answers FOR INSERT TO app_user
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid AND status = 'pending');

ALTER TABLE phi.circle_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE phi.circle_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY own_reports ON phi.circle_reports TO app_user
  USING (reporter_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (reporter_id = current_setting('app.user_id', true)::uuid);

ALTER TABLE phi.circle_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE phi.circle_blocks FORCE ROW LEVEL SECURITY;
CREATE POLICY own_blocks ON phi.circle_blocks TO app_user
  USING (user_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);

-- Poll totals without exposing individual votes: runs as the table owner and returns counts only.
CREATE FUNCTION circle.poll_totals(q uuid) RETURNS TABLE (option_index smallint, n integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, phi AS
  $$ SELECT v.option_index, count(*)::int FROM phi.circle_votes v WHERE v.question_id = q GROUP BY v.option_index $$;
REVOKE ALL ON FUNCTION circle.poll_totals(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION circle.poll_totals(uuid) TO app_user;
