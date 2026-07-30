import { describe, expect, it } from "vitest";
import {
  resolveEnemyTurnSequence,
} from "../src/ai/enemyTurnCoordinator";
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
  EnemyActionState,
} from "../src/core/battle/types";
import {
  resolveAllyTurnEnd,
  resolveEnemyTurnEnd,
} from "../src/core/battle/turnEndCoordinator";
import { BattleRng } from "../src/core/rng";
import {
  selectCommandCards,
  type CommandCardSelection,
} from "../src/core/cards/selection";
import {
  resolveAllyCommandSequence,
} from "../src/core/cards/turnCoordinator";
import {
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import { unit } from "./helpers/battle";

// Canonical behavior:
// docs/specs/BATTLE_SYSTEM.md and docs/PROJECT_RULES.md (checked 2026-07-30).

function enemyAction(): EnemyActionState {
  return {
    maxActions: "auto",
    normalAttack: {
      stableId: "enemy-normal",
      name: "enemy-normal",
    },
    skills: [],
    noblePhantasm: null,
    charge: 0,
    chargeMax: 0,
  };
}

function battle(): BattleState {
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
  const cards = state.commandDeck.sourceCards.slice(0, 5);
  return {
    ...state,
    commandDeck: {
      ...state.commandDeck,
      currentHand: cards,
    },
  };
}

function selection(state: BattleState): CommandCardSelection {
  const selected = selectCommandCards(
    state,
    state.commandDeck.currentHand.slice(0, 3).map(
      ({ cardId }) => cardId,
    ),
  );
  if (!selected.accepted) {
    throw new Error(`selection rejected: ${selected.reason}`);
  }
  return selected.selection;
}

function defeat(
  state: BattleState,
  ...instanceIds: string[]
): BattleState {
  let formation = state.formation;
  for (const instanceId of instanceIds) {
    const location = findUnitLocation(formation, instanceId);
    if (!location) throw new Error(`missing unit: ${instanceId}`);
    formation = replaceUnit(formation, {
      ...location.unit,
      hp: 0,
      alive: false,
    });
  }
  return setBattleFormation(state, formation);
}

describe("full turn sequence skeleton", () => {
  it("connects ally cards, both turn ends, enemy actions, and the next ally turn", () => {
    const initial = battle();
    const rng = new BattleRng("full-turn-sequence").stream(
      "effects",
    );
    const counters = createEffectRuntimeCounters();
    const ally = resolveAllyCommandSequence(
      initial,
      selection(initial),
      (input) => ({ state: input.state }),
    );
    expect(ally.accepted).toBe(true);
    if (!ally.accepted) return;
    expect(ally.result.state.phase).toBe("ally_turn_end");

    const allyEnd = resolveAllyTurnEnd(
      ally.result.state,
      counters,
      rng,
    );
    expect(allyEnd.state.phase).toBe("enemy_action");

    const enemy = resolveEnemyTurnSequence(
      allyEnd.state,
      [],
      (input) => ({ state: input.state }),
    );
    expect(enemy.actions).toHaveLength(3);
    expect(enemy.state.phase).toBe("enemy_turn_end");

    const enemyEnd = resolveEnemyTurnEnd(
      enemy.state,
      allyEnd.counters,
      rng,
    );
    expect(enemyEnd.state).toMatchObject({
      phase: "ally_action",
      outcome: "ongoing",
      battleTurn: 2,
      waveTurn: 2,
    });
    expect(rng.snapshot().drawCount).toBe(0);
  });

  it("settles final-enemy departure as victory at ally turn end without entering enemy actions", () => {
    const initial = battle();
    const ally = resolveAllyCommandSequence(
      initial,
      selection(initial),
      (input) => ({
        state: defeat(input.state, "enemy-a"),
      }),
    );
    expect(ally.accepted).toBe(true);
    if (!ally.accepted) return;
    expect(ally.result.stopReason).toBe("no_enemy_target");

    const result = resolveAllyTurnEnd(
      ally.result.state,
      createEffectRuntimeCounters(),
      new BattleRng("ally-victory").stream("effects"),
    );
    expect(result.state).toMatchObject({
      phase: "finished",
      outcome: "victory",
    });
  });

  it("settles ally annihilation as defeat only after enemy turn-end work", () => {
    const initial = battle();
    const ally = resolveAllyCommandSequence(
      initial,
      selection(initial),
      (input) => ({ state: input.state }),
    );
    expect(ally.accepted).toBe(true);
    if (!ally.accepted) return;
    const effects = new BattleRng("enemy-victory").stream("effects");
    const allyEnd = resolveAllyTurnEnd(
      ally.result.state,
      createEffectRuntimeCounters(),
      effects,
    );
    const enemy = resolveEnemyTurnSequence(
      allyEnd.state,
      [],
      (input) => ({
        state: defeat(
          input.state,
          "ally-a",
          "ally-b",
          "ally-c",
        ),
      }),
    );
    expect(enemy.stopReason).toBe("ally_annihilated");
    expect(enemy.state).toMatchObject({
      phase: "enemy_turn_end",
      outcome: "ongoing",
    });

    const result = resolveEnemyTurnEnd(
      enemy.state,
      allyEnd.counters,
      effects,
    );
    expect(result.state).toMatchObject({
      phase: "finished",
      outcome: "defeat",
    });
  });
});
