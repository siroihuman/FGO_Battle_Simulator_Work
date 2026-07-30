import { describe, expect, it } from "vitest";
import { BattleRng } from "../src/core/rng";
import { executeCommonAction } from "../src/effects/actions";
import {
  calculateInstantDeathRate,
  resolveInstantDeath,
} from "../src/effects/instantDeath";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import {
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import { resolveLethalHp } from "../src/effects/survival";
import type { EffectTemplate } from "../src/effects/types";
import { unit } from "./helpers/battle";

// References checked 2026-07-30:
// https://w.atwiki.jp/f_go/pages/955.html
// https://w.atwiki.jp/f_go/pages/2030.html
// https://w.atwiki.jp/f_go/pages/304.html

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

describe("lethal HP and guts", () => {
  it("uses stackable guts before normal guts and fixed recovery ignores modifiers", () => {
    const target = addEffects(
      unit("ally-a", "ally", { hp: 0, alive: false }),
      [
        effect("normal-guts", COMMON_EFFECT_TYPES.guts, {
          value: 1000,
          remainingUses: 1,
        }),
        effect("stackable-guts", COMMON_EFFECT_TYPES.guts, {
          value: 500,
          remainingUses: 1,
          flags: { stackable: true, recoveryMode: "fixed" },
        }),
      ],
    );
    const result = resolveLethalHp(target, {
      percentageRecoveryModifierPermille: 0,
    });

    expect(result).toMatchObject({
      outcome: "guts",
      recoveryHp: 500,
      consumedGutsUse: true,
      deathTriggerAllowed: false,
      gutsEffect: { stableId: "stackable-guts" },
      unit: { hp: 500, alive: true },
    });
    expect(result.unit.effects.map(({ stableId }) => stableId)).toEqual([
      "normal-guts",
    ]);
  });

  it("applies recovery modifiers only to percentage-of-max-HP guts", () => {
    const target = addEffects(
      unit("ally-a", "ally", {
        maxHp: 10_000,
        hp: 0,
        alive: false,
      }),
      [
        effect("percentage-guts", COMMON_EFFECT_TYPES.guts, {
          value: 300,
          remainingUses: 1,
          flags: { recoveryMode: "max_hp_permille" },
        }),
      ],
    );
    const result = resolveLethalHp(target, {
      percentageRecoveryModifierPermille: 1500,
    });
    expect(result.recoveryHp).toBe(4500);
  });

  it("does not let healing block prevent guts", () => {
    const target = addEffects(
      unit("ally-a", "ally", { hp: 0, alive: false }),
      [
        effect("heal-block", "heal_block"),
        effect("guts", COMMON_EFFECT_TYPES.guts, {
          value: 100,
          remainingUses: 1,
        }),
      ],
    );
    expect(resolveLethalHp(target)).toMatchObject({
      outcome: "guts",
      unit: { hp: 100, alive: true },
    });
  });

  it("keeps guts untouched on an intermediate break gauge", () => {
    const target = addEffects(
      unit("enemy-a", "enemy", { hp: 0, alive: false }),
      [
        effect("guts", COMMON_EFFECT_TYPES.guts, {
          value: 1000,
          remainingUses: 1,
        }),
      ],
    );
    const result = resolveLethalHp(target, { intermediateBreak: true });
    expect(result).toMatchObject({
      outcome: "break_pending",
      consumedGutsUse: false,
      deathTriggerAllowed: false,
      unit: { hp: 0, alive: true },
    });
    expect(result.unit.effects[0].remainingUses).toBe(1);
  });

  it("defeats without consuming guts when guts-ignore is explicit", () => {
    const target = addEffects(
      unit("ally-a", "ally", { hp: 0, alive: false }),
      [
        effect("guts", COMMON_EFFECT_TYPES.guts, {
          value: 1000,
          remainingUses: 1,
        }),
      ],
    );
    const result = resolveLethalHp(target, { ignoreGuts: true });
    expect(result).toMatchObject({
      outcome: "defeated",
      consumedGutsUse: false,
      deathTriggerAllowed: true,
      unit: { hp: 0, alive: false },
    });
    expect(result.unit.effects[0].remainingUses).toBe(1);
  });

  it("routes lethal HP reduction through the same guts resolver", () => {
    const target = addEffects(
      unit("ally-a", "ally", { maxHp: 1000, hp: 100 }),
      [
        effect("guts", COMMON_EFFECT_TYPES.guts, {
          value: 500,
          remainingUses: 1,
        }),
      ],
    );
    const result = executeCommonAction(
      null,
      target,
      { kind: "reduce_hp", amount: 100, canDefeat: true },
      createEffectRuntimeCounters(),
      new BattleRng("hp-reduction-guts").stream("effects"),
    );
    expect(result).toMatchObject({
      outcome: "changed",
      hpChange: -100,
      target: { hp: 500, alive: true },
      survivalResult: { outcome: "guts" },
    });
  });
});

describe("instant death", () => {
  it("uses effect rate × DR × success/resistance factor", () => {
    const source = addEffects(unit("ally-a", "ally"), [
      effect("death-success", COMMON_EFFECT_TYPES.instantDeathSuccess, {
        value: 1000,
      }),
    ]);
    const target = unit("enemy-a", "enemy", { deathRatePermille: 800 });
    expect(calculateInstantDeathRate(source, target, 1000)).toEqual({
      effectRatePermille: 1000,
      targetDeathRatePermille: 800,
      sourceSuccessPermille: 1000,
      targetResistancePermille: 0,
      modifierFactorPermille: 2000,
      resolvedRatePermille: 1600,
    });
  });

  it("does not consume death immunity when the death roll fails", () => {
    const target = addEffects(
      unit("enemy-a", "enemy", { deathRatePermille: 0 }),
      [
        effect("death-immunity", COMMON_EFFECT_TYPES.instantDeathImmunity, {
          remainingUses: 1,
        }),
      ],
    );
    const rng = new BattleRng("failed-death").stream("effects");
    const result = resolveInstantDeath(
      null,
      target,
      { effectRatePermille: 1000 },
      rng,
    );
    expect(result.outcome).toBe("failed");
    expect(result.target?.effects[0].remainingUses).toBe(1);
    expect(rng.snapshot().drawCount).toBe(0);
  });

  it("consumes only the oldest death immunity after a successful roll", () => {
    const target = addEffects(
      unit("enemy-a", "enemy", { deathRatePermille: 0 }),
      [
        effect("old-immunity", COMMON_EFFECT_TYPES.instantDeathImmunity, {
          remainingUses: 1,
        }),
        effect("new-immunity", COMMON_EFFECT_TYPES.instantDeathImmunity, {
          remainingUses: 1,
        }),
      ],
    );
    const result = resolveInstantDeath(
      null,
      target,
      { effectRatePermille: 0, forceSuccess: true },
      new BattleRng("forced-death").stream("effects"),
    );
    expect(result).toMatchObject({
      outcome: "immune",
      deathRollSucceeded: true,
      consumedImmunityUse: true,
      immunityEffect: { stableId: "old-immunity" },
    });
    expect(result.target?.effects.map(({ stableId }) => stableId)).toEqual([
      "new-immunity",
    ]);
  });

  it("activates guts after instant death and skips later hits before damage", () => {
    const target = addEffects(
      unit("enemy-a", "enemy", { deathRatePermille: 1000 }),
      [
        effect("guts", COMMON_EFFECT_TYPES.guts, {
          value: 700,
          remainingUses: 1,
        }),
      ],
    );
    const result = resolveInstantDeath(
      null,
      target,
      { effectRatePermille: 1000, timing: "before_damage" },
      new BattleRng("death-with-guts").stream("effects"),
    );
    expect(result).toMatchObject({
      outcome: "guts",
      deathRollSucceeded: true,
      skipAttackHits: true,
      target: { hp: 700, alive: true },
      survival: {
        outcome: "guts",
        deathTriggerAllowed: false,
      },
    });
  });

  it("turns instant death on an intermediate gauge into break pending without guts", () => {
    const target = addEffects(
      unit("enemy-a", "enemy", { deathRatePermille: 1000 }),
      [
        effect("guts", COMMON_EFFECT_TYPES.guts, {
          value: 700,
          remainingUses: 1,
        }),
      ],
    );
    const result = resolveInstantDeath(
      null,
      target,
      {
        effectRatePermille: 1000,
        timing: "before_damage",
        intermediateBreak: true,
      },
      new BattleRng("death-break").stream("effects"),
    );
    expect(result).toMatchObject({
      outcome: "break_pending",
      skipAttackHits: true,
      target: { hp: 0, alive: true },
      survival: {
        outcome: "break_pending",
        consumedGutsUse: false,
      },
    });
    expect(result.target?.effects[0].remainingUses).toBe(1);
  });

  it("lets a guts-ignore death demerit bypass DR, resistance and immunity", () => {
    const target = addEffects(
      unit("ally-a", "ally", { deathRatePermille: 0 }),
      [
        effect("death-resistance", COMMON_EFFECT_TYPES.instantDeathResistance, {
          value: 10_000,
        }),
        effect("death-immunity", COMMON_EFFECT_TYPES.instantDeathImmunity, {
          remainingUses: 1,
        }),
        effect("guts", COMMON_EFFECT_TYPES.guts, {
          value: 1000,
          remainingUses: 1,
        }),
      ],
    );
    const result = resolveInstantDeath(
      target,
      target,
      {
        effectRatePermille: 0,
        forceSuccess: true,
        ignoreImmunity: true,
        ignoreGuts: true,
      },
      new BattleRng("death-demerit").stream("effects"),
    );
    expect(result).toMatchObject({
      outcome: "defeated",
      deathRollSucceeded: true,
      consumedImmunityUse: false,
      target: { hp: 0, alive: false },
      survival: { deathTriggerAllowed: true },
    });
    expect(result.target?.effects).toHaveLength(3);
  });

  it("replays probabilistic instant death with the same fixed seed", () => {
    const target = unit("enemy-a", "enemy", { deathRatePermille: 500 });
    const firstRng = new BattleRng("instant-death-replay").stream("effects");
    const secondRng = new BattleRng("instant-death-replay").stream("effects");
    const first = resolveInstantDeath(
      null,
      target,
      { effectRatePermille: 1000 },
      firstRng,
    );
    const second = resolveInstantDeath(
      null,
      target,
      { effectRatePermille: 1000 },
      secondRng,
    );
    expect(second.outcome).toBe(first.outcome);
    expect(secondRng.snapshot()).toEqual(firstRng.snapshot());
    expect(firstRng.snapshot().drawCount).toBe(1);
  });

  it("exposes instant death through common actions", () => {
    const target = unit("enemy-a", "enemy", { deathRatePermille: 1000 });
    const result = executeCommonAction(
      null,
      target,
      {
        kind: "instant_death",
        options: { effectRatePermille: 1000 },
      },
      createEffectRuntimeCounters(),
      new BattleRng("death-action").stream("effects"),
    );
    expect(result).toMatchObject({
      outcome: "changed",
      target: { hp: 0, alive: false },
      instantDeathResult: { outcome: "defeated" },
      survivalResult: { deathTriggerAllowed: true },
    });
  });
});
