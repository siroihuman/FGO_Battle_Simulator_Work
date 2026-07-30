import { describe, expect, it } from "vitest";
import {
  findUnitLocation,
  replaceUnit,
} from "../src/core/battle/formation";
import { BattleRng } from "../src/core/rng";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import {
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import { resolveSideTurnEnd } from "../src/effects/turnEnd";
import type {
  EffectRuntimeCounters,
  EffectTemplate,
  TurnEndSettlementKind,
} from "../src/effects/types";
import { formation } from "./helpers/battle";

// Reference checked 2026-07-30:
// https://w.atwiki.jp/f_go/pages/955.html

const self = {
  relation: "self",
  selection: "single",
} as const;

function withHp(
  state: ReturnType<typeof formation>,
  instanceId: string,
  hp: number,
) {
  const location = findUnitLocation(state, instanceId);
  if (!location) throw new Error(`missing test unit: ${instanceId}`);
  return replaceUnit(state, { ...location.unit, hp });
}

function register(
  state: ReturnType<typeof formation>,
  instanceId: string,
  template: EffectTemplate,
  counters: EffectRuntimeCounters,
  sourceInstanceId: string | null = instanceId,
) {
  const location = findUnitLocation(state, instanceId);
  if (!location) throw new Error(`missing test unit: ${instanceId}`);
  const applied = applyEffect(
    location.unit,
    template,
    sourceInstanceId,
    counters,
  );
  return {
    formation: replaceUnit(state, applied.unit),
    counters: applied.counters,
  };
}

function recurring(
  stableId: string,
  action: NonNullable<
    NonNullable<EffectTemplate["trigger"]>["actions"]
  >[number]["action"],
  options: Partial<EffectTemplate> = {},
): EffectTemplate {
  return {
    stableId,
    name: stableId,
    effectType: stableId,
    category: "buff",
    remainingTurns: 2,
    ...options,
    trigger: {
      timing: "turn_end",
      actions: [{ target: self, action }],
      ...options.trigger,
    },
  };
}

function settledRecurring(
  stableId: string,
  settlement: TurnEndSettlementKind,
  action: NonNullable<
    NonNullable<EffectTemplate["trigger"]>["actions"]
  >[number]["action"],
  options: Partial<EffectTemplate> = {},
): EffectTemplate {
  return {
    ...recurring(stableId, action, options),
    trigger: {
      timing: "turn_end",
      ...options.trigger,
      actions: [
        {
          target: self,
          action,
          turnEndSettlement: settlement,
        },
      ],
    },
  };
}

describe("side turn-end integration", () => {
  it("resolves only the ending side and decreases only that side's durations", () => {
    let state = formation();
    state = withHp(state, "ally-a", 5_000);
    state = withHp(state, "enemy-a", 5_000);
    let counters = createEffectRuntimeCounters();
    let applied = register(
      state,
      "ally-a",
      recurring("ally-heal", { kind: "heal_hp", amount: 1_000 }),
      counters,
    );
    state = applied.formation;
    counters = applied.counters;
    applied = register(
      state,
      "enemy-a",
      recurring("enemy-heal", { kind: "heal_hp", amount: 1_000 }),
      counters,
    );

    const allyEnd = resolveSideTurnEnd(
      applied.formation,
      "ally",
      applied.counters,
      new BattleRng("side-turn-end").stream("effects"),
    );
    expect(findUnitLocation(allyEnd.formation, "ally-a")?.unit).toMatchObject({
      hp: 6_000,
      effects: [{ stableId: "ally-heal", remainingTurns: 1 }],
    });
    expect(findUnitLocation(allyEnd.formation, "enemy-a")?.unit).toMatchObject({
      hp: 5_000,
      effects: [{ stableId: "enemy-heal", remainingTurns: 2 }],
    });

    const enemyEnd = resolveSideTurnEnd(
      allyEnd.formation,
      "enemy",
      allyEnd.counters,
      new BattleRng("side-turn-end-enemy").stream("effects"),
    );
    expect(findUnitLocation(enemyEnd.formation, "enemy-a")?.unit).toMatchObject({
      hp: 6_000,
      effects: [{ stableId: "enemy-heal", remainingTurns: 1 }],
    });
  });

  it("executes a one-turn effect before expiring it", () => {
    let state = withHp(formation(), "ally-a", 5_000);
    const applied = register(
      state,
      "ally-a",
      recurring(
        "one-turn-heal",
        { kind: "heal_hp", amount: 1_000 },
        { remainingTurns: 1 },
      ),
      createEffectRuntimeCounters(),
    );

    const result = resolveSideTurnEnd(
      applied.formation,
      "ally",
      applied.counters,
      new BattleRng("one-turn-effect").stream("effects"),
    );
    expect(findUnitLocation(result.formation, "ally-a")?.unit).toMatchObject({
      hp: 6_000,
      effects: [],
    });
    expect(result.durations[0].removed[0]).toMatchObject({
      effect: { stableId: "one-turn-heal" },
      reason: "expired_turns",
    });
  });

  it("freezes reserve activation and duration even with a generic reserve flag", () => {
    let state = withHp(formation(), "ally-d", 5_000);
    const applied = register(
      state,
      "ally-d",
      recurring(
        "reserve-heal",
        { kind: "heal_hp", amount: 1_000 },
        {
          remainingTurns: 1,
          flags: { activeWhileReserve: true },
        },
      ),
      createEffectRuntimeCounters(),
    );

    const result = resolveSideTurnEnd(
      applied.formation,
      "ally",
      applied.counters,
      new BattleRng("reserve-freeze").stream("effects"),
    );
    expect(result.activations).toEqual([]);
    expect(findUnitLocation(result.formation, "ally-d")?.unit).toMatchObject({
      hp: 5_000,
      effects: [{ stableId: "reserve-heal", remainingTurns: 1 }],
    });
  });

  it("delays effects registered during the phase until the next matching turn end", () => {
    let state = withHp(formation(), "ally-b", 5_000);
    let counters = createEffectRuntimeCounters();
    const delayedHeal = recurring(
      "delayed-heal",
      { kind: "heal_hp", amount: 1_000 },
      { remainingTurns: 1 },
    );
    const applier = recurring(
      "register-delayed-heal",
      {
        kind: "apply_effects",
        effects: [{ template: delayedHeal }],
      },
      {
        remainingTurns: 1,
        trigger: {
          timing: "turn_end",
          actions: [
            {
              target: {
                relation: "allies",
                selection: "single",
                selectedInstanceId: "ally-b",
              },
              action: {
                kind: "apply_effects",
                effects: [{ template: delayedHeal }],
              },
            },
          ],
        },
      },
    );
    const applied = register(state, "ally-a", applier, counters);
    state = applied.formation;
    counters = applied.counters;

    const first = resolveSideTurnEnd(
      state,
      "ally",
      counters,
      new BattleRng("new-turn-end-state").stream("effects"),
    );
    expect(findUnitLocation(first.formation, "ally-b")?.unit).toMatchObject({
      hp: 5_000,
      effects: [{ stableId: "delayed-heal", remainingTurns: 1 }],
    });
    expect(first.activations.map(({ effectStableId }) => effectStableId)).toEqual([
      "register-delayed-heal",
    ]);

    const second = resolveSideTurnEnd(
      first.formation,
      "ally",
      first.counters,
      new BattleRng("new-turn-end-state-next").stream("effects"),
    );
    expect(findUnitLocation(second.formation, "ally-b")?.unit).toMatchObject({
      hp: 6_000,
      effects: [],
    });
  });

  it("orders units by frontline slot, then effects by priority and registration", () => {
    let state = formation();
    let counters = createEffectRuntimeCounters();
    for (const [owner, stableId, priority] of [
      ["ally-a", "a-late", 10],
      ["ally-a", "a-early", -10],
      ["ally-b", "b-earliest-priority", -100],
    ] as const) {
      const applied = register(
        state,
        owner,
        recurring(
          stableId,
          { kind: "change_np", amount: 0, npLevel: 1 },
          {
            trigger: {
              timing: "turn_end",
              priority,
              actions: [
                {
                  target: self,
                  action: { kind: "change_np", amount: 0, npLevel: 1 },
                },
              ],
            },
          },
        ),
        counters,
      );
      state = applied.formation;
      counters = applied.counters;
    }

    const result = resolveSideTurnEnd(
      state,
      "ally",
      counters,
      new BattleRng("turn-end-order").stream("effects"),
    );
    expect(result.activations.map(({ effectStableId }) => effectStableId)).toEqual([
      "a-early",
      "a-late",
      "b-earliest-priority",
    ]);
  });

  it("consumes a parent use only on activation and runs its actions afterwards", () => {
    let state = formation();
    let counters = createEffectRuntimeCounters();
    let applied = register(
      state,
      "ally-a",
      recurring(
        "failed-parent",
        { kind: "change_np", amount: 5_000, npLevel: 1 },
        {
          remainingTurns: null,
          remainingUses: 1,
          trigger: {
            timing: "turn_end",
            activationRatePermille: 0,
            consumeUseOnActivation: true,
            actions: [
              {
                target: self,
                action: { kind: "change_np", amount: 5_000, npLevel: 1 },
              },
            ],
          },
        },
      ),
      counters,
    );
    state = applied.formation;
    counters = applied.counters;
    applied = register(
      state,
      "ally-a",
      recurring(
        "successful-parent",
        { kind: "change_np", amount: 1_000, npLevel: 1 },
        {
          remainingTurns: null,
          remainingUses: 1,
          trigger: {
            timing: "turn_end",
            activationRatePermille: 1_000,
            consumeUseOnActivation: true,
            actions: [
              {
                target: self,
                action: { kind: "change_np", amount: 1_000, npLevel: 1 },
              },
            ],
          },
        },
      ),
      counters,
    );
    const rng = new BattleRng("parent-use").stream("effects");

    const result = resolveSideTurnEnd(
      applied.formation,
      "ally",
      applied.counters,
      rng,
    );
    expect(findUnitLocation(result.formation, "ally-a")?.unit).toMatchObject({
      np: 1_000,
      effects: [{ stableId: "failed-parent", remainingUses: 1 }],
    });
    expect(
      result.activations.map(
        ({ effectStableId, outcome, consumedUse }) => ({
          effectStableId,
          outcome,
          consumedUse,
        }),
      ),
    ).toEqual([
      {
        effectStableId: "failed-parent",
        outcome: "probability_failed",
        consumedUse: false,
      },
      {
        effectStableId: "successful-parent",
        outcome: "activated",
        consumedUse: true,
      },
    ]);
    expect(rng.snapshot().drawCount).toBe(0);
  });

  it("skips a snapshotted effect removed by an earlier activation", () => {
    let state = formation();
    let counters = createEffectRuntimeCounters();
    let applied = register(
      state,
      "ally-a",
      recurring(
        "remove-turn-end-buffs",
        {
          kind: "remove_effects",
          request: { mode: "all", category: "buff" },
        },
        {
          remainingTurns: null,
          trigger: {
            timing: "turn_end",
            priority: -10,
            actions: [
              {
                target: self,
                action: {
                  kind: "remove_effects",
                  request: { mode: "all", category: "buff" },
                },
              },
            ],
          },
        },
      ),
      counters,
    );
    state = applied.formation;
    counters = applied.counters;
    applied = register(
      state,
      "ally-a",
      recurring(
        "removed-before-activation",
        { kind: "change_np", amount: 1_000, npLevel: 1 },
        { remainingTurns: null },
      ),
      counters,
    );

    const result = resolveSideTurnEnd(
      applied.formation,
      "ally",
      applied.counters,
      new BattleRng("removed-trigger").stream("effects"),
    );
    expect(findUnitLocation(result.formation, "ally-a")?.unit).toMatchObject({
      np: 0,
      effects: [],
    });
    expect(result.activations.map(({ outcome }) => outcome)).toEqual([
      "activated",
      "effect_unavailable",
    ]);
  });

  it("can explicitly affect all allies including reserve in formation order", () => {
    let state = formation();
    for (const instanceId of [
      "ally-a",
      "ally-b",
      "ally-c",
      "ally-d",
      "ally-e",
      "ally-f",
    ]) {
      state = withHp(state, instanceId, 5_000);
    }
    const applied = register(
      state,
      "ally-a",
      recurring(
        "party-heal",
        { kind: "heal_hp", amount: 500 },
        {
          remainingTurns: null,
          trigger: {
            timing: "turn_end",
            actions: [
              {
                target: {
                  relation: "allies",
                  selection: "all",
                  includeReserve: true,
                },
                action: { kind: "heal_hp", amount: 500 },
              },
            ],
          },
        },
      ),
      createEffectRuntimeCounters(),
    );

    const result = resolveSideTurnEnd(
      applied.formation,
      "ally",
      applied.counters,
      new BattleRng("party-heal").stream("effects"),
    );
    expect(
      [
        "ally-a",
        "ally-b",
        "ally-c",
        "ally-d",
        "ally-e",
        "ally-f",
      ].map(
        (instanceId) =>
          findUnitLocation(result.formation, instanceId)?.unit.hp,
      ),
    ).toEqual([5_500, 5_500, 5_500, 5_500, 5_500, 5_500]);
    expect(result.activations[0].actions[0].targetInstanceIds).toEqual([
      "ally-a",
      "ally-b",
      "ally-c",
      "ally-d",
      "ally-e",
      "ally-f",
    ]);
  });

  it("uses the original effect source for given recovery modifiers", () => {
    let state = withHp(formation(), "ally-b", 5_000);
    let counters = createEffectRuntimeCounters();
    let applied = register(
      state,
      "ally-a",
      {
        stableId: "given-recovery-up",
        name: "与HP回復量アップ",
        effectType: COMMON_EFFECT_TYPES.givenHpRecovery,
        category: "buff",
        value: 500,
        remainingTurns: null,
      },
      counters,
    );
    state = applied.formation;
    counters = applied.counters;
    applied = register(
      state,
      "ally-b",
      {
        stableId: "received-recovery-up",
        name: "HP回復量アップ",
        effectType: COMMON_EFFECT_TYPES.receivedHpRecovery,
        category: "buff",
        value: 200,
        remainingTurns: null,
      },
      counters,
    );
    state = applied.formation;
    counters = applied.counters;
    applied = register(
      state,
      "ally-b",
      recurring(
        "heal-from-ally-a",
        { kind: "heal_hp", amount: 1_000 },
        { remainingTurns: 1 },
      ),
      counters,
      "ally-a",
    );

    const result = resolveSideTurnEnd(
      applied.formation,
      "ally",
      applied.counters,
      new BattleRng("turn-end-healing-source").stream("effects"),
    );
    expect(findUnitLocation(result.formation, "ally-b")?.unit.hp).toBe(6_800);
    expect(result.activations[0].actions[0].batch.results[0]).toMatchObject({
      recoveryResult: {
        givenModifierPermille: 500,
        receivedModifierPermille: 200,
        scaledAmount: 1_800,
      },
    });
  });

  it("keeps slip damage nonlethal when its action is configured for HP1 stop", () => {
    const applied = register(
      formation(),
      "ally-a",
      recurring(
        "poison",
        { kind: "reduce_hp", amount: 20_000, canDefeat: false },
        { category: "debuff", remainingTurns: 1 },
      ),
      createEffectRuntimeCounters(),
      "enemy-a",
    );

    const result = resolveSideTurnEnd(
      applied.formation,
      "ally",
      applied.counters,
      new BattleRng("slip-damage").stream("effects"),
    );
    expect(findUnitLocation(result.formation, "ally-a")?.unit).toMatchObject({
      hp: 1,
      alive: true,
      effects: [],
    });
  });

  it("combines standard recurring recovery before consuming modifiers once", () => {
    let state = withHp(formation(), "ally-a", 2_000);
    let counters = createEffectRuntimeCounters();
    let applied = register(
      state,
      "enemy-a",
      {
        stableId: "counted-given-recovery",
        name: "与HP回復量アップ",
        effectType: COMMON_EFFECT_TYPES.givenHpRecovery,
        category: "buff",
        value: 500,
        remainingUses: 1,
      },
      counters,
    );
    state = applied.formation;
    counters = applied.counters;
    applied = register(
      state,
      "ally-a",
      {
        stableId: "counted-received-recovery",
        name: "HP回復量アップ",
        effectType: COMMON_EFFECT_TYPES.receivedHpRecovery,
        category: "buff",
        value: 200,
        remainingUses: 1,
      },
      counters,
    );
    state = applied.formation;
    counters = applied.counters;
    for (const [stableId, amount] of [
      ["recurring-heal-a", 600],
      ["recurring-heal-b", 400],
    ] as const) {
      applied = register(
        state,
        "ally-a",
        settledRecurring(
          stableId,
          "recurring_hp_recovery",
          { kind: "heal_hp", amount },
        ),
        counters,
        "enemy-a",
      );
      state = applied.formation;
      counters = applied.counters;
    }

    const result = resolveSideTurnEnd(
      state,
      "ally",
      counters,
      new BattleRng("grouped-recurring-heal").stream("effects"),
    );
    expect(findUnitLocation(result.formation, "ally-a")?.unit).toMatchObject({
      hp: 3_800,
      effects: [
        { stableId: "recurring-heal-a", remainingTurns: 1 },
        { stableId: "recurring-heal-b", remainingTurns: 1 },
      ],
    });
    expect(findUnitLocation(result.formation, "enemy-a")?.unit.effects).toEqual(
      [],
    );
    expect(result.hpSettlements).toHaveLength(1);
    expect(result.hpSettlements[0].result).toMatchObject({
      outcome: "healed",
      totalBaseRecovery: 1_000,
      scaledRecovery: 1_800,
      totalSlipDamage: 0,
      hpBefore: 2_000,
      hpAfter: 3_800,
      receivedModifierPermille: 200,
      sourceModifiers: [
        {
          sourceInstanceId: "enemy-a",
          givenModifierPermille: 500,
        },
      ],
      consumedSourceEffectInstanceIds: ["effect-1"],
      consumedTargetEffectInstanceIds: ["effect-2"],
    });
    expect(
      result.activations.map(
        ({ actions }) => actions[0].deferredSettlement,
      ),
    ).toEqual([
      "recurring_hp_recovery",
      "recurring_hp_recovery",
    ]);
  });

  it("settles recovery and slip damage together regardless of registration order", () => {
    const run = (slipFirst: boolean) => {
      let state = withHp(formation(), "ally-a", 500);
      let counters = createEffectRuntimeCounters();
      const effects = [
        settledRecurring(
          "recurring-heal",
          "recurring_hp_recovery",
          { kind: "heal_hp", amount: 1_000 },
        ),
        settledRecurring(
          "poison",
          "slip_damage",
          { kind: "reduce_hp", amount: 1_200, canDefeat: false },
          { category: "debuff" },
        ),
      ];
      if (slipFirst) effects.reverse();
      for (const effect of effects) {
        const applied = register(
          state,
          "ally-a",
          effect,
          counters,
          effect.category === "debuff" ? "enemy-a" : "ally-a",
        );
        state = applied.formation;
        counters = applied.counters;
      }
      return resolveSideTurnEnd(
        state,
        "ally",
        counters,
        new BattleRng(
          slipFirst ? "slip-before-heal" : "heal-before-slip",
        ).stream("effects"),
      );
    };

    const healFirst = run(false);
    const slipFirst = run(true);
    for (const result of [healFirst, slipFirst]) {
      expect(findUnitLocation(result.formation, "ally-a")?.unit.hp).toBe(300);
      expect(result.hpSettlements[0].result).toMatchObject({
        totalBaseRecovery: 1_000,
        scaledRecovery: 1_000,
        totalSlipDamage: 1_200,
        hpBefore: 500,
        hpAfter: 300,
        hpChange: -200,
      });
    }
  });

  it("lets recurring recovery offset slip damage even at maximum HP", () => {
    let state = formation();
    let counters = createEffectRuntimeCounters();
    for (const effect of [
      settledRecurring(
        "full-hp-recovery",
        "recurring_hp_recovery",
        { kind: "heal_hp", amount: 1_000 },
      ),
      settledRecurring(
        "full-hp-poison",
        "slip_damage",
        { kind: "reduce_hp", amount: 500, canDefeat: false },
        { category: "debuff" },
      ),
    ]) {
      const applied = register(
        state,
        "ally-a",
        effect,
        counters,
        effect.category === "debuff" ? "enemy-a" : "ally-a",
      );
      state = applied.formation;
      counters = applied.counters;
    }

    const result = resolveSideTurnEnd(
      state,
      "ally",
      counters,
      new BattleRng("full-hp-simultaneous").stream("effects"),
    );
    expect(findUnitLocation(result.formation, "ally-a")?.unit.hp).toBe(10_000);
    expect(result.hpSettlements[0].result).toMatchObject({
      outcome: "unchanged",
      scaledRecovery: 1_000,
      totalSlipDamage: 500,
      hpBefore: 10_000,
      hpAfter: 10_000,
    });
  });

  it("stops simultaneous slip settlement at HP1 without break or guts", () => {
    let state = withHp(formation(), "enemy-a", 500);
    let counters = createEffectRuntimeCounters();
    for (const effect of [
      settledRecurring(
        "small-recovery",
        "recurring_hp_recovery",
        { kind: "heal_hp", amount: 100 },
      ),
      settledRecurring(
        "large-curse",
        "slip_damage",
        { kind: "reduce_hp", amount: 1_000, canDefeat: false },
        { category: "debuff" },
      ),
    ]) {
      const applied = register(
        state,
        "enemy-a",
        effect,
        counters,
        effect.category === "debuff" ? "ally-a" : "enemy-a",
      );
      state = applied.formation;
      counters = applied.counters;
    }

    const result = resolveSideTurnEnd(
      state,
      "enemy",
      counters,
      new BattleRng("nonlethal-settlement").stream("effects"),
    );
    expect(findUnitLocation(result.formation, "enemy-a")?.unit).toMatchObject({
      hp: 1,
      alive: true,
    });
    expect(result.hpSettlements[0].result).toMatchObject({
      outcome: "damaged",
      hpAfter: 1,
      slipPreventedDefeat: true,
    });
  });

  it("blocks one grouped recovery and consumes count-based states once", () => {
    let state = withHp(formation(), "ally-a", 2_000);
    let counters = createEffectRuntimeCounters();
    for (const template of [
      {
        stableId: "one-recovery-block",
        name: "HP回復不能",
        effectType: COMMON_EFFECT_TYPES.hpRecoveryBlocked,
        category: "debuff" as const,
        remainingUses: 1,
      },
      {
        stableId: "one-received-modifier",
        name: "HP回復量アップ",
        effectType: COMMON_EFFECT_TYPES.receivedHpRecovery,
        category: "buff" as const,
        value: 500,
        remainingUses: 1,
      },
    ]) {
      const applied = register(
        state,
        "ally-a",
        template,
        counters,
        "enemy-a",
      );
      state = applied.formation;
      counters = applied.counters;
    }
    for (const [stableId, amount, settlement] of [
      ["blocked-heal-a", 500, "recurring_hp_recovery"],
      ["blocked-heal-b", 500, "recurring_hp_recovery"],
      ["settled-poison", 500, "slip_damage"],
    ] as const) {
      const applied = register(
        state,
        "ally-a",
        settledRecurring(
          stableId,
          settlement,
          settlement === "recurring_hp_recovery"
            ? { kind: "heal_hp", amount }
            : { kind: "reduce_hp", amount, canDefeat: false },
          settlement === "slip_damage"
            ? { category: "debuff" }
            : {},
        ),
        counters,
        settlement === "slip_damage" ? "enemy-a" : "ally-a",
      );
      state = applied.formation;
      counters = applied.counters;
    }

    const result = resolveSideTurnEnd(
      state,
      "ally",
      counters,
      new BattleRng("grouped-healing-block").stream("effects"),
    );
    expect(findUnitLocation(result.formation, "ally-a")?.unit).toMatchObject({
      hp: 1_500,
      effects: [
        { stableId: "blocked-heal-a" },
        { stableId: "blocked-heal-b" },
        { stableId: "settled-poison" },
      ],
    });
    expect(result.hpSettlements[0].result).toMatchObject({
      scaledRecovery: 0,
      totalSlipDamage: 500,
      blockedByEffectInstanceId: "effect-1",
      consumedTargetEffectInstanceIds: ["effect-2", "effect-1"],
    });
  });

  it("rejects a lethal action marked as standard slip damage", () => {
    const applied = register(
      formation(),
      "ally-a",
      settledRecurring(
        "invalid-slip",
        "slip_damage",
        { kind: "reduce_hp", amount: 500, canDefeat: true },
      ),
      createEffectRuntimeCounters(),
      "enemy-a",
    );

    expect(() =>
      resolveSideTurnEnd(
        applied.formation,
        "ally",
        applied.counters,
        new BattleRng("invalid-slip").stream("effects"),
      ),
    ).toThrow(/nonlethal reduce_hp/);
  });

  it("groups multi-target absorption into one source recovery", () => {
    let state = withHp(formation(), "ally-a", 1_000);
    state = withHp(state, "enemy-a", 500);
    state = withHp(state, "enemy-c", 2_000);
    const applied = register(
      state,
      "ally-a",
      recurring(
        "enemy-party-absorption",
        { kind: "absorb_hp", amount: 1_000, canDefeat: false },
        {
          remainingTurns: 1,
          trigger: {
            timing: "turn_end",
            actions: [
              {
                target: { relation: "enemies", selection: "all" },
                action: {
                  kind: "absorb_hp",
                  amount: 1_000,
                  canDefeat: false,
                },
              },
            ],
          },
        },
      ),
      createEffectRuntimeCounters(),
    );

    const result = resolveSideTurnEnd(
      applied.formation,
      "ally",
      applied.counters,
      new BattleRng("turn-end-absorption").stream("effects"),
    );
    expect(findUnitLocation(result.formation, "ally-a")?.unit.hp).toBe(2_499);
    expect(findUnitLocation(result.formation, "enemy-a")?.unit.hp).toBe(1);
    expect(findUnitLocation(result.formation, "enemy-c")?.unit.hp).toBe(1_000);
    expect(
      result.activations[0].actions[0].batch.absorptionResult,
    ).toMatchObject({
      totalActualReduction: 1_499,
      recoveryBaseAmount: 1_499,
      recovery: { actualRecovered: 1_499 },
    });
  });

  it("replays probabilistic turn-end activation with the same fixed seed", () => {
    const base = register(
      formation(),
      "ally-a",
      recurring(
        "probabilistic-np",
        { kind: "change_np", amount: 1_000, npLevel: 1 },
        {
          remainingTurns: null,
          trigger: {
            timing: "turn_end",
            activationRatePermille: 500,
            actions: [
              {
                target: self,
                action: { kind: "change_np", amount: 1_000, npLevel: 1 },
              },
            ],
          },
        },
      ),
      createEffectRuntimeCounters(),
    );
    const firstRng = new BattleRng("turn-end-replay").stream("effects");
    const secondRng = new BattleRng("turn-end-replay").stream("effects");
    const first = resolveSideTurnEnd(
      base.formation,
      "ally",
      base.counters,
      firstRng,
    );
    const second = resolveSideTurnEnd(
      base.formation,
      "ally",
      base.counters,
      secondRng,
    );

    expect(second.activations).toEqual(first.activations);
    expect(second.formation).toEqual(first.formation);
    expect(secondRng.snapshot()).toEqual(firstRng.snapshot());
    expect(firstRng.snapshot().drawCount).toBe(1);
  });
});
