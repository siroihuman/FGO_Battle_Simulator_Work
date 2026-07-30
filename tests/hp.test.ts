import { describe, expect, it } from "vitest";
import { BattleRng } from "../src/core/rng";
import {
  executeCommonAction,
  executeCommonActions,
} from "../src/effects/actions";
import {
  resolveHpAbsorption,
  resolveHpRecovery,
} from "../src/effects/hp";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import { removeEffects } from "../src/effects/removal";
import {
  advanceOwnerTurnEnd,
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import type {
  EffectRuntimeCounters,
  EffectTemplate,
} from "../src/effects/types";
import { unit } from "./helpers/battle";

const maxHpUp: EffectTemplate = {
  stableId: "max-hp-up",
  name: "最大HPアップ",
  effectType: COMMON_EFFECT_TYPES.maxHpChange,
  category: "buff",
  value: 1_000,
  remainingTurns: 3,
};

const maxHpDown: EffectTemplate = {
  ...maxHpUp,
  stableId: "max-hp-down",
  name: "最大HPダウン",
  category: "debuff",
  value: -3_000,
};

function register(
  target: ReturnType<typeof unit>,
  template: EffectTemplate,
  counters: EffectRuntimeCounters,
) {
  return applyEffect(target, template, null, counters);
}

describe("maximum HP states", () => {
  it("raises maximum and current HP by the same actual amount", () => {
    let target = unit("ally-a", "ally", { hp: 2_000 });
    let counters = createEffectRuntimeCounters();
    for (const template of [
      {
        stableId: "received-healing-up",
        name: "HP回復量アップ",
        effectType: COMMON_EFFECT_TYPES.receivedHpRecovery,
        category: "buff" as const,
        value: 10_000,
      },
      {
        stableId: "healing-block",
        name: "HP回復不能",
        effectType: COMMON_EFFECT_TYPES.hpRecoveryBlocked,
        category: "debuff" as const,
      },
      maxHpUp,
    ]) {
      const applied = register(target, template, counters);
      target = applied.unit;
      counters = applied.counters;
    }

    expect(target).toMatchObject({
      baseMaxHp: 10_000,
      maxHp: 11_000,
      hp: 3_000,
    });
  });

  it("removes only the maximum increase on expiry and clamps excess HP", () => {
    const applied = register(
      unit("ally-a", "ally", { hp: 9_500 }),
      { ...maxHpUp, remainingTurns: 1 },
      createEffectRuntimeCounters(),
    ).unit;
    const healed = { ...applied, hp: 11_000 };
    const result = advanceOwnerTurnEnd(healed, "ally", false);

    expect(applied).toMatchObject({ maxHp: 11_000, hp: 10_500 });
    expect(result.unit).toMatchObject({ maxHp: 10_000, hp: 10_000 });
    expect(result.removed[0]).toMatchObject({
      effect: { stableId: "max-hp-up" },
      reason: "expired_turns",
    });
  });

  it("keeps current HP unchanged on expiry when it is under the base maximum", () => {
    const applied = register(
      unit("ally-a", "ally", { hp: 2_000 }),
      { ...maxHpUp, remainingTurns: 1 },
      createEffectRuntimeCounters(),
    ).unit;
    const result = advanceOwnerTurnEnd(applied, "ally", false);

    expect(result.unit).toMatchObject({ maxHp: 10_000, hp: 3_000 });
  });

  it("clamps current HP on maximum reduction and does not heal on removal", () => {
    const applied = register(
      unit("ally-a", "ally", { hp: 8_000 }),
      maxHpDown,
      createEffectRuntimeCounters(),
    ).unit;
    const removed = removeEffects(applied, {
      mode: "by_id",
      stableId: "max-hp-down",
    });

    expect(applied).toMatchObject({ maxHp: 7_000, hp: 7_000 });
    expect(removed.unit).toMatchObject({ maxHp: 10_000, hp: 7_000 });
  });

  it("leaves current HP alone when it is below a reduced maximum", () => {
    const applied = register(
      unit("ally-a", "ally", { hp: 6_000 }),
      maxHpDown,
      createEffectRuntimeCounters(),
    ).unit;

    expect(applied).toMatchObject({ maxHp: 7_000, hp: 6_000 });
  });

  it("keeps maximum HP at one and recomputes stacked states from base HP", () => {
    let target = unit("ally-a", "ally", { hp: 10_000 });
    let counters = createEffectRuntimeCounters();
    let applied = register(
      target,
      { ...maxHpDown, value: -20_000 },
      counters,
    );
    target = applied.unit;
    counters = applied.counters;
    applied = register(
      target,
      { ...maxHpUp, stableId: "large-max-hp-up", value: 15_000 },
      counters,
    );
    target = applied.unit;

    expect(target).toMatchObject({ maxHp: 5_000, hp: 5_000 });
    const removed = removeEffects(target, {
      mode: "by_id",
      stableId: "max-hp-down",
    });
    expect(removed.unit).toMatchObject({ maxHp: 25_000, hp: 5_000 });
  });
});

describe("ordinary HP recovery", () => {
  it("adds modifiers within each group and multiplies the two groups", () => {
    let source = unit("ally-a", "ally");
    let target = unit("ally-b", "ally", { hp: 1_000 });
    let counters = createEffectRuntimeCounters();
    let applied = register(
      source,
      {
        stableId: "given-healing-up",
        name: "与HP回復量アップ",
        effectType: COMMON_EFFECT_TYPES.givenHpRecovery,
        category: "buff",
        value: 200,
        remainingUses: 1,
      },
      counters,
    );
    source = applied.unit;
    counters = applied.counters;
    applied = register(
      target,
      {
        stableId: "received-healing-up",
        name: "HP回復量アップ",
        effectType: COMMON_EFFECT_TYPES.receivedHpRecovery,
        category: "buff",
        value: 500,
        remainingUses: 1,
      },
      counters,
    );
    target = applied.unit;

    const result = resolveHpRecovery(source, target, 1_000);
    expect(result).toMatchObject({
      outcome: "healed",
      givenModifierPermille: 200,
      receivedModifierPermille: 500,
      scaledAmount: 1_800,
      actualRecovered: 1_800,
      target: { hp: 2_800 },
    });
    expect(result.source?.effects).toEqual([]);
    expect(result.target?.effects).toEqual([]);
  });

  it("blocks ordinary healing unless the action explicitly ignores the block", () => {
    const target = register(
      unit("ally-a", "ally", { hp: 5_000 }),
      {
        stableId: "healing-block",
        name: "HP回復不能",
        effectType: COMMON_EFFECT_TYPES.hpRecoveryBlocked,
        category: "debuff",
        remainingUses: 1,
      },
      createEffectRuntimeCounters(),
    ).unit;

    const blocked = resolveHpRecovery(null, target, 2_000);
    expect(blocked).toMatchObject({
      outcome: "blocked",
      actualRecovered: 0,
      target: { hp: 5_000, effects: [] },
    });
    const ignored = resolveHpRecovery(
      null,
      target,
      2_000,
      { ignoreHealingBlock: true },
    );
    expect(ignored).toMatchObject({
      outcome: "healed",
      actualRecovered: 2_000,
      target: { hp: 7_000 },
    });
    expect(ignored.target?.effects).toHaveLength(1);
  });
});

describe("HP absorption", () => {
  it("totals actual reductions from multiple targets and heals once", () => {
    let source = unit("ally-a", "ally", { hp: 1_000 });
    let counters = createEffectRuntimeCounters();
    let applied = register(
      source,
      {
        stableId: "given-healing-up",
        name: "与HP回復量アップ",
        effectType: COMMON_EFFECT_TYPES.givenHpRecovery,
        category: "buff",
        value: 200,
      },
      counters,
    );
    source = applied.unit;
    counters = applied.counters;
    applied = register(
      source,
      {
        stableId: "received-healing-up",
        name: "HP回復量アップ",
        effectType: COMMON_EFFECT_TYPES.receivedHpRecovery,
        category: "buff",
        value: 500,
      },
      counters,
    );
    source = applied.unit;

    const result = resolveHpAbsorption(
      source,
      [
        unit("enemy-a", "enemy", { hp: 500 }),
        unit("enemy-b", "enemy", { hp: 2_000 }),
      ],
      { amountPerTarget: 1_000, canDefeat: false },
    );

    expect(result).toMatchObject({
      outcome: "absorbed",
      totalActualReduction: 1_499,
      recoveryBaseAmount: 1_499,
      source: { hp: 3_698 },
      recovery: {
        scaledAmount: 2_698,
        actualRecovered: 2_698,
      },
    });
    expect(result.targets).toMatchObject([
      { hp: 1, alive: true },
      { hp: 1_000, alive: true },
    ]);
  });

  it("counts HP removed before guts recovery", () => {
    const target = register(
      unit("enemy-a", "enemy", { hp: 500 }),
      {
        stableId: "guts",
        name: "ガッツ",
        effectType: COMMON_EFFECT_TYPES.guts,
        category: "buff",
        value: 700,
        remainingUses: 1,
      },
      createEffectRuntimeCounters(),
    ).unit;
    const result = resolveHpAbsorption(
      unit("ally-a", "ally", { hp: 1_000 }),
      [target],
      { amountPerTarget: 1_000, canDefeat: true },
    );

    expect(result).toMatchObject({
      totalActualReduction: 500,
      source: { hp: 1_500 },
      targetResults: [
        {
          outcome: "guts",
          actualReduction: 500,
          target: { hp: 700, alive: true, effects: [] },
        },
      ],
    });
  });

  it("still reduces targets when source recovery is blocked", () => {
    const source = register(
      unit("ally-a", "ally", { hp: 1_000 }),
      {
        stableId: "healing-block",
        name: "HP回復不能",
        effectType: COMMON_EFFECT_TYPES.hpRecoveryBlocked,
        category: "debuff",
      },
      createEffectRuntimeCounters(),
    ).unit;
    const result = resolveHpAbsorption(
      source,
      [unit("enemy-a", "enemy", { hp: 2_000 })],
      { amountPerTarget: 1_000, canDefeat: false },
    );

    expect(result).toMatchObject({
      totalActualReduction: 1_000,
      source: { hp: 1_000 },
      targets: [{ hp: 1_000 }],
      recovery: { outcome: "blocked", actualRecovered: 0 },
    });
  });

  it("updates both source and target through common action sequences", () => {
    const rng = new BattleRng("hp-absorption-action").stream("effects");
    const result = executeCommonActions(
      unit("ally-a", "ally", { hp: 1_000 }),
      unit("enemy-a", "enemy", { hp: 3_000 }),
      [
        { kind: "absorb_hp", amount: 1_000, canDefeat: false },
        { kind: "reduce_hp", amount: 500, canDefeat: false },
      ],
      createEffectRuntimeCounters(),
      rng,
    );

    expect(result).toMatchObject({
      source: { hp: 2_000 },
      target: { hp: 1_500 },
      results: [
        {
          outcome: "changed",
          hpChange: -1_000,
          absorptionResult: { totalActualReduction: 1_000 },
        },
        { outcome: "changed", hpChange: -500 },
      ],
    });
    expect(rng.snapshot().drawCount).toBe(0);
  });

  it("does not reduce a target when the absorption source is unavailable", () => {
    const target = unit("enemy-a", "enemy", { hp: 2_000 });
    const result = executeCommonAction(
      null,
      target,
      { kind: "absorb_hp", amount: 1_000, canDefeat: false },
      createEffectRuntimeCounters(),
      new BattleRng("no-absorption-source").stream("effects"),
    );

    expect(result).toMatchObject({
      outcome: "unchanged",
      source: null,
      target: { hp: 2_000 },
      absorptionResult: {
        outcome: "no_source",
        totalActualReduction: 0,
      },
    });
  });
});
