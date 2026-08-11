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
  allyC?: ReturnType<typeof unit>;
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
        options.allyC ?? unit("ally-c", "ally"),
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

function turnEndStars(
  stableId: string,
  amount: number,
  options: {
    priority?: number;
    activationRatePermille?: number;
    remainingTurns?: number;
  } = {},
): EffectTemplate {
  return {
    stableId,
    name: stableId,
    effectType: stableId,
    category: "buff",
    remainingTurns: options.remainingTurns,
    trigger: {
      timing: "turn_end",
      priority: options.priority,
      activationRatePermille: options.activationRatePermille,
      actions: [{
        target: self,
        action: {
          kind: "gain_stars",
          amount,
          destination: "next_command",
        },
      }],
    },
  };
}

describe("ally turn-end coordinator", () => {
  it("adds ally turn-end stars sequentially to the pending bucket with a per-action cap", () => {
    let counters = createEffectRuntimeCounters();
    let allyA = unit("ally-a", "ally");
    const secondWithTwoChildren = turnEndStars("second-stars", 10);
    secondWithTwoChildren.trigger!.actions = [
      ...secondWithTwoChildren.trigger!.actions!,
      {
        target: self,
        action: {
          kind: "gain_stars",
          amount: 4,
          destination: "next_command",
        },
      },
    ];
    for (const template of [
      turnEndStars("first-stars", 5, { priority: -10 }),
      secondWithTwoChildren,
    ]) {
      const applied = register(allyA, template, counters);
      allyA = applied.unit;
      counters = applied.counters;
    }
    const countersBefore = { ...counters };
    const battleRng = new BattleRng("ally-turn-end-stars");
    const state = {
      ...battle({ allyA }),
      commandStars: 7,
      nextCommandStars: 88,
    };

    const result = resolveAllyTurnEnd(
      beginAllyTurnEnd(state),
      counters,
      battleRng.stream("effects"),
    );

    expect(result.state).toMatchObject({
      phase: "enemy_action",
      commandStars: 7,
      nextCommandStars: 99,
    });
    expect(result.recurring.activations.flatMap((activation) =>
      activation.actions.map(({ starAddition }) => starAddition)
    )).toEqual([
      {
        bucket: "next_command",
        requested: 5,
        before: 88,
        added: 5,
        after: 93,
        overflow: 0,
      },
      {
        bucket: "next_command",
        requested: 10,
        before: 93,
        added: 6,
        after: 99,
        overflow: 4,
      },
      {
        bucket: "next_command",
        requested: 4,
        before: 99,
        added: 0,
        after: 99,
        overflow: 4,
      },
    ]);
    expect(result.counters).toEqual(countersBefore);
    expect(battleRng.snapshot().streams).toEqual(
      new BattleRng("ally-turn-end-stars").snapshot().streams,
    );
  });

  it("does not activate turn-end star effects for reserves, removed states, dead owners, or arrivals after the snapshot", () => {
    let counters = createEffectRuntimeCounters();
    let allyA = unit("ally-a", "ally");
    let applied = register(
      allyA,
      {
        stableId: "remove-next-stars",
        name: "後続スター解除",
        effectType: "remove-next-stars",
        category: "other",
        trigger: {
          timing: "turn_end",
          priority: -20,
          actions: [{
            target: {
              relation: "allies",
              selection: "single",
              selectedInstanceId: "ally-b",
            },
            action: {
              kind: "remove_effects",
              request: { mode: "all", category: "buff" },
            },
          }],
        },
      },
      counters,
    );
    allyA = applied.unit;
    counters = applied.counters;
    applied = register(
      allyA,
      {
        stableId: "defeat-next-owner",
        name: "後続所持者撃破",
        effectType: "defeat-next-owner",
        category: "other",
        trigger: {
          timing: "turn_end",
          priority: -10,
          actions: [{
            target: {
              relation: "allies",
              selection: "single",
              selectedInstanceId: "ally-c",
            },
            action: {
              kind: "reduce_hp",
              amount: 10_000,
              canDefeat: true,
            },
          }],
        },
      },
      counters,
    );
    allyA = applied.unit;
    counters = applied.counters;
    applied = register(
      unit("ally-b", "ally"),
      turnEndStars("removed-stars", 10),
      counters,
    );
    const allyB = applied.unit;
    counters = applied.counters;
    applied = register(
      unit("ally-c", "ally"),
      turnEndStars("dead-owner-stars", 10),
      counters,
    );
    const allyC = applied.unit;
    counters = applied.counters;
    applied = register(
      unit("ally-d", "ally"),
      turnEndStars("reserve-arrival-stars", 10),
      counters,
    );
    const allyD = applied.unit;
    counters = applied.counters;
    applied = register(
      unit("ally-e", "ally"),
      turnEndStars("reserve-stars", 10),
      counters,
    );
    const allyE = applied.unit;
    counters = applied.counters;

    const result = resolveAllyTurnEnd(
      beginAllyTurnEnd(battle({
        allyA,
        allyB,
        allyC,
        allyReserve: [allyD, allyE],
      })),
      counters,
      new BattleRng("turn-end-star-candidate-recheck").stream("effects"),
    );

    expect(result.state.nextCommandStars).toBe(0);
    expect(result.recurring.activations.map(({ outcome }) => outcome)).toEqual([
      "activated",
      "activated",
      "effect_unavailable",
      "owner_unavailable",
    ]);
    expect(
      result.recurring.activations.flatMap(({ actions }) => actions)
        .filter(({ starAddition }) => starAddition),
    ).toEqual([]);
    expect(
      result.state.formation.ally.frontline.map(
        (current) => current?.instanceId ?? null,
      ),
    ).toEqual(["ally-a", "ally-b", "ally-d"]);
    expect(
      findUnitLocation(result.state.formation, "ally-d")?.unit.effects,
    ).toEqual([expect.objectContaining({ stableId: "reserve-arrival-stars" })]);
    expect(
      findUnitLocation(result.state.formation, "ally-e")?.unit.effects,
    ).toEqual([expect.objectContaining({ stableId: "reserve-stars" })]);
  });

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
    expect(result.state.commandDeck).toMatchObject({
      cycle: 2,
      drawsInCycle: 0,
      lastRebuildReason: "ally_departure",
    });
    expect(new Set(
      result.state.commandDeck.sourceCards.map(
        ({ ownerInstanceId }) => ownerInstanceId,
      ),
    )).toEqual(new Set(["ally-a", "ally-c", "ally-d"]));
  });
});

describe("enemy turn-end coordinator", () => {
  it("adds enemy turn-end stars to pending and activates them only when ally input begins", () => {
    let counters = createEffectRuntimeCounters();
    const applied = register(
      unit("enemy-a", "enemy"),
      turnEndStars("enemy-turn-end-stars", 10),
      counters,
    );
    counters = applied.counters;
    let state = {
      ...battle({ enemyA: applied.unit }),
      commandStars: 12,
      nextCommandStars: 96,
    };
    state = completeAllyTurnEnd(beginAllyTurnEnd(state));

    const result = resolveEnemyTurnEnd(
      beginEnemyTurnEnd(state),
      counters,
      new BattleRng("enemy-turn-end-stars").stream("effects"),
    );

    expect(result.recurring.activations[0].actions[0].starAddition).toEqual({
      bucket: "next_command",
      requested: 10,
      before: 96,
      added: 3,
      after: 99,
      overflow: 7,
    });
    expect(result.state).toMatchObject({
      phase: "ally_action",
      commandStars: 99,
      nextCommandStars: 0,
    });
  });

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
                kind: "gain_stars",
                amount: 10,
                destination: "next_command",
              },
            },
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
      commandStars: 0,
      nextCommandStars: 10,
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
