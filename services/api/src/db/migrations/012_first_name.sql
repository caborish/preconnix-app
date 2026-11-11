-- 012: The name she would like to be called (owner and Dr Gloria, 5 Nov 2026): optional, asked once after sign-in,
-- used to greet her in the app and in Dr Gloria's welcome letter. Encrypted with her data key; never logged.
ALTER TABLE identity.users ADD COLUMN first_name_enc bytea;
