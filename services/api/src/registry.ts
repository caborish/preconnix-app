// Loads versioned definitions and scoring policies from the repository (read-only at runtime).
import type { Definition, Policy } from '@preconnix/assessment-engine';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const load = <T>(rel: string): T => JSON.parse(readFileSync(root + rel, 'utf8')) as T;

export interface Version { definition: Definition; policy: Policy }

export interface Registry {
  /** Offered to clients that do not ask for a version (the website and older app builds). */
  current: Version;
  /** Every version a client may ask for. */
  versions: Map<string, Version>;
  definitions: Map<string, Definition>;
  policies: Map<string, Policy>;
}

const version = (defs: string, policy: string): Version => ({
  definition: load<Definition>(`packages/assessment-definitions/rra/${defs}.json`),
  policy: load<Policy>(`packages/assessment-policies/rra/${policy}.json`)
});

export function loadRegistry(): Registry {
  const all = [version('rra-defs-1.1', 'rra-1.1.0'), version('rra-defs-2.0', 'rra-2.0.0')];
  return {
    current: all[0],
    versions: new Map(all.map(v => [v.definition.definitionId, v])),
    definitions: new Map(all.map(v => [v.definition.definitionId, v.definition])),
    policies: new Map(all.map(v => [v.policy.policyId, v.policy]))
  };
}
