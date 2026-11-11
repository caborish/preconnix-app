// Line-break tidying. Runs with node:test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tidy } from '../src/design/typeset.ts';

const N = '\u00A0';

test('the last two words stay together', () => {
  assert.equal(tidy('A little learning, every day'), `A${N}little learning, every${N}day`);
});

test('short words stay with the next word', () => {
  assert.equal(tidy('Small steps today. A healthier tomorrow.'), `Small steps today. A${N}healthier tomorrow.`);
});

test('one or two words are left alone', () => {
  assert.equal(tidy('Your plan'), 'Your plan');
  assert.equal(tidy('Account'), 'Account');
});

test('a long last pair is not joined, so a narrow card never breaks inside a word', () => {
  assert.equal(tidy('Conversations and shared experiences'), 'Conversations and shared experiences');
  assert.equal(tidy('Book a one-on-one consultation'), `Book a${N}one-on-one consultation`);
});

test('mixed text and numbers are tidied as one line', async () => {
  const { tidyNode } = await import('../src/design/typeset.ts');
  assert.equal(tidyNode(['Folic acid', ' · ', 5, ' min']), `Folic acid · 5${N}min`);
});
