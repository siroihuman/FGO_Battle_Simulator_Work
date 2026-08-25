import { describe, expect, it } from "vitest";
import {
  createBattleAttackDataRegistry,
} from "../src/core/battle/actionData";
import {
  findUnitLocation,
  replaceUnit,
} from "../src/core/battle/formation";
import {
  beginAllyTurnEnd,
  completeAllyTurnEnd,
} from "../src/core/battle/progression";
import {
  createBattleState,
  type BattleState,
} from "../src/core/battle/state";
import type {
  EnemyActionState,
} from "../src/core/battle/types";
import { BattleRng } from "../src/core/rng";
import {
  resolveEnemyAttacks,
  type EnemyAttackDetail,
} from "../src/ai/enemyAttack";
import {
  createBattleActionEffectDataRegistry,
} from "../src/effects/actionData";
import type {
  EnemyNoblePhantasmContext,
} from "../src/effects/declarations";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import {
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import { summarizeBattleLogBatch } from "../src/ui/battlePresentation";
import { combatantData } from "./helpers/attackData";
import { unit } from "./helpers/battle";

function noblePhantasm() {
  return {
    stableId: "ally-np",
    name: "Ally NP",
    cardType: "arts" as const,
    level: 1 as const,
  };
}

function enemyActions(
  fullCharge = false,
): EnemyActionState {
  return {
    maxActions: 1,
    normalAttack: {
      stableId: "enemy-normal",
      name: "Enemy Normal",
    },
    skills: [{
      stableId: "enemy-skill",
      name: "Enemy Skill",
    }],
    noblePhantasm: {
      stableId: "enemy-np",
      name: "Enemy NP",
    },
    charge: fullCharge ? 3 : 0,
    chargeMax: 3,
  };
}

function enemyTurn(fullCharge = false): BattleState {
  const state = createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally", {
          dataId: "servant-a",
          hp: 100_000,
          maxHp: 100_000,
          baseMaxHp: 100_000,
          noblePhantasm: noblePhantasm(),
        }),
        unit("ally-b", "ally", {
          dataId: "servant-b",
          hp: 100_000,
          maxHp: 100_000,
          baseMaxHp: 100_000,
          noblePhantasm: noblePhantasm(),
        }),
        unit("ally-c", "ally", {
          dataId: "servant-c",
          hp: 100_000,
          maxHp: 100_000,
          baseMaxHp: 100_000,
          noblePhantasm: noblePhantasm(),
        }),
      ],
      reserve: [
        unit("ally-d", "ally", {
          dataId: "servant-d",
        }),
      ],
    },
    waves: [
      {
        enemy: {
          frontline: [
            unit("enemy-a", "enemy", {
              dataId: "enemy",
              enemyAction: enemyActions(fullCharge),
            }),
            null,
            null,
          ],
          reserve: [],
        },
      },
    ],
    enemyFrontlineLimit: 3,
  });
  return completeAllyTurnEnd(beginAllyTurnEnd(state));
}

function registry() {
  return createBattleAttackDataRegistry([
    combatantData("enemy-a", "enemy", {
      attack: 10_000,
      attackNpRatePermille: 800,
      commandCardHitWeights: null,
      extraAttackHitWeights: null,
      enemyAttacks: [
        {
          actionStableId: "enemy-normal",
          kind: "normal_attack",
          targetScope: "single",
          cardType: "buster",
          hitWeights: [1, 1],
          cardDamageValuePermille: 1_000,
        },
        {
          actionStableId: "enemy-np",
          kind: "noble_phantasm",
          targetScope: "all",
          cardType: "buster",
          hitWeights: [1],
          cardDamageValuePermille: 1_500,
          npDamageMultiplierPermille: 3_000,
        },
      ],
    }),
    ...["a", "b", "c"].map((suffix) =>
      combatantData(
        `ally-${suffix}`,
        `servant-${suffix}`,
        {
          receivedNpUnits: 300,
        },
      )
    ),
  ]);
}

