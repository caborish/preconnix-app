// App-level envelope encryption for free text (RLP goals, notes, actions). Doc 02 §5, doc 04 §6.
// Each user has a data encryption key (DEK); DEKs are stored wrapped by a master key.
// Local/test: the master key is a local file or random. Azure: Key Vault wraps the DEK (BE-17).
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Database } from './db/database.ts';

const VERSION = 1;

/** AES-256-GCM. Layout: version(1) | iv(12) | tag(16) | ciphertext. */
export function seal(key: Buffer, plaintext: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), ct]);
}

export function unseal(key: Buffer, blob: Uint8Array): string {
  const b = Buffer.from(blob);
  if (b[0] !== VERSION) throw new Error('Unknown ciphertext version');
  const decipher = createDecipheriv('aes-256-gcm', key, b.subarray(1, 13));
  decipher.setAuthTag(b.subarray(13, 29));
  return Buffer.concat([decipher.update(b.subarray(29)), decipher.final()]).toString('utf8');
}

export interface KeyRing {
  /** Returns the user's data key, creating it on first use. */
  dataKeyFor(userId: string): Promise<Buffer>;
}

/** Master key for local development: kept in a git-ignored file next to the local database. */
export function loadLocalMasterKey(path: string): Buffer {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, randomBytes(32).toString('base64'), { mode: 0o600 });
  }
  const key = Buffer.from(readFileSync(path, 'utf8').trim(), 'base64');
  if (key.length !== 32) throw new Error('Master key must be 32 bytes');
  return key;
}

export function createKeyRing(db: Database, masterKey: Buffer): KeyRing {
  const cache = new Map<string, Buffer>();
  return {
    async dataKeyFor(userId) {
      const hit = cache.get(userId);
      if (hit) return hit;
      const existing = await db.system.query<{ wrapped_dek: Uint8Array }>(
        'SELECT wrapped_dek FROM keys.user_data_keys WHERE user_id = $1', [userId]);
      let dek: Buffer;
      if (existing.rows[0]) {
        dek = Buffer.from(unseal(masterKey, existing.rows[0].wrapped_dek), 'base64');
      } else {
        dek = randomBytes(32);
        await db.system.query(
          'INSERT INTO keys.user_data_keys (user_id, wrapped_dek) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING',
          [userId, seal(masterKey, dek.toString('base64'))]);
        // Another request may have won the race; always use the stored key.
        const stored = await db.system.query<{ wrapped_dek: Uint8Array }>('SELECT wrapped_dek FROM keys.user_data_keys WHERE user_id = $1', [userId]);
        dek = Buffer.from(unseal(masterKey, stored.rows[0].wrapped_dek), 'base64');
      }
      cache.set(userId, dek);
      return dek;
    }
  };
}
