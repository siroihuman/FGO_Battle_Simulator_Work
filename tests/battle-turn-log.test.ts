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
