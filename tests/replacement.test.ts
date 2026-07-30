import { describe, expect, it } from "vitest";
import {
  resolveAllyDefeatReplacement,
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