function actionEffectRegistry() {
  return createBattleActionEffectDataRegistry([{
    instanceId: "enemy-a",
    dataId: "enemy",
    passives: [],
    actions: [
      {
        stableId: "enemy-skill",
        name: "Enemy Skill",
        kind: "skill",
        skillSlot: 1,
        cooldownAtMax: 0,
        attackOrder: null,
        effects: [{
          kind: "effect",
          stableId: "enemy-skill-hp-reduction",
          order: 1,
          description: "選択した味方のHPを減らす",
          target: { relation: "enemies", selection: "single" },
          action: {
            kind: "reduce_hp",
            amount: 1_000,
            canDefeat: false,
          },
        }],
      },
      {
        stableId: "enemy-np",
        name: "Enemy NP",
        kind: "noble_phantasm",
        attackOrder: 2,
        effects: [
          {
            kind: "effect",
            stableId: "enemy-np-before",
            order: 1,
            description: "攻撃前に味方全体のNPを増やす",
            target: { relation: "enemies", selection: "all" },
            action: { kind: "change_np", amount: 1_000 },
          },
          {
            kind: "effect",
            stableId: "enemy-np-after",
            order: 3,
            description: "攻撃後に自身を回復する",
            target: { relation: "self", selection: "single" },
            action: { kind: "heal_hp", amount: 500 },
          },
        ],
      },
    ],
  }]);
}

const stagedContext = {
  actionStableId: "enemy-np",
  noblePhantasmLevel: 4 as const,
  overchargeStage: 2 as const,
};

function stagedRegistry(
  context: EnemyNoblePhantasmContext | null = stagedContext,
) {
  return createBattleAttackDataRegistry([
    combatantData("enemy-a", "enemy", {
      attack: 10_000,
      attackNpRatePermille: 800,
      commandCardHitWeights: null,
      extraAttackHitWeights: null,
      enemyAttacks: [{
        actionStableId: "enemy-np",
        kind: "noble_phantasm",
        targetScope: "single",
        cardType: "buster",
        hitWeights: [1],
        cardDamageValuePermille: 1_000,
        npDamageMultiplierPermille: {
          scaling: "noble_phantasm_level",
          values: [1_000, 2_000, 3_000, 4_000, 5_000],
        },
        ...(context ? { noblePhantasmContext: context } : {}),
      }],
    }),
    ...["a", "b", "c"].map((suffix) =>
      combatantData(`ally-${suffix}`, `servant-${suffix}`, {
        receivedNpUnits: 300,
      })
    ),
  ]);
}

function stagedEffectRegistry(
  context: EnemyNoblePhantasmContext | null = stagedContext,
) {
  return createBattleActionEffectDataRegistry([{
    instanceId: "enemy-a",
    dataId: "enemy",
    passives: [],
    actions: [{
      stableId: "enemy-np",
      name: "Enemy NP",
      kind: "noble_phantasm",
      attackOrder: 2,
      ...(context ? { noblePhantasmContext: context } : {}),
      effects: [
        {
          kind: "effect",
          stableId: "enemy-np-level-before",
          order: 1,
          description: "宝具Lv別に味方全体のNPを増やす",
          target: { relation: "enemies", selection: "all" },
          action: {
            kind: "change_np",
            amount: {
              scaling: "noble_phantasm_level",
              values: [100, 200, 300, 400, 500],
            },
          },
        },
        {
          kind: "effect",
          stableId: "enemy-np-oc-after",
          order: 3,
          description: "OC別に次回用スターを増やす",
          target: { relation: "self", selection: "single" },
          action: {
            kind: "gain_stars",
            amount: {
              scaling: "overcharge",
              values: [10, 20, 30, 40, 50],
            },
            destination: "next_command",
          },
        },
      ],
    }],
  }]);
}

