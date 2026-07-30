import { describe, expect, it } from "vitest";
import { BattleRng } from "../src/core/rng";
import {
  executeCommonAction,
  executeCommonActions,
} from "../src/effects/actions";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import { attemptRemoveEffects } from "../src/effects/removal";
import {
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import type {
  EffectRuntimeCounters,
  EffectTemplate,
} from "../src/effects/types";
import { unit } from "./helpers/battle";

const attackUp: EffectTemplate = {
  stableId: "attack-up",
  name: "攻撃力アップ",
  effectType: "attack_mod",
  category: "buff",
  classifications: ["attack"],
  value: 300,
  remainingTurns: 3,
};

function register(
  target: ReturnType<typeof unit>,
  template: EffectTemplate,
  counters: EffectRuntimeCounters,
) {
  return applyEffect(target, template, null, counters);
}

describe("removal success and resistance", () => {
  it("selects the newest state before a resisted one-effect removal", () => {
    let target = unit("ally-a", "ally");
    let counters = createEffectRuntimeCounters();
    for (const stableId of ["old-buff", "new-buff"]) {
      const result = register(
        target,
        { ...attackUp, stableId, name: stableId },
        counters,
      );
      target = result.unit;
      counters = result.counters;
    }
    target = register(
      target,
      {
        stableId: "removal-resistance",
        name: "強化解除耐性",
        effectType: COMMON_EFFECT_TYPES.buffRemovalResistance,
        category: "buff",
        value: 500,
        removalPolicy: "unremovable",
      },
      counters,
    ).unit;

    const result = attemptRemoveEffects(
      target,
      { mode: "one", category: "buff" },
      500,
      new BattleRng("resisted-one-removal").stream("effects"),
    );
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({
      effect: { stableId: "new-buff" },
      outcome: "resisted",
      resolvedRatePermille: 0,
    });
    expect(result.unit.effects.map(({ stableId }) => stableId)).toEqual([
      "old-buff",
      "new-buff",
      "removal-resistance",
    ]);
  });

  it("snapshots all candidates and rolls classification-specific resistance separately", () => {
    let target = unit("ally-a", "ally");
    let counters = createEffectRuntimeCounters();
    for (const template of [
      attackUp,
      {
        ...attackUp,
        stableId: "mental-buff",
        name: "精神系強化",
        classifications: ["mental"],
      },
      {
        stableId: "mental-removal-resistance",
        name: "精神系強化解除耐性",
        effectType: COMMON_EFFECT_TYPES.buffRemovalResistance,
        category: "buff" as const,
        classifications: ["mental"],
        value: 1000,
        removalPolicy: "unremovable" as const,
      },
    ]) {
      const result = register(target, template, counters);
      target = result.unit;
      counters = result.counters;
    }
    const rng = new BattleRng("classified-removal").stream("effects");
    const result = attemptRemoveEffects(
      target,
      { mode: "all", category: "buff" },
      1000,
      rng,
    );

    expect(
      result.attempts.map(({ effect, outcome, resolvedRatePermille }) => ({
        stableId: effect.stableId,
        outcome,
        resolvedRatePermille,
      })),
    ).toEqual([
      {
        stableId: "mental-buff",
        outcome: "resisted",
        resolvedRatePermille: 0,
      },
      {
        stableId: "attack-up",
        outcome: "removed",
        resolvedRatePermille: 1000,
      },
    ]);
    expect(result.unit.effects.map(({ stableId }) => stableId)).toEqual([
      "mental-buff",
      "mental-removal-resistance",
    ]);
    expect(rng.snapshot().drawCount).toBe(0);
  });

  it("allows success rates above 100% to overcome removal resistance", () => {
    let target = register(
      unit("ally-a", "ally"),
      attackUp,
      createEffectRuntimeCounters(),
    );
    target = register(
      target.unit,
      {
        stableId: "removal-resistance",
        name: "強化解除耐性",
        effectType: COMMON_EFFECT_TYPES.buffRemovalResistance,
        category: "buff",
        value: 1000,
        removalPolicy: "unremovable",
      },
      target.counters,
    );
    const rng = new BattleRng("high-rate-removal").stream("effects");
    const result = attemptRemoveEffects(
      target.unit,
      { mode: "all", category: "buff" },
      5000,
      rng,
    );
    expect(result.removed.map(({ effect }) => effect.stableId)).toEqual([
      "attack-up",
    ]);
    expect(result.attempts[0].resolvedRatePermille).toBe(4000);
    expect(rng.snapshot().drawCount).toBe(0);
  });
});

describe("common state-changing actions", () => {
  it("clamps healing and distinguishes nonlethal from lethal HP reduction", () => {
    const counters = createEffectRuntimeCounters();
    const rng = new BattleRng("hp-actions").stream("effects");
    const healed = executeCommonAction(
      null,
      unit("ally-a", "ally", { hp: 9000 }),
      { kind: "heal_hp", amount: 5000 },
      counters,
      rng,
    );
    expect(healed.target).toMatchObject({ hp: 10_000, alive: true });
    expect(healed.hpChange).toBe(1000);

    const retained = executeCommonAction(
      null,
      healed.target,
      { kind: "reduce_hp", amount: 20_000, canDefeat: false },
      counters,
      rng,
    );
    expect(retained.target).toMatchObject({ hp: 1, alive: true });

    const defeated = executeCommonAction(
      null,
      retained.target,
      { kind: "reduce_hp", amount: 1, canDefeat: true },
      counters,
      rng,
    );
    expect(defeated.target).toMatchObject({ hp: 0, alive: false });
  });

  it("uses the shared NP cap and 99% correction for direct NP changes", () => {
    const result = executeCommonAction(
      null,
      unit("ally-a", "ally", { np: 9850 }),
      { kind: "change_np", amount: 50, npLevel: 1 },
      createEffectRuntimeCounters(),
      new BattleRng("np-action").stream("effects"),
    );
    expect(result.target?.np).toBe(10_000);
    expect(result.npChange).toBe(150);
  });

  it("executes status application and removal in declared action order", () => {
    const result = executeCommonActions(
      unit("ally-a", "ally"),
      unit("ally-b", "ally"),
      [
        {
          kind: "apply_effects",
          effects: [{ template: attackUp }],
        },
        {
          kind: "remove_effects",
          request: { mode: "all", category: "buff" },
        },
      ],
      createEffectRuntimeCounters(),
      new BattleRng("action-sequence").stream("effects"),
    );

    expect(result.results.map(({ outcome }) => outcome)).toEqual([
      "changed",
      "changed",
    ]);
    expect(result.results[0].applicationResults?.[0].outcome).toBe("applied");
    expect(result.results[1].removalAttempts?.[0].outcome).toBe("removed");
    expect(result.target?.effects).toEqual([]);
  });

  it("returns no-target without changing counters or consuming randomness", () => {
    const counters = createEffectRuntimeCounters();
    const rng = new BattleRng("action-no-target").stream("effects");
    const result = executeCommonAction(
      null,
      null,
      { kind: "heal_hp", amount: 1000 },
      counters,
      rng,
    );
    expect(result).toMatchObject({ outcome: "no_target", target: null, counters });
    expect(rng.snapshot().drawCount).toBe(0);
  });
});
