// Azure sign-in to PostgreSQL: the managed identity's token must reach the connection as its password.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { poolOptions } from '../src/db/postgres.ts';

const token = async () => 'entra-token';
const azureUrl = 'postgres://id-preconnix-api@psql.example.postgres.database.azure.com:5432/preconnix';

test('with a token provider, the token is the password (an address without one does not blank it)', () => {
  const opts = poolOptions({ connectionString: azureUrl, ssl: true, password: token });
  const client = new pg.Client(opts);
  assert.equal(client.password, token);
  assert.equal(client.user, 'id-preconnix-api');
  assert.equal(client.host, 'psql.example.postgres.database.azure.com');
  assert.equal(client.port, 5432);
  assert.equal(client.database, 'preconnix');
  assert.deepEqual(opts.ssl, { rejectUnauthorized: true });
});

test('without a token provider, the address is used as given (local test databases)', () => {
  const client = new pg.Client(poolOptions({ connectionString: 'postgres://postgres:secret@localhost:55432/postgres' }));
  assert.equal(client.password, 'secret');
  assert.equal(client.port, 55432);
});
