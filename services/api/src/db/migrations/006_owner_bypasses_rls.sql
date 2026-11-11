-- 006: the API's system connection owns the tables and is not a superuser on Azure. FORCE ROW LEVEL SECURITY made
-- row-level security apply to the owner too, which blocked system work (e.g. creating an account). Members' queries
-- run as app_user, which does not own the tables, so their row-level security walls are unchanged (tests: per-user walls).
ALTER TABLE circle.questions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.consents NO FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.user_handles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.users NO FORCE ROW LEVEL SECURITY;
ALTER TABLE phi.assessment_answers NO FORCE ROW LEVEL SECURITY;
ALTER TABLE phi.assessment_results NO FORCE ROW LEVEL SECURITY;
ALTER TABLE phi.assessments NO FORCE ROW LEVEL SECURITY;
ALTER TABLE phi.circle_answers NO FORCE ROW LEVEL SECURITY;
ALTER TABLE phi.circle_blocks NO FORCE ROW LEVEL SECURITY;
ALTER TABLE phi.circle_reports NO FORCE ROW LEVEL SECURITY;
ALTER TABLE phi.circle_votes NO FORCE ROW LEVEL SECURITY;
ALTER TABLE phi.rlp_actions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE phi.rlp_goals NO FORCE ROW LEVEL SECURITY;
ALTER TABLE phi.rlp_plans NO FORCE ROW LEVEL SECURITY;
