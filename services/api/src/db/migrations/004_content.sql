-- 004: content staff edit in the admin console (lessons, settings). No personal data in this schema.
-- Lessons have a working copy (edited by content editors) and a published copy (set only when a clinical
-- reviewer approves). Editing an approved lesson never changes what members see until it is approved again.
CREATE SCHEMA IF NOT EXISTS content;

CREATE TABLE content.lessons (
  id              text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{3,60}$'),
  position        int NOT NULL DEFAULT 0,
  working         jsonb NOT NULL,             -- {title, summary, minutes, cards:[{front, back}]}
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved')),
  published       jsonb,                      -- last approved copy; what members see
  reviewed_by     text,                       -- reviewer's display name (shown on the lesson)
  reviewed_on     date,
  reviewer_ref    text,                       -- reviewer's account (audit trail)
  updated_by      text,                       -- last editor's account (a reviewer cannot approve their own edit)
  updated_at      timestamptz NOT NULL DEFAULT now(),
  review_note     text                        -- reviewer's note when returning a lesson
);

CREATE TABLE content.settings (
  key             text PRIMARY KEY CHECK (key = 'app'),
  value           jsonb NOT NULL,
  updated_by      text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
