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
