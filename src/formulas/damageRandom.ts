import type { DeterministicRng } from "../core/rng";

export const DAMAGE_RANDOM_MIN = 900;
export const DAMAGE_RANDOM_MAX = 1099;
export const DAMAGE_RANDOM_VARIANTS = 200;

export function drawDamageRandom(rng: DeterministicRng): number {
  return rng.nextIntInclusive(DAMAGE_RANDOM_MIN, DAMAGE_RANDOM_MAX);
}
