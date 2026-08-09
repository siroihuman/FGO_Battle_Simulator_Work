import { describe, expect, it } from "vitest";
import {
  createBattleAttackDataRegistry,
} from "../src/core/battle/actionData";
import {
  createBattleLoop,
  resolveBattleLoopTurn,
} from "../src/core/battle/loop";
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

function createLoop(seed = "battle-loop"): ReturnType<typeof createBattleLoop> {
  return createBattleLoop({
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
  });
}

function registry() {
  return createBattleAttackDataRegistry([
    ...["ally-a", "ally-b", "ally-c"].map((instanceId) =>
      combatantData(instanceId, instanceId, {
        attack: 10_000,
        starRatePermille: 0,
        commandCardHitWeights: [[1], [1], [1], [1], [1]],
        extraAttackHitWeights: [1],
      }),
    ),
  ]);
}

function firstThreeCardIds(
  loop: ReturnType<typeof createBattleLoop>,
): string[] {
  return loop.state.commandDeck.currentHand
    .slice(0, 3)
    .map(({ cardId }) => cardId);
}

describe("complete battle loop", () => {
  it("distributes the initial hand and leaves invalid card input at the same boundary", () => {
    const loop = createLoop();
    const before = loop.rng.snapshot();

    expect(loop.state.commandDeck.currentHand).toHaveLength(5);
    expect(before.streams.cards.drawCount).toBe(5);

    const result = resolveBattleLoopTurn(loop, {
      cardIds: firstThreeCardIds(loop).slice(0, 2),
      registry: registry(),
    });

    expect(result).toMatchObject({
      accepted: false,
      selection: { reason: "wrong_card_count" },
    });
    expect(result.loop).toBe(loop);
    expect(loop.rng.snapshot()).toEqual(before);
  });

  it("connects distribution, one complete turn, and the next input boundary", () => {
    const loop = createLoop();
    const firstHandIds = loop.state.commandDeck.currentHand.map(
      ({ cardId }) => cardId,
    );

    const result = resolveBattleLoopTurn(loop, {
      cardIds: firstThreeCardIds(loop),
      registry: registry(),
    });

    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.resolution.stopReason).toBe("turn_complete");
    expect(result.nextHand).not.toBeNull();
    expect(result.loop.state).toMatchObject({
      phase: "ally_action",
      outcome: "ongoing",
      battleTurn: 2,
      waveTurn: 2,
      commandDeck: { drawsInCycle: 2 },
    });
    expect(result.loop.state.commandDeck.currentHand).toHaveLength(5);
    expect(
      result.loop.state.commandDeck.currentHand.some(({ cardId }) =>
        firstHandIds.includes(cardId),
      ),
    ).toBe(false);
    expect(result.loop.rng.snapshot().streams.cards.drawCount).toBe(10);
  });

  it("reproduces hands, state, and all RNG positions for the same seed and selections", () => {
    const first = createLoop("replayable-loop");
    const second = createLoop("replayable-loop");
    expect(first.state.commandDeck.currentHand).toEqual(
      second.state.commandDeck.currentHand,
    );

    const firstResult = resolveBattleLoopTurn(first, {
      cardIds: firstThreeCardIds(first),
      registry: registry(),
    });
    const secondResult = resolveBattleLoopTurn(second, {
      cardIds: firstThreeCardIds(second),
      registry: registry(),
    });
    expect(firstResult.accepted).toBe(true);
    expect(secondResult.accepted).toBe(true);
    if (!firstResult.accepted || !secondResult.accepted) return;

    expect(firstResult.loop.state).toEqual(secondResult.loop.state);
    expect(firstResult.loop.rng.snapshot()).toEqual(
      secondResult.loop.rng.snapshot(),
    );
  });
});
