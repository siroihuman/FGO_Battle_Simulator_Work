import { describe, expect, it } from "vitest";
import {
  resolveEnemyAttacks,
} from "../src/ai/enemyAttack";
import {
  createBattleAttackDataRegistry,
} from "../src/core/battle/actionData";
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
  resolveAllyCommandAttacks,
} from "../src/core/cards/commandAttack";
import {
  selectCommandCards,
  type CommandCardSelection,
} from "../src/core/cards/selection";
import { combatantData } from "./helpers/attackData";
import { unit } from "./helpers/battle";

// Canonical battle-log requirements:
// docs/specs/BATTLE_SYSTEM.md, CALCULATIONS_AND_RNG.md, and
// UI_AND_STORAGE.md (checked 2026-08-03).

function enemyAction(maxActions: 1 | "auto" = 1): EnemyActionState {
  return {
    maxActions,
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

function allyBattle(): BattleState {
  const state = createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally", {
          name: "Ally A",
          commandCards: [
            "buster",
            "buster",
            "buster",
            "arts",
            "quick",
          ],
        }),
        unit("ally-b", "ally"),
        unit("ally-c", "ally"),
      ],
      reserve: [],
    },
    waves: [
      {
        enemy: {
          frontline: [
            unit("enemy-a", "enemy", {
              name: "Enemy A",
              hp: 1,
              maxHp: 1,
              baseMaxHp: 1,
            }),
            unit("enemy-b", "enemy", {
              name: "Enemy B",
              hp: 1_000_000,
              maxHp: 1_000_000,
              baseMaxHp: 1_000_000,
            }),
            null,
          ],
          reserve: [
            unit("enemy-c", "enemy", {
              name: "Enemy C",
              hp: 1_000_000,
              maxHp: 1_000_000,
              baseMaxHp: 1_000_000,
            }),
          ],
        },
      },
    ],
    enemyFrontlineLimit: 3,
    enemyReplacementMode: "immediate",
  });
  const allyCards = state.commandDeck.sourceCards.filter(
    ({ ownerInstanceId }) => ownerInstanceId === "ally-a",
  );
  return {
    ...state,
    commandDeck: {
      ...state.commandDeck,
      currentHand: allyCards,
    },
  };
}

function selection(state: BattleState): CommandCardSelection {
  const selected = selectCommandCards(
    state,
    state.commandDeck.currentHand
      .slice(0, 3)
      .map(({ cardId }) => cardId),
  );
  if (!selected.accepted) {
    throw new Error(`selection rejected: ${selected.reason}`);
  }
  return selected.selection;
}

function resolveAllyLog(seed: string) {
  const state = allyBattle();
  const rng = new BattleRng(seed);
  return resolveAllyCommandAttacks({
    state,
    selection: selection(state),
    registry: createBattleAttackDataRegistry([
      combatantData("ally-a", "ally-a", {
        attack: 10_000,
        starRatePermille: 0,
        commandCardHitWeights: [
          [1],
          [1],
          [1],
          [1],
          [1],
        ],
        extraAttackHitWeights: [1],
      }),
    ]),
    rng: {
      effects: rng.stream("effects"),
      critical: rng.stream("critical"),
      damage: rng.stream("damage"),
      stars: rng.stream("stars"),
    },
  });
}

