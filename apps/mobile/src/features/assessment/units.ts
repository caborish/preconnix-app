// Height and weight in the units a person prefers (owner, 10 Nov 2026). The server always receives cm and kg.
export type HeightUnit = 'cm' | 'ft';
export type WeightUnit = 'kg' | 'lb';

const CM_PER_INCH = 2.54;
const LB_PER_KG = 2.20462;
const oneDecimal = (n: number) => Math.round(n * 10) / 10;

export const cmFromFeet = (feet: number, inches: number) => oneDecimal((feet * 12 + inches) * CM_PER_INCH);
export const kgFromPounds = (lb: number) => oneDecimal(lb / LB_PER_KG);
export const poundsFromKg = (kg: number) => oneDecimal(kg * LB_PER_KG);

export function feetFromCm(cm: number): { feet: number; inches: number } {
  const total = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(total / 12), inches: total % 12 };
}

/** For showing the number as it is typed. The server works out the range and the score. */
export const bmiValue = (heightCm: number, weightKg: number) => oneDecimal(weightKg / (heightCm / 100) ** 2);
