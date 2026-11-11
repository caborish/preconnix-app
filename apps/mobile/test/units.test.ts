import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bmiValue, cmFromFeet, feetFromCm, kgFromPounds, poundsFromKg } from '../src/features/assessment/units.ts';

test('feet and inches become centimetres and back', () => {
  assert.equal(cmFromFeet(5, 4), 162.6);
  assert.deepEqual(feetFromCm(162.6), { feet: 5, inches: 4 });
});
test('pounds become kilograms and back', () => {
  assert.equal(kgFromPounds(143), 64.9);
  assert.equal(poundsFromKg(65), 143.3);
});
test('BMI to one decimal place', () => { assert.equal(bmiValue(160, 70), 27.3); });