function enemyBattle(): BattleState {
  const state = createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally"),
        unit("ally-b", "ally"),
        unit("ally-c", "ally"),
      ],
      reserve: [],
    },
    waves: [
      {
        enemy: {
          frontline: [
            unit("enemy-a", "enemy", {
              enemyAction: enemyAction(),
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

describe("versioned battle action log", () => {
  it("records Hits, trigger order, immediate replacement, and rear-slot retargeting", () => {
    const result = resolveAllyLog("battle-log-ally");
    const log = result.battleLog;
    const first = log.entries[0];

    expect(log).toMatchObject({
      schemaVersion: 4,
      kind: "ally_command",
      status: "completed",
      context: {
        waveNumber: 1,
        battleTurn: 1,
        waveTurn: 1,
        phase: "ally_action",
      },
    });
    expect(log.setupRngEvents.length).toBeGreaterThan(0);
    expect(first).toMatchObject({
      entryId:
        "wave-1:battle-turn-1:wave-turn-1:ally_command:action-1",
      actor: {
        instanceId: "ally-a",
        name: "Ally A",
      },
      action: {
        kind: "normal_command",
        stage: "selected",
        sequence: 1,
        cardType: "buster",
      },
      outcome: {
        status: "resolved",
        reasons: [],
      },
      targetsAtStart: [
        { instanceId: "enemy-a", name: "Enemy A" },
      ],
      attack: {
        stoppedBeforeHits: false,
        totalActualHpLoss: 1,
        targets: [
          {
            target: { instanceId: "enemy-a" },
            hpBefore: 1,
            hpAfter: 0,
            actualHpLoss: 1,
          },
        ],
      },
      boundary: {
        enemyDepartures: [
          {
            area: "frontline",
            index: 0,
            unit: { instanceId: "enemy-a" },
          },
        ],
        enemyArrivals: [
          {
            frontlineIndex: 0,
            reserveIndexBefore: 0,
            unit: { instanceId: "enemy-c", name: "Enemy C" },
          },
        ],
        targetTransition: {
          outcome: "retargeted",
          previous: {
            instanceId: "enemy-a",
            frontlineIndex: 0,
          },
          next: {
            instanceId: "enemy-b",
            frontlineIndex: 1,
          },
        },
      },
    });
    expect(first?.attack?.hits[0]?.survival?.outcome).toBe(
      "defeated",
    );
    expect(
      first?.attack?.triggerStages.map(({ timing }) => timing),
    ).toEqual([
      "before_attack",
      "on_hit",
      "on_attack",
      "on_damage_taken",
      "after_attack",
      "on_death",
    ]);
    expect(first?.rngEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stream: "damage",
          operation: "integer",
          minimum: 900,
          maximum: 1099,
          drawsConsumed: 1,
        }),
        expect.objectContaining({
          stream: "critical",
          operation: "chance",
          ratePermille: 0,
          roll: null,
          drawsConsumed: 0,
          succeeded: false,
        }),
      ]),
    );
  });

  it("is JSON-safe and exactly reproducible from a fixed seed", () => {
    const first = resolveAllyLog("battle-log-replay").battleLog;
    const second = resolveAllyLog("battle-log-replay").battleLog;

    expect(second).toEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it("records typed enemy skips and AI draw values without attack RNG", () => {
    const state = enemyBattle();
    const rng = new BattleRng("battle-log-enemy-skip");
    const result = resolveEnemyAttacks({
      state,
      priorityRequests: [],
      registry: createBattleAttackDataRegistry([]),
      rng: {
        effects: rng.stream("effects"),
        damage: rng.stream("damage"),
        stars: rng.stream("stars"),
      },
      aiRng: rng.stream("ai"),
      normalSelector: () => {
        rng.stream("ai").nextIntInclusive(1, 2);
        return { kind: "normal_attack" };
      },
    });
    const entry = result.battleLog.entries[0];

    expect(result.battleLog).toMatchObject({
      kind: "enemy_turn",
      context: { phase: "enemy_action" },
      stopReason: "sequence_complete",
    });
    expect(entry).toMatchObject({
      action: {
        kind: "enemy_normal_attack",
        stage: "normal",
      },
      outcome: {
        status: "skipped",
        reasons: ["source_attack_data_missing"],
        resolverCalled: false,
      },
      attack: null,
      rngEvents: [
        {
          eventNumber: 1,
          stream: "ai",
          operation: "integer",
          drawNumberStart: 1,
          drawNumberEnd: 1,
          drawsConsumed: 1,
          minimum: 1,
          maximum: 2,
          value: expect.any(Number),
        },
      ],
    });
    expect(rng.stream("effects").snapshot().drawCount).toBe(0);
    expect(rng.stream("damage").snapshot().drawCount).toBe(0);
    expect(rng.stream("stars").snapshot().drawCount).toBe(0);
  });
});
