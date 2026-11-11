-- 005: lessons change from question/answer cards to story lessons (owner, 29 Oct 2026). No lesson in the
-- old format was ever approved, so the old drafts are removed and the new ones are seeded at startup.
DELETE FROM content.lessons WHERE published IS NULL;
