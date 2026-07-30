import {
  initialEnemyTarget,
  resolveActionBoundary,
  selectEnemyTarget,
  type ActionBoundaryResult,
  type EnemyTargetAnchor,
  type EnemyTargetSelectionRejectionReason,
} from "../battle/actionBoundary";
import { beginAllyTurnEnd } from "../battle/progression";
import type { BattleState } from "../battle/state";
import {
  addNextCommandStars,
  type BattleStarAddition,
} from "../battle/starState";
import {
  analyzeCommandCardChain,
  type CommandCardCalculationContext,
  type CommandCardChainAnalysis,
  type ExtraAttackCalculationContext,
} from "./chain";
import {
  beginCommandCardExecution,
  commandCardOwnerRestrictions,
  type CommandCardExecutionRestriction,
  type CommandCardExecutionResult,
  type CommandCardSelection,
} from "./selection";

export type AllyCommandSequenceAction =
  | {
      kind: "selected_card";
      sequence: 1 | 2 | 3;
      ownerInstanceId: string;
      calculation: CommandCardCalculationContext;
    }
  | {
      kind: "extra_attack";
      sequence: 4;
      ownerInstanceId: string;
      calculation: ExtraAttackCalculationContext;
    };

export interface AllyCommandActionResolverInput {
  /**
   * NP is already consumed when this is an NP action.
   */
  state: BattleState;
  action: AllyCommandSequenceAction;
  target: EnemyTargetAnchor;
  chain: CommandCardChainAnalysis;
}

export interface AllyCommandActionResolverResult {
  state: BattleState;
  /**
   * Opaque, serializable action detail for the later battle-log layer.
   */
  detail?: unknown;
}

export type AllyCommandActionResolver = (
  input: AllyCommandActionResolverInput,
) => AllyCommandActionResolverResult;

export type ExtraAttackExecutionResult =
  | {
      outcome: "ready";
      state: BattleState;
      restrictions: [];
    }
  | {
      outcome: "fizzled";
      state: BattleState;
      restrictions: CommandCardExecutionRestriction[];
    };

export interface AllyCommandActionResolution {
  action: AllyCommandSequenceAction;
  targetAtStart: EnemyTargetAnchor;
  preflight:
    | CommandCardExecutionResult
    | ExtraAttackExecutionResult;
  resolverCalled: boolean;
  resolverDetail?: unknown;
  boundary: ActionBoundaryResult;
}

export type AllyCommandSequenceStopReason =
  | "sequence_complete"
  | "no_enemy_target";

export interface AllyCommandSequenceResult {
  state: BattleState;
  selection: CommandCardSelection;
  chain: CommandCardChainAnalysis;
  quickChainStarAddition: BattleStarAddition;
  initialTarget: EnemyTargetAnchor;
  actions: AllyCommandActionResolution[];
  plannedActionCount: 3 | 4;
  stopReason: AllyCommandSequenceStopReason;
}

export type AllyCommandSequenceRejectionReason =
  | EnemyTargetSelectionRejectionReason
  | "no_enemy_target";

export type AllyCommandSequenceStartResult =
  | {
      accepted: true;
      result: AllyCommandSequenceResult;
    }
  | {
      accepted: false;
      reason: AllyCommandSequenceRejectionReason;
    };

function assertResolverState(state: BattleState): void {
  if (state.outcome !== "ongoing" || state.phase !== "ally_action") {
    throw new RangeError(
      "ally command action resolver must return an ongoing ally action phase",
    );
  }
}

function plannedActions(
  chain: CommandCardChainAnalysis,
): AllyCommandSequenceAction[] {
  const selected: AllyCommandSequenceAction[] = [
    {
      kind: "selected_card",
      sequence: 1,
      ownerInstanceId: chain.cards[0].card.ownerInstanceId,
      calculation: chain.cards[0],
    },
    {
      kind: "selected_card",
      sequence: 2,
      ownerInstanceId: chain.cards[1].card.ownerInstanceId,
      calculation: chain.cards[1],
    },
    {
      kind: "selected_card",
      sequence: 3,
      ownerInstanceId: chain.cards[2].card.ownerInstanceId,
      calculation: chain.cards[2],
    },
  ];
  return chain.extraAttack
    ? [
        ...selected,
        {
          kind: "extra_attack",
          sequence: 4,
          ownerInstanceId: chain.extraAttack.ownerInstanceId,
          calculation: chain.extraAttack,
        },
      ]
    : selected;
}

