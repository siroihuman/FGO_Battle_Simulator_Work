import { findUnitLocation } from "./formation";
import type { BattleState } from "./state";
import type { BattleUnitState } from "./types";
import {
  applyAllyDepartureDeckRebuild,
  resolveAllyDefeatReplacement,
  resolveEnemyReplacement,
  type AllyDefeatReplacementResult,
  type EnemyReplacementResult,
} from "./replacement";

export interface EnemyTargetAnchor {
  instanceId: string;
  frontlineIndex: number;
}

export type EnemyTargetSelectionRejectionReason =
  | "invalid_phase"
  | "target_missing"
  | "target_not_enemy"
  | "target_not_frontline"
  | "target_defeated";

export type EnemyTargetSelectionResult =
  | {
      accepted: true;
      target: EnemyTargetAnchor;
    }
  | {
      accepted: false;
      reason: EnemyTargetSelectionRejectionReason;
    };

export interface ActionBoundaryResult {
  state: BattleState;
  phase: "ally_action" | "enemy_action";
  allyReplacement: AllyDefeatReplacementResult;
  enemyReplacement: EnemyReplacementResult;
  previousEnemyTarget: EnemyTargetAnchor | null;
  nextEnemyTarget: EnemyTargetAnchor | null;
}

export interface ActionBoundaryOptions {
  /**
   * Defers only the defeated selected enemy while the same ally continues a
   * consecutive single-target normal-card attack.
   */
  deferDefeatedEnemyTarget?: boolean;
}

function assertActionPhase(
  state: BattleState,
): asserts state is BattleState & {
  phase: "ally_action" | "enemy_action";
} {
  if (
    state.outcome !== "ongoing"
    || (
      state.phase !== "ally_action"
      && state.phase !== "enemy_action"
    )
  ) {
    throw new RangeError(
      "action boundary requires an ongoing ally or enemy action phase",
    );
  }
}

function isAttackableEnemy(
  unit: BattleUnitState | null,
): unit is BattleUnitState {
  // A pending break remains alive at HP 0 and can receive over-gauge attacks.
  return unit !== null && unit.alive;
}

function anchorAt(
  state: BattleState,
  frontlineIndex: number,
): EnemyTargetAnchor | null {
  const unit = state.formation.enemy.frontline[frontlineIndex] ?? null;
  return isAttackableEnemy(unit)
    ? {
        instanceId: unit.instanceId,
        frontlineIndex,
      }
    : null;
}

/**
 * Returns the frontmost living enemy at ally-turn attack start.
 */
export function initialEnemyTarget(
  state: BattleState,
): EnemyTargetAnchor | null {
  if (state.outcome !== "ongoing" || state.phase !== "ally_action") {
    throw new RangeError(
      "initial enemy target requires an ongoing ally action phase",
    );
  }
  for (
    let index = 0;
    index < state.formation.enemy.frontline.length;
    index += 1
  ) {
    const target = anchorAt(state, index);
    if (target) return target;
  }
  return null;
}

/**
 * Validates a user-selected enemy target without changing battle state.
 */
export function selectEnemyTarget(
  state: BattleState,
  instanceId: string,
): EnemyTargetSelectionResult {
  if (state.outcome !== "ongoing" || state.phase !== "ally_action") {
    return { accepted: false, reason: "invalid_phase" };
  }
  const location = findUnitLocation(state.formation, instanceId);
  if (!location) {
    return { accepted: false, reason: "target_missing" };
  }
  if (location.side !== "enemy") {
    return { accepted: false, reason: "target_not_enemy" };
  }
  if (location.area !== "frontline") {
    return { accepted: false, reason: "target_not_frontline" };
  }
  if (!location.unit.alive) {
    return { accepted: false, reason: "target_defeated" };
  }
  return {
    accepted: true,
    target: {
      instanceId,
      frontlineIndex: location.index,
    },
  };
}

/**
 * Chooses the target for the next command action.
 *
 * A surviving original target stays selected. After departure, selection
 * starts strictly behind the original slot, skips empty slots, and wraps to
 * the front. The original slot is checked last, so an immediate replacement
 * in that slot does not receive unconditional priority.
 */
export function retargetEnemyAfterAction(
  state: BattleState,
  previous: EnemyTargetAnchor,
): EnemyTargetAnchor | null {
  const current = findUnitLocation(
    state.formation,
    previous.instanceId,
  );
  if (
    current?.side === "enemy"
    && current.area === "frontline"
    && current.unit.alive
  ) {
    return {
      instanceId: current.unit.instanceId,
      frontlineIndex: current.index,
    };
  }

  const slotCount = state.formation.enemy.frontline.length;
  for (let offset = 1; offset <= slotCount; offset += 1) {
    const index = (previous.frontlineIndex + offset) % slotCount;
    const target = anchorAt(state, index);
    if (target) return target;
  }
  return null;
}

function resolveAllyReplacementAndDeck(
  state: BattleState,
): {
  state: BattleState;
  replacement: AllyDefeatReplacementResult;
} {
  const replacement = resolveAllyDefeatReplacement(state);
  return {
    state: applyAllyDepartureDeckRebuild(
      replacement.state,
      replacement,
    ),
    replacement,
  };
}

/**
 * Settles exactly one completed action. Call only after every Hit and
 * after-effect belonging to that action has finished.
 *
 * This boundary deliberately performs no victory, defeat, Wave, break, or
 * turn transition judgment. Those remain turn-end responsibilities.
 */
export function resolveActionBoundary(
  state: BattleState,
  previousEnemyTarget: EnemyTargetAnchor | null = null,
  options: ActionBoundaryOptions = {},
): ActionBoundaryResult {
  assertActionPhase(state);
  const phase = state.phase;
  let currentState: BattleState = state;
  let allyReplacement: AllyDefeatReplacementResult;
  let enemyReplacement: EnemyReplacementResult;

  if (phase === "ally_action") {
    enemyReplacement = resolveEnemyReplacement(
      currentState,
      "after_action",
      options.deferDefeatedEnemyTarget && previousEnemyTarget
        ? {
            deferredDepartureInstanceIds: [
              previousEnemyTarget.instanceId,
            ],
          }
        : {},
    );
    currentState = enemyReplacement.state;
    const ally = resolveAllyReplacementAndDeck(currentState);
    currentState = ally.state;
    allyReplacement = ally.replacement;
  } else {
    const ally = resolveAllyReplacementAndDeck(currentState);
    currentState = ally.state;
    allyReplacement = ally.replacement;
    enemyReplacement = resolveEnemyReplacement(
      currentState,
      "after_action",
    );
    currentState = enemyReplacement.state;
  }

  const deferredTargetLocation =
    phase === "ally_action"
    && options.deferDefeatedEnemyTarget
    && previousEnemyTarget
      ? findUnitLocation(
          currentState.formation,
          previousEnemyTarget.instanceId,
        )
      : undefined;
  const deferredTarget =
    deferredTargetLocation?.side === "enemy"
    && deferredTargetLocation.area === "frontline"
    && !deferredTargetLocation.unit.alive
      ? {
          instanceId: deferredTargetLocation.unit.instanceId,
          frontlineIndex: deferredTargetLocation.index,
        }
      : null;

  return {
    state: currentState,
    phase,
    allyReplacement,
    enemyReplacement,
    previousEnemyTarget,
    nextEnemyTarget:
      phase === "ally_action" && previousEnemyTarget
        ? deferredTarget
          ?? retargetEnemyAfterAction(
              currentState,
              previousEnemyTarget,
            )
        : null,
  };
}
