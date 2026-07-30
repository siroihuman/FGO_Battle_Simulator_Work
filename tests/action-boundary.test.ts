import { describe, expect, it } from "vitest";
import {
  initialEnemyTarget,
  resolveActionBoundary,
  retargetEnemyAfterAction,
  selectEnemyTarget,
  type EnemyTargetAnchor,
} from "../src/core/battle/actionBoundary";
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
  setBattleFormation,
  type BattleState,
  type EnemyFrontlineLimit,
  type EnemyReplacementMode,
} from "../src/core/battle/state";
import type { SideFormation } from "../src/core/battle/types";
import { drawCommandCards } from "../src/core/cards/deck";
import { BattleRng } from "../src/core/rng";
import { unit } from "./helpers/battle";

// Canonical behavior:
// docs/specs/BATTLE_SYSTEM.md and docs/PROJECT_RULES.md (checked 2026-07-30).

function battle(
  enemy: SideFormation = {
    frontline: [
      unit("enemy-a", "enemy"),
      unit("enemy-b", "enemy"),
      unit("enemy-c", "enemy"),
    ],
    reserve: [
      unit("enemy-d", "enemy"),
      unit("enemy-e", "enemy"),
    ],
  },
  mode: EnemyReplacementMode = "standard",
  limit: EnemyFrontlineLimit =
    enemy.frontline.length === 6 ? 6 : 3,
): BattleState {
  return createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally"),
        unit("ally-b", "ally"),
        unit("ally-c", "ally"),
      ],
      reserve: [
        unit("ally-d", "ally"),
        unit("ally-e", "ally"),
        unit("ally-f", "ally"),
      ],
    },
    waves: [{ enemy }],
    enemyFrontlineLimit: limit,
    enemyReplacementMode: mode,
  });
}

function updateUnit(
  state: BattleState,
  instanceId: string,
  update: (
    current: NonNullable<
      ReturnType<typeof findUnitLocation>
    >["unit"],
  ) => NonNullable<
    ReturnType<typeof findUnitLocation>
  >["unit"],
): BattleState {
  const location = findUnitLocation(state.formation, instanceId);
  if (!location) throw new Error(`missing unit: ${instanceId}`);
  return setBattleFormation(
    state,
    replaceUnit(state.formation, update(location.unit)),
  );
}

function defeat(
  state: BattleState,
  ...instanceIds: string[]
): BattleState {
  let current = state;
  for (const instanceId of instanceIds) {
    current = updateUnit(current, instanceId, (unitState) => ({
      ...unitState,
      hp: 0,
      alive: false,
    }));
  }
  return current;
}

function enemyPhase(state: BattleState): BattleState {
  return completeAllyTurnEnd(beginAllyTurnEnd(state));
}

function ids(
  units: Array<{ instanceId: string } | null>,
): Array<string | null> {
  return units.map((current) => current?.instanceId ?? null);
}

