// The app bundles ./routing. It must stay free of scoring, validation and policy code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
const routingSrc = readFileSync(fileURLToPath(new URL('../src/routing.ts', import.meta.url)), 'utf8');

test('package exposes a routing-only entry for the app', () => {
  assert.equal(pkg.exports['./routing'], './src/routing.ts');
});

test('routing module imports only types', () => {
  const imports = [...routingSrc.matchAll(/^import\s+(type\s+)?[^;]*from\s+'([^']+)'/gm)];
  for (const m of imports) {
    assert.ok(m[1], `non-type import in routing.ts: ${m[0]}`);
    assert.equal(m[2], './types.ts');
  }
  assert.doesNotMatch(routingSrc, /itemPoints|profilePoints|score\(|assessment-policies/);
});
