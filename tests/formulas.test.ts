import { describe, expect, it } from "vitest";
import { BattleRng } from "../src/core/rng";
import {
  DAMAGE_RANDOM_MAX,
  DAMAGE_RANDOM_MIN,
  DAMAGE_RANDOM_VARIANTS,
  drawDamageRandom,
} from "../src/formulas/damageRandom";
import { distributeDamageAcrossHits } from "../src/formulas/hitDistribution";
import {
  addNp,
  applyOverkillNp,
  calculateAttackNp,
  calculateReceivedNp,
  npCap,
} from "../src/formulas/np";
import {
  addStars,
  calculateStarRate,
  distributeStarsToCards,
  resolveStarsForHit,
} from "../src/formulas/stars";

// Reference values checked 2026-07-30:
// https://w.atwiki.jp/f_go/pages/304.html
// https://atlasacademy.github.io/fgo-docs/deeper/battle/damage.html

describe("damage calculation primitives", () => {
  it("distributes the remainder to the final hit", () => {
    expect(distributeDamageAcrossHits(101, [10, 20, 30, 40])).toEqual([
      10, 20, 30, 41,
    ]);
  });

  it("always preserves total damage", () => {
    const hits = distributeDamageAcrossHits(12_345, [7, 13, 20, 60]);
    expect(hits.reduce((sum, damage) => sum + damage, 0)).toBe(12_345);
  });

  it("draws from all 200 documented damage random values", () => {
    const rng = new BattleRng("damage-random-range").stream("damage");
    const values = new Set(
      Array.from({ length: 10_000 }, () => drawDamageRandom(rng)),
    );
    expect(Math.min(...values)).toBe(DAMAGE_RANDOM_MIN);
    expect(Math.max(...values)).toBe(DAMAGE_RANDOM_MAX);
    expect(values.size).toBe(DAMAGE_RANDOM_VARIANTS);
  });
});

describe("NP calculation primitives", () => {
  it("uses the NP-level-specific cap", () => {
    expect([1, 2, 3, 4, 5].map((level) => npCap(level as 1 | 2 | 3 | 4 | 5))).toEqual([
      10_000, 20_000, 20_000, 20_000, 30_000,
    ]);
  });

  it("rounds a positive 99.00–99.99% result up to 100%", () => {
    expect(addNp(9_850, 50, 1)).toBe(10_000);
    expect(addNp(9_899, 1, 1)).toBe(10_000);
    expect(addNp(9_950, -1, 1)).toBe(9_949);
  });

  it("applies the 1.5x overkill multiplier with integer floor", () => {
    expect(applyOverkillNp(101, true)).toBe(151);
    expect(applyOverkillNp(101, false)).toBe(101);
  });

  it("matches the documented Ereshkigal first-Arts example", () => {
    expect(
      calculateAttackNp({
        baseNpUnits: 54,
        cardNpValuePermille: 3_000,
        cardPerformanceModPermille: 110,
        firstCardBonusPermille: 1_000,
        targetNpRatePermille: 1_000,
        overkillOrOvergaugeByHit: [false, false, false, false, false, false],
      }),
    ).toEqual({
      baseUnitsPerHit: 233,
      normalHits: 6,
      overkillHits: 0,
      totalUnits: 1_398,
    });
  });

  it("floors after summing normal and 1.5x overkill hits", () => {
    expect(
      calculateAttackNp({
        baseNpUnits: 54,
        cardNpValuePermille: 3_000,
        cardPerformanceModPermille: 110,
        firstCardBonusPermille: 1_000,
        targetNpRatePermille: 1_000,
        overkillOrOvergaugeByHit: [false, true, true, true, true, true],
      }).totalUnits,
    ).toBe(1_980);
  });

  it("calculates received NP per hit before the card total", () => {
    expect(
      calculateReceivedNp({
        baseDefenseNpUnits: 300,
        attackerNpRatePermille: 1_000,
        overkillByHit: [false, false, false],
      }).totalUnits,
    ).toBe(900);
  });
});

describe("star calculation primitives", () => {
  it("caps a hit at 300% and grants three stars without a draw", () => {
    const rng = new BattleRng("star-cap").stream("stars");
    expect(resolveStarsForHit(3_500, rng)).toMatchObject({
      ratePermille: 3_000,
      guaranteed: 3,
      fractionalPermille: 0,
      stars: 3,
    });
    expect(rng.snapshot().drawCount).toBe(0);
  });

  it("keeps inventory at the 99-star cap", () => {
    expect(addStars(95, 10)).toBe(99);
  });

  it("matches the documented Jack first-Quick star-rate example", () => {
    expect(
      calculateStarRate({
        servantStarRatePermille: 255,
        cardStarValuePermille: 800,
        cardPerformanceModPermille: 500,
        firstCardBonusPermille: 200,
        starGenerationModPermille: 105,
      }),
    ).toBe(1_760);
  });

  it("adds the overkill bonus after the base rate and caps at 300%", () => {
    expect(
      calculateStarRate({
        servantStarRatePermille: 255,
        cardStarValuePermille: 1_300,
        cardPerformanceModPermille: 500,
        firstCardBonusPermille: 200,
        starGenerationModPermille: 105,
        criticalBonusPermille: 200,
        isOverkillOrOvergauge: true,
      }),
    ).toBe(3_000);
  });

  it("distributes at most ten stars to each of five cards", () => {
    const rng = new BattleRng("star-distribution").stream("stars");
    const result = distributeStarsToCards(
      75,
      [
        { id: "a", baseWeight: 194 },
        { id: "b", baseWeight: 194 },
        { id: "c", baseWeight: 102 },
        { id: "d", baseWeight: 102 },
        { id: "e", baseWeight: 10 },
      ],
      rng,
    );
    expect([...result.randomBonuses].sort((a, b) => b - a)).toEqual([50, 20, 20, 0, 0]);
    expect(result.starsByCard.every((stars) => stars === 10)).toBe(true);
    expect(result.distributed).toBe(50);
    expect(result.unassigned).toBe(25);
  });
});
