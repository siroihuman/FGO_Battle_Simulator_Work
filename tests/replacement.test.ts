import { describe, expect, it } from "vitest";
import {
  resolveDirectAllyExchange,
  resolveAllyDefeatReplacement,
  resolveEnemyReplacement,
} from "../src/core/battle/replacement";
import {
  createBattleState,
  setBattleFormation,
  type BattleState,
} from "../src/core/battle/state";
import {
  findUnitLocation,
  replaceUnit,
} from "../src/core/battle/formation";
import type { SideFormation } from "../src/core/battle/types";
import { unit } from "./helpers/battle";

// Canonical behavior:
// docs/specs/BATTLE_SYSTEM.md and docs/PROJECT_RULES.md (checked 2026-07-30).

function battle(
  allyReserve: SideFormation["reserve"] = [
    unit("ally-d", "ally"),
    unit("ally-e", "ally"),
    unit("ally-f", "ally"),
  ],
): BattleState {
  return createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally"),
        unit("ally-b", "ally"),
        unit("ally-c", "ally"),
      ],
      reserve: allyReserve,
    },
    waves: [
      {
        enemy: {
          frontline: [unit("enemy-a", "enemy"), null, null],
          reserve: [],
        },
      },
    ],
    enemyFrontlineLimit: 3,
  });
}

function enemyBattle(
  mode: "standard" | "immediate",
  enemy: SideFormation = {
    frontline: [
      unit("enemy-a", "enemy"),
      unit("enemy-b", "enemy"),
      unit("enemy-c", "enemy"),
    ],
    reserve: [
      unit("enemy-d", "enemy"),
      unit("enemy-e", "enemy"),
      unit("enemy-f", "enemy"),
    ],
  },
): BattleState {
  return createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally"),
        unit("ally-b", "ally"),
        unit("ally-c", "ally"),
      ],
      reserve: [],
    },
    waves: [{ enemy }],
    enemyFrontlineLimit:
      enemy.frontline.length === 6 ? 6 : 3,
    enemyReplacementMode: mode,
  });
}

function defeat(
  state: BattleState,
  ...instanceIds: string[]
): BattleState {
  let formation = state.formation;
  for (const instanceId of instanceIds) {
    const location = findUnitLocation(formation, instanceId);
    if (!location) throw new Error(`missing test unit: ${instanceId}`);
    formation = replaceUnit(formation, {
      ...location.unit,
      hp: 0,
      alive: false,
    });
  }
  return setBattleFormation(state, formation);
}

function ids(
  units: Array<{ instanceId: string } | null>,
): Array<string | null> {
  return units.map((current) => current?.instanceId ?? null);
}

