import { clampInteger, floorDiv, multiplyThenFloor } from "../core/numeric";
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

export interface StarRateInput {
  servantStarRatePermille: number;
  /** Exact source SR in 0.01%-point units, when provided. */
  servantStarRateBasisPoints?: number;
  cardStarValuePermille: number;
  cardPerformanceModPermille?: number;
  cardResistancePermille?: number;
  firstCardBonusPermille?: number;
  enemyStarRatePermille?: number;
  starGenerationModPermille?: number;
  enemyStarGenerationModPermille?: number;
  criticalBonusPermille?: number;
  isOverkillOrOvergauge?: boolean;
}

export interface StarDistributionCard {
  id: string;
  baseWeight: number;
  starFocusModPermille?: number;
}

export interface StarDistributionResult {
  randomBonuses: number[];
  effectiveWeights: number[];
  starsByCard: number[];
  distributed: number;
  unassigned: number;
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

export function calculateStarRate(input: StarRateInput): number {
  const values = Object.entries(input);
  for (const [name, value] of values) {
    if (typeof value === "number" && !Number.isSafeInteger(value)) {
      throw new RangeError(`${name} must be a safe integer`);
    }
  }
  const cardFactor = Math.max(
    0,
    Math.min(5000, 1000 + (input.cardPerformanceModPermille ?? 0))
      - (input.cardResistancePermille ?? 0),
  );
  const cardContribution = multiplyThenFloor(
    [input.cardStarValuePermille, cardFactor],
    1000,
  );
  const baseServantRate = input.servantStarRateBasisPoints === undefined
    ? input.servantStarRatePermille
    : floorDiv(input.servantStarRateBasisPoints, 10);
  const baseRate = baseServantRate
    + cardContribution
    + (input.firstCardBonusPermille ?? 0)
    + (input.enemyStarRatePermille ?? 0)
    + (input.starGenerationModPermille ?? 0)
    - (input.enemyStarGenerationModPermille ?? 0)
    + (input.criticalBonusPermille ?? 0);
  const overkillBonus = input.isOverkillOrOvergauge ? 300 : 0;
  return clampInteger(baseRate + overkillBonus, 0, STAR_RATE_CAP_PERMILLE);
}

function shuffledBonuses(count: number, rng: DeterministicRng): number[] {
  const bonuses = [50, 20, 20, 0, 0].slice(0, count);
  for (let index = bonuses.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.nextIntInclusive(0, index);
    [bonuses[index], bonuses[swapIndex]] = [bonuses[swapIndex], bonuses[index]];
  }
  return bonuses;
}

export function distributeStarsToCards(
  starCount: number,
  cards: readonly StarDistributionCard[],
  rng: DeterministicRng,
): StarDistributionResult {
  if (!Number.isSafeInteger(starCount) || starCount < 0) {
    throw new RangeError("starCount must be a non-negative safe integer");
  }
  if (cards.length !== 5) {
    throw new RangeError("cards must contain exactly five command cards");
  }
  const randomBonuses = shuffledBonuses(cards.length, rng);
  const effectiveWeights = cards.map((card, index) => {
    if (!Number.isSafeInteger(card.baseWeight) || card.baseWeight < 0) {
      throw new RangeError(`cards[${index}].baseWeight must be non-negative`);
    }
    const focus = clampInteger(1000 + (card.starFocusModPermille ?? 0), 1, 500_000);
    return multiplyThenFloor([card.baseWeight, focus], 1000) + randomBonuses[index];
  });

  const starsByCard = cards.map(() => 0);
  const targetCount = Math.min(starCount, 50);
  let distributed = 0;
  while (distributed < targetCount) {
    const totalWeight = effectiveWeights.reduce(
      (sum, weight, index) => sum + (starsByCard[index] < 10 ? weight : 0),
      0,
    );
    if (totalWeight <= 0) break;
    let draw = rng.nextIntInclusive(1, totalWeight);
    let selected = -1;
    for (let index = 0; index < effectiveWeights.length; index += 1) {
      if (starsByCard[index] >= 10) continue;
      draw -= effectiveWeights[index];
      if (draw <= 0) {
        selected = index;
        break;
      }
    }
    if (selected < 0) throw new Error("weighted star selection failed");
    starsByCard[selected] += 1;
    distributed += 1;
  }

  return {
    randomBonuses,
    effectiveWeights,
    starsByCard,
    distributed,
    unassigned: starCount - distributed,
  };
}
