import { clampInteger, floorDiv } from "../core/numeric";
import type { DeterministicRng } from "../core/rng";

export const STAR_RATE_CAP_PERMILLE = 3000;
export const STAR_INVENTORY_CAP = 99;

export interface StarHitResult {
  ratePermille: number;
  guaranteed: number;
  fractionalPermille: number;
  rolled: boolean;
  stars: number;
}

export function resolveStarsForHit(
  rawRatePermille: number,
  rng: DeterministicRng,
): StarHitResult {
  if (!Number.isSafeInteger(rawRatePermille)) {
    throw new RangeError("rawRatePermille must be a safe integer");
  }
  const ratePermille = clampInteger(rawRatePermille, 0, STAR_RATE_CAP_PERMILLE);
  const guaranteed = floorDiv(ratePermille, 1000);
  const fractionalPermille = ratePermille % 1000;
  const rolled = rng.chance(fractionalPermille);
  return {
    ratePermille,
    guaranteed,
    fractionalPermille,
    rolled,
    stars: guaranteed + Number(rolled),
  };
}

export function addStars(current: number, addition: number): number {
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(addition)) {
    throw new RangeError("star values must be safe integers");
  }
  return clampInteger(current + addition, 0, STAR_INVENTORY_CAP);
}