describe("ally defeat replacement", () => {
  it("places the first living reserve in the defeated ally's exact slot", () => {
    const result = resolveAllyDefeatReplacement(
      defeat(battle(), "ally-b"),
    );

    expect(ids(result.state.formation.ally.frontline)).toEqual([
      "ally-a",
      "ally-d",
      "ally-c",
    ]);
    expect(ids(result.state.formation.ally.reserve)).toEqual([
      "ally-e",
      "ally-f",
      "ally-b",
    ]);
    expect(result.events).toEqual([
      {
        frontlineIndex: 1,
        defeatedInstanceId: "ally-b",
        replacementInstanceId: "ally-d",
        replacementReserveIndex: 0,
      },
    ]);
    expect(result.cardDeckRebuildRequired).toBe(true);
  });

  it("resolves simultaneous defeats from the frontmost slot", () => {
    const result = resolveAllyDefeatReplacement(
      defeat(battle(), "ally-a", "ally-c"),
    );

    expect(ids(result.state.formation.ally.frontline)).toEqual([
      "ally-d",
      "ally-b",
      "ally-e",
    ]);
    expect(ids(result.state.formation.ally.reserve)).toEqual([
      "ally-f",
      "ally-a",
      "ally-c",
    ]);
    expect(result.events.map(({ frontlineIndex }) => frontlineIndex)).toEqual([
      0,
      2,
    ]);
  });

  it("skips defeated reserves without changing their relative order", () => {
    const result = resolveAllyDefeatReplacement(
      defeat(battle(), "ally-d", "ally-b"),
    );

    expect(ids(result.state.formation.ally.frontline)).toEqual([
      "ally-a",
      "ally-e",
      "ally-c",
    ]);
    expect(ids(result.state.formation.ally.reserve)).toEqual([
      "ally-d",
      "ally-f",
      "ally-b",
    ]);
    expect(result.events[0].replacementReserveIndex).toBe(1);
  });

  it("leaves the frontline slot empty when no living reserve remains", () => {
    const result = resolveAllyDefeatReplacement(
      defeat(
        battle([
          unit("ally-d", "ally"),
          unit("ally-e", "ally"),
        ]),
        "ally-d",
        "ally-e",
        "ally-b",
      ),
    );

    expect(ids(result.state.formation.ally.frontline)).toEqual([
      "ally-a",
      null,
      "ally-c",
    ]);
    expect(ids(result.state.formation.ally.reserve)).toEqual([
      "ally-d",
      "ally-e",
      "ally-b",
    ]);
    expect(result.events[0]).toMatchObject({
      replacementInstanceId: null,
      replacementReserveIndex: null,
    });
  });

  it("moves all defeated frontline allies to reserve before defeat judgment", () => {
    const result = resolveAllyDefeatReplacement(
      defeat(battle([]), "ally-a", "ally-b", "ally-c"),
    );

    expect(ids(result.state.formation.ally.frontline)).toEqual([
      null,
      null,
      null,
    ]);
    expect(ids(result.state.formation.ally.reserve)).toEqual([
      "ally-a",
      "ally-b",
      "ally-c",
    ]);
    expect(result.events).toHaveLength(3);
  });

  it("preserves each unit's HP, NP, effects, and cooldowns while moving it", () => {
    let state = battle();
    const allyB = findUnitLocation(state.formation, "ally-b")?.unit;
    if (!allyB) throw new Error("missing ally-b");
    state = setBattleFormation(
      state,
      replaceUnit(state.formation, {
        ...allyB,
        hp: 0,
        np: 9_876,
        alive: false,
        traits: ["preserved"],
        skillCooldowns: [4, 2, 1],
      }),
    );

    const result = resolveAllyDefeatReplacement(state);
    expect(result.state.formation.ally.reserve[2]).toMatchObject({
      instanceId: "ally-b",
      hp: 0,
      np: 9_876,
      alive: false,
      traits: ["preserved"],
      skillCooldowns: [4, 2, 1],
    });
  });

  it("is idempotent after all defeated frontliners have moved", () => {
    const first = resolveAllyDefeatReplacement(
      defeat(battle(), "ally-b"),
    );
    const second = resolveAllyDefeatReplacement(first.state);

    expect(second.state).toBe(first.state);
    expect(second.events).toEqual([]);
    expect(second.cardDeckRebuildRequired).toBe(false);
  });
});

describe("direct ally exchange", () => {
  it("swaps living frontline and reserve units intact without rebuilding cards", () => {
    const state = battle();
    const deck = state.commandDeck;
    const result = resolveDirectAllyExchange(state, "ally-b", "ally-e");

    expect(ids(result.state.formation.ally.frontline)).toEqual([
      "ally-a",
      "ally-e",
      "ally-c",
    ]);
    expect(ids(result.state.formation.ally.reserve)).toEqual([
      "ally-d",
      "ally-b",
      "ally-f",
    ]);
    expect(result.state.commandDeck).toBe(deck);
    expect(result.cardDeckRebuildRequired).toBe(false);
  });

  it("rejects invalid exchange areas before changing the input state", () => {
    const state = battle();
    expect(() => resolveDirectAllyExchange(state, "ally-d", "ally-b"))
      .toThrow("living frontline ally and living reserve ally");
    expect(ids(state.formation.ally.frontline)).toEqual([
      "ally-a",
      "ally-b",
      "ally-c",
    ]);
  });
});

