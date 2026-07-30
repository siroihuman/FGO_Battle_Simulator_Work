import { describe, expect, it } from "vitest";
import {
  beginAllyTurnEnd,
  beginEnemyTurnEnd,
  completeAllyTurnEnd,
  completeEnemyTurnEnd,
  retreatBattle,
} from "../src/core/battle/progression";
import {
  createBattleState,
  isCurrentWaveCleared,
  setBattleFormation,
  setWaveContinuation,
  type BattleState,
  type BattleWaveInput,
  type EnemyFrontlineLimit,
} from "../src/core/battle/state";
import {
  findUnitLocation,
  replaceUnit,
} from "../src/core/battle/formation";
import type {
  BattleFormation,
  SideFormation,
} from "../src/core/battle/types";
import { unit } from "./helpers/battle";

// Canonical behavior:
// docs/specs/BATTLE_SYSTEM.md and docs/PROJECT_RULES.md (checked 2026-07-30).

function allyFormation(reserveCount = 3): SideFormation {
  return {
    frontline: [
      unit("ally-a", "ally"),
      unit("ally-b", "ally"),
      unit("ally-c", "ally"),
    ],
    reserve: Array.from({ length: reserveCount }, (_, index) =>
      unit(`ally-${String.fromCharCode("d".charCodeAt(0) + index)}`, "ally"),
    ),
  };
}

function enemyFormation(
  prefix: string,
  frontlineLimit: EnemyFrontlineLimit = 3,
  reserveCount = 0,
): SideFormation {
  return {
    frontline: Array.from({ length: frontlineLimit }, (_, index) =>
      index === 0 ? unit(`${prefix}-front`, "enemy") : null,
    ),
    reserve: Array.from({ length: reserveCount }, (_, index) =>
      unit(`${prefix}-reserve-${index + 1}`, "enemy"),
    ),
  };
}

function battle(
  waves: readonly BattleWaveInput[] = [{ enemy: enemyFormation("wave-1") }],
  enemyFrontlineLimit: EnemyFrontlineLimit = 3,
): BattleState {
  return createBattleState({
    ally: allyFormation(),
    waves,
    enemyFrontlineLimit,
  });
}

function defeatUnit(
  state: BattleState,
  instanceId: string,
): BattleState {
  const location = findUnitLocation(state.formation, instanceId);
  if (!location) throw new Error(`missing test unit: ${instanceId}`);
  const formation = replaceUnit(state.formation, {
    ...location.unit,
    hp: 0,
    alive: false,
  });
  return setBattleFormation(state, formation);
}

function defeatSide(
  state: BattleState,
  side: "ally" | "enemy",
): BattleState {
  let formation: BattleFormation = state.formation;
  const units = [
    ...formation[side].frontline.filter((current) => current !== null),
    ...formation[side].reserve,
  ];
  for (const current of units) {
    formation = replaceUnit(formation, {
      ...current,
      hp: 0,
      alive: false,
    });
  }
  return setBattleFormation(state, formation);
}

