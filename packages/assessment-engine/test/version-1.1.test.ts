// rra-defs-1.1 adds Canada to the country list. Scores must be identical to rra-legacy-1.0.0. The band names drop
// "Readiness" ("High", not "High Readiness": Dr Gloria, 5 Nov 2026); points and cut-offs are unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score, validateSubmission, type Definition, type Policy } from '../src/index.ts';
import { def as defLegacy, policy as policyLegacy, readJson, submission } from './helpers.ts';

const def11 = readJson<Definition>('packages/assessment-definitions/rra/rra-defs-1.1.json');
const policy11 = readJson<Policy>('packages/assessment-policies/rra/rra-1.1.0.json');
const golden = readJson<{ questionOrder: Record<string, string[]>; cases: { plan: string; everpreg: string; age: string; answers: string }[] }>(
  'contracts/conformance/scoring/rra-legacy-1.0.0.golden.json'
);

test('1.1 differs from the legacy definition only by the Canada option', () => {
  const strip = (d: Definition) => JSON.stringify({ ...d, definitionId: '', derivedFrom: '', changes: '',
    profile: d.profile.map(f => (f.id === 'country' ? { ...f, options: f.options.filter(o => o.value !== 'CA') } : f)) });
  assert.equal(strip(def11), strip(defLegacy));
  assert.deepEqual(def11.profile.find(f => f.id === 'country')!.options.map(o => o.value), ['NG', 'CA']);
});

test('the frozen legacy definition still rejects Canada', () => {
  const s = submission({ plan: 'no', everpreg: 'no', age: '20-34', country: 'CA' }, {});
  assert.ok(validateSubmission(defLegacy, s).issues.some(i => i.code === 'invalid_profile_option' && i.ref === 'country'));
});

test('1.1.0 scores every golden case exactly like rra-legacy-1.0.0, for Nigeria and Canada', () => {
  let n = 0;
  for (const c of golden.cases) {
    const order = golden.questionOrder[c.plan === 'no' ? 'P2' : c.everpreg === 'yes' ? 'P1_everpreg' : 'P1_neverpreg'];
    const points = Object.fromEntries(order.map((q, j) => [q, c.answers[j]]));
    const legacy = score(defLegacy, policyLegacy, submission(c, points));
    for (const country of ['NG', 'CA']) {
      const r = score(def11, policy11, submission({ ...c, country }, points));
      const relabelled = { ...legacy.overall, bandLabel: legacy.overall.bandLabel.replace(/ Readiness$/, '') };
      assert.deepEqual([r.overall, r.domains], [relabelled, legacy.domains]);
      n++;
    }
  }
  assert.equal(n, golden.cases.length * 2);
});
