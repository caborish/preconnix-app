import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applicableSections, purgeForProfile, resolvePathway } from '../src/index.ts';
import { def, readJson } from './helpers.ts';

interface Conformance {
  definitionId: string;
  pathwayCases: { name: string; profile: Record<string, string>; pathway: string; sections: string[] }[];
  purgeCases: { name: string; to: Record<string, string>; answered: string[]; purged: string[]; kept: string[] }[];
}
const conf = readJson<Conformance>('contracts/conformance/routing/rra-defs-legacy-1.routing.json');

test('conformance file targets this definition', () => {
  assert.equal(conf.definitionId, def.definitionId);
});

for (const c of conf.pathwayCases) {
  test(`route: ${c.name}`, () => {
    assert.equal(resolvePathway(def, c.profile), c.pathway);
    assert.deepEqual(applicableSections(def, c.profile).map(s => s.id), c.sections);
  });
}

for (const c of conf.purgeCases) {
  test(`purge: ${c.name}`, () => {
    const answers = Object.fromEntries(c.answered.map(q => [q, `${q}.a`]));
    const r = purgeForProfile(def, answers, c.to);
    assert.deepEqual(r.purged, c.purged);
    assert.deepEqual(Object.keys(r.kept), c.kept);
  });
}
