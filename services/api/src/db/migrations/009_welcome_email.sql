-- 009: The first report email an account receives is the welcome letter from Dr Gloria (owner, 1 Nov 2026); later
-- ones are the shorter report email. Only the time is kept, never the address.
ALTER TABLE identity.users ADD COLUMN welcome_email_at timestamptz;
