import { describe, expect, it } from "vitest";
import {
  createBattleAttackDataRegistry,
} from "../src/core/battle/actionData";
import {
  prepareBattleAttackInput,
  type AttackCalculationData,
} from "../src/core/battle/attackInput";
import {
  beginAllyTurnEnd,
  completeAllyTurnEnd,
} from "../src/core/battle/progression";
import {
  createBattleState,
  type BattleState,
} from "../src/core/battle/state";
import type {
  BattleUnitState,
} from "../src/core/battle/types";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import {
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import type {
  EffectTemplate,
} from "../src/effects/types";
import { createTraitGrantEffect } from "../src/effects/classification";
import { combatantData } from "./helpers/attackData";
import { unit } from "./helpers/battle";

function noblePhantasm() {
  return {
    stableId: "test-np",
    name: "Test NP",
    cardType: "buster" as const,
    level: 2 as const,
  };
}

function addEffects(
  target: BattleUnitState,
  effects: readonly EffectTemplate[],
): BattleUnitState {
  let current = target;
  let counters = createEffectRuntimeCounters();
  for (const effect of effects) {
    const result = applyEffect(
      current,
      effect,
      null,
      counters,
    );
    current = result.unit;
    counters = result.counters;
  }
  return current;
}

function modifier(
  stableId: string,
  effectType: string,
  value: number,
  flags: EffectTemplate["flags"] = {},
): EffectTemplate {
  return {
    stableId,
    name: stableId,
    effectType,
    category: "buff",
    value,
    flags,
  };
}

function battle(
  allyA: BattleUnitState,
  enemyA: BattleUnitState,
): BattleState {
  return createBattleState({
    ally: {
      frontline: [
        allyA,
        unit("ally-b", "ally"),
        unit("ally-c", "ally"),
      ],
      reserve: [],
    },
    waves: [
      {
        enemy: {
          frontline: [enemyA, null, null],
          reserve: [],
        },
      },
    ],
    enemyFrontlineLimit: 3,
  });
}

const criticalBuster: AttackCalculationData = {
  cardType: "buster",
  isNoblePhantasm: false,
  isCritical: true,
  cardDamageValuePermille: 1_500,
  cardNpValuePermille: 0,
  cardStarValuePermille: 100,
  firstCardDamageBonusPermille: 500,
  firstCardNpBonusPermille: 0,
  firstCardStarBonusPermille: 200,
  busterChainModPermille: 200,
  extraCardModifierPermille: 1_000,
  hitWeights: [1, 2],
};

describe("attack calculation input adapter", () => {
  it("combines instance stats, affinities, card context, and matching effects", () => {
    const source = addEffects(
      unit("ally-a", "ally", {
        dataId: "servant",
        noblePhantasm: noblePhantasm(),
      }),
      [
        modifier("attack", COMMON_EFFECT_TYPES.attack, 200),
        modifier(
          "buster",
          COMMON_EFFECT_TYPES.cardPerformance,
          300,
          { cardType: "buster" },
        ),
        modifier(
          "arts",
          COMMON_EFFECT_TYPES.cardPerformance,
          900,
          { cardType: "arts" },
        ),
        modifier(
          "dragon-power",
          COMMON_EFFECT_TYPES.power,
          400,
          { requiredTargetTrait: "dragon" },
        ),
        modifier(
          "critical",
          COMMON_EFFECT_TYPES.criticalDamage,
          500,
          { criticalOnly: true },
        ),
        modifier(
          "np-only",
          COMMON_EFFECT_TYPES.noblePhantasmDamage,
          700,
          { attackKind: "noble_phantasm" },
        ),
        modifier("fixed", COMMON_EFFECT_TYPES.fixedDamage, 100),
        modifier("np-gain", COMMON_EFFECT_TYPES.npGain, 250),
        modifier("stars", COMMON_EFFECT_TYPES.starGeneration, 150),
      ],
    );
    const target = addEffects(
      unit("enemy-a", "enemy", {
        dataId: "dragon-enemy",
        traits: ["dragon"],
      }),
      [
        modifier(
          "buster-resist",
          COMMON_EFFECT_TYPES.cardResistance,
          100,
          { cardType: "buster" },
        ),
        modifier(
          "received-damage",
          COMMON_EFFECT_TYPES.targetDamage,
          200,
        ),
        modifier(
          "received-star-down",
          COMMON_EFFECT_TYPES.targetStarGeneration,
          50,
        ),
      ],
    );
    const registry = createBattleAttackDataRegistry(
      [
        combatantData("ally-a", "servant", {
          attack: 12_345,
          classKey: "assassin",
          attributeKey: "man",
          classAttackCoefficientPermille: 900,
          attackNpUnits: 59,
          starRatePermille: 253,
        }),
        combatantData("enemy-a", "dragon-enemy", {
          classKey: "rider",
          attributeKey: "sky",
          targetNpRatePermille: 1_200,
          targetStarRatePermille: 100,
        }),
      ],
      {
        class: {
          assassin: { rider: 2_000 },
        },
        attribute: {
          man: { sky: 1_100 },
        },
      },
    );
    const prepared = prepareBattleAttackInput(
      battle(source, target),
      registry,
      "ally-a",
      ["enemy-a"],
      criticalBuster,
    );
    const targetInput = prepared.input.targets[0];

    expect(targetInput?.damage).toMatchObject({
      attack: 12_345,
      isCritical: true,
      isNoblePhantasm: false,
      cardDamageValuePermille: 1_500,
      cardPerformanceModPermille: 300,
      cardResistancePermille: 100,
      firstCardBonusPermille: 500,
      classAttackCoefficientPermille: 900,
      classAffinityPermille: 2_000,
      attributeAffinityPermille: 1_100,
      attackModPermille: 200,
      criticalDamageModPermille: 500,
      powerModPermille: 400,
      targetDamageModPermille: 200,
      npDamageModPermille: 0,
      fixedDamage: 100,
      busterChainModPermille: 200,
    });
    expect(targetInput?.attackNp).toMatchObject({
      baseNpUnits: 59,
      cardPerformanceModPermille: 300,
      cardResistancePermille: 100,
      targetNpRatePermille: 1_200,
      npGainModPermille: 250,
      criticalModifierPermille: 2_000,
    });
    expect(targetInput?.stars).toMatchObject({
      servantStarRatePermille: 253,
      cardPerformanceModPermille: 300,
      cardResistancePermille: 100,
      enemyStarRatePermille: 100,
      starGenerationModPermille: 150,
      enemyStarGenerationModPermille: 50,
      criticalBonusPermille: 200,
    });
    expect(prepared.input.defense).toEqual({
      cardType: "buster",
      isNoblePhantasm: false,
      isCritical: true,
    });
    expect(prepared.input.sourceNpLevel).toBe(2);
  });

  it("matches source modifiers against target evade or invincibility state", () => {
    const source = addEffects(
      unit("ally-a", "ally", {
        dataId: "servant",
        noblePhantasm: noblePhantasm(),
      }),
      [
        modifier(
          "np-vs-evade-or-invincibility",
          COMMON_EFFECT_TYPES.noblePhantasmDamage,
          500,
          {
            attackKind: "noble_phantasm",
            requiredTargetEvadeOrInvincibility: true,
          },
        ),
        modifier(
          "critical-vs-evade-or-invincibility",
          COMMON_EFFECT_TYPES.criticalDamage,
          300,
          {
            criticalOnly: true,
            requiredTargetEvadeOrInvincibility: true,
          },
        ),
      ],
    );
    const plainTarget = unit("enemy-a", "enemy", { dataId: "enemy" });
    const evadeTarget = addEffects(plainTarget, [
      modifier("evade", COMMON_EFFECT_TYPES.evade, 0),
    ]);
    const invincibleTarget = addEffects(plainTarget, [
      modifier("invincibility", COMMON_EFFECT_TYPES.invincibility, 0),
    ]);
    const bothTarget = addEffects(plainTarget, [
      modifier("evade", COMMON_EFFECT_TYPES.evade, 0),
      modifier("invincibility", COMMON_EFFECT_TYPES.invincibility, 0),
    ]);
    const solemnTarget = addEffects(plainTarget, [
      modifier("solemn", COMMON_EFFECT_TYPES.solemnDefense, 0),
    ]);
    const registry = createBattleAttackDataRegistry([
      combatantData("ally-a", "servant"),
      combatantData("enemy-a", "enemy"),
    ]);
    const normalCritical = (target: BattleUnitState) =>
      prepareBattleAttackInput(
        battle(source, target),
        registry,
        "ally-a",
        ["enemy-a"],
        criticalBuster,
      ).input.targets[0]?.damage;
    const noblePhantasmAttack = (target: BattleUnitState) =>
      prepareBattleAttackInput(
        battle(source, target),
        registry,
        "ally-a",
        ["enemy-a"],
        {
          ...criticalBuster,
          isNoblePhantasm: true,
          isCritical: false,
          npDamageMultiplierPermille: 1_000,
        },
      ).input.targets[0]?.damage;

    expect(normalCritical(plainTarget)?.criticalDamageModPermille).toBe(0);
    expect(normalCritical(evadeTarget)?.criticalDamageModPermille).toBe(300);
    expect(normalCritical(invincibleTarget)?.criticalDamageModPermille).toBe(300);
    expect(normalCritical(bothTarget)?.criticalDamageModPermille).toBe(300);
    expect(normalCritical(solemnTarget)?.criticalDamageModPermille).toBe(0);

    expect(noblePhantasmAttack(plainTarget)?.npDamageModPermille).toBe(0);
    expect(noblePhantasmAttack(evadeTarget)?.npDamageModPermille).toBe(500);
    expect(noblePhantasmAttack(invincibleTarget)?.npDamageModPermille).toBe(500);
    expect(noblePhantasmAttack(bothTarget)?.npDamageModPermille).toBe(500);
    expect(noblePhantasmAttack(solemnTarget)?.npDamageModPermille).toBe(0);
  });

  it("applies conditional NP special attack to base or granted target traits only", () => {
    const source = addEffects(
      unit("ally-a", "ally", {
        dataId: "servant",
        noblePhantasm: noblePhantasm(),
      }),
      [modifier(
        "evil-power",
        COMMON_EFFECT_TYPES.power,
        250,
        { requiredTargetTrait: "evil" },
      )],
    );
    const plainTarget = unit("enemy-a", "enemy", {
      dataId: "enemy",
    });
    const grantedTarget = addEffects(
      plainTarget,
      [createTraitGrantEffect("evil", "悪", { remainingTurns: 3 })],
    );
    const registry = createBattleAttackDataRegistry([
      combatantData("ally-a", "servant"),
      combatantData("enemy-a", "enemy"),
    ]);
    const action: AttackCalculationData = {
      ...criticalBuster,
      isNoblePhantasm: true,
      isCritical: false,
      npDamageMultiplierPermille: 3_000,
      npSpecialAttackPermille: 1_500,
      npSpecialAttackRequiredTargetTraits: ["evil"],
    };

    const plainInput = prepareBattleAttackInput(
        battle(source, plainTarget),
        registry,
        "ally-a",
        ["enemy-a"],
        action,
      ).input.targets[0]?.damage;
    const grantedInput = prepareBattleAttackInput(
        battle(source, grantedTarget),
        registry,
        "ally-a",
        ["enemy-a"],
        action,
      ).input.targets[0]?.damage;
    expect(plainInput?.npSpecialAttackPermille).toBeUndefined();
    expect(plainInput?.powerModPermille).toBe(0);
    expect(grantedInput?.npSpecialAttackPermille).toBe(1_500);
    expect(grantedInput?.powerModPermille).toBe(250);

    expect(() => prepareBattleAttackInput(
      battle(source, plainTarget),
      registry,
      "ally-a",
      ["enemy-a"],
      {
        ...criticalBuster,
        npSpecialAttackRequiredTargetTraits: ["evil"],
      },
    )).toThrow(/requires npSpecialAttackPermille/);
  });

  it("builds enemy received-NP input without command-star work", () => {
    const ally = addEffects(
      unit("ally-a", "ally", {
        dataId: "servant",
        noblePhantasm: noblePhantasm(),
      }),
      [
        modifier("np", COMMON_EFFECT_TYPES.npGain, 100),
        modifier(
          "received-np",
          COMMON_EFFECT_TYPES.receivedNpGain,
          300,
        ),
      ],
    );
    const enemy = unit("enemy-a", "enemy", {
      dataId: "enemy",
    });
    const state = completeAllyTurnEnd(
      beginAllyTurnEnd(battle(ally, enemy)),
    );
    const registry = createBattleAttackDataRegistry([
      combatantData("ally-a", "servant", {
        receivedNpUnits: 300,
      }),
      combatantData("enemy-a", "enemy", {
        attackNpRatePermille: 800,
      }),
    ]);
    const prepared = prepareBattleAttackInput(
      state,
      registry,
      "enemy-a",
      ["ally-a"],
      {
        ...criticalBuster,
        isCritical: false,
      },
    );
    const target = prepared.input.targets[0];

    expect(target?.receivedNp).toEqual({
      baseDefenseNpUnits: 300,
      attackerNpRatePermille: 800,
      npGainModPermille: 100,
      receivedNpGainModPermille: 300,
    });
    expect(target?.receivedNpLevel).toBe(2);
    expect(target?.attackNp).toBeUndefined();
    expect(target?.stars).toBeUndefined();
  });

  it("uses neutral target defaults but requires source data", () => {
    const state = battle(
      unit("ally-a", "ally", {
        dataId: "servant",
        noblePhantasm: noblePhantasm(),
      }),
      unit("enemy-a", "enemy", {
        dataId: "unregistered-enemy",
      }),
    );
    const registry = createBattleAttackDataRegistry([
      combatantData("ally-a", "servant"),
    ]);
    const prepared = prepareBattleAttackInput(
      state,
      registry,
      "ally-a",
      ["enemy-a"],
      criticalBuster,
    );

    expect(prepared.targetDataInstanceIds).toEqual([null]);
    expect(prepared.input.targets[0]?.damage).toMatchObject({
      classAffinityPermille: 1_000,
      attributeAffinityPermille: 1_000,
    });
    expect(
      prepared.input.targets[0]?.attackNp?.targetNpRatePermille,
    ).toBe(1_000);
    expect(
      prepared.input.targets[0]?.stars?.enemyStarRatePermille,
    ).toBe(0);

    expect(() =>
      prepareBattleAttackInput(
        state,
        createBattleAttackDataRegistry([]),
        "ally-a",
        ["enemy-a"],
        criticalBuster,
      )
    ).toThrow(/source data is missing/);
  });
});
