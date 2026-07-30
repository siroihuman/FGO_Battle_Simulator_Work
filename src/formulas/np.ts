import { clampInteger, floorDiv } from "../core/numeric";

export const NP_ONE_PERCENT = 100;
export const NP_FULL_GAUGE = 10_000;

export type NoblePhantasmLevel = 1 | 2 | 3 | 4 | 5;

export function npCap(npLevel: NoblePhantasmLevel): number {
  if (npLevel === 1) return 10_000;
  if (npLevel === 5) return 30_000;
  return 20_000;
}

export function addNp(
  current: number,
  addition: number,
  npLevel: NoblePhantasmLevel,
): number {
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(addition)) {
    throw new RangeError("NP values must be safe integers");
  }
  const cap = npCap(npLevel);
  let result = clampInteger(current + addition, 0, cap);
  if (addition > 0 && result >= 9_900 && result < NP_FULL_GAUGE) {
    result = NP_FULL_GAUGE;
  }
  return result;
}

export function applyOverkillNp(baseNp: number, isOverkillOrOvergauge: boolean): number {
  if (!Number.isSafeInteger(baseNp) || baseNp < 0) {
    throw new RangeError("baseNp must be a non-negative safe integer");
  }
  return isOverkillOrOvergauge ? floorDiv(baseNp * 3, 2) : baseNp;
}
