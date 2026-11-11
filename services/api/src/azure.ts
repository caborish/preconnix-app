// Azure wiring for staging/production (ADR-013). The container's managed identity signs in to Key Vault and to
// PostgreSQL, so no password or key is stored in configuration.
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

export const credential = new DefaultAzureCredential();

/** The API master key (32 bytes, base64) from Key Vault. Wraps each member's data key (crypto.ts). */
export async function loadKeyVaultMasterKey(vaultUrl: string, secretName: string): Promise<Buffer> {
  const secret = await new SecretClient(vaultUrl, credential).getSecret(secretName);
  const key = Buffer.from(secret.value ?? '', 'base64');
  if (key.length !== 32) throw new Error('Master key secret must be 32 bytes, base64');
  return key;
}

/** Entra access token used as the PostgreSQL password (refreshed by the pool on each new connection). */
export const postgresEntraPassword = async () =>
  (await credential.getToken('https://ossrdbms-aad.database.windows.net/.default')).token;
