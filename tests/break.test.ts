import { describe, expect, it } from "vitest";
import {
  resolvePendingEnemyBreaks,
} from "../src/core/battle/break";
import {
  beginAllyTurnEnd,
} from "../src/core/battle/progression";
import {
  createBattleState,
  setBattleFormation,
  setWaveContinuation,
  type BattleState,
} from "../src/core/battle/state";
import {
  findUnitLocation,
  replaceUnit,
} from "../src/core/battle/formation";
import type {
  BattleUnitState,
} from "../src/core/battle/types";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import {
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import { resolveLethalHp } from "../src/effects/survival";
import { unit } from "./helpers/battle";

// Canonical behavior:
// docs/specs/BATTLE_SYSTEM.md and docs/PROJECT_RULES.md (checked 2026-07-30).

function battle(
  enemies: Array<BattleUnitState | null> = [
    unit("enemy-a", "enemy", {
      remainingBreakGauges: [{ maxHp: 8_000 }, { maxHp: 6_000 }],
    }),
    unit("enemy-b", "enemy"),
    unit("enemy-c", "enemy", {
      remainingBreakGauges: [{ maxHp: 7_000 }],
    }),
  ],
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
    waves: [
      {
        enemy: {
          frontline: enemies,
          reserve: [],
        },
      },
    ],
    enemyFrontlineLimit: 3,
  });
}

function makeBreakPending(
  state: BattleState,
  instanceId: string,
): BattleState {
  const location = findUnitLocation(state.formation, instanceId);
  if (!location) throw new Error(`missing test unit: ${instanceId}`);
  const lethal = resolveLethalHp({
    ...location.unit,
    hp: 0,
  });
  expect(lethal.outcome).toBe("break_pending");
  return setBattleFormation(
    state,
    replaceUnit(state.formation, lethal.unit),
  );
}

