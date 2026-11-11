import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Definition, Policy, Submission } from '../src/index.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
export const readJson = <T>(rel: string): T => JSON.parse(readFileSync(root + rel, 'utf8')) as T;

export const def = readJson<Definition>('packages/assessment-definitions/rra/rra-defs-legacy-1.json');
export const policy = readJson<Policy>('packages/assessment-policies/rra/rra-legacy-1.0.0.json');

const SUFFIX: Record<string, string> = { '2': 'a', '1': 'b', '0': 'c' };

/** Builds a submission from profile values and legacy points per question id. */
export function submission(
  p: { plan: string; everpreg: string; age: string; cycle?: string; country?: string },
  points: Record<string, string | number>
): Submission {
  return {
    profile: {
      age: `profile.age.${p.age}`,
      country: `profile.country.${p.country ?? 'NG'}`,
      cycle: `profile.cycle.${p.cycle ?? 'regular'}`,
      everpreg: `profile.everpreg.${p.everpreg}`,
      plan: `profile.plan.${p.plan}`
    },
    answers: Object.fromEntries(Object.entries(points).map(([q, v]) => [q, `${q}.${SUFFIX[String(v)]}`]))
  };
}
