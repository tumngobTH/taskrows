export const MIN_ROW_FRACTION = 0.1;

/** Move `delta` of height from row i+1 to row i; neither shrinks below 0.1 (or below where it already is). Sum is preserved. */
export function resizeFractions(fractions: number[], i: number, delta: number): number[] {
  if (i < 0 || i + 1 >= fractions.length) return fractions;
  const a = fractions[i];
  const b = fractions[i + 1];
  const min = Math.min(MIN_ROW_FRACTION, a, b);
  const out = [...fractions];
  if (delta >= b - min) {
    out[i + 1] = min;
    out[i] = a + b - min;
  } else if (delta <= min - a) {
    out[i] = min;
    out[i + 1] = a + b - min;
  } else {
    out[i] = a + delta;
    out[i + 1] = a + b - out[i];
  }
  return out;
}