describe("ally attack target selection", () => {
  it("selects the first living frontline enemy and skips empty or defeated slots", () => {
    let state = battle({
      frontline: [
        unit("enemy-a", "enemy"),
        null,
        unit("enemy-c", "enemy"),
      ],
      reserve: [],
    });
    state = defeat(state, "enemy-a");

    expect(initialEnemyTarget(state)).toEqual({
      instanceId: "enemy-c",
      frontlineIndex: 2,
    });
  });

  it("keeps a pending-break HP-0 enemy targetable for over-gauge attacks", () => {
    let state = battle({
      frontline: [
        unit("enemy-a", "enemy", {
          remainingBreakGauges: [{ maxHp: 20_000 }],
        }),
        null,
        null,
      ],
      reserve: [],
    });
    state = updateUnit(state, "enemy-a", (current) => ({
      ...current,
      hp: 0,
      alive: true,
      breakPending: true,
    }));

    expect(initialEnemyTarget(state)?.instanceId).toBe("enemy-a");
    expect(selectEnemyTarget(state, "enemy-a").accepted).toBe(true);
  });

  it("accepts a living frontline choice without mutating state", () => {
    const state = battle();
    const result = selectEnemyTarget(state, "enemy-c");

    expect(result).toEqual({
      accepted: true,
      target: {
        instanceId: "enemy-c",
        frontlineIndex: 2,
      },
    });
    expect(state.formation.enemy.frontline[2]?.instanceId).toBe("enemy-c");
  });

  it("returns stable rejection reasons for missing, ally, reserve, defeated, and wrong-phase targets", () => {
    let state = battle();
    state = defeat(state, "enemy-b");

    expect(selectEnemyTarget(state, "missing")).toEqual({
      accepted: false,
      reason: "target_missing",
    });
    expect(selectEnemyTarget(state, "ally-a")).toEqual({
      accepted: false,
      reason: "target_not_enemy",
    });
    expect(selectEnemyTarget(state, "enemy-d")).toEqual({
      accepted: false,
      reason: "target_not_frontline",
    });
    expect(selectEnemyTarget(state, "enemy-b")).toEqual({
      accepted: false,
      reason: "target_defeated",
    });
    expect(
      selectEnemyTarget(enemyPhase(battle()), "enemy-a"),
    ).toEqual({
      accepted: false,
      reason: "invalid_phase",
    });
  });

  it("keeps the same target when it survives the completed action", () => {
    const state = battle();
    const previous: EnemyTargetAnchor = {
      instanceId: "enemy-b",
      frontlineIndex: 1,
    };

    expect(retargetEnemyAfterAction(state, previous)).toEqual(previous);
  });

  it("selects behind the departed slot, skipping gaps", () => {
    let state = battle({
      frontline: [
        unit("enemy-a", "enemy"),
        unit("enemy-b", "enemy"),
        null,
        null,
        unit("enemy-e", "enemy"),
        unit("enemy-f", "enemy"),
      ],
      reserve: [],
    }, "standard", 6);
    state = resolveActionBoundary(
      defeat(state, "enemy-b"),
      { instanceId: "enemy-b", frontlineIndex: 1 },
    ).state;

    expect(
      retargetEnemyAfterAction(
        state,
        { instanceId: "enemy-b", frontlineIndex: 1 },
      ),
    ).toEqual({
      instanceId: "enemy-e",
      frontlineIndex: 4,
    });
  });

  it("wraps to the front when no living enemy remains behind", () => {
    let state = battle();
    state = resolveActionBoundary(
      defeat(state, "enemy-c"),
      { instanceId: "enemy-c", frontlineIndex: 2 },
    ).state;

    expect(
      retargetEnemyAfterAction(
        state,
        { instanceId: "enemy-c", frontlineIndex: 2 },
      ),
    ).toEqual({
      instanceId: "enemy-a",
      frontlineIndex: 0,
    });
  });
});

