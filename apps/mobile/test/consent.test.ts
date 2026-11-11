// Privacy choices → consent records. Runs with node:test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyChoices, fromConsents, toConsents } from '../src/features/consent/model.ts';

test('the one agreement records the terms, health processing and keeping a record of results', () => {
  assert.deepEqual(toConsents({ ...emptyChoices(), agreement: true }, emptyChoices()), { terms_privacy: true, health_processing: true, history_storage: true });
});

test('marketing is recorded separately and never implied by the agreement', () => {
  assert.equal(toConsents({ agreement: true, marketing: false, ai: false }, emptyChoices()).email_comms, undefined);
  assert.deepEqual(toConsents({ ...emptyChoices(), marketing: true }, emptyChoices()), { email_comms: true });
});

test('only changed choices are sent; analytics and research are never recorded', () => {
  const before = { agreement: true, marketing: true, ai: true };
  assert.deepEqual(toConsents(before, before), {});
  const all = toConsents({ agreement: true, marketing: true, ai: false }, emptyChoices());
  assert.ok(!('product_analytics' in all) && !('research_deidentified' in all));
});

test('the agreement counts only when all three parts were given (accounts from before are asked once more)', () => {
  assert.equal(fromConsents({ terms_privacy: true, health_processing: true }).agreement, false);
  assert.equal(fromConsents({ terms_privacy: true, health_processing: true, history_storage: true }).agreement, true);
  assert.deepEqual(fromConsents({}), emptyChoices());
});
