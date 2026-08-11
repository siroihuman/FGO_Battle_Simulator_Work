import { describe, expect, it } from "vitest";
import {
  createBattleAttackDataRegistry,
} from "../src/core/battle/actionData";
import {
  createBattleSession,
  createBattleSuspendSave,
  parseBattleSuspendSave,
  replayBattleSession,
  resolveBattleSessionTurn,
  restoreBattleSession,
  serializeBattleSuspendSave,
} from "../src/core/battle/session";
import { createBattleState } from "../src/core/battle/state";
import type { EnemyActionState } from "../src/core/battle/types";
import { BattleRng } from "../src/core/rng";
import {
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import { combatantData } from "./helpers/attackData";
import { unit } from "./helpers/battle";

function enemyAction(): EnemyActionState {
  return {
    maxActions: 1,
    normalAttack: null,
    skills: [],
    noblePhantasm: null,
    charge: 0,
    chargeMax: 0,
  };
}

function registry() {
  return createBattleAttackDataRegistry(
    ["ally-a", "ally-b", "ally-c"].map((instanceId) =>
      combatantData(instanceId, instanceId, {
        attack: 10_000,
        starRatePermille: 0,
        commandCardHitWeights: [[1], [1], [1], [1], [1]],
        extraAttackHitWeights: [1],
      })
    ),
  );
}

function createSession(seed = "battle-session") {
  return createBattleSession({
    state: createBattleState({
      ally: {
        frontline: [
          unit("ally-a", "ally"),
          unit("ally-b", "ally"),
          unit("ally-c", "ally"),
        ],
        reserve: [],
      },
      waves: [{
        enemy: {
          frontline: [
            unit("enemy-a", "enemy", {
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
      }],
      enemyFrontlineLimit: 3,
    }),
    rng: new BattleRng(seed),
    registry: registry(),
  });
}

function firstThreeCardIds(session: ReturnType<typeof createSession>): string[] {
  return session.loop.state.commandDeck.currentHand
    .slice(0, 3)
    .map(({ cardId }) => cardId);
}

describe("battle session persistence and replay", () => {
  it("accumulates completed turn logs while retaining rejected input in replay history", () => {
    let session = createSession();
    const rejected = resolveBattleSessionTurn(session, {
      cardIds: firstThreeCardIds(session).slice(0, 2),
    });
    session = rejected.session;

    expect(rejected.result).toMatchObject({
      accepted: false,
      selection: { reason: "wrong_card_count" },
    });
    expect(session.operationHistory).toHaveLength(1);
    expect(session.turnLogs).toHaveLength(0);

    const accepted = resolveBattleSessionTurn(session, {
      cardIds: firstThreeCardIds(session),
    });
    session = accepted.session;
    expect(accepted.result.accepted).toBe(true);
    expect(session.operationHistory).toHaveLength(2);
    expect(session.turnLogs).toHaveLength(1);
    expect(session.turnLogs[0]).toMatchObject({
      schemaVersion: 2,
      seed: "battle-session",
      before: { battleTurn: 1 },
      after: { battleTurn: 2 },
    });
  });

  it("restores the exact input boundary and continues with identical state, logs, and RNG", () => {
    let uninterrupted = createSession("suspend-and-resume");
    uninterrupted = resolveBattleSessionTurn(uninterrupted, {
      cardIds: firstThreeCardIds(uninterrupted),
    }).session;
    const serialized = serializeBattleSuspendSave(uninterrupted);
    const save = parseBattleSuspendSave(serialized);
    let resumed = restoreBattleSession(save);

    expect(JSON.parse(serialized)).toEqual(save);
    expect(resumed.loop.state).toEqual(uninterrupted.loop.state);
    expect(resumed.loop.rng.snapshot()).toEqual(uninterrupted.loop.rng.snapshot());
    expect(resumed.turnLogs).toEqual(uninterrupted.turnLogs);

    const uninterruptedNext = resolveBattleSessionTurn(uninterrupted, {
      cardIds: firstThreeCardIds(uninterrupted),
    });
    const resumedNext = resolveBattleSessionTurn(resumed, {
      cardIds: firstThreeCardIds(resumed),
    });
    uninterrupted = uninterruptedNext.session;
    resumed = resumedNext.session;

    expect(uninterruptedNext.result.accepted).toBe(true);
    expect(resumedNext.result.accepted).toBe(true);
    expect(resumed.loop.state).toEqual(uninterrupted.loop.state);
    expect(resumed.loop.rng.snapshot()).toEqual(uninterrupted.loop.rng.snapshot());
    expect(resumed.turnLogs).toEqual(uninterrupted.turnLogs);
  });

  it("replays initial settings and all recorded operations without recomputing saved logs", () => {
    let session = createSession("saved-replay");
    session = resolveBattleSessionTurn(session, {
      cardIds: firstThreeCardIds(session).slice(0, 2),
    }).session;
    session = resolveBattleSessionTurn(session, {
      cardIds: firstThreeCardIds(session),
    }).session;
    session = resolveBattleSessionTurn(session, {
      cardIds: firstThreeCardIds(session),
    }).session;
    const save = createBattleSuspendSave(session);
    const replayed = replayBattleSession(save);

    expect(replayed.loop.state).toEqual(session.loop.state);
    expect(replayed.loop.rng.snapshot()).toEqual(session.loop.rng.snapshot());
    expect(replayed.operationHistory).toEqual(session.operationHistory);
    expect(replayed.turnLogs).toEqual(session.turnLogs);
    expect(save).toMatchObject({
      kind: "battle_suspend",
      schemaVersion: 4,
      specVersion: "1.0.0",
      dataSchemaVersion: "1.38.0",
      rngAlgorithmVersion: 1,
      battleLogSchemaVersion: 5,
      battleTurnLogSchemaVersion: 2,
    });
  });

  it("directly restores amplified slip once and replays state, counters, six RNG streams, and exact logs", () => {
    let counters = createEffectRuntimeCounters();
    let applied = applyEffect(
      unit("ally-a", "ally", { hp: 5_000 }),
      {
        stableId: "saved-spread",
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
        stableId: "saved-burn",
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
    let session = createBattleSession({
      state: createBattleState({
        ally: {
          frontline: [
            applied.unit,
            unit("ally-b", "ally"),
            unit("ally-c", "ally"),
          ],
          reserve: [],
        },
        waves: [{
          enemy: {
            frontline: [
              unit("enemy-a", "enemy", {
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
        }],
        enemyFrontlineLimit: 3,
      }),
      rng: new BattleRng("saved-amplified-slip"),
      registry: registry(),
      counters,
    });
    session = resolveBattleSessionTurn(session, {
      cardIds: firstThreeCardIds(session),
    }).session;
    const save = parseBattleSuspendSave(
      serializeBattleSuspendSave(session),
    );
    const restored = restoreBattleSession(save);
    const replayed = replayBattleSession(save);

    expect(save).toMatchObject({
      schemaVersion: 4,
      dataSchemaVersion: "1.38.0",
      battleTurnLogSchemaVersion: 2,
    });
    expect(restored.loop.state).toEqual(session.loop.state);
    expect(restored.turnLogs).toEqual(session.turnLogs);
    expect(restored.loop.state.formation.ally.frontline[0]?.hp).toBe(4_148);
    expect(replayed.loop.state).toEqual(session.loop.state);
    expect(replayed.loop.counters).toEqual(session.loop.counters);
    expect(replayed.loop.rng.snapshot()).toEqual(session.loop.rng.snapshot());
    expect(Object.keys(replayed.loop.rng.snapshot().streams)).toHaveLength(6);
    expect(replayed.turnLogs).toEqual(session.turnLogs);
    expect(createBattleSuspendSave(restored)).toEqual(save);
  });

  it("restores turn-end stars without rerunning them and replays exact state, counters, RNG, and logs", () => {
    let counters = createEffectRuntimeCounters();
    let applied = applyEffect(
      unit("ally-a", "ally"),
      {
        stableId: "saved-ally-end-stars",
        name: "保存対象・味方終了時スター",
        effectType: "saved-ally-end-stars",
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
        stableId: "saved-enemy-end-stars",
        name: "保存対象・敵終了時スター",
        effectType: "saved-enemy-end-stars",
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
    const initialState = {
      ...createBattleState({
        ally: {
          frontline: [
            allyA,
            unit("ally-b", "ally"),
            unit("ally-c", "ally"),
          ],
          reserve: [],
        },
        waves: [{
          enemy: {
            frontline: [applied.unit, null, null],
            reserve: [],
          },
        }],
        enemyFrontlineLimit: 3,
      }),
      nextCommandStars: 88,
    };
    let session = createBattleSession({
      state: initialState,
      rng: new BattleRng("saved-turn-end-stars"),
      registry: registry(),
      counters,
    });
    session = resolveBattleSessionTurn(session, {
      cardIds: firstThreeCardIds(session),
    }).session;
    const save = parseBattleSuspendSave(
      serializeBattleSuspendSave(session),
    );
    const restored = restoreBattleSession(save);
    const replayed = replayBattleSession(save);

    expect(save).toMatchObject({
      schemaVersion: 4,
      dataSchemaVersion: "1.38.0",
      battleLogSchemaVersion: 5,
      battleTurnLogSchemaVersion: 2,
    });
    expect(session.loop.state).toMatchObject({
      commandStars: 99,
      nextCommandStars: 0,
    });
    expect(restored.loop.state).toEqual(session.loop.state);
    expect(restored.loop.counters).toEqual(session.loop.counters);
    expect(restored.loop.rng.snapshot()).toEqual(session.loop.rng.snapshot());
    expect(restored.turnLogs).toEqual(session.turnLogs);
    expect(restored.turnLogs).toHaveLength(1);
    expect(replayed.loop.state).toEqual(session.loop.state);
    expect(replayed.loop.counters).toEqual(session.loop.counters);
    expect(replayed.loop.rng.snapshot()).toEqual(session.loop.rng.snapshot());
    expect(Object.keys(replayed.loop.rng.snapshot().streams)).toHaveLength(6);
    expect(replayed.turnLogs).toEqual(session.turnLogs);
    expect(createBattleSuspendSave(restored)).toEqual(save);
  });

  it("rejects function-based AI before it can change state or RNG", () => {
    const session = createSession("unsupported-selector");
    const before = session.loop.rng.snapshot();

    expect(() => resolveBattleSessionTurn(session, {
      cardIds: firstThreeCardIds(session),
      enemy: {
        normalSelector: (() => ({ kind: "normal_attack" })) as never,
      },
    })).toThrow("cannot be saved or replayed");
    expect(session.loop.rng.snapshot()).toEqual(before);
    expect(session.operationHistory).toHaveLength(0);
    expect(session.turnLogs).toHaveLength(0);
  });

  it("rejects an incompatible version instead of silently resuming a different format", () => {
    const save = createBattleSuspendSave(createSession("versioned-save"));
    const incompatible = {
      ...save,
      schemaVersion: 0,
    };

    expect(() => restoreBattleSession(incompatible as never)).toThrow(
      "unsupported battle suspend schema version",
    );
  });
});