describe("completed-action boundary", () => {
  it("removes a defeated standard-mode enemy but defers its reserve replacement", () => {
    const result = resolveActionBoundary(
      defeat(battle(), "enemy-b"),
      { instanceId: "enemy-b", frontlineIndex: 1 },
    );

    expect(ids(result.state.formation.enemy.frontline)).toEqual([
      "enemy-a",
      null,
      "enemy-c",
    ]);
    expect(result.enemyReplacement.replacementDeferred).toBe(true);
    expect(result.enemyReplacement.arrivals).toEqual([]);
    expect(result.nextEnemyTarget).toEqual({
      instanceId: "enemy-c",
      frontlineIndex: 2,
    });
  });

  it("uses a rear enemy before an immediate replacement in the defeated target slot", () => {
    const result = resolveActionBoundary(
      defeat(battle(undefined, "immediate"), "enemy-b"),
      { instanceId: "enemy-b", frontlineIndex: 1 },
    );

    expect(ids(result.state.formation.enemy.frontline)).toEqual([
      "enemy-a",
      "enemy-d",
      "enemy-c",
    ]);
    expect(result.enemyReplacement.arrivals[0]).toMatchObject({
      frontlineIndex: 1,
      instanceId: "enemy-d",
    });
    expect(result.nextEnemyTarget).toEqual({
      instanceId: "enemy-c",
      frontlineIndex: 2,
    });
  });

  it("wraps to the immediate replacement when it is the only remaining enemy", () => {
    const state = battle({
      frontline: [
        null,
        unit("enemy-b", "enemy"),
        null,
      ],
      reserve: [unit("enemy-d", "enemy")],
    }, "immediate");
    const result = resolveActionBoundary(
      defeat(state, "enemy-b"),
      { instanceId: "enemy-b", frontlineIndex: 1 },
    );

    expect(result.nextEnemyTarget).toEqual({
      instanceId: "enemy-d",
      frontlineIndex: 0,
    });
  });

  it("settles all targets of an area action together before filling immediate gaps", () => {
    const result = resolveActionBoundary(
      defeat(
        battle(undefined, "immediate"),
        "enemy-a",
        "enemy-c",
      ),
      { instanceId: "enemy-a", frontlineIndex: 0 },
    );

    expect(ids(result.state.formation.enemy.frontline)).toEqual([
      "enemy-d",
      "enemy-b",
      "enemy-e",
    ]);
    expect(result.enemyReplacement.departures).toHaveLength(2);
    expect(result.enemyReplacement.arrivals).toHaveLength(2);
    expect(result.nextEnemyTarget).toEqual({
      instanceId: "enemy-b",
      frontlineIndex: 1,
    });
  });

  it("auto-replaces a defeated ally in the same slot and rebuilds only the next card deck", () => {
    let state = battle();
    state = {
      ...state,
      commandDeck: drawCommandCards(
        state.commandDeck,
        state.formation.ally,
        new BattleRng("action-boundary-hand").stream("cards"),
      ).deck,
    };
    const currentHand = state.commandDeck.currentHand.map(
      ({ cardId }) => cardId,
    );
    const result = resolveActionBoundary(
      defeat(state, "ally-b"),
    );

    expect(ids(result.state.formation.ally.frontline)).toEqual([
      "ally-a",
      "ally-d",
      "ally-c",
    ]);
    expect(result.allyReplacement.events[0]).toMatchObject({
      frontlineIndex: 1,
      defeatedInstanceId: "ally-b",
      replacementInstanceId: "ally-d",
    });
    expect(result.state.commandDeck.lastRebuildReason).toBe(
      "ally_departure",
    );
    expect(
      result.state.commandDeck.currentHand.map(({ cardId }) => cardId),
    ).toEqual(currentHand);
    expect(
      new Set(
        result.state.commandDeck.sourceCards.map(
          ({ ownerInstanceId }) => ownerInstanceId,
        ),
      ),
    ).toEqual(new Set(["ally-a", "ally-c", "ally-d"]));
  });

  it("handles ally annihilation without trying to draw from an empty next deck", () => {
    let state = battle();
    state = defeat(
      state,
      "ally-a",
      "ally-b",
      "ally-c",
      "ally-d",
      "ally-e",
      "ally-f",
    );

    const result = resolveActionBoundary(state);
    expect(result.state.formation.ally.frontline).toEqual([
      null,
      null,
      null,
    ]);
    expect(result.state.commandDeck.sourceCards).toEqual([]);
    expect(result.state.outcome).toBe("ongoing");
    expect(result.state.phase).toBe("ally_action");
  });

  it("keeps the battle ongoing at the boundary even when the final enemy departs", () => {
    let state = battle({
      frontline: [unit("enemy-a", "enemy"), null, null],
      reserve: [],
    });
    const result = resolveActionBoundary(
      defeat(state, "enemy-a"),
      { instanceId: "enemy-a", frontlineIndex: 0 },
    );

    expect(result.state.formation.enemy.frontline).toEqual([
      null,
      null,
      null,
    ]);
    expect(result.state.outcome).toBe("ongoing");
    expect(result.state.phase).toBe("ally_action");
    expect(result.nextEnemyTarget).toBeNull();
  });

  it("applies ally replacement before the next enemy action", () => {
    let state = enemyPhase(battle());
    state = defeat(state, "ally-a");
    const result = resolveActionBoundary(state);

    expect(result.phase).toBe("enemy_action");
    expect(ids(result.state.formation.ally.frontline)).toEqual([
      "ally-d",
      "ally-b",
      "ally-c",
    ]);
    expect(result.nextEnemyTarget).toBeNull();
  });

  it("also settles enemy self-defeat and immediate replacement during the enemy phase", () => {
    let state = enemyPhase(battle(undefined, "immediate"));
    state = defeat(state, "enemy-a");
    const result = resolveActionBoundary(state);

    expect(ids(result.state.formation.enemy.frontline)).toEqual([
      "enemy-d",
      "enemy-b",
      "enemy-c",
    ]);
    expect(result.enemyReplacement.arrivals[0]).toMatchObject({
      frontlineIndex: 0,
      instanceId: "enemy-d",
    });
  });

  it("rejects turn-end and finished phases", () => {
    const ending = beginAllyTurnEnd(battle());
    expect(() => resolveActionBoundary(ending)).toThrow(
      /ongoing ally or enemy action phase/,
    );
  });
});
