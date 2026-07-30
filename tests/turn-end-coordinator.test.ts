import { describe, expect, it } from "vitest";
import {
  findUnitLocation,
  replaceUnit,
} from "../src/core/battle/formation";
import {
  beginAllyTurnEnd,
  beginEnemyTurnEnd,
  completeAllyTurnEnd,
} from "../src/core/battle/progression";
import {
  createBattleState,
  setBattleFormation,
  type BattleState,
  type EnemyReplacementMode,
} from "../src/core/battle/state";
import {
  resolveAllyTurnEnd,
  resolveEnemyTurnEnd,
} from "../src/core/battle/turnEndCoordinator";
import { BattleRng } from "../src/core/rng";
import {
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import { resolveLethalHp } from "../src/effects/survival";
import type {
  EffectRuntimeCounters,
  EffectTemplate,
} from "../src/effects/types";
import { unit } from "./helpers/battle";

// Canonical behavior:
// docs/specs/BATTLE_SYSTEM.md, docs/specs/EFFECTS_AND_TIMING.md,
// and docs/PROJECT_RULES.md (checked 2026-07-30).

function register(
  target: ReturnType<typeof unit>,
  template: EffectTemplate,
  counters: EffectRuntimeCounters,
  sourceInstanceId: string | null = target.instanceId,
) {
  return applyEffect(
    target,
    template,
    sourceInstanceId,
    counters,
  );
}

function battle(options: {
  allyA?: ReturnType<typeof unit>;
  allyB?: ReturnType<typeof unit>;
  allyReserve?: ReturnType<typeof unit>[];
  enemyA?: ReturnType<typeof unit>;
  enemyReserve?: ReturnType<typeof unit>[];
  enemyReplacementMode?: EnemyReplacementMode;
  mysticCodeCooldowns?: number[];
} = {}): BattleState {
  return createBattleState({
    ally: {
      frontline: [
        options.allyA ?? unit("ally-a", "ally"),
        options.allyB ?? unit("ally-b", "ally"),
        unit("ally-c", "ally"),
      ],
      reserve: options.allyReserve ?? [],
    },
    waves: [
      {
        enemy: {
          frontline: [
            options.enemyA ?? unit("enemy-a", "enemy"),
            null,
            null,
          ],
          reserve: options.enemyReserve ?? [],
        },
      },
    ],
    enemyFrontlineLimit: 3,
    enemyReplacementMode:
      options.enemyReplacementMode ?? "standard",
    mysticCodeCooldowns: options.mysticCodeCooldowns,
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
  if (lethal.outcome !== "break_pending") {
    throw new Error("test enemy did not enter break pending");
  }
  return setBattleFormation(
    state,
    replaceUnit(state.formation, lethal.unit),
  );
}

const self = {
  relation: "self",
  selection: "single",
} as const;

describe("ally turn-end coordinator", () => {
  it("runs break actions before ally recurring effects and then ticks cooldowns", () => {
    let counters = createEffectRuntimeCounters();
    let applied = register(
      unit("enemy-a", "enemy", {
        remainingBreakGauges: [{ maxHp: 8_000 }],
      }),
      {
        stableId: "break-damage",
        name: "ブレイク時HP減少",
        effectType: "break-damage",
        category: "other",
        trigger: {
          timing: "on_break",
          actions: [
            {
              target: {
                relation: "enemies",
                selection: "single",
                selectedInstanceId: "ally-a",
              },
              action: {
                kind: "reduce_hp",
                amount: 3_000,
                canDefeat: false,
              },
            },
          ],
        },
      },
      counters,
    );
    const enemyA = applied.unit;
    counters = applied.counters;
    applied = register(
      unit("ally-a", "ally", {
        skillCooldowns: [2, 0, 1],
      }),
      {
        stableId: "turn-heal",
        name: "毎ターン回復",
        effectType: "turn-heal",
        category: "buff",
        remainingTurns: 2,
        trigger: {
          timing: "turn_end",
          actions: [
            {
              target: self,
              action: { kind: "heal_hp", amount: 1_000 },
            },
          ],
        },
      },
      counters,
    );
    const allyA = applied.unit;
    counters = applied.counters;

    let state = battle({
      allyA,
      enemyA,
      mysticCodeCooldowns: [2, 1, 0],
    });
    state = makeBreakPending(state, "enemy-a");
    const result = resolveAllyTurnEnd(
      beginAllyTurnEnd(state),
      counters,
      new BattleRng("ally-coordinator-order").stream("effects"),
    );

    expect(
      findUnitLocation(result.state.formation, "ally-a")?.unit,
    ).toMatchObject({
      hp: 8_000,
      skillCooldowns: [1, 0, 0],
    });
    expect(
      findUnitLocation(result.state.formation, "enemy-a")?.unit,
    ).toMatchObject({
      hp: 8_000,
      hpGaugeNumber: 2,
      breakPending: false,
    });
    expect(result.breakTriggers[0].activations[0].outcome).toBe(
      "activated",
    );
    expect(result.recurring.activations[0].outcome).toBe(
      "activated",
    );
    expect(result.state).toMatchObject({
      phase: "enemy_action",
      mysticCodeCooldowns: [1, 0, 0],
    });
  });

  it("does not activate or expire a turn-end state added by a break action", () => {
    let counters = createEffectRuntimeCounters();
    const applied = register(
      unit("enemy-a", "enemy", {
        remainingBreakGauges: [{ maxHp: 8_000 }],
      }),
      {
        stableId: "grant-late-heal",
        name: "終了時回復付与",
        effectType: "grant-late-heal",
        category: "other",
        trigger: {
          timing: "on_break",
          actions: [
            {
              target: {
                relation: "enemies",
                selection: "single",
                selectedInstanceId: "ally-a",
              },
              action: {
                kind: "apply_effects",
                effects: [
                  {
                    template: {
                      stableId: "late-heal",
                      name: "後発毎ターン回復",
                      effectType: "late-heal",
                      category: "buff",
                      remainingTurns: 1,
                      trigger: {
                        timing: "turn_end",
                        actions: [
                          {
                            target: self,
                            action: {
                              kind: "heal_hp",
                              amount: 1_000,
                            },
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      counters,
    );
    counters = applied.counters;
    let state = battle({
      allyA: unit("ally-a", "ally", { hp: 5_000 }),
      enemyA: applied.unit,
    });
    state = makeBreakPending(state, "enemy-a");
    const result = resolveAllyTurnEnd(
      beginAllyTurnEnd(state),
      counters,
      new BattleRng("late-turn-end-state").stream("effects"),
    );
    const allyA = findUnitLocation(
      result.state.formation,
      "ally-a",
    )?.unit;

    expect(allyA?.hp).toBe(5_000);
    expect(allyA?.effects).toEqual([
      expect.objectContaining({
        stableId: "late-heal",
        remainingTurns: 1,
      }),
    ]);
    expect(result.recurring.activations).toEqual([]);
  });

  it("auto-replaces an ally defeated by recurring effects before cooldown ticks", () => {
    let counters = createEffectRuntimeCounters();
    const applied = register(
      unit("ally-b", "ally"),
      {
        stableId: "self-defeat",
        name: "終了時HP減少",
        effectType: "self-defeat",
        category: "debuff",
        remainingTurns: 2,
        trigger: {
          timing: "turn_end",
          actions: [
            {
              target: self,
              action: {
                kind: "reduce_hp",
                amount: 10_000,
                canDefeat: true,
              },
            },
          ],
        },
      },
      counters,
    );
    counters = applied.counters;
    const reserveApplied = register(
      unit("ally-d", "ally", {
        skillCooldowns: [2, 0, 0],
      }),
      {
        stableId: "reserve-duration",
        name: "控え中の状態",
        effectType: "reserve-duration",
        category: "buff",
        remainingTurns: 1,
      },
      counters,
    );
    counters = reserveApplied.counters;
    const state = battle({
      allyB: applied.unit,
      allyReserve: [reserveApplied.unit],
    });
    const result = resolveAllyTurnEnd(
      beginAllyTurnEnd(state),
      counters,
      new BattleRng("ally-end-replacement").stream("effects"),
    );

    expect(
      result.state.formation.ally.frontline.map(
        (current) => current?.instanceId ?? null,
      ),
    ).toEqual(["ally-a", "ally-d", "ally-c"]);
    expect(
      result.state.formation.ally.reserve.map(
        ({ instanceId }) => instanceId,
      ),
    ).toEqual(["ally-b"]);
    expect(
      findUnitLocation(result.state.formation, "ally-d")?.unit
        .skillCooldowns,
    ).toEqual([1, 0, 0]);
    expect(
      findUnitLocation(result.state.formation, "ally-d")?.unit
        .effects,
    ).toEqual([
      expect.objectContaining({
        stableId: "reserve-duration",
        remainingTurns: 1,
      }),
    ]);
    expect(result.allyReplacement.cardDeckRebuildRequired).toBe(
      true,
    );
  });
});

describe("enemy turn-end coordinator", () => {
  it("removes a defeated enemy, ticks current units, then performs standard replacement", () => {
    let counters = createEffectRuntimeCounters();
    const applied = register(
      unit("enemy-a", "enemy", {
        skillCooldowns: [3, 0, 0],
      }),
      {
        stableId: "enemy-self-defeat",
        name: "敵終了時HP減少",
        effectType: "enemy-self-defeat",
        category: "debuff",
        remainingTurns: 2,
        trigger: {
          timing: "turn_end",
          actions: [
            {
              target: self,
              action: {
                kind: "reduce_hp",
                amount: 10_000,
                canDefeat: true,
              },
            },
          ],
        },
      },
      counters,
    );
    counters = applied.counters;
    let state = battle({
      enemyA: applied.unit,
      enemyReserve: [
        unit("enemy-d", "enemy", {
          skillCooldowns: [2, 0, 0],
        }),
      ],
    });
    state = completeAllyTurnEnd(beginAllyTurnEnd(state));
    const result = resolveEnemyTurnEnd(
      beginEnemyTurnEnd(state),
      counters,
      new BattleRng("enemy-end-standard").stream("effects"),
    );

    expect(result.defeatedEnemyDeparture.departures).toEqual([
      {
        area: "frontline",
        index: 0,
        instanceId: "enemy-a",
      },
    ]);
    expect(result.standardReplacement.arrivals).toEqual([
      {
        frontlineIndex: 0,
        reserveIndexBefore: 0,
        instanceId: "enemy-d",
      },
    ]);
    expect(
      findUnitLocation(result.state.formation, "enemy-d")?.unit
        .skillCooldowns,
    ).toEqual([2, 0, 0]);
    expect(result.state).toMatchObject({
      phase: "ally_action",
      battleTurn: 2,
      waveTurn: 2,
    });
  });

  it("auto-replaces an ally defeated by an enemy recurring effect", () => {
    let counters = createEffectRuntimeCounters();
    const applied = register(
      unit("enemy-a", "enemy"),
      {
        stableId: "enemy-end-attack",
        name: "敵終了時攻撃",
        effectType: "enemy-end-attack",
        category: "other",
        trigger: {
          timing: "turn_end",
          actions: [
            {
              target: {
                relation: "enemies",
                selection: "single",
                selectedInstanceId: "ally-b",
              },
              action: {
                kind: "reduce_hp",
                amount: 10_000,
                canDefeat: true,
              },
            },
          ],
        },
      },
      counters,
    );
    counters = applied.counters;
    let state = battle({
      allyReserve: [unit("ally-d", "ally")],
      enemyA: applied.unit,
    });
    state = completeAllyTurnEnd(beginAllyTurnEnd(state));
    const result = resolveEnemyTurnEnd(
      beginEnemyTurnEnd(state),
      counters,
      new BattleRng("enemy-end-ally-replacement").stream(
        "effects",
      ),
    );

    expect(
      result.state.formation.ally.frontline.map(
        (current) => current?.instanceId ?? null,
      ),
    ).toEqual(["ally-a", "ally-d", "ally-c"]);
    expect(result.allyReplacement.events).toHaveLength(1);
  });

  it("finishes the final Wave only after all enemy-end work completes", () => {
    let counters = createEffectRuntimeCounters();
    const applied = register(
      unit("enemy-a", "enemy"),
      {
        stableId: "final-slip",
        name: "最終敵終了時HP減少",
        effectType: "final-slip",
        category: "debuff",
        trigger: {
          timing: "turn_end",
          actions: [
            {
              target: self,
              action: {
                kind: "reduce_hp",
                amount: 10_000,
                canDefeat: true,
              },
            },
          ],
        },
      },
      counters,
    );
    counters = applied.counters;
    let state = battle({ enemyA: applied.unit });
    state = completeAllyTurnEnd(beginAllyTurnEnd(state));
    const result = resolveEnemyTurnEnd(
      beginEnemyTurnEnd(state),
      counters,
      new BattleRng("enemy-end-victory").stream("effects"),
    );

    expect(result.state).toMatchObject({
      phase: "finished",
      outcome: "victory",
    });
  });

  it("rejects the wrong phase before consuming any turn-end work", () => {
    const state = battle();
    expect(() =>
      resolveEnemyTurnEnd(
        state,
        createEffectRuntimeCounters(),
        new BattleRng("wrong-phase").stream("effects"),
      ),
    ).toThrow(/requires enemy_turn_end/);
  });
});