describe("break gauge configuration", () => {
  it("accepts at most ten total HP gauges including the current gauge", () => {
    expect(() =>
      battle([
        unit("enemy-a", "enemy", {
          remainingBreakGauges: Array.from(
            { length: 9 },
            (_, index) => ({ maxHp: 9_000 - index }),
          ),
        }),
        null,
        null,
      ]),
    ).not.toThrow();

    expect(() =>
      battle([
        unit("enemy-a", "enemy", {
          remainingBreakGauges: Array.from(
            { length: 10 },
            () => ({ maxHp: 1_000 }),
          ),
        }),
        null,
        null,
      ]),
    ).toThrow(/must not exceed 10 total HP gauges/);
  });

  it("rejects invalid gauge HP and ally break gauges", () => {
    expect(() =>
      battle([
        unit("enemy-a", "enemy", {
          remainingBreakGauges: [{ maxHp: 0 }],
        }),
        null,
        null,
      ]),
    ).toThrow(/maxHp must be positive/);

    expect(() =>
      createBattleState({
        ally: {
          frontline: [
            unit("ally-a", "ally", {
              remainingBreakGauges: [{ maxHp: 1_000 }],
            }),
            unit("ally-b", "ally"),
            unit("ally-c", "ally"),
          ],
          reserve: [],
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
      }),
    ).toThrow(/allies cannot have break gauges/);
  });
});

describe("pending break settlement", () => {
  it("automatically makes an enemy with a next gauge break-pending", () => {
    const initial = battle();
    const state = makeBreakPending(initial, "enemy-a");
    const enemy = findUnitLocation(
      state.formation,
      "enemy-a",
    )?.unit;

    expect(enemy).toMatchObject({
      hp: 0,
      alive: true,
      breakPending: true,
      hpGaugeNumber: 1,
    });
    expect(state.waveContinuation.pendingBreaks).toBe(1);
  });

  it("resolves simultaneous breaks from the frontmost enemy slot", () => {
    let state = battle();
    state = makeBreakPending(state, "enemy-c");
    state = makeBreakPending(state, "enemy-a");
    state = beginAllyTurnEnd(state);
    const result = resolvePendingEnemyBreaks(state);

    expect(result.events.map(({ instanceId }) => instanceId)).toEqual([
      "enemy-a",
      "enemy-c",
    ]);
    expect(result.events[0]).toMatchObject({
      area: "frontline",
      index: 0,
      brokenGaugeNumber: 1,
      activatedGaugeNumber: 2,
      baseMaxHp: 8_000,
      maxHp: 8_000,
      remainingGaugeCount: 1,
      triggerEvent: {
        timing: "on_break",
        actorInstanceId: "enemy-a",
      },
    });
    expect(
      findUnitLocation(result.state.formation, "enemy-a")?.unit,
    ).toMatchObject({
      hp: 8_000,
      alive: true,
      hpGaugeNumber: 2,
      remainingBreakGauges: [{ maxHp: 6_000 }],
      breakPending: false,
      lastBreakBattleTurn: 1,
    });
    expect(result.state.waveContinuation.pendingBreaks).toBe(0);
  });

  it("reconciles persistent maximum-HP effects and fills the new gauge", () => {
    const applied = applyEffect(
      unit("enemy-a", "enemy", {
        remainingBreakGauges: [{ maxHp: 8_000 }],
      }),
      {
        stableId: "max-hp-up",
        name: "最大HPアップ",
        effectType: COMMON_EFFECT_TYPES.maxHpChange,
        category: "buff",
        value: 1_000,
      },
      null,
      createEffectRuntimeCounters(),
    ).unit;
    let state = battle([applied, null, null]);
    state = makeBreakPending(state, "enemy-a");
    const result = resolvePendingEnemyBreaks(
      beginAllyTurnEnd(state),
    );

    expect(
      findUnitLocation(result.state.formation, "enemy-a")?.unit,
    ).toMatchObject({
      baseMaxHp: 8_000,
      maxHp: 9_000,
      hp: 9_000,
      effects: [{ stableId: "max-hp-up" }],
    });
  });

  it("settles only one gauge and is idempotent afterwards", () => {
    let state = makeBreakPending(battle(), "enemy-a");
    const first = resolvePendingEnemyBreaks(
      beginAllyTurnEnd(state),
    );
    const second = resolvePendingEnemyBreaks(first.state);

    expect(first.events).toHaveLength(1);
    expect(second.state).toBe(first.state);
    expect(second.events).toEqual([]);
    expect(second.deferredInstanceIds).toEqual([]);
  });

  it("defers a duplicate pending break already settled this ally turn", () => {
    let state = battle();
    const location = findUnitLocation(state.formation, "enemy-a");
    if (!location) throw new Error("missing enemy-a");
    state = setBattleFormation(
      state,
      replaceUnit(state.formation, {
        ...location.unit,
        hp: 0,
        alive: true,
        breakPending: true,
        lastBreakBattleTurn: 1,
      }),
    );
    state = beginAllyTurnEnd(state);
    const result = resolvePendingEnemyBreaks(state);

    expect(result.events).toEqual([]);
    expect(result.deferredInstanceIds).toEqual(["enemy-a"]);
    expect(result.state).toBe(state);
    expect(result.state.waveContinuation.pendingBreaks).toBe(1);
  });

  it("rejects break settlement outside ally turn end", () => {
    const state = makeBreakPending(battle(), "enemy-a");
    expect(() => resolvePendingEnemyBreaks(state)).toThrow(
      /breaks must resolve during ally_turn_end/,
    );
  });

  it("does not allow continuation metadata to hide a pending enemy gauge", () => {
    const state = makeBreakPending(battle(), "enemy-a");
    expect(() =>
      setWaveContinuation(state, {
        ...state.waveContinuation,
        pendingBreaks: 0,
      }),
    ).toThrow(/pendingBreaks cannot be smaller/);
  });
});
