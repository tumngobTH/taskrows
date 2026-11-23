import { describe, it, expect } from "vitest";
import { resizeFractions } from "./resize";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("resizeFractions", () => {
  it("moves the delta from the row below to the row above, preserving the sum", () => {
    const r = resizeFractions([0.5, 0.3, 0.2], 0, 0.1);
    expect(r[0]).toBeCloseTo(0.6);
    expect(r[1]).toBeCloseTo(0.2);
    expect(r[2]).toBe(0.2);
    expect(sum(r)).toBeCloseTo(1);
  });

  it("clamps both rows to a minimum of 0.1", () => {
    expect(resizeFractions([0.5, 0.5], 0, 0.9)).toEqual([0.9, 0.1]);
    expect(resizeFractions([0.5, 0.5], 0, -0.9)).toEqual([0.1, 0.9]);
  });

  it("never shrinks a row that is already below the minimum", () => {
    const r = resizeFractions([0.05, 0.95], 0, -0.2);
    expect(r).toEqual([0.05, 0.95]);
  });

  it("returns the input unchanged for an out-of-range index", () => {
    expect(resizeFractions([1], 0, 0.2)).toEqual([1]);
  });
});
