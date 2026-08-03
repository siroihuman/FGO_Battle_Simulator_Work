import { describe, expect, it } from "vitest";
import { BattleRng } from "../src/core/rng";
import {
  resolveAttackDefense,
} from "../src/effects/defense";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import {
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import type { EffectTemplate } from "../src/effects/types";
import { calculateDamage } from "../src/formulas/damage";
import { unit } from "./helpers/battle";

// Reference checked 2026-07-30:
// https://w.atwiki.jp/f_go/pages/955.html

function addEffects(
  target: ReturnType<typeof unit>,
  effects: readonly EffectTemplate[],
): ReturnType<typeof unit> {
  let current = target;
  let counters = createEffectRuntimeCounters();
  for (const template of effects) {
    const result = applyEffect(current, template, null, counters);
    current = result.unit;
    counters = result.counters;
  }
  return current;
}

function effect(
  stableId: string,
  effectType: string,
  options: Partial<EffectTemplate> = {},
): EffectTemplate {
  return {
    stableId,
    name: stableId,
    effectType,
    category: "buff",
    ...options,
  };
}

describe("attack protection resolution", () => {
  it("uses solemn defense before invincibility and evasion", () => {
    const target = addEffects(unit("enemy-a", "enemy"), [
      effect("evade", COMMON_EFFECT_TYPES.evade, { remainingUses: 1 }),
      effect("invincible", COMMON_EFFECT_TYPES.invincibility, {
        remainingUses: 1,
      }),
      effect("solemn", COMMON_EFFECT_TYPES.solemnDefense, {
        remainingUses: 1,
      }),
    ]);
    const result = resolveAttackDefense(
      null,
      target,
      { phase: "attack" },
      new BattleRng("priority").stream("effects"),
    );

    expect(result).toMatchObject({
      outcome: "solemn_defense",
      damageAllowed: false,
      countsAsSuccessfulHit: false,
      postAttackEffectsContinue: true,
      protection: {
        kind: "solemn_defense",
        bypassed: false,
        consumedUse: true,
      },
    });
    expect(result.target.effects.map(({ stableId }) => stableId)).toEqual([
      "evade",
      "invincible",
    ]);
  });

  it("lets sure hit bypass evasion while still consuming its count", () => {
    const target = addEffects(unit("enemy-a", "enemy"), [
      effect("evade", COMMON_EFFECT_TYPES.evade, { remainingUses: 1 }),
    ]);
    const result = resolveAttackDefense(
      null,
      target,
      { phase: "attack", sureHit: true },
      new BattleRng("sure-hit").stream("effects"),
    );

    expect(result).toMatchObject({
      outcome: "damage_allowed",
      damageAllowed: true,
      sureHit: true,
      protection: {
        kind: "evade",
        bypassed: true,
        consumedUse: true,
      },
    });
    expect(result.target.effects).toEqual([]);
  });

  it("does not let sure hit bypass invincibility", () => {
    const target = addEffects(unit("enemy-a", "enemy"), [
      effect("invincible", COMMON_EFFECT_TYPES.invincibility),
    ]);
    const result = resolveAttackDefense(
      null,
      target,
      { phase: "attack", sureHit: true },
      new BattleRng("sure-hit-vs-invincible").stream("effects"),
    );
    expect(result.outcome).toBe("invincible");
    expect(result.damageAllowed).toBe(false);
  });

  it("does not let sure hit or invincibility pierce bypass solemn defense", () => {
    const target = addEffects(unit("enemy-a", "enemy"), [
      effect("solemn", COMMON_EFFECT_TYPES.solemnDefense, {
        remainingUses: 1,
      }),
    ]);
    const result = resolveAttackDefense(
      null,
      target,
      {
        phase: "attack",
        sureHit: true,
        invincibilityPierce: true,
      },
      new BattleRng("pierce-vs-solemn").stream("effects"),
    );
    expect(result).toMatchObject({
      outcome: "solemn_defense",
      damageAllowed: false,
      protection: {
        kind: "solemn_defense",
        bypassed: false,
        consumedUse: true,
      },
    });
  });

  it("consumes only invincibility when pierce bypasses invincibility over evasion", () => {
    const source = addEffects(unit("ally-a", "ally"), [
      effect("pierce", COMMON_EFFECT_TYPES.invincibilityPierce, {
        remainingUses: 1,
      }),
    ]);
    const target = addEffects(unit("enemy-a", "enemy"), [
      effect("evade", COMMON_EFFECT_TYPES.evade, { remainingUses: 1 }),
      effect("invincible", COMMON_EFFECT_TYPES.invincibility, {
        remainingUses: 1,
      }),
    ]);
    const result = resolveAttackDefense(
      source,
      target,
      { phase: "attack" },
      new BattleRng("pierce-order").stream("effects"),
    );

    expect(result).toMatchObject({
      outcome: "damage_allowed",
      invincibilityPierce: true,
      protection: { kind: "invincibility", bypassed: true },
    });
    expect(result.source?.effects).toEqual([]);
    expect(result.target.effects.map(({ stableId }) => stableId)).toEqual([
      "evade",
    ]);
  });

  it("does not consume lower damage reducers when protection blocks", () => {
    const target = addEffects(unit("enemy-a", "enemy"), [
      effect("defense", COMMON_EFFECT_TYPES.defense, {
        value: 300,
        remainingUses: 1,
      }),
      effect("cut", COMMON_EFFECT_TYPES.damageCut, {
        value: 500,
        remainingUses: 1,
      }),
      effect("invincible", COMMON_EFFECT_TYPES.invincibility, {
        remainingUses: 1,
      }),
    ]);
    const result = resolveAttackDefense(
      null,
      target,
      { phase: "attack" },
      new BattleRng("block-reducers").stream("effects"),
    );

    expect(result.damageAllowed).toBe(false);
    expect(
      result.target.effects.map(({ stableId, remainingUses }) => ({
        stableId,
        remainingUses,
      })),
    ).toEqual([
      { stableId: "defense", remainingUses: 1 },
      { stableId: "cut", remainingUses: 1 },
    ]);
  });

  it("ignores only positive defense while preserving defense down and other buckets", () => {
    const target = addEffects(unit("enemy-a", "enemy"), [
      effect("defense-up", COMMON_EFFECT_TYPES.defense, { value: 300 }),
      effect("defense-down", COMMON_EFFECT_TYPES.defense, { value: -100 }),
      effect("special-defense", COMMON_EFFECT_TYPES.specialDefense, {
        value: 200,
      }),
      effect("cut", COMMON_EFFECT_TYPES.damageCut, { value: 400 }),
    ]);
    const result = resolveAttackDefense(
      null,
      target,
      { phase: "attack", ignoreDefense: true },
      new BattleRng("ignore-defense").stream("effects"),
    );

    expect(result).toMatchObject({
      outcome: "damage_allowed",
      defenseModPermille: -100,
      specialDefenseModPermille: 200,
      damageCut: 400,
      targetFixedDamage: -400,
    });
  });

  it("consumes attack-count and hit-count states only in their own phase", () => {
    let target = addEffects(unit("enemy-a", "enemy"), [
      effect("attack-evade", COMMON_EFFECT_TYPES.evade, {
        remainingUses: 2,
        flags: { consumptionUnit: "attack" },
      }),
      effect("hit-evade", COMMON_EFFECT_TYPES.evade, {
        remainingUses: 2,
        flags: { consumptionUnit: "hit" },
      }),
    ]);
    const rng = new BattleRng("consumption-unit").stream("effects");
    const attack = resolveAttackDefense(
      null,
      target,
      { phase: "attack", sureHit: true },
      rng,
    );
    target = attack.target;
    expect(target.effects.map(({ remainingUses }) => remainingUses)).toEqual([
      1, 2,
    ]);

    const hit = resolveAttackDefense(
      null,
      target,
      { phase: "hit", sureHit: true },
      rng,
    );
    expect(hit.target.effects.map(({ remainingUses }) => remainingUses)).toEqual([
      1, 1,
    ]);
  });

  it("skips a failed probability protection without consuming it", () => {
    const target = addEffects(unit("enemy-a", "enemy"), [
      effect("failed-evade", COMMON_EFFECT_TYPES.evade, {
        remainingUses: 1,
        flags: { activationRatePermille: 0 },
      }),
      effect("certain-evade", COMMON_EFFECT_TYPES.evade, {
        remainingUses: 1,
      }),
    ]);
    const rng = new BattleRng("probability-evade").stream("effects");
    const result = resolveAttackDefense(
      null,
      target,
      { phase: "attack" },
      rng,
    );

    expect(result.protection?.effect.stableId).toBe("certain-evade");
    expect(result.target.effects.map(({ stableId }) => stableId)).toEqual([
      "failed-evade",
    ]);
    expect(rng.snapshot().drawCount).toBe(0);
  });

  it("keeps calculated zero damage distinct from a protection block", () => {
    const target = addEffects(unit("enemy-a", "enemy"), [
      effect("full-defense", COMMON_EFFECT_TYPES.defense, { value: 1000 }),
    ]);
    const defense = resolveAttackDefense(
      null,
      target,
      { phase: "attack" },
      new BattleRng("zero-damage").stream("effects"),
    );
    const damage = calculateDamage({
      attack: 10_000,
      cardDamageValuePermille: 1000,
      classAttackCoefficientPermille: 1000,
      classAffinityPermille: 1000,
      attributeAffinityPermille: 1000,
      randomModifierPermille: 1000,
      defenseModPermille: defense.defenseModPermille,
    });

    expect(damage.damage).toBe(0);
    expect(defense).toMatchObject({
      outcome: "damage_allowed",
      countsAsSuccessfulHit: true,
    });
  });

  it("nets received fixed damage against damage cut in the E slot", () => {
    const target = addEffects(unit("enemy-a", "enemy"), [
      effect("cut", COMMON_EFFECT_TYPES.damageCut, {
        value: 500,
      }),
      effect(
        "received-fixed",
        COMMON_EFFECT_TYPES.targetFixedDamage,
        { value: 700 },
      ),
    ]);
    const defense = resolveAttackDefense(
      null,
      target,
      { phase: "attack" },
      new BattleRng("received-fixed").stream("effects"),
    );

    expect(defense).toMatchObject({
      damageCut: 500,
      targetFixedDamage: 200,
    });
  });
});
