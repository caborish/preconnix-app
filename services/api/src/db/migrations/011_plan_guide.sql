-- 011: Reproductive Life Plan guide (owner, 4 Nov 2026; SOGC "My Preconception Plan" adapted for Nigeria): how she
-- pictures her family, who supports her (fixed choices), which health essentials are already done (ids from
-- packages/content planGuide.ts), and questions for her provider (her own words, so encrypted like goals).

ALTER TABLE phi.rlp_plans
  ADD COLUMN family_picture text CHECK (family_picture IN ('with_partner','on_my_own','adopt_foster','no_children','not_sure','prefer_not_say')),
  ADD COLUMN support text[] NOT NULL DEFAULT '{}'
    CHECK (support <@ ARRAY['partner','family','friends','health_worker','faith','community','no_one_yet']::text[]),
  ADD COLUMN essentials_done text[] NOT NULL DEFAULT '{}' CHECK (cardinality(essentials_done) <= 50),
  ADD COLUMN provider_questions_enc bytea;    -- AES-256-GCM JSON array of strings, with the user's data key
