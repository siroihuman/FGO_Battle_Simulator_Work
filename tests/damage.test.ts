import { describe, expect, it } from "vitest";
import { calculateDamage, type DamageInput } from "../src/formulas/damage";

// Reference checked 2026-07-30:
// https://w.atwiki.jp/f_go/pages/304.html
// https://atlasacademy.github.io/fgo-docs/deeper/battle/damage.html

const neutral: DamageInput = {
  attack: 10_000,
  cardDamageValuePermille: 1_000,
  classAttackCoefficientPermille: 1_000,
  classAffinityPermille: 1_000,
  attributeAffinityPermille: 1_000,
  randomModifierPermille: 1_000,
};

describe("final damage formula", () => {
  it("applies the universal 0.23 attack correction", () => {
    const result = calculateDamage(neutral);
    expect(result.damage).toBe(2_300);
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("applies the Buster first-card bonus in the card term", () => {
    expect(
      calculateDamage({ ...neutral, firstCardBonusPermille: 500 }).damage,
    ).toBe(3_450);
  });

  it("keeps independent attack, critical, power and special buckets", () => {
    const result = calculateDamage({
      ...neutral,
      isCritical: true,
      attackModPermille: 200,
      defenseModPermille: 100,
      criticalDamageModPermille: 500,
      specialDamageModPermille: 200,
    });
    expect(result.attackDefenseFactorPermille).toBe(1_100);
    expect(result.powerFactorPermille).toBe(1_500);
    expect(result.specialDamageFactorPermille).toBe(1_200);
    expect(result.damage).toBe(9_108);
  });

  it("adds fixed damage and Buster-chain damage before the final floor", () => {
    expect(
      calculateDamage({
        ...neutral,
        fixedDamage: 100,
        targetFixedDamage: -50,
        busterChainModPermille: 200,
      }).damage,
    ).toBe(4_350);
  });

  it("never returns negative damage", () => {
    expect(
      calculateDamage({ ...neutral, specialDefenseModPermille: 1_000, fixedDamage: -1 }),
    ).toMatchObject({ specialDefenseFactorPermille: 0, damage: 0 });
  });
});
