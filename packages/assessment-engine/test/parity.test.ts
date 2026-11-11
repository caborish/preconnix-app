// Golden-master parity: every case's expected values come from executing legacy_rra.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score } from '../src/index.ts';
import { def, policy, readJson, submission } from './helpers.ts';

interface GoldenCase {
  kind: string;
  plan: string;
  everpreg: string;
  age: string;
  answers: string;
  expected: { score: number; band: string; domains: number[] };
}
interface Golden {
  policyId: string;
  legacyHtmlSha256: string;
  questionOrder: Record<string, string[]>;
  cases: GoldenCase[];
}

const golden = readJson<Golden>('contracts/conformance/scoring/rra-legacy-1.0.0.golden.json');
const variant = (c: GoldenCase) => (c.plan === 'no' ? 'P2' : c.everpreg === 'yes' ? 'P1_everpreg' : 'P1_neverpreg');

test('golden master was generated from the same legacy page as the policy', () => {
  assert.equal(golden.policyId, policy.policyId);
  assert.equal(golden.legacyHtmlSha256, (policy as unknown as { source: { sha256: string } }).source.sha256);
  assert.ok(golden.cases.length > 3000);
});

test('rra-legacy-1.0.0 matches the legacy website on every golden case', () => {
  const failures: string[] = [];
  for (const [i, c] of golden.cases.entries()) {
    const order = golden.questionOrder[variant(c)];
    const points = Object.fromEntries(order.map((q, j) => [q, c.answers[j]]));
    const r = score(def, policy, submission(c, points));
    const got = { score: r.overall.score, band: r.overall.bandLabel, domains: r.domains.map(d => d.percent) };
    try {
      assert.deepEqual(got, c.expected);
    } catch {
      failures.push(`#${i} ${c.kind} ${JSON.stringify({ got, expected: c.expected })}`);
    }
  }
  assert.equal(failures.length, 0, `${failures.length} mismatches:\n${failures.slice(0, 10).join('\n')}`);
});

test('half-up rounding cases exist and match (12.5 → 13)', () => {
  const p2 = golden.cases.filter(c => c.plan === 'no' && c.expected.domains[0] === 13);
  assert.ok(p2.length > 0, 'expected a Family Planning 1/8 case');
});

test('overall score is computed from totals, not the mean of domains', () => {
  const pts = Object.fromEntries(golden.questionOrder.P2.map(q => [q, 2]));
  pts.n1 = 0;
  const r = score(def, policy, submission({ plan: 'no', everpreg: 'no', age: '20-34' }, pts));
  assert.equal(r.overall.earned, 34);
  assert.equal(r.overall.max, 36);
  assert.equal(r.overall.score, 94);
  assert.equal(r.domains[0].percent, 75);
});