/**
 * Rechecks an Extra Attack owner immediately before execution.
 */
export function beginExtraAttackExecution(
  state: BattleState,
  action: ExtraAttackCalculationContext,
): ExtraAttackExecutionResult {
  if (state.outcome !== "ongoing" || state.phase !== "ally_action") {
    throw new RangeError(
      "Extra Attack can only execute during an ongoing ally action phase",
    );
  }
  const owner = commandCardOwnerRestrictions(
    state,
    action.ownerInstanceId,
  );
  if (owner.restrictions.length > 0) {
    return {
      outcome: "fizzled",
      state,
      restrictions: owner.restrictions,
    };
  }
  return {
    outcome: "ready",
    state,
    restrictions: [],
  };
}

function resolveStartingTarget(
  state: BattleState,
  requestedInstanceId?: string,
):
  | {
      accepted: true;
      target: EnemyTargetAnchor;
    }
  | {
      accepted: false;
      reason: AllyCommandSequenceRejectionReason;
    } {
  if (requestedInstanceId !== undefined) {
    return selectEnemyTarget(state, requestedInstanceId);
  }
  if (state.outcome !== "ongoing" || state.phase !== "ally_action") {
    return { accepted: false, reason: "invalid_phase" };
  }
  const target = initialEnemyTarget(state);
  return target
    ? { accepted: true, target }
    : { accepted: false, reason: "no_enemy_target" };
}

/**
 * Resolves the selected three cards and an optional Extra Attack in order.
 *
 * The injected resolver owns Hit, damage, NP, star, and action-effect work.
 * This coordinator owns immutable selection-time chain facts, execution-time
 * card checks, NP consumption, completed-action boundaries, deterministic
 * retargeting, early stop when no enemy remains, and ally-turn-end entry.
 */
export function resolveAllyCommandSequence(
  state: BattleState,
  selection: CommandCardSelection,
  resolver: AllyCommandActionResolver,
  requestedTargetInstanceId?: string,
): AllyCommandSequenceStartResult {
  const starting = resolveStartingTarget(
    state,
    requestedTargetInstanceId,
  );
  if (!starting.accepted) return starting;

  const chain = analyzeCommandCardChain(state, selection);
  const quickChainStarAddition = addNextCommandStars(
    state,
    chain.quickChainStars,
  );
  const plan = plannedActions(chain);
  const actions: AllyCommandActionResolution[] = [];
  const initialTarget = starting.target;
  let target: EnemyTargetAnchor | null = initialTarget;
  let currentState = quickChainStarAddition.state;

  for (const action of plan) {
    if (!target) break;
    const targetAtStart = target;
    const preflight =
      action.kind === "selected_card"
        ? beginCommandCardExecution(
            currentState,
            action.calculation.card,
          )
        : beginExtraAttackExecution(
            currentState,
            action.calculation,
          );
    currentState = preflight.state;

    let resolverCalled = false;
    let resolverDetail: unknown;
    if (preflight.outcome === "ready") {
      const resolved = resolver({
        state: currentState,
        action,
        target: targetAtStart,
        chain,
      });
      assertResolverState(resolved.state);
      currentState = resolved.state;
      resolverCalled = true;
      resolverDetail = resolved.detail;
    }

    const boundary = resolveActionBoundary(
      currentState,
      targetAtStart,
    );
    currentState = boundary.state;
    target = boundary.nextEnemyTarget;
    actions.push({
      action,
      targetAtStart,
      preflight,
      resolverCalled,
      ...(resolverDetail === undefined
        ? {}
        : { resolverDetail }),
      boundary,
    });
  }

  const stopReason: AllyCommandSequenceStopReason =
    actions.length === plan.length
      ? "sequence_complete"
      : "no_enemy_target";
  return {
    accepted: true,
    result: {
      state: beginAllyTurnEnd(currentState),
      selection,
      chain,
      quickChainStarAddition,
      initialTarget,
      actions,
      plannedActionCount: chain.extraAttack ? 4 : 3,
      stopReason,
    },
  };
}
