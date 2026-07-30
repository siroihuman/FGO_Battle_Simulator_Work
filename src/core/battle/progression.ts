import type { BattleState } from "./state";
import {
  hasLivingUnit,
  isCurrentWaveCleared,
} from "./state";
import { activateNextCommandStars } from "./starState";

function assertPhase(
  state: BattleState,
  expected: BattleState["phase"],
): void {
  if (state.outcome !== "ongoing" || state.phase === "finished") {
    throw new RangeError("finished battles cannot advance");
  }
  if (state.phase !== expected) {
    throw new RangeError(
      `battle phase must be ${expected}, received ${state.phase}`,
    );
  }
}

function finishBattle(
  state: BattleState,
  outcome: Exclude<BattleState["outcome"], "ongoing">,
): BattleState {
  return {
    ...state,
    phase: "finished",
    outcome,
  };
}

function startNextWave(state: BattleState): BattleState {
  const [nextWave, ...remainingWaves] = state.remainingWaves;
  if (!nextWave) {
    throw new RangeError("cannot advance beyond the final Wave");
  }
  const withActivatedStars =
    activateNextCommandStars(state).state;
  return {
    ...withActivatedStars,
    formation: {
      ally: {
        frontline: [...state.formation.ally.frontline],
        reserve: [...state.formation.ally.reserve],
      },
      enemy: {
        frontline: [...nextWave.enemy.frontline],
        reserve: [...nextWave.enemy.reserve],
      },
    },
    remainingWaves,
    waveNumber: state.waveNumber + 1,
    battleTurn: state.battleTurn + 1,
    waveTurn: 1,
    phase: "ally_action",
    waveContinuation: { ...nextWave.continuation },
  };
}

/**
 * Applies annihilation-only result and Wave checks after all ordered turn-end
 * work has finished. Ally annihilation is checked first so simultaneous
 * annihilation is always a defeat.
 */
function resolveTurnEndCheckpoint(
  state: BattleState,
): BattleState | undefined {
  if (!hasLivingUnit(state.formation.ally)) {
    return finishBattle(state, "defeat");
  }
  if (!isCurrentWaveCleared(state)) return undefined;
  if (state.remainingWaves.length === 0) {
    return finishBattle(state, "victory");
  }
  return startNextWave(state);
}

export function beginAllyTurnEnd(state: BattleState): BattleState {
  assertPhase(state, "ally_action");
  return {
    ...state,
    phase: "ally_turn_end",
  };
}

/**
 * Call after attack-aftereffects, break settlement, ally recurring effects,
 * death/replacement, duration updates, and cooldown updates are complete.
 */
export function completeAllyTurnEnd(state: BattleState): BattleState {
  assertPhase(state, "ally_turn_end");
  const checkpoint = resolveTurnEndCheckpoint(state);
  if (checkpoint) return checkpoint;
  return {
    ...state,
    phase: "enemy_action",
  };
}

export function beginEnemyTurnEnd(state: BattleState): BattleState {
  assertPhase(state, "enemy_action");
  return {
    ...state,
    phase: "enemy_turn_end",
  };
}

/**
 * Call after enemy recurring effects, survival, duration/cooldown updates, and
 * standard enemy replacement are complete.
 */
export function completeEnemyTurnEnd(state: BattleState): BattleState {
  assertPhase(state, "enemy_turn_end");
  const checkpoint = resolveTurnEndCheckpoint(state);
  if (checkpoint) return checkpoint;
  const withActivatedStars =
    activateNextCommandStars(state).state;
  return {
    ...withActivatedStars,
    battleTurn: state.battleTurn + 1,
    waveTurn: state.waveTurn + 1,
    phase: "ally_action",
  };
}

export function retreatBattle(state: BattleState): BattleState {
  if (state.outcome !== "ongoing" || state.phase === "finished") {
    throw new RangeError("finished battles cannot retreat");
  }
  return finishBattle(state, "retreat");
}
