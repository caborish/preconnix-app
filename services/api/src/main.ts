// Starts the API. Local: `npm run api` (PGlite in .data/, dev sign-in, synthetic data only).
// Staging/production: Azure Database for PostgreSQL and Key Vault through the container's managed identity (ADR-013).
import { buildApp, seedPolicyDocuments } from './app.ts';
import { createAuthenticator } from './auth.ts';
import { credential, loadKeyVaultMasterKey, postgresEntraPassword } from './azure.ts';
import { azureMailer } from './mail.ts';
import { standInExplainer } from './explain.ts';
import { azureOpenAIExplainer } from './openai.ts';
import { chromiumRenderer } from './pdf.ts';
import { seedSampleCircleQuestion } from './circle.ts';
import { seedContent } from './content.ts';
import { createKeyRing, loadLocalMasterKey } from './crypto.ts';
import { loadConfig } from './config.ts';
import { openPglite, type Database } from './db/database.ts';
import { openPostgres } from './db/postgres.ts';
import { loadRegistry } from './registry.ts';

const config = loadConfig();
let db: Database;
let masterKey: Buffer;

if (config.database && config.keyVault) {
  db = await openPostgres({
    connectionString: config.database.url,
    ssl: true,
    password: config.database.auth === 'entra' ? postgresEntraPassword : undefined
  });
  masterKey = await loadKeyVaultMasterKey(config.keyVault.url, config.keyVault.masterKeySecret);
} else {
  db = await openPglite(config.dataDir);
  // Local only: the master key lives in a git-ignored file beside the local database.
  masterKey = loadLocalMasterKey(`${config.dataDir}/../master.key`);
}

await seedPolicyDocuments(db);
await seedContent(db); // lessons from the code that the database does not have yet (as drafts)
if (config.env === 'local') await seedSampleCircleQuestion(db); // so the local Circle is not empty

const app = await buildApp({ config, db, auth: await createAuthenticator(config), registry: loadRegistry(), keyRing: createKeyRing(db, masterKey),
  mailer: config.mail ? azureMailer(config.mail.endpoint, config.mail.from, credential) : undefined,
  pdf: config.chromePath ? chromiumRenderer(config.chromePath) : undefined,
  // Azure OpenAI where configured (staging/production, ADR-018); locally the stand-in writes from approved text only.
  explainer: config.openai ? azureOpenAIExplainer(config.openai, credential) : config.env === 'local' ? standInExplainer : undefined });
await app.listen({ host: config.host, port: config.port });
app.log.info({ env: config.env, port: config.port }, config.env === 'local' ? 'api_started_local_synthetic_data_only' : 'api_started');

// Container Apps stops containers with SIGTERM: finish in-flight requests, then close the database.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => { app.close().then(() => db.close()).finally(() => process.exit(0)); });
}
