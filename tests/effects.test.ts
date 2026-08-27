import { describe, expect, it } from "vitest";
import {
  findUnitLocation,
  orderedLocations,
  replaceUnit,
} from "../src/core/battle/formation";
import { createBattleState } from "../src/core/battle/state";
import { BattleRng } from "../src/core/rng";
import { resolveEffectApplication } from "../src/effects/application";
import {
  categoryForGrantedTrait,
  createTraitGrantEffect,
} from "../src/effects/classification";
import { removeEffects } from "../src/effects/removal";
import {
  advanceEffectDurationsAtTurnEnd,
  advanceOwnerTurnEnd,
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import {
  attemptTriggerActivation,
  collectTriggerActivations,
} from "../src/effects/triggers";
import { resolveTriggerEvent } from "../src/effects/triggerExecution";
import type {
  EffectTemplate,
  SlipDamageAmplifierKind,
  SlipDamageKind,
} from "../src/effects/types";
import { formation, unit } from "./helpers/battle";

const attackUp: EffectTemplate = {
  stableId: "attack-up",
  name: "攻撃力アップ",
  effectType: "attack_mod",
  category: "buff",
  value: 300,
  remainingTurns: 3,
};

describe("effect registration and classification", () => {
  it("assigns deterministic instance IDs and registration order", () => {
    let counters = createEffectRuntimeCounters();
    let target = unit("ally-a", "ally");
    const first = applyEffect(target, attackUp, "ally-b", counters);
    target = first.unit;
    counters = first.counters;
    const second = applyEffect(target, attackUp, "ally-c", counters);

    expect(second.unit.effects.map(({ instanceId }) => instanceId)).toEqual([
      "effect-1",
      "effect-2",
    ]);
    expect(second.unit.effects.map(({ registrationOrder }) => registrationOrder)).toEqual([
      1, 2,
    ]);
  });

  it("fails non-stackable state applications while preserving the debuff-taunt exception and explicit stackable states", () => {
    let counters = createEffectRuntimeCounters();
    let target = unit("ally-a", "ally");
    const register = (template: EffectTemplate, seed: string) => {
      const result = resolveEffectApplication(
        null,
        target,
        [{ template }],
        counters,
        new BattleRng(seed).stream("effects"),
      );
      if (!result.unit) throw new Error("状態付与先がありません");
      target = result.unit;
      counters = result.counters;
      return result.results[0];
    };

    expect(register({
      stableId: "first-invincibility",
      name: "無敵",
      effectType: "invincibility",
      category: "buff",
      remainingTurns: 1,
    }, "first-invincibility")?.outcome).toBe("applied");
    expect(register({
      stableId: "refreshed-invincibility",
      name: "無敵",
      effectType: "invincibility",
      category: "buff",
      remainingUses: 2,
    }, "rejected-invincibility")?.outcome).toBe("already_active");
    expect(target.effects).toEqual([
      expect.objectContaining({
        instanceId: "effect-1",
        stableId: "first-invincibility",
        remainingTurns: 1,
      }),
    ]);

    expect(register({
      stableId: "buff-taunt",
      name: "ターゲット集中",
      effectType: "target_focus",
      category: "buff",
      value: 3_000,
    }, "buff-taunt")?.outcome).toBe("applied");
    expect(register({
      stableId: "debuff-taunt",
      name: "ターゲット集中",
      effectType: "target_focus",
      category: "debuff",
      value: -3_000,
    }, "debuff-taunt")?.outcome).toBe("applied");
    expect(register({
      stableId: "refreshed-buff-taunt",
      name: "ターゲット集中",
      effectType: "target_focus",
      category: "buff",
      value: 1_000,
    }, "rejected-buff-taunt")?.outcome).toBe("already_active");
    expect(target.effects.filter(({ effectType }) => effectType === "target_focus"))
      .toEqual([
        expect.objectContaining({ stableId: "buff-taunt", category: "buff" }),
        expect.objectContaining({ stableId: "debuff-taunt", category: "debuff" }),
      ]);

    expect(register({
      stableId: "stackable-guts-one",
      name: "重複可能ガッツ",
      effectType: "guts",
      category: "buff",
      flags: { stackable: true },
      remainingUses: 1,
    }, "stackable-guts-one")?.outcome).toBe("applied");
    expect(register({
      stableId: "stackable-guts-two",
      name: "重複可能ガッツ",
      effectType: "guts",
      category: "buff",
      flags: { stackable: true },
      remainingUses: 1,
    }, "stackable-guts-two")?.outcome).toBe("applied");
    expect(target.effects.filter(({ effectType }) => effectType === "guts"))
      .toHaveLength(2);
  });

  it("validates typed slip declarations and debuff-only amplifiers", () => {
    const target = unit("ally-a", "ally");
    const counters = createEffectRuntimeCounters();
    expect(() => applyEffect(
      target,
      {
        ...attackUp,
        stableId: "invalid-slip-kind-placement",
        trigger: {
          timing: "turn_end",
          actions: [{
            target: { relation: "self", selection: "single" },
            action: { kind: "heal_hp", amount: 500 },
            turnEndSettlement: "recurring_hp_recovery",
            slipDamageKind: "burn",
          }],
        },
      },
      null,
      counters,
    )).toThrow(/requires slip_damage settlement/);
    expect(() => applyEffect(
      target,
      {
        ...attackUp,
        stableId: "invalid-amplifier-category",
        value: 550,
        slipDamageAmplifierKind: "spread_of_fire",
      },
      null,
      counters,
    )).toThrow(/must be debuff effects/);
  });

  it("accepts only connected turn-end star declarations without advancing counters on rejection", () => {
    const target = unit("ally-a", "ally");
    const counters = createEffectRuntimeCounters();
    const valid: EffectTemplate = {
      stableId: "turn-end-stars",
      name: "終了時スター獲得",
      effectType: "turn-end-stars",
      category: "buff",
      trigger: {
        timing: "turn_end",
        actions: [{
          target: { relation: "self", selection: "single" },
          action: {
            kind: "gain_stars",
            amount: 10,
            destination: "next_command",
          },
        }],
      },
    };

    const applied = applyEffect(target, valid, target.instanceId, counters);
    expect(applied.effect.instanceId).toBe("effect-1");
    expect(applied.counters).toEqual({
      nextInstanceNumber: 2,
      nextRegistrationOrder: 2,
    });

    const rejected: Array<[string, EffectTemplate]> = [
      ["command destination", {
        ...valid,
        stableId: "turn-end-stars-command",
        trigger: {
          timing: "turn_end",
          actions: [{
            target: { relation: "self", selection: "single" },
            action: {
              kind: "gain_stars",
              amount: 10,
              destination: "command",
            },
          }],
        },
      }],
      ["invalid target", {
        ...valid,
        stableId: "turn-end-stars-all",
        trigger: {
          timing: "turn_end",
          actions: [{
            target: { relation: "allies", selection: "all" },
            action: {
              kind: "gain_stars",
              amount: 10,
              destination: "next_command",
            },
          }],
        },
      }],
      ["negative amount", {
        ...valid,
        stableId: "turn-end-stars-negative",
        trigger: {
          timing: "turn_end",
          actions: [{
            target: { relation: "self", selection: "single" },
            action: {
              kind: "gain_stars",
              amount: -1,
              destination: "next_command",
            },
          }],
        },
      }],
      ["fractional amount", {
        ...valid,
        stableId: "turn-end-stars-fractional",
        trigger: {
          timing: "turn_end",
          actions: [{
            target: { relation: "self", selection: "single" },
            action: {
              kind: "gain_stars",
              amount: 1.5,
              destination: "next_command",
            },
          }],
        },
      }],
      ["settlement combination", {
        ...valid,
        stableId: "turn-end-stars-settlement",
        trigger: {
          timing: "turn_end",
          actions: [{
            target: { relation: "self", selection: "single" },
            action: {
              kind: "gain_stars",
              amount: 10,
              destination: "next_command",
            },
            turnEndSettlement: "recurring_hp_recovery",
          }],
        },
      }],
      ["missing destination", {
        ...valid,
        stableId: "turn-end-stars-missing-destination",
        trigger: {
          timing: "turn_end",
          actions: [{
            target: { relation: "self", selection: "single" },
            action: {
              kind: "gain_stars",
              amount: 10,
            } as never,
          }],
        },
      }],
      ["missing target", {
        ...valid,
        stableId: "turn-end-stars-missing-target",
        trigger: {
          timing: "turn_end",
          actions: [{
            action: {
              kind: "gain_stars",
              amount: 10,
              destination: "next_command",
            },
          } as never],
        },
      }],
      ["missing action", {
        ...valid,
        stableId: "turn-end-stars-missing-action",
        trigger: {
          timing: "turn_end",
          actions: [{
            target: { relation: "self", selection: "single" },
          } as never],
        },
      }],
    ];

    for (const [label, template] of rejected) {
      expect(
        () => applyEffect(target, template, target.instanceId, counters),
        label,
      ).toThrow(RangeError);
      expect(counters, label).toEqual({
        nextInstanceNumber: 1,
        nextRegistrationOrder: 1,
      });
    }
  });

  it("classifies only the Roma trait grant as a debuff", () => {
    expect(categoryForGrantedTrait("roma")).toBe("debuff");
    expect(categoryForGrantedTrait("dragon")).toBe("other");
    expect(createTraitGrantEffect("roma", "ローマ").removalPolicy).toBe("removable");
    expect(createTraitGrantEffect("dragon", "竜").removalPolicy).toBe("id_only");
  });
});

describe("effect duration and removal", () => {
  it("ticks after the owner's turn but freezes while in reserve", () => {
    const applied = applyEffect(
      unit("ally-a", "ally"),
      { ...attackUp, remainingTurns: 1 },
      null,
      createEffectRuntimeCounters(),
    ).unit;
    expect(advanceOwnerTurnEnd(applied, "enemy", false).unit.effects[0].remainingTurns).toBe(1);
    expect(advanceOwnerTurnEnd(applied, "ally", true).unit.effects[0].remainingTurns).toBe(1);
    const ended = advanceOwnerTurnEnd(applied, "ally", false);
    expect(ended.unit.effects).toEqual([]);
    expect(ended.removed[0].reason).toBe("expired_turns");
  });

  it("ticks opponent-boundary effects only after the opposing side's turn", () => {
    const applied = applyEffect(
      unit("ally-a", "ally"),
      {
        ...attackUp,
        stableId: "opponent-boundary",
        remainingTurns: 1,
        durationTick: "opponent_turn_end",
      },
      null,
      createEffectRuntimeCounters(),
    ).unit;

    const allyEnd = advanceEffectDurationsAtTurnEnd(
      applied,
      "ally",
      false,
    );
    expect(allyEnd.unit.effects).toHaveLength(1);
    expect(allyEnd.unit.effects[0].remainingTurns).toBe(1);

    const enemyEnd = advanceEffectDurationsAtTurnEnd(
      allyEnd.unit,
      "enemy",
      false,
    );
    expect(enemyEnd.unit.effects).toEqual([]);
    expect(enemyEnd.removed[0]).toMatchObject({
      effect: {
        stableId: "opponent-boundary",
        durationTick: "opponent_turn_end",
      },
      reason: "expired_turns",
    });

    const enemyApplied = applyEffect(
      unit("enemy-a", "enemy"),
      {
        ...attackUp,
        stableId: "enemy-opponent-boundary",
        remainingTurns: 1,
        durationTick: "opponent_turn_end",
      },
      null,
      createEffectRuntimeCounters(),
    ).unit;
    expect(advanceEffectDurationsAtTurnEnd(
      enemyApplied,
      "enemy",
      false,
    ).unit.effects).toHaveLength(1);
    expect(advanceEffectDurationsAtTurnEnd(
      enemyApplied,
      "ally",
      false,
    ).unit.effects).toEqual([]);
  });

  it("does not tick effects registered during the current end phase", () => {
    let counters = createEffectRuntimeCounters();
    let target = unit("ally-a", "ally");
    const old = applyEffect(target, attackUp, null, counters);
    target = old.unit;
    counters = old.counters;
    const cutoff = old.effect.registrationOrder;
    target = applyEffect(target, attackUp, null, counters).unit;

    expect(
      advanceOwnerTurnEnd(target, "ally", false, cutoff).unit.effects.map(
        ({ remainingTurns }) => remainingTurns,
      ),
    ).toEqual([2, 3]);
  });

  it("removes the newest matching effect for a one-effect dispel", () => {
    let counters = createEffectRuntimeCounters();
    let target = unit("ally-a", "ally");
    for (const value of [100, 200, 300]) {
      const applied = applyEffect(target, { ...attackUp, value }, null, counters);
      target = applied.unit;
      counters = applied.counters;
    }
    const result = removeEffects(target, { mode: "one", category: "buff" });
    expect(result.removed[0].effect.value).toBe(300);
    expect(result.unit.effects.map(({ value }) => value)).toEqual([100, 200]);
  });

  it("protects id-only and unremovable states from general dispels", () => {
    let counters = createEffectRuntimeCounters();
    let target = unit("ally-a", "ally");
    for (const removalPolicy of ["id_only", "unremovable"] as const) {
      const applied = applyEffect(
        target,
        { ...attackUp, stableId: removalPolicy, removalPolicy },
        null,
        counters,
      );
      target = applied.unit;
      counters = applied.counters;
    }
    expect(removeEffects(target, { mode: "all", category: "buff" }).removed).toEqual([]);
    const byId = removeEffects(target, { mode: "by_id", stableId: "id_only" });
    expect(byId.removed).toHaveLength(1);
    expect(byId.unit.effects[0].stableId).toBe("unremovable");
  });

  it("separates burn, poison, and curse removal from their amplifiers while general debuff removal reaches both", () => {
    const pairs: Array<[SlipDamageKind, SlipDamageAmplifierKind]> = [
      ["burn", "spread_of_fire"],
      ["poison", "toxic"],
      ["curse", "evil_curse"],
    ];
    for (const [slipKind, amplifierKind] of pairs) {
      let counters = createEffectRuntimeCounters();
      let target = unit("ally-a", "ally");
      const slipTemplate: EffectTemplate = {
        stableId: slipKind,
        name: slipKind,
        effectType: slipKind,
        category: "debuff",
        classifications: [slipKind],
        trigger: {
          timing: "turn_end",
          actions: [{
            target: { relation: "self", selection: "single" },
            action: { kind: "reduce_hp", amount: 500, canDefeat: false },
            turnEndSettlement: "slip_damage",
            slipDamageKind: slipKind,
          }],
        },
      };
      const amplifierTemplate: EffectTemplate = {
        stableId: amplifierKind,
        name: amplifierKind,
        effectType: amplifierKind,
        category: "debuff",
        classifications: [amplifierKind],
        value: 550,
        slipDamageAmplifierKind: amplifierKind,
      };
      for (const template of [slipTemplate, amplifierTemplate]) {
        const applied = applyEffect(target, template, null, counters);
        target = applied.unit;
        counters = applied.counters;
      }

      const slipOnly = removeEffects(target, {
        mode: "all",
        category: "debuff",
        classifications: [slipKind],
      });
      expect(slipOnly.removed.map(({ effect }) => effect.stableId)).toEqual([
        slipKind,
      ]);
      expect(slipOnly.unit.effects.map(({ stableId }) => stableId)).toEqual([
        amplifierKind,
      ]);
      expect(removeEffects(target, {
        mode: "all",
        category: "debuff",
      }).removed.map(({ effect }) => effect.stableId)).toEqual([
        amplifierKind,
        slipKind,
      ]);
    }
  });
});

describe("common triggers", () => {
  it("orders effects by unit order, priority, then registration order", () => {
    const state = formation();
    let counters = createEffectRuntimeCounters();
    const firstOwner = state.ally.frontline[0]!;
    let first = applyEffect(
      firstOwner,
      {
        ...attackUp,
        stableId: "late-priority",
        trigger: { timing: "on_attack", priority: 10 },
      },
      null,
      counters,
    );
    counters = first.counters;
    first = applyEffect(
      first.unit,
      {
        ...attackUp,
        stableId: "early-priority",
        trigger: { timing: "on_attack", priority: -10 },
      },
      null,
      counters,
    );
    state.ally.frontline[0] = first.unit;
    const activations = collectTriggerActivations(
      orderedLocations(state, "ally", true),
      {
        timing: "on_attack",
        actorInstanceId: "ally-a",
        actorSide: "ally",
      },
    );
    expect(activations.map(({ effect }) => effect.stableId)).toEqual([
      "early-priority",
      "late-priority",
    ]);
  });

  it("requires both normal-command kind and Buster card type when declared", () => {
    const state = formation();
    state.ally.frontline[0] = applyEffect(
      state.ally.frontline[0]!,
      {
        ...attackUp,
        stableId: "normal-buster-only",
        trigger: {
          timing: "after_attack",
          condition: {
            actor: "owner",
            attackKinds: ["normal_command"],
            cardTypes: ["buster"],
          },
        },
      },
      null,
      createEffectRuntimeCounters(),
    ).unit;
    const owner = orderedLocations(state, "ally", true).slice(0, 1);
    const candidates = (attackKind: "normal_command" | "noble_phantasm", cardType: "arts" | "buster") =>
      collectTriggerActivations(owner, {
        timing: "after_attack",
        actorInstanceId: "ally-a",
        actorSide: "ally",
        targetInstanceId: "enemy-a",
        targetSide: "enemy",
        attackKind,
        cardType,
      });

    expect(candidates("noble_phantasm", "buster")).toEqual([]);
    expect(candidates("normal_command", "arts")).toEqual([]);
    expect(
      candidates("normal_command", "buster")
        .map(({ effect }) => effect.stableId),
    ).toEqual(["normal-buster-only"]);
  });

  it("does not activate reserve effects unless explicitly allowed", () => {
    const state = formation();
    const reserve = state.ally.reserve[0];
    state.ally.reserve[0] = applyEffect(
      reserve,
      { ...attackUp, trigger: { timing: "turn_end" } },
      null,
      createEffectRuntimeCounters(),
    ).unit;
    expect(
      collectTriggerActivations(orderedLocations(state, "ally", true), {
        timing: "turn_end",
      }),
    ).toEqual([]);
  });

  it("consumes fear/confusion-style uses after parent activation succeeds", () => {
    const effect = applyEffect(
      unit("ally-a", "ally"),
      {
        ...attackUp,
        remainingUses: 2,
        trigger: {
          timing: "turn_end",
          activationRatePermille: 1000,
          consumeUseOnActivation: true,
        },
      },
      null,
      createEffectRuntimeCounters(),
    ).effect;
    const rng = new BattleRng("counted-trigger").stream("effects");
    const result = attemptTriggerActivation(effect, rng);
    expect(result).toMatchObject({
      activated: true,
      consumedUse: true,
      effect: { remainingUses: 1 },
    });
    expect(rng.snapshot().drawCount).toBe(0);
  });

  it("does not consume a use when the parent probability fails", () => {
    const effect = applyEffect(
      unit("ally-a", "ally"),
      {
        ...attackUp,
        remainingUses: 2,
        trigger: {
          timing: "turn_end",
          activationRatePermille: 0,
          consumeUseOnActivation: true,
        },
      },
      null,
      createEffectRuntimeCounters(),
    ).effect;
    const result = attemptTriggerActivation(
      effect,
      new BattleRng("failed-trigger").stream("effects"),
    );
    expect(result).toMatchObject({
      activated: false,
      consumedUse: false,
      effect: { remainingUses: 2 },
    });
  });

  it("allows only a defeated owner to execute its on-death trigger", () => {
    let counters = createEffectRuntimeCounters();
    const state = formation();
    const registered = applyEffect(
      state.ally.frontline[0]!,
      {
        stableId: "death-np",
        name: "退場時NP",
        effectType: "death-np",
        category: "buff",
        trigger: {
          timing: "on_death",
          actions: [
            {
              target: {
                relation: "allies",
                selection: "single",
                selectedInstanceId: "ally-b",
              },
              action: {
                kind: "change_np",
                amount: 100,
                npLevel: 1,
              },
            },
          ],
        },
      },
      null,
      counters,
    );
    counters = registered.counters;
    state.ally.frontline[0] = registered.unit;
    const initialBattleState = createBattleState({
      ally: state.ally,
      waves: [{ enemy: state.enemy }],
      enemyFrontlineLimit: 3,
    });
    const battleState = {
      ...initialBattleState,
      formation: replaceUnit(initialBattleState.formation, {
        ...registered.unit,
        hp: 0,
        alive: false,
      }),
    };
    const owner = findUnitLocation(battleState.formation, "ally-a");
    if (!owner) throw new Error("missing ally-a");
    const result = resolveTriggerEvent(
      battleState,
      [owner],
      {
        timing: "on_death",
        actorInstanceId: "ally-a",
        actorSide: "ally",
        targetInstanceId: "ally-a",
        targetSide: "ally",
      },
      counters,
      new BattleRng("death-trigger").stream("effects"),
    );

    expect(result.activations[0]?.outcome).toBe("activated");
    expect(
      findUnitLocation(result.state.formation, "ally-b")?.unit.np,
    ).toBe(100);

    const aliveAgain = replaceUnit(result.formation, {
      ...owner.unit,
      hp: 1,
      alive: true,
    });
    expect(
      collectTriggerActivations(
        orderedLocations(aliveAgain, "ally", true),
        { timing: "on_death" },
      ),
    ).toEqual([]);
  });
});