describe("battle state creation", () => {
  it("starts at Wave 1, battle turn 1, and Wave turn 1", () => {
    const state = battle([
      { enemy: enemyFormation("wave-1") },
      { enemy: enemyFormation("wave-2") },
    ]);

    expect(state).toMatchObject({
      waveNumber: 1,
      totalWaves: 2,
      battleTurn: 1,
      waveTurn: 1,
      phase: "ally_action",
      outcome: "ongoing",
      waveContinuation: {
        pendingBreaks: 0,
        pendingRevives: 0,
        pendingAdditions: 0,
      },
    });
    expect(state.formation.enemy.frontline[0]?.instanceId).toBe(
      "wave-1-front",
    );
    expect(state.remainingWaves).toHaveLength(1);
  });

  it("accepts the six-enemy frontline mode and retains all six slots", () => {
    const state = battle(
      [{ enemy: enemyFormation("wave-1", 6, 4) }],
      6,
    );
    expect(state.enemyFrontlineLimit).toBe(6);
    expect(state.formation.enemy.frontline).toHaveLength(6);
  });

  it("rejects invalid Wave, frontline, and instance-ID structures", () => {
    expect(() => battle([])).toThrow(/wave count/);
    expect(() =>
      battle([
        { enemy: enemyFormation("wave-1") },
        { enemy: enemyFormation("wave-2") },
        { enemy: enemyFormation("wave-3") },
        { enemy: enemyFormation("wave-4") },
      ]),
    ).toThrow(/wave count/);

    const missingAlly = allyFormation();
    missingAlly.frontline[1] = null;
    expect(() =>
      createBattleState({
        ally: missingAlly,
        waves: [{ enemy: enemyFormation("wave-1") }],
        enemyFrontlineLimit: 3,
      }),
    ).toThrow(/all three ally frontline slots/);

    const duplicateWave = enemyFormation("wave-2");
    duplicateWave.frontline[0] = unit("wave-1-front", "enemy");
    expect(() =>
      battle([
        { enemy: enemyFormation("wave-1") },
        { enemy: duplicateWave },
      ]),
    ).toThrow(/duplicate instanceId/);

    expect(() =>
      battle([{ enemy: enemyFormation("wave-1", 6) }], 3),
    ).toThrow(/enemy frontline must have 3 slots/);

    expect(() =>
      battle([
        { enemy: enemyFormation("wave-1", 3, 33) },
        { enemy: enemyFormation("wave-2", 3, 33) },
        { enemy: enemyFormation("wave-3", 3, 33) },
      ]),
    ).toThrow(/total enemy count must not exceed 99/);
  });
});

describe("turn phase and counters", () => {
  it("moves through both ordered turn-end phases before starting turn 2", () => {
    let state = battle();

    state = beginAllyTurnEnd(state);
    expect(state.phase).toBe("ally_turn_end");
    state = completeAllyTurnEnd(state);
    expect(state).toMatchObject({
      phase: "enemy_action",
      battleTurn: 1,
      waveTurn: 1,
    });
    state = beginEnemyTurnEnd(state);
    expect(state.phase).toBe("enemy_turn_end");
    state = completeEnemyTurnEnd(state);
    expect(state).toMatchObject({
      phase: "ally_action",
      battleTurn: 2,
      waveTurn: 2,
    });
  });

  it("rejects skipped, repeated, and post-finish transitions", () => {
    const initial = battle();
    expect(() => completeAllyTurnEnd(initial)).toThrow(/battle phase/);
    expect(() => beginEnemyTurnEnd(initial)).toThrow(/battle phase/);

    const allyEnd = beginAllyTurnEnd(initial);
    expect(() => beginAllyTurnEnd(allyEnd)).toThrow(/battle phase/);

    const finished = retreatBattle(allyEnd);
    expect(() => completeAllyTurnEnd(finished)).toThrow(
      /finished battles cannot advance/,
    );
    expect(() => retreatBattle(finished)).toThrow(
      /finished battles cannot retreat/,
    );
  });
});

