import { describe, expect, it } from "vitest";
import { floorDiv, multiplyThenFloor } from "../src/core/numeric";

describe("integer calculation primitives", () => {
  it("floors instead of truncating negative values", () => {
    expect(floorDiv(-1, 2)).toBe(-1);
    expect(floorDiv(7, 3)).toBe(2);
  });

  it("uses bigint internally before returning a safe integer", () => {
    expect(multiplyThenFloor([9_000_000_000, 9_000], 10_000)).toBe(8_100_000_000);
  });

  it("rejects unsafe inputs and zero divisors", () => {
    expect(() => floorDiv(Number.MAX_SAFE_INTEGER + 1, 2)).toThrow();
    expect(() => floorDiv(1, 0)).toThrow();
  });
});