function mismatchedActionEffectRegistry() {
  const current = stagedEffectRegistry().byInstanceId["enemy-a"]!;
  const sequence = current.actions[0]!;
  return createBattleActionEffectDataRegistry([{
    ...current,
    actions: [{
      ...sequence,
      stableId: "another-enemy-np",
      noblePhantasmContext: {
        ...stagedContext,
        actionStableId: "another-enemy-np",
      },
    }],
  }]);
}

function streams(seed: string) {
  const rng = new BattleRng(seed);
  return {
    rng,
    streams: {
      effects: rng.stream("effects"),
      damage: rng.stream("damage"),
      stars: rng.stream("stars"),
    },
  };
}

describe("enemy data-to-attack integration", () => {
  it("applies critical-chance modifiers to enemy normal attacks and clamps before RNG", () => {
    const initial = enemyTurn();
    const enemy = findUnitLocation(initial.formation, "enemy-a")?.unit;
    if (!enemy) throw new Error("敵が見つかりません");
    const applied = applyEffect(
      enemy,
      {
        stableId: "critical-chance-down",
        name: "クリティカル発生率ダウン",
        effectType: COMMON_EFFECT_TYPES.criticalChance,
        category: "debuff",
        value: -200,
        remainingTurns: 3,
      },
      "ally-source",
      createEffectRuntimeCounters(),
    );
    const state = {
      ...initial,
      formation: replaceUnit(initial.formation, applied.unit),
    };
    const battleRegistry = createBattleAttackDataRegistry([
      combatantData("enemy-a", "enemy", {
        attack: 10_000,
        commandCardHitWeights: null,
        extraAttackHitWeights: null,
        enemyAttacks: [{
          actionStableId: "enemy-normal",
          kind: "normal_attack",
          targetScope: "single",
          cardType: "buster",
          hitWeights: [1],
          cardDamageValuePermille: 1_000,
          criticalChancePermille: 100,
        }],
      }),
    ]);
    const rng = new BattleRng("enemy-critical-chance-down");
    const resolved = resolveEnemyAttacks({
      state,
      priorityRequests: [],
      registry: battleRegistry,
      rng: {
        effects: rng.stream("effects"),
        damage: rng.stream("damage"),
        stars: rng.stream("stars"),
      },
      aiRng: rng.stream("ai"),
      criticalRng: rng.stream("critical"),
    });
    expect(resolved.sequence.actions[0]?.resolverDetail).toMatchObject({
      outcome: "resolved",
      calculation: { isCritical: false },
    });
    expect(rng.snapshot().streams.critical.drawCount).toBe(0);
  });

  it("uses the default frontmost target and grants received NP", () => {
    const random = streams("enemy-normal-data");
    const resolved = resolveEnemyAttacks({
      state: enemyTurn(),
      priorityRequests: [],
      registry: registry(),
      rng: random.streams,
    });

    expect(resolved.sequence.actions).toHaveLength(1);
    const detail = resolved.sequence.actions[0]
      ?.resolverDetail as EnemyAttackDetail;
    expect(detail).toMatchObject({
      outcome: "resolved",
      targetScope: "single",
      targetInstanceIds: ["ally-a"],
    });
    expect(
      findUnitLocation(
        resolved.sequence.state.formation,
        "ally-a",
      )?.unit,
    ).toMatchObject({
      alive: true,
    });
    expect(
      findUnitLocation(
        resolved.sequence.state.formation,
        "ally-a",
      )?.unit.hp,
    ).toBeLessThan(100_000);
    expect(
      findUnitLocation(
        resolved.sequence.state.formation,
        "ally-a",
      )?.unit.np,
    ).toBeGreaterThan(0);
    expect(resolved.sequence.state.nextCommandStars).toBe(0);
    expect(resolved.sequence.state.phase).toBe("enemy_turn_end");
  });

  it("prioritizes a living frontline target-focus holder for a single-target attack", () => {
    const initial = enemyTurn();
    const target = findUnitLocation(initial.formation, "ally-b")?.unit;
    if (!target) throw new Error("target-focus test ally is missing");
    const applied = applyEffect(
      target,
      {
        stableId: "test-target-focus",
        name: "ターゲット集中",
        effectType: COMMON_EFFECT_TYPES.targetFocus,
        category: "buff",
        value: 3_000,
        remainingTurns: 1,
      },
      "ally-b",
      createEffectRuntimeCounters(),
    );
    const state = {
      ...initial,
      formation: replaceUnit(initial.formation, applied.unit),
    };
    const random = streams("enemy-target-focus");
    let selectorCalls = 0;
    const resolved = resolveEnemyAttacks({
      state,
      priorityRequests: [],
      registry: registry(),
      counters: applied.counters,
      rng: random.streams,
      singleTargetSelector: () => {
        selectorCalls += 1;
        return "ally-a";
      },
    });
    const detail = resolved.sequence.actions[0]
      ?.resolverDetail as EnemyAttackDetail;
    expect(detail).toMatchObject({
      outcome: "resolved",
      targetScope: "single",
      targetInstanceIds: ["ally-b"],
    });
    expect(selectorCalls).toBe(0);
    expect(findUnitLocation(resolved.sequence.state.formation, "ally-a")?.unit.hp)
      .toBe(100_000);
    expect(findUnitLocation(resolved.sequence.state.formation, "ally-b")?.unit.hp)
      .toBeLessThan(100_000);
  });

  it("uses a full-charge all-target NP and resets charge before damage", () => {
    const random = streams("enemy-np-data");
    const resolved = resolveEnemyAttacks({
      state: enemyTurn(true),
      priorityRequests: [],
      registry: registry(),
      actionEffectRegistry: actionEffectRegistry(),
      rng: random.streams,
    });
    const detail = resolved.sequence.actions[0]
      ?.resolverDetail as EnemyAttackDetail;

    expect(detail).toMatchObject({
      outcome: "resolved",
      targetScope: "all",
      targetInstanceIds: ["ally-a", "ally-b", "ally-c"],
      calculation: {
        isNoblePhantasm: true,
        npDamageMultiplierPermille: 3_000,
      },
    });
    if (detail.outcome !== "resolved") return;
    expect(detail.declaredEffects.map(({ phase }) => phase)).toEqual([
      "before_attack",
      "after_attack",
    ]);
    expect(detail.resolution.attack?.attack.hits).toHaveLength(3);
    for (const instanceId of ["ally-a", "ally-b", "ally-c"]) {
      expect(
        findUnitLocation(
          resolved.sequence.state.formation,
          instanceId,
        )?.unit.hp,
      ).toBeLessThan(100_000);
    }
    expect(
      findUnitLocation(
        resolved.sequence.state.formation,
        "enemy-a",
      )?.unit.enemyAction?.charge,
    ).toBe(0);
    expect(resolved.battleLog.entries[0]?.declaredEffects).toMatchObject([
      {
        phase: "before_attack",
        effects: [{
          effectStableId: "enemy-np-before",
          targetInstanceIds: ["ally-a", "ally-b", "ally-c"],
        }],
      },
      {
        phase: "after_attack",
        effects: [{ effectStableId: "enemy-np-after" }],
      },
    ]);
    expect(resolved.battleLog.entries[0]).not.toHaveProperty(
      "noblePhantasmLevel",
    );
    expect(resolved.battleLog.entries[0]?.overchargeStage).toBeNull();
  });

  it("uses one preflight snapshot for staged damage, before/after effects, logs, and UI detail", () => {
    const random = streams("enemy-staged-np-context");
    const resolved = resolveEnemyAttacks({
      state: enemyTurn(true),
      priorityRequests: [],
      registry: stagedRegistry(),
      actionEffectRegistry: stagedEffectRegistry(),
      rng: random.streams,
      aiRng: random.rng.stream("ai"),
      criticalRng: random.rng.stream("critical"),
    });
    const action = resolved.sequence.actions[0];
    const detail = action?.resolverDetail as EnemyAttackDetail;
    expect(action).toMatchObject({
      preflight: {
        outcome: "ready",
        chargeBefore: 3,
        chargeConsumed: 3,
        guardSnapshot: {
          context: stagedContext,
          npDamageMultiplierPermille: 4_000,
        },
      },
    });
    expect(detail).toMatchObject({
      outcome: "resolved",
      calculation: { npDamageMultiplierPermille: 4_000 },
      noblePhantasmContext: stagedContext,
      declaredEffects: [
        {
          phase: "before_attack",
          result: { effects: [{ resolvedAmount: 400 }] },
        },
        {
          phase: "after_attack",
          result: { effects: [{ resolvedAmount: 20 }] },
        },
      ],
    });
    expect(resolved.sequence.state.nextCommandStars).toBe(20);
    expect(["ally-a", "ally-b", "ally-c"].map((instanceId) =>
      findUnitLocation(
        resolved.sequence.state.formation,
        instanceId,
      )?.unit.np
    )).toEqual([640, 400, 400]);
    const log = resolved.battleLog.entries[0]!;
    expect(log).toMatchObject({
      noblePhantasmLevel: 4,
      overchargeStage: 2,
      calculation: { npDamageMultiplierPermille: 4_000 },
      declaredEffects: [
        { effects: [{ resolvedAmount: 400 }] },
        { effects: [{ resolvedAmount: 20 }] },
      ],
    });
    const summary = summarizeBattleLogBatch(resolved.battleLog)[0];
    expect(summary?.detail).toBe(log);
    expect((summary?.detail as typeof log).calculation)
      .toEqual(log.calculation);
  });

  it("resolves a configured enemy skill against its AI-selected target and logs the effect", () => {
    const random = streams("enemy-declared-skill");
    const resolved = resolveEnemyAttacks({
      state: enemyTurn(),
      priorityRequests: [{
        actorInstanceId: "enemy-a",
        skillStableId: "enemy-skill",
        selectedTargetInstanceId: "ally-b",
      }],
      registry: registry(),
      actionEffectRegistry: actionEffectRegistry(),
      rng: random.streams,
    });
    const first = resolved.sequence.actions[0];
    expect(first?.preflight.outcome).toBe("ready");
    expect(first?.resolverDetail).toMatchObject({
      outcome: "resolved_effects",
      targetInstanceIds: ["ally-b"],
    });
    expect(findUnitLocation(
      resolved.sequence.state.formation,
      "ally-b",
    )?.unit.hp).toBe(99_000);
    expect(resolved.battleLog.entries[0]).toMatchObject({
      action: { kind: "enemy_skill", stage: "priority" },
      outcome: { status: "resolved", reasons: [] },
      calculation: null,
      attack: null,
      declaredEffects: [{
        phase: "non_damaging",
        effects: [{
          effectStableId: "enemy-skill-hp-reduction",
          targetInstanceIds: ["ally-b"],
          results: [{ hpChange: -1_000 }],
        }],
      }],
    });
  });

  it("skips a selected-target enemy skill before effects when AI omits the target", () => {
    const random = streams("enemy-skill-target-missing");
    const resolved = resolveEnemyAttacks({
      state: enemyTurn(),
      priorityRequests: [{
        actorInstanceId: "enemy-a",
        skillStableId: "enemy-skill",
      }],
      registry: registry(),
      actionEffectRegistry: actionEffectRegistry(),
      rng: random.streams,
    });
    expect(resolved.sequence.actions[0]).toMatchObject({
      preflight: {
        outcome: "skipped",
        reason: "action_effect_target_required",
      },
      resolverCalled: false,
    });
    expect(findUnitLocation(
      resolved.sequence.state.formation,
      "ally-b",
    )?.unit.hp).toBe(100_000);
    expect(resolved.battleLog.entries[0]).toMatchObject({
      outcome: {
        status: "skipped",
        reasons: ["action_effect_target_required"],
      },
      declaredEffects: [],
      attack: null,
      rngEvents: [],
    });
    expect(random.rng.stream("effects").snapshot().drawCount).toBe(0);
  });

  it("skips an unresolved enemy NP before charge and action RNG are consumed", () => {
    const unresolved = createBattleActionEffectDataRegistry([{
      instanceId: "enemy-a",
      dataId: "enemy",
      passives: [],
      actions: [{
        stableId: "enemy-np",
        name: "Enemy NP",
        kind: "noble_phantasm",
        attackOrder: 2,
        effects: [{
          kind: "effect",
          stableId: "enemy-np-future-effect",
          order: 1,
          description: "未対応効果",
          target: { relation: "self", selection: "single" },
          action: {
            kind: "unsupported",
            mechanicId: "future_enemy_np_effect",
          },
        }],
      }],
    }]);
    const random = streams("enemy-unresolved-np");
    const resolved = resolveEnemyAttacks({
      state: enemyTurn(true),
      priorityRequests: [],
      registry: registry(),
      actionEffectRegistry: unresolved,
      rng: random.streams,
    });
    expect(resolved.sequence.actions[0]).toMatchObject({
      preflight: {
        outcome: "skipped",
        reason: "action_effects_unresolved",
        chargeBefore: 3,
        chargeConsumed: 0,
      },
      resolverCalled: false,
    });
    expect(findUnitLocation(
      resolved.sequence.state.formation,
      "enemy-a",
    )?.unit.enemyAction?.charge).toBe(3);
    expect(
      Object.values(random.rng.snapshot().streams).every(
        ({ drawCount }) => drawCount === 0,
      ),
    ).toBe(true);
  });

  it.each([
    {
      label: "missing context",
      reason: "enemy_noble_phantasm_context_missing",
      attackRegistry: () => stagedRegistry(null),
      effectRegistry: () => stagedEffectRegistry(null),
    },
    {
      label: "mismatched attack/effect context",
      reason: "enemy_noble_phantasm_data_invalid",
      attackRegistry: () => stagedRegistry(),
      effectRegistry: () => stagedEffectRegistry({
        ...stagedContext,
        noblePhantasmLevel: 3,
      }),
    },
    {
      label: "mismatched attack/effect action ID",
      reason: "enemy_noble_phantasm_data_invalid",
      attackRegistry: () => stagedRegistry(),
      effectRegistry: () => mismatchedActionEffectRegistry(),
    },
  ])("atomically skips $label with a typed reason", ({
    reason,
    attackRegistry,
    effectRegistry,
  }) => {
    const random = streams(`enemy-staged-skip-${reason}`);
    let targetCalls = 0;
    const counters = {
      nextInstanceNumber: 7,
      nextRegistrationOrder: 9,
    };
    const resolved = resolveEnemyAttacks({
      state: enemyTurn(true),
      priorityRequests: [],
      registry: attackRegistry(),
      actionEffectRegistry: effectRegistry(),
      counters,
      rng: random.streams,
      aiRng: random.rng.stream("ai"),
      criticalRng: random.rng.stream("critical"),
      singleTargetSelector: () => {
        targetCalls += 1;
        return "ally-a";
      },
    });
    expect(resolved.sequence.actions[0]).toMatchObject({
      preflight: {
        outcome: "skipped",
        reason,
        chargeBefore: 3,
        chargeConsumed: 0,
      },
      resolverCalled: false,
    });
    expect(resolved.counters).toEqual(counters);
    expect(targetCalls).toBe(0);
    expect(findUnitLocation(
      resolved.sequence.state.formation,
      "enemy-a",
    )?.unit.enemyAction?.charge).toBe(3);
    expect(findUnitLocation(
      resolved.sequence.state.formation,
      "ally-a",
    )?.unit.hp).toBe(100_000);
    expect(Object.values(random.rng.snapshot().streams).every(
      ({ drawCount }) => drawCount === 0,
    )).toBe(true);
    expect(resolved.battleLog.entries[0]?.outcome.reasons).toEqual([reason]);
  });

  it("atomically rejects invalid context and malformed five-stage data", () => {
    const readyAttack = stagedRegistry();
    const readyEffects = stagedEffectRegistry();
    const baseCombatant = readyAttack.byInstanceId["enemy-a"]!;
    const baseAction = baseCombatant.enemyAttacks[0]!;
    const baseEffectData = readyEffects.byInstanceId["enemy-a"]!;
    const baseSequence = baseEffectData.actions[0]!;

    const cases = [
      {
        reason: "enemy_noble_phantasm_context_invalid",
        registry: {
          ...readyAttack,
          byInstanceId: {
            ...readyAttack.byInstanceId,
            "enemy-a": {
              ...baseCombatant,
              enemyAttacks: [{
                ...baseAction,
                noblePhantasmContext: {
                  ...stagedContext,
                  noblePhantasmLevel: 6,
                },
              }],
            },
          },
        },
        effects: {
          byInstanceId: {
            "enemy-a": {
              ...baseEffectData,
              actions: [{
                ...baseSequence,
                noblePhantasmContext: {
                  ...stagedContext,
                  noblePhantasmLevel: 6,
                },
              }],
            },
          },
        },
      },
      {
        reason: "enemy_noble_phantasm_data_invalid",
        registry: {
          ...readyAttack,
          byInstanceId: {
            ...readyAttack.byInstanceId,
            "enemy-a": {
              ...baseCombatant,
              enemyAttacks: [{
                ...baseAction,
                npDamageMultiplierPermille: {
                  scaling: "noble_phantasm_level",
                  values: [1_000, 2_000, 3_000, 4_000],
                },
              }],
            },
          },
        },
        effects: readyEffects,
      },
    ] as const;

    for (const [index, current] of cases.entries()) {
      const random = streams(`enemy-invalid-context-${index}`);
      const resolved = resolveEnemyAttacks({
        state: enemyTurn(true),
        priorityRequests: [],
        registry: current.registry as never,
        actionEffectRegistry: current.effects as never,
        rng: random.streams,
        aiRng: random.rng.stream("ai"),
        criticalRng: random.rng.stream("critical"),
      });
      expect(resolved.sequence.actions[0]).toMatchObject({
        preflight: {
          outcome: "skipped",
          reason: current.reason,
          chargeConsumed: 0,
        },
        resolverCalled: false,
      });
      expect(Object.values(random.rng.snapshot().streams).every(
        ({ drawCount }) => drawCount === 0,
      )).toBe(true);
    }
  });

  it("treats missing numeric action data as a safe no-op", () => {
    const random = streams("enemy-missing-action-data");
    const resolved = resolveEnemyAttacks({
      state: enemyTurn(),
      priorityRequests: [],
      registry: createBattleAttackDataRegistry([
        combatantData("enemy-a", "enemy", {
          commandCardHitWeights: null,
          extraAttackHitWeights: null,
        }),
      ]),
      rng: random.streams,
    });

    expect(resolved.sequence.actions[0]).toMatchObject({
      preflight: {
        outcome: "skipped",
        reason: "action_attack_data_missing",
        chargeConsumed: 0,
      },
      resolverCalled: false,
    });
    expect(
      Object.values(random.rng.snapshot().streams).every(
        ({ drawCount }) => drawCount === 0,
      ),
    ).toBe(true);
    expect(
      findUnitLocation(
        resolved.sequence.state.formation,
        "ally-a",
      )?.unit.hp,
    ).toBe(100_000);
  });

  it("rejects an unavailable custom target before attack RNG", () => {
    const random = streams("enemy-invalid-target");
    expect(() =>
      resolveEnemyAttacks({
        state: enemyTurn(),
        priorityRequests: [],
        registry: registry(),
        rng: random.streams,
        singleTargetSelector: () => "ally-d",
      })
    ).toThrow(/unavailable ally/);
    expect(
      Object.values(random.rng.snapshot().streams).every(
        ({ drawCount }) => drawCount === 0,
      ),
    ).toBe(true);
  });
});
