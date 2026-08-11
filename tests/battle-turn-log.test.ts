import { describe, expect, it } from "vitest";
import {
  createBattleAttackDataRegistry,
} from "../src/core/battle/actionData";
import {
  resolveBattleTurn,
} from "../src/core/battle/battleTurn";
import {
  findUnitLocation,
  replaceUnit,
} from "../src/core/battle/formation";
import {
  createBattleState,
  setBattleFormation,
  type BattleState,
} from "../src/core/battle/state";
import type {
  BattleUnitState,
  EnemyActionState,
} from "../src/core/battle/types";
import { BattleRng } from "../src/core/rng";
import {
  selectCommandCards,
  type CommandCardSelection,
} from "../src/core/cards/selection";
import {
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import { resolveLethalHp } from "../src/effects/survival";
import { combatantData } from "./helpers/attackData";
import { unit } from "./helpers/battle";
import { summarizeBattleTurnLogs } from "../src/ui/battlePresentation";

// Canonical timeline-log requirements:
// docs/specs/BATTLE_SYSTEM.md, CALCULATIONS_AND_RNG.md,
// EFFECTS_AND_TIMING.md, and UI_AND_STORAGE.md (checked 2026-08-03).

function enemyAction(): EnemyActionState {
  return {
    maxActions: 1,
    normalAttack: {
      stableId: "enemy-normal",
      name: "Enemy Normal",
    },
    skills: [],
    noblePhantasm: null,
    charge: 0,
    chargeMax: 0,
  };
}

interface BattleOptions {
  allyA?: BattleUnitState;
  enemyA?: BattleUnitState;
  secondWave?: boolean;
  mysticCodeCooldowns?: number[];
}

function battle(options: BattleOptions = {}): BattleState {
  const state = createBattleState({
    ally: {
      frontline: [
        options.allyA ?? unit("ally-a", "ally"),
        unit("ally-b", "ally"),
        unit("ally-c", "ally"),
      ],
      reserve: [],
    },
    waves: [
      {
        enemy: {
          frontline: [
            options.enemyA
              ?? unit("enemy-a", "enemy", {
                hp: 1_000_000,
                maxHp: 1_000_000,
                baseMaxHp: 1_000_000,
                enemyAction: enemyAction(),
              }),
            null,
            null,
          ],
          reserve: [],
        },
      },
      ...(options.secondWave
        ? [
            {
              enemy: {
                frontline: [
                  unit("enemy-b", "enemy", {
                    hp: 50_000,
                    maxHp: 50_000,
                    baseMaxHp: 50_000,
                  }),
                  null,
                  null,
                ],
                reserve: [],
              },
            },
          ]
        : []),
    ],
    enemyFrontlineLimit: 3,
    mysticCodeCooldowns: options.mysticCodeCooldowns,
  });
  const allyCards = state.commandDeck.sourceCards.filter(
    ({ ownerInstanceId }) => ownerInstanceId === "ally-a",
  );
  return {
    ...state,
    commandStarDistributionMode: "legacy_on_command_confirmation",
    commandStarDistribution: null,
    commandDeck: {
      ...state.commandDeck,
      currentHand: allyCards,
    },
  };
}

function selection(state: BattleState): CommandCardSelection {
  const result = selectCommandCards(
    state,
    state.commandDeck.currentHand
      .slice(0, 3)
      .map(({ cardId }) => cardId),
  );
  if (!result.accepted) {
    throw new Error(`selection rejected: ${result.reason}`);
  }
  return result.selection;
}

function allyRegistry() {
  return createBattleAttackDataRegistry([
    combatantData("ally-a", "ally-a", {
      attack: 10_000,
      starRatePermille: 0,
    }),
  ]);
}

function resolveLoggedTurn(seed: string) {
  const state = battle();
  const rng = new BattleRng(seed);
  return {
    result: resolveBattleTurn({
      state,
      selection: selection(state),
      registry: allyRegistry(),
      rng,
    }),
    rng,
  };
}

describe("battle-turn timeline log", () => {
  it("orders action and turn-end records and saves the parent seed and RNG positions", () => {
    const first = resolveLoggedTurn("battle-turn-timeline");
    const second = resolveLoggedTurn("battle-turn-timeline");
    const log = first.result.battleLog;

    expect(log).toMatchObject({
      schemaVersion: 2,
      turnId: "wave-1:battle-turn-1:wave-turn-1",
      seed: "battle-turn-timeline",
      rngAlgorithmVersion: 1,
      before: {
        phase: "ally_action",
        battleTurn: 1,
        waveTurn: 1,
      },
      after: {
        phase: "ally_action",
        battleTurn: 2,
        waveTurn: 2,
      },
      stopReason: "turn_complete",
    });
    expect(
      log.records.map((record) =>
        record.recordType === "action_batch"
          ? record.batch.kind
          : `${record.side}_turn_end`
      ),
    ).toEqual([
      "ally_command",
      "ally_turn_end",
      "enemy_turn",
      "enemy_turn_end",
    ]);
    expect(log.rngBefore.damage.drawCount).toBe(0);
    expect(log.rngAfter).toEqual(first.rng.snapshot().streams);
    expect(second.result.battleLog).toEqual(log);
    expect(JSON.parse(JSON.stringify(log))).toEqual(log);
  });

  it("records recurring settlement, duration expiry, cooldowns, and turn-end RNG", () => {
    let counters = createEffectRuntimeCounters();
    let applied = applyEffect(
      unit("ally-a", "ally", {
        hp: 5_000,
        skillCooldowns: [2, 0, 1],
      }),
      {
        stableId: "recurring-heal",
        name: "Recurring Heal",
        effectType: "recurring-heal",
        category: "buff",
        remainingTurns: 1,
        trigger: {
          timing: "turn_end",
          activationRatePermille: 1_000,
          actions: [
            {
              target: { relation: "self", selection: "single" },
              action: { kind: "heal_hp", amount: 1_000 },
              turnEndSettlement: "recurring_hp_recovery",
            },
          ],
        },
      },
      "ally-a",
      counters,
    );
    counters = applied.counters;
    applied = applyEffect(
      applied.unit,
      {
        stableId: "probability-only",
        name: "Probability Only",
        effectType: "probability-only",
        category: "buff",
        remainingTurns: 2,
        trigger: {
          timing: "turn_end",
          activationRatePermille: 500,
        },
      },
      "ally-a",
      counters,
    );
    counters = applied.counters;
    const state = battle({
      allyA: applied.unit,
      enemyA: unit("enemy-a", "enemy", {
        hp: 1_000_000,
        maxHp: 1_000_000,
        baseMaxHp: 1_000_000,
      }),
      mysticCodeCooldowns: [2, 1, 0],
    });
    const result = resolveBattleTurn({
      state,
      selection: selection(state),
      registry: allyRegistry(),
      rng: new BattleRng("turn-end-detail-log"),
      counters,
    });
    const allyEnd = result.battleLog.records.find(
      (record) =>
        record.recordType === "turn_end"
        && record.side === "ally",
    );
    if (!allyEnd || allyEnd.recordType !== "turn_end") {
      throw new Error("missing ally turn-end log");
    }

    expect(allyEnd.activations[0]).toMatchObject({
      owner: { instanceId: "ally-a" },
      effectStableId: "recurring-heal",
      outcome: "activated",
      actions: [
        {
          actionKind: "heal_hp",
          deferredSettlement: "recurring_hp_recovery",
          targetInstanceIds: ["ally-a"],
        },
      ],
    });
    expect(allyEnd.hpSettlements[0]).toMatchObject({
      target: { instanceId: "ally-a" },
      result: {
        outcome: "healed",
        totalBaseRecovery: 1_000,
        hpBefore: 5_000,
        hpAfter: 6_000,
        hpChange: 1_000,
      },
    });
    expect(
      allyEnd.hpSettlements[0].recoveryContributions[0],
    ).not.toHaveProperty("slipDamageKind");
    expect(allyEnd.hpSettlements[0].result).not.toHaveProperty(
      "slipDamageCategories",
    );
    expect(allyEnd.durations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: expect.objectContaining({
            instanceId: "ally-a",
          }),
          removed: [
            expect.objectContaining({
              effectStableId: "recurring-heal",
              reason: "expired_turns",
            }),
          ],
        }),
      ]),
    );
    expect(allyEnd.cooldowns).toMatchObject({
      units: [
        expect.objectContaining({
          unit: expect.objectContaining({
            instanceId: "ally-a",
          }),
          before: [2, 0, 1],
          after: [1, 0, 0],
        }),
        expect.anything(),
        expect.anything(),
      ],
      mysticCodeBefore: [2, 1, 0],
      mysticCodeAfter: [1, 0, 0],
    });
    expect(allyEnd.rngEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stream: "effects",
          operation: "chance",
          ratePermille: 1_000,
          drawsConsumed: 0,
        }),
        expect.objectContaining({
          stream: "effects",
          operation: "chance",
          ratePermille: 500,
          drawsConsumed: 1,
        }),
      ]),
    );
    expect(JSON.parse(JSON.stringify(result.battleLog))).toEqual(
      result.battleLog,
    );
  });

  it("records each confirmed turn-end star addition and presents only saved values", () => {
    let counters = createEffectRuntimeCounters();
    let applied = applyEffect(
      unit("ally-a", "ally"),
      {
        stableId: "ally-end-stars",
        name: "味方終了時スター",
        effectType: "ally-end-stars",
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
      },
      "ally-a",
      counters,
    );
    const allyA = applied.unit;
    counters = applied.counters;
    applied = applyEffect(
      unit("enemy-a", "enemy", {
        hp: 1_000_000,
        maxHp: 1_000_000,
        baseMaxHp: 1_000_000,
        enemyAction: enemyAction(),
      }),
      {
        stableId: "enemy-end-stars",
        name: "敵終了時スター",
        effectType: "enemy-end-stars",
        category: "buff",
        trigger: {
          timing: "turn_end",
          actions: [{
            target: { relation: "self", selection: "single" },
            action: {
              kind: "gain_stars",
              amount: 7,
              destination: "next_command",
            },
          }],
        },
      },
      "enemy-a",
      counters,
    );
    counters = applied.counters;
    const state = {
      ...battle({ allyA, enemyA: applied.unit }),
      commandStars: 3,
      nextCommandStars: 87,
    };
    const result = resolveBattleTurn({
      state,
      selection: selection(state),
      registry: allyRegistry(),
      rng: new BattleRng("turn-end-star-log"),
      counters,
    });
    const turnEnds = result.battleLog.records.filter(
      (record) => record.recordType === "turn_end",
    );

    expect(turnEnds).toHaveLength(2);
    expect(turnEnds.map((record) =>
      record.recordType === "turn_end"
        ? record.activations[0].actions[0].starAddition
        : null
    )).toEqual([
      {
        bucket: "next_command",
        requested: 10,
        before: 88,
        added: 10,
        after: 98,
        overflow: 0,
      },
      {
        bucket: "next_command",
        requested: 7,
        before: 98,
        added: 1,
        after: 99,
        overflow: 6,
      },
    ]);
    expect(result.state).toMatchObject({
      phase: "ally_action",
      commandStars: 99,
      nextCommandStars: 0,
    });

    const savedOnly = structuredClone(result.battleLog);
    const savedEnemyEnd = savedOnly.records.find(
      (record) => record.recordType === "turn_end" && record.side === "enemy",
    );
    if (!savedEnemyEnd || savedEnemyEnd.recordType !== "turn_end") {
      throw new Error("missing saved enemy turn-end log");
    }
    const savedAddition = savedEnemyEnd.activations[0].actions[0].starAddition;
    if (!savedAddition) throw new Error("missing saved star addition");
    Object.assign(savedAddition, {
      requested: 40,
      before: 41,
      added: 2,
      after: 43,
      overflow: 38,
    });
    const summary = summarizeBattleTurnLogs([savedOnly]).find(
      ({ kind, title }) => kind === "turn_end" && title === "敵ターン終了",
    );
    expect(summary?.changes).toContain(
      "enemy-a：次回用スター 41→43（要求40・獲得2・上限超過38）",
    );
  });

  it("records amplified slip details and presents only the saved confirmed values", () => {
    let counters = createEffectRuntimeCounters();
    let applied = applyEffect(
      unit("ally-a", "ally", { hp: 5_000 }),
      {
        stableId: "spread-55",
        name: "延焼",
        effectType: "spread-of-fire",
        category: "debuff",
        classifications: ["spread_of_fire"],
        value: 550,
        remainingTurns: 2,
        slipDamageAmplifierKind: "spread_of_fire",
      },
      "enemy-a",
      counters,
    );
    counters = applied.counters;
    applied = applyEffect(
      applied.unit,
      {
        stableId: "burn-550",
        name: "やけど",
        effectType: "burn",
        category: "debuff",
        classifications: ["burn"],
        remainingTurns: 2,
        trigger: {
          timing: "turn_end",
          actions: [{
            target: { relation: "self", selection: "single" },
            action: { kind: "reduce_hp", amount: 550, canDefeat: false },
            turnEndSettlement: "slip_damage",
            slipDamageKind: "burn",
          }],
        },
      },
      "enemy-a",
      counters,
    );
    counters = applied.counters;
    const result = resolveBattleTurn({
      state: battle({
        allyA: applied.unit,
        enemyA: unit("enemy-a", "enemy", {
          hp: 1_000_000,
          maxHp: 1_000_000,
          baseMaxHp: 1_000_000,
        }),
      }),
      selection: selection(battle({ allyA: applied.unit })),
      registry: allyRegistry(),
      rng: new BattleRng("amplified-slip-log"),
      counters,
    });
    const allyEnd = result.battleLog.records.find(
      (record) => record.recordType === "turn_end" && record.side === "ally",
    );
    if (!allyEnd || allyEnd.recordType !== "turn_end") {
      throw new Error("missing amplified slip turn-end log");
    }
    expect(allyEnd.hpSettlements[0]).toMatchObject({
      slipDamageContributions: [{
        amount: 550,
        slipDamageKind: "burn",
        amplifierPermille: 550,
        categoryBaseAmount: 550,
        categoryResolvedDamage: 852,
      }],
      result: {
        totalSlipDamage: 852,
        slipDamageCategories: [{
          kind: "burn",
          baseAmount: 550,
          resolvedDamage: 852,
        }],
      },
    });

    const savedOnly = structuredClone(result.battleLog);
    const savedEnd = savedOnly.records.find(
      (record) => record.recordType === "turn_end" && record.side === "ally",
    );
    if (!savedEnd || savedEnd.recordType !== "turn_end") {
      throw new Error("missing saved turn-end log");
    }
    savedEnd.hpSettlements[0].slipDamageContributions[0].categoryResolvedDamage = 123;
    savedEnd.hpSettlements[0].result.totalSlipDamage = 456;
    const summary = summarizeBattleTurnLogs([{ ...savedOnly }]).find(
      ({ kind, title }) => kind === "turn_end" && title === "味方ターン終了",
    );
    expect(summary?.changes).toEqual(expect.arrayContaining([
      expect.stringContaining("確定123"),
      expect.stringContaining("スリップ合計456"),
    ]));
  });

  it("records break settlement and its on-break trigger at ally turn end", () => {
    const state = battle({
      enemyA: unit("enemy-a", "enemy", {
        remainingBreakGauges: [{ maxHp: 8_000 }],
      }),
    });
    const enemy = findUnitLocation(
      state.formation,
      "enemy-a",
    )?.unit;
    if (!enemy) throw new Error("missing break test enemy");
    const lethal = resolveLethalHp({ ...enemy, hp: 0 });
    if (lethal.outcome !== "break_pending") {
      throw new Error("enemy did not enter break pending");
    }
    const pending = setBattleFormation(
      state,
      replaceUnit(state.formation, lethal.unit),
    );
    const result = resolveBattleTurn({
      state: pending,
      selection: selection(pending),
      registry: createBattleAttackDataRegistry([]),
      rng: new BattleRng("turn-end-break-log"),
    });
    const allyEnd = result.battleLog.records.find(
      (record) =>
        record.recordType === "turn_end"
        && record.side === "ally",
    );
    if (!allyEnd || allyEnd.recordType !== "turn_end") {
      throw new Error("missing ally turn-end log");
    }

    expect(allyEnd.breaks).toEqual([
      expect.objectContaining({
        enemy: expect.objectContaining({
          instanceId: "enemy-a",
          dataId: "enemy-a",
        }),
        brokenGaugeNumber: 1,
        activatedGaugeNumber: 2,
        maxHp: 8_000,
        remainingGaugeCount: 0,
        trigger: expect.objectContaining({
          timing: "on_break",
        }),
      }),
    ]);
    expect(
      findUnitLocation(result.state.formation, "enemy-a")?.unit,
    ).toMatchObject({
      hp: 8_000,
      hpGaugeNumber: 2,
      breakPending: false,
    });
  });

  it("records the incoming formation when ally turn end advances a Wave", () => {
    const state = battle({
      enemyA: unit("enemy-a", "enemy", {
        hp: 1,
        maxHp: 1,
        baseMaxHp: 1,
      }),
      secondWave: true,
    });
    const result = resolveBattleTurn({
      state,
      selection: selection(state),
      registry: allyRegistry(),
      rng: new BattleRng("wave-transition-log"),
    });
    const allyEnd = result.battleLog.records.at(-1);

    expect(result.battleLog.records).toHaveLength(2);
    expect(allyEnd).toMatchObject({
      recordType: "turn_end",
      side: "ally",
      checkpoint: {
        kind: "wave_advanced",
        battleOutcome: "ongoing",
        battleTurnBefore: 1,
        battleTurnAfter: 2,
        waveTurnBefore: 1,
        waveTurnAfter: 1,
        waveTransition: {
          fromWaveNumber: 1,
          toWaveNumber: 2,
          incomingEnemies: [
            {
              area: "frontline",
              index: 0,
              unit: {
                instanceId: "enemy-b",
                dataId: "enemy-b",
              },
            },
          ],
        },
      },
    });
  });

  it("records final victory at the ally turn-end checkpoint", () => {
    const state = battle({
      enemyA: unit("enemy-a", "enemy", {
        hp: 1,
        maxHp: 1,
        baseMaxHp: 1,
      }),
    });
    const result = resolveBattleTurn({
      state,
      selection: selection(state),
      registry: allyRegistry(),
      rng: new BattleRng("victory-checkpoint-log"),
    });

    expect(result.battleLog.records).toHaveLength(2);
    expect(result.battleLog.records.at(-1)).toMatchObject({
      recordType: "turn_end",
      side: "ally",
      after: { phase: "finished", outcome: "victory" },
      checkpoint: {
        kind: "battle_finished",
        battleOutcome: "victory",
        waveTransition: null,
      },
    });
  });
});
