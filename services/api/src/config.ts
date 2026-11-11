// Runtime configuration from environment variables. No secrets have defaults.
export type AppEnv = 'local' | 'test' | 'staging' | 'production';

export interface Config {
  env: AppEnv;
  host: string;
  port: number;
  /** PGlite data directory (local only). Undefined = in-memory. */
  dataDir?: string;
  /** Browser origins allowed to call the API (the admin console). Local default: the Expo web dev server. */
  adminOrigins: string[];
  /** Staff must sign in with two steps (MFA) to use /admin routes. Always on for staging and production. */
  staffMfa: boolean;
  /** Website origins (preconnix.com) allowed to call member and public routes from a browser; never /admin. */
  webOrigins: string[];
  /** AI-assisted result explanations (ADR-018). Off on staging/production unless AI_EXPLANATIONS=on; a switch-off is immediate. */
  aiExplanations: boolean;
  /** Azure OpenAI for those explanations (managed identity, no key). Absent = no AI provider. */
  openai?: { endpoint: string; deployment: string };
  /** Report emails (Azure Communication Services). Absent when not set up. */
  mail?: { endpoint: string; from: string };
  /** Chromium used to print report PDFs for email attachments (the container's; locally optional). */
  chromePath?: string;
  /** Azure Database for PostgreSQL (staging/production). Local and tests use PGlite. */
  database?: {
    /** postgres://<login>@<server>.postgres.database.azure.com:5432/<db>; no password in it. */
    url: string;
    /** `entra`: the container's managed identity signs in (no stored password). `password`: PGPASSWORD. */
    auth: 'entra' | 'password';
  };
  /** Key Vault holding the API master key (staging/production). Local: a git-ignored file. */
  keyVault?: { url: string; masterKeySecret: string };
  auth: {
    /** Staff sign-in (tokens may carry staff roles). Local/test: the dev signer. Remote: optional until staff exist. */
    issuer: string;
    audience: string;
    /** Remote JWKS for staff tokens. Unset in local/test, where the dev signer is used. */
    jwksUrl?: string;
    /**
     * Member sign-in through Entra External ID, accepted alongside the dev signer in local mode so the phone can
     * use real email sign-in against the staging directory. Member tokens never grant staff roles.
     */
    member?: { issuer: string; audience: string; jwksUrl: string };
  };
}

// Staging member sign-in directory (doc 13). Ids only; no secrets.
const STAGING_TENANT = 'eaea71b1-9489-4dda-b874-0ebd9372b43e';
export const STAGING_MEMBER_DIRECTORY = {
  issuer: `https://${STAGING_TENANT}.ciamlogin.com/${STAGING_TENANT}/v2.0`,
  audience: '3a06cc82-1d56-4307-b5ae-51d2c35eaf1d',
  jwksUrl: `https://preconnixstaging.ciamlogin.com/${STAGING_TENANT}/discovery/v2.0/keys`
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const appEnv = (env.APP_ENV ?? 'local') as AppEnv;
  if (!['local', 'test', 'staging', 'production'].includes(appEnv)) throw new Error(`Unknown APP_ENV ${appEnv}`);
  const remote = appEnv === 'staging' || appEnv === 'production';
  const need = (...names: string[]) => {
    const missing = names.filter(n => !env[n]);
    if (missing.length) throw new Error(`${missing.join(', ')} required in ${appEnv}`);
  };
  if (remote) need('DATABASE_URL', 'KEY_VAULT_URL', 'MEMBER_OIDC_ISSUER', 'MEMBER_OIDC_AUDIENCE', 'MEMBER_OIDC_JWKS_URL');
  if (env.OIDC_JWKS_URL) need('OIDC_ISSUER', 'OIDC_AUDIENCE');
  return {
    env: appEnv,
    host: env.HOST ?? (appEnv === 'test' ? '127.0.0.1' : '0.0.0.0'),
    port: Number(env.PORT ?? 3000),
    dataDir: appEnv === 'local' ? (env.DATA_DIR ?? '.data/pglite') : undefined,
    database: remote ? { url: env.DATABASE_URL!, auth: env.DATABASE_AUTH === 'password' ? 'password' : 'entra' } : undefined,
    keyVault: remote ? { url: env.KEY_VAULT_URL!, masterKeySecret: env.MASTER_KEY_SECRET ?? 'api-master-key' } : undefined,
    staffMfa: remote || env.REQUIRE_STAFF_MFA === 'true',
    adminOrigins: (env.ADMIN_ORIGINS ?? (remote ? '' : 'http://localhost:8083,http://127.0.0.1:8083')).split(',').filter(Boolean),
    chromePath: env.CHROME_PATH || undefined,
    aiExplanations: remote ? env.AI_EXPLANATIONS === 'on' : env.AI_EXPLANATIONS !== 'off',
    openai: env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_DEPLOYMENT ? { endpoint: env.AZURE_OPENAI_ENDPOINT, deployment: env.AZURE_OPENAI_DEPLOYMENT } : undefined,
    mail: env.MAIL_ENDPOINT && env.MAIL_FROM ? { endpoint: env.MAIL_ENDPOINT, from: env.MAIL_FROM } : undefined,
    webOrigins: (env.WEB_ORIGINS ?? (remote ? '' : 'http://localhost:8085,http://127.0.0.1:8085')).split(',').filter(Boolean),
    auth: {
      issuer: env.OIDC_ISSUER ?? 'https://dev.preconnix.local/',
      audience: env.OIDC_AUDIENCE ?? 'api.preconnix.local',
      jwksUrl: env.OIDC_JWKS_URL,
      member: remote
        ? { issuer: env.MEMBER_OIDC_ISSUER!, audience: env.MEMBER_OIDC_AUDIENCE!, jwksUrl: env.MEMBER_OIDC_JWKS_URL! }
        : appEnv === 'local' && env.MEMBER_SIGN_IN !== 'off' ? STAGING_MEMBER_DIRECTORY : undefined
    }
  };
}
