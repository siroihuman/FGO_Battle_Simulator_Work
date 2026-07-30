import { describe, expect, it } from "vitest";
import { BattleRng } from "../src/core/rng";
import {
  DAMAGE_RANDOM_MAX,
  DAMAGE_RANDOM_MIN,
  DAMAGE_RANDOM_VARIANTS,
  drawDamageRandom,
} from "../src/formulas/damageRandom";
import { distributeDamageAcrossHits } from "../src/formulas/hitDistribution";
import { addNp, applyOverkillNp, npCap } from "../src/formulas/np";
import { addStars, resolveStarsForHit } from "../src/formulas/stars";

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
});