describe("Wave progression", () => {
  it("does not clear a Wave while a living enemy reserve remains", () => {
    let state = battle([
      { enemy: enemyFormation("wave-1", 3, 1) },
      { enemy: enemyFormation("wave-2") },
    ]);
    state = defeatUnit(state, "wave-1-front");

    expect(isCurrentWaveCleared(state)).toBe(false);
    state = completeAllyTurnEnd(beginAllyTurnEnd(state));
    expect(state).toMatchObject({
      waveNumber: 1,
      phase: "enemy_action",
    });
  });

  it("does not clear a Wave while break, revival, or addition work remains", () => {
    let state = battle([
      {
        enemy: enemyFormation("wave-1"),
        continuation: {
          pendingBreaks: 1,
          pendingRevives: 1,
          pendingAdditions: 1,
        },
      },
      { enemy: enemyFormation("wave-2") },
    ]);
    state = defeatUnit(state, "wave-1-front");

    expect(isCurrentWaveCleared(state)).toBe(false);
    state = completeAllyTurnEnd(beginAllyTurnEnd(state));
    expect(state.phase).toBe("enemy_action");

    state = setWaveContinuation(state, {
      pendingBreaks: 0,
      pendingRevives: 0,
      pendingAdditions: 0,
    });
    state = completeEnemyTurnEnd(beginEnemyTurnEnd(state));
    expect(state).toMatchObject({
      waveNumber: 2,
      battleTurn: 2,
      waveTurn: 1,
      phase: "ally_action",
    });
  });

  it("advances after the ally turn and preserves the changed ally state", () => {
    let state = battle([
      { enemy: enemyFormation("wave-1") },
      {
        enemy: enemyFormation("wave-2"),
        continuation: { pendingAdditions: 2 },
      },
    ]);
    const allyA = findUnitLocation(state.formation, "ally-a")?.unit;
    if (!allyA) throw new Error("missing ally-a");
    let formation = replaceUnit(state.formation, {
      ...allyA,
      hp: 4_321,
      np: 87,
      skillCooldowns: [2, 0, 5],
    });
    formation = {
      ...formation,
      ally: {
        ...formation.ally,
        frontline: [
          formation.ally.frontline[2],
          formation.ally.frontline[1],
          formation.ally.frontline[0],
        ],
      },
    };
    state = setBattleFormation(state, formation);
    state = defeatUnit(state, "wave-1-front");
    state = completeAllyTurnEnd(beginAllyTurnEnd(state));

    expect(state).toMatchObject({
      waveNumber: 2,
      battleTurn: 2,
      waveTurn: 1,
      phase: "ally_action",
      outcome: "ongoing",
      waveContinuation: {
        pendingBreaks: 0,
        pendingRevives: 0,
        pendingAdditions: 2,
      },
    });
    expect(state.formation.ally.frontline[2]).toMatchObject({
      instanceId: "ally-a",
      hp: 4_321,
      np: 87,
      skillCooldowns: [2, 0, 5],
    });
    expect(state.formation.enemy.frontline[0]?.instanceId).toBe(
      "wave-2-front",
    );
  });

  it("can advance after an enemy-turn recurring effect clears the Wave", () => {
    let state = battle([
      { enemy: enemyFormation("wave-1") },
      { enemy: enemyFormation("wave-2") },
    ]);
    state = completeAllyTurnEnd(beginAllyTurnEnd(state));
    state = defeatUnit(state, "wave-1-front");
    state = completeEnemyTurnEnd(beginEnemyTurnEnd(state));

    expect(state).toMatchObject({
      waveNumber: 2,
      battleTurn: 2,
      waveTurn: 1,
      phase: "ally_action",
    });
  });
});

describe("annihilation-only results", () => {
  it("wins only when the final Wave is cleared at a turn-end checkpoint", () => {
    let state = battle();
    state = defeatSide(state, "enemy");
    expect(state.outcome).toBe("ongoing");

    state = completeAllyTurnEnd(beginAllyTurnEnd(state));
    expect(state).toMatchObject({
      phase: "finished",
      outcome: "victory",
      battleTurn: 1,
      waveTurn: 1,
    });
  });

  it("loses when all allies are defeated", () => {
    let state = defeatSide(battle(), "ally");
    state = completeAllyTurnEnd(beginAllyTurnEnd(state));
    expect(state).toMatchObject({
      phase: "finished",
      outcome: "defeat",
    });
  });

  it("resolves simultaneous annihilation as defeat", () => {
    let state = battle();
    state = defeatSide(state, "enemy");
    state = defeatSide(state, "ally");
    state = completeAllyTurnEnd(beginAllyTurnEnd(state));
    expect(state).toMatchObject({
      phase: "finished",
      outcome: "defeat",
    });
  });

  it("records retreat separately from victory and defeat", () => {
    const state = retreatBattle(battle());
    expect(state).toMatchObject({
      phase: "finished",
      outcome: "retreat",
    });
  });
});