describe("enemy replacement", () => {
  it("removes a defeated enemy but defers standard replacement after an action", () => {
    const result = resolveEnemyReplacement(
      defeat(enemyBattle("standard"), "enemy-b"),
      "after_action",
    );

    expect(ids(result.state.formation.enemy.frontline)).toEqual([
      "enemy-a",
      null,
      "enemy-c",
    ]);
    expect(ids(result.state.formation.enemy.reserve)).toEqual([
      "enemy-d",
      "enemy-e",
      "enemy-f",
    ]);
    expect(result.departures).toEqual([
      {
        area: "frontline",
        index: 1,
        instanceId: "enemy-b",
      },
    ]);
    expect(result.arrivals).toEqual([]);
    expect(result.replacementDeferred).toBe(true);
  });

  it("fills standard-mode empty slots from the reserve at enemy turn end", () => {
    let state = resolveEnemyReplacement(
      defeat(enemyBattle("standard"), "enemy-b"),
      "after_action",
    ).state;
    const result = resolveEnemyReplacement(state, "enemy_turn_end");

    expect(ids(result.state.formation.enemy.frontline)).toEqual([
      "enemy-a",
      "enemy-d",
      "enemy-c",
    ]);
    expect(ids(result.state.formation.enemy.reserve)).toEqual([
      "enemy-e",
      "enemy-f",
    ]);
    expect(result.arrivals).toEqual([
      {
        frontlineIndex: 1,
        reserveIndexBefore: 0,
        instanceId: "enemy-d",
      },
    ]);
    expect(result.replacementDeferred).toBe(false);
  });

  it("fills immediate-mode empty slots at the next action boundary", () => {
    const result = resolveEnemyReplacement(
      defeat(enemyBattle("immediate"), "enemy-b"),
      "after_action",
    );

    expect(ids(result.state.formation.enemy.frontline)).toEqual([
      "enemy-a",
      "enemy-d",
      "enemy-c",
    ]);
    expect(ids(result.state.formation.enemy.reserve)).toEqual([
      "enemy-e",
      "enemy-f",
    ]);
    expect(result.arrivals[0].frontlineIndex).toBe(1);
    expect(result.replacementDeferred).toBe(false);
  });

  it("fills multiple and pre-existing empty slots from front to back", () => {
    const state = enemyBattle("immediate", {
      frontline: [
        unit("enemy-a", "enemy"),
        null,
        unit("enemy-c", "enemy"),
        unit("enemy-d", "enemy"),
        null,
        unit("enemy-f", "enemy"),
      ],
      reserve: [
        unit("enemy-g", "enemy"),
        unit("enemy-h", "enemy"),
        unit("enemy-i", "enemy"),
      ],
    });
    const result = resolveEnemyReplacement(
      defeat(state, "enemy-a", "enemy-d"),
      "after_action",
    );

    expect(ids(result.state.formation.enemy.frontline)).toEqual([
      "enemy-g",
      "enemy-h",
      "enemy-c",
      "enemy-i",
      null,
      "enemy-f",
    ]);
    expect(result.arrivals.map(({ frontlineIndex }) => frontlineIndex)).toEqual([
      0,
      1,
      3,
    ]);
  });

  it("removes defeated reserves and uses the next living reserve", () => {
    let state = enemyBattle("immediate");
    state = defeat(state, "enemy-b", "enemy-d");
    const result = resolveEnemyReplacement(state, "after_action");

    expect(ids(result.state.formation.enemy.frontline)).toEqual([
      "enemy-a",
      "enemy-e",
      "enemy-c",
    ]);
    expect(ids(result.state.formation.enemy.reserve)).toEqual([
      "enemy-f",
    ]);
    expect(result.departures).toEqual([
      {
        area: "frontline",
        index: 1,
        instanceId: "enemy-b",
      },
      {
        area: "reserve",
        index: 0,
        instanceId: "enemy-d",
      },
    ]);
    expect(result.arrivals[0]).toMatchObject({
      reserveIndexBefore: 1,
      instanceId: "enemy-e",
    });
  });

  it("leaves empty slots when no living reserve remains", () => {
    const state = enemyBattle("immediate", {
      frontline: [
        unit("enemy-a", "enemy"),
        unit("enemy-b", "enemy"),
        null,
      ],
      reserve: [],
    });
    const result = resolveEnemyReplacement(
      defeat(state, "enemy-a", "enemy-b"),
      "after_action",
    );

    expect(ids(result.state.formation.enemy.frontline)).toEqual([
      null,
      null,
      null,
    ]);
    expect(result.arrivals).toEqual([]);
    expect(result.replacementDeferred).toBe(false);
  });

  it("is idempotent at repeated safe boundaries", () => {
    const first = resolveEnemyReplacement(
      defeat(enemyBattle("immediate"), "enemy-b"),
      "after_action",
    );
    const second = resolveEnemyReplacement(first.state, "after_action");

    expect(second.state).toBe(first.state);
    expect(second.departures).toEqual([]);
    expect(second.arrivals).toEqual([]);
    expect(second.replacementDeferred).toBe(false);
  });
});
