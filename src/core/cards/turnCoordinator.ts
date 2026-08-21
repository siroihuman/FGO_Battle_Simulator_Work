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
  findUnitLocation,
  replaceUnit,
} from "../battle/formation";
import { setBattleFormation } from "../battle/state";
import { addNp } from "../../formulas/np";
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
  /**
   * True only when a preceding single-target normal card from the same owner
   * defeated this target and deliberately retained it for overkill.
   */
  defeatedTargetContinuation: boolean;
  chain: CommandCardChainAnalysis;
  preflight:
    | Extract<
        CommandCardExecutionResult,
        { outcome: "ready" }
      >
    | Extract<
        ExtraAttackExecutionResult,
        { outcome: "ready" }
      >;
}

export interface AllyCommandActionResolverResult {
  state: BattleState;
  /** Actual target scope of a resolved damaging action. */
  targetScope?: "single" | "all";
  /**
   * Opaque, serializable action detail for the later battle-log layer.
   */
  detail?: unknown;
}

export type AllyCommandActionResolver = (
  input: AllyCommandActionResolverInput,
) => AllyCommandActionResolverResult;

export interface AllyCommandActionGuardInput {
  state: BattleState;
  action: AllyCommandSequenceAction;
  target: EnemyTargetAnchor;
}

export type AllyCommandActionGuard = (
  input: AllyCommandActionGuardInput,
) => readonly CommandCardExecutionRestriction[];

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
  artsChainNpAddition: ArtsChainNpAddition;
  quickChainStarAddition: BattleStarAddition;
  initialTarget: EnemyTargetAnchor;
  actions: AllyCommandActionResolution[];
  plannedActionCount: 3 | 4;
  stopReason: AllyCommandSequenceStopReason;
}

export interface ArtsChainNpChange {
  instanceId: string;
  before: number;
  requested: number;
  added: number;
  after: number;
}

export interface ArtsChainNpAddition {
  state: BattleState;
  requestedPerParticipant: number;
  participantInstanceIds: string[];
  changes: ArtsChainNpChange[];
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

function isNormalCommandAction(
  action: AllyCommandSequenceAction,
): boolean {
  return action.kind === "selected_card"
    && action.calculation.card.kind === "normal";
}

function isSameOwnerNormalContinuation(
  state: BattleState,
  current: AllyCommandSequenceAction,
  next: AllyCommandSequenceAction | undefined,
  targetScope: "single" | "all" | undefined,
): boolean {
  if (
    targetScope !== "single"
    || !isNormalCommandAction(current)
    || !next
    || next.ownerInstanceId !== current.ownerInstanceId
    || !(
      isNormalCommandAction(next)
      || next.kind === "extra_attack"
    )
  ) {
    return false;
  }
  return commandCardOwnerRestrictions(
    state,
    next.ownerInstanceId,
  ).restrictions.length === 0;
}

function isDefeatedEnemyTarget(
  state: BattleState,
  target: EnemyTargetAnchor,
): boolean {
  const location = findUnitLocation(
    state.formation,
    target.instanceId,
  );
  return Boolean(
    location
    && location.side === "enemy"
    && location.area === "frontline"
    && !location.unit.alive,
  );
}

/**
 * Applies the fixed Arts-chain NP bonus before the first selected command is
 * started. Each battle instance receives the bonus at most once, even when
 * it owns multiple selected Arts cards.
 */
export function applyArtsChainNp(
  state: BattleState,
  chain: CommandCardChainAnalysis,
): ArtsChainNpAddition {
  let formation = state.formation;
  const changes: ArtsChainNpChange[] = [];
  for (const instanceId of chain.artsChainParticipantInstanceIds) {
    const location = findUnitLocation(formation, instanceId);
    if (!location || location.side !== "ally") {
      throw new RangeError(
        `Arts-chain participant is missing: ${instanceId}`,
      );
    }
    const unit = location.unit;
    const after = addNp(
      unit.np,
      chain.artsChainNpUnits,
      unit.noblePhantasm?.level ?? 1,
    );
    formation = replaceUnit(formation, {
      ...unit,
      np: after,
    });
    changes.push({
      instanceId,
      before: unit.np,
      requested: chain.artsChainNpUnits,
      added: after - unit.np,
      after,
    });
  }
  return {
    state:
      changes.some(({ added }) => added !== 0)
        ? setBattleFormation(state, formation)
        : state,
    requestedPerParticipant: chain.artsChainNpUnits,
    participantInstanceIds: [
      ...chain.artsChainParticipantInstanceIds,
    ],
    changes,
  };
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
  actionGuard?: AllyCommandActionGuard,
): AllyCommandSequenceStartResult {
  const starting = resolveStartingTarget(
    state,
    requestedTargetInstanceId,
  );
  if (!starting.accepted) return starting;

  const chain = analyzeCommandCardChain(state, selection);
  const artsChainNpAddition = applyArtsChainNp(state, chain);
  const quickChainStarAddition = addNextCommandStars(
    artsChainNpAddition.state,
    chain.quickChainStars,
  );
  const plan = plannedActions(chain);
  const actions: AllyCommandActionResolution[] = [];
  const initialTarget = starting.target;
  let target: EnemyTargetAnchor | null = initialTarget;
  let currentState = quickChainStarAddition.state;

  for (const [actionIndex, action] of plan.entries()) {
    if (!target) break;
    const targetAtStart = target;
    const defeatedTargetContinuation = isDefeatedEnemyTarget(
      currentState,
      targetAtStart,
    );
    const additionalRestrictions =
      action.kind === "selected_card" && actionGuard
        ? actionGuard({
            state: currentState,
            action,
            target: targetAtStart,
          })
        : [];
    const preflight =
      action.kind === "selected_card"
        ? beginCommandCardExecution(
            currentState,
            action.calculation.card,
            additionalRestrictions,
          )
        : beginExtraAttackExecution(
            currentState,
            action.calculation,
          );
    currentState = preflight.state;

    let resolverCalled = false;
    let resolverDetail: unknown;
    let resolvedTargetScope: "single" | "all" | undefined;
    if (preflight.outcome === "ready") {
      const resolved = resolver({
        state: currentState,
        action,
        target: targetAtStart,
        defeatedTargetContinuation,
        chain,
        preflight,
      });
      assertResolverState(resolved.state);
      currentState = resolved.state;
      resolverCalled = true;
      resolverDetail = resolved.detail;
      resolvedTargetScope = resolved.targetScope;
    }

    const deferDefeatedEnemyTarget =
      isDefeatedEnemyTarget(currentState, targetAtStart)
      && isSameOwnerNormalContinuation(
        currentState,
        action,
        plan[actionIndex + 1],
        resolvedTargetScope,
      );
    const boundary = resolveActionBoundary(
      currentState,
      targetAtStart,
      { deferDefeatedEnemyTarget },
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
      artsChainNpAddition,
      quickChainStarAddition,
      initialTarget,
      actions,
      plannedActionCount: chain.extraAttack ? 4 : 3,
      stopReason,
    },
  };
}
