import {
  beginEnemyActionExecution,
  effectiveEnemyCharge,
  enemyActorExecutionSkipReason,
  planEnemyNormalActions,
  planEnemyPrioritySkills,
  type EnemyActionExecutionResult,
  type EnemyActionRequest,
  type EnemyActionSkipReason,
  type EnemyNormalActionPlan,
  type EnemyNormalActionSlot,
  type EnemyPrioritySkillRequest,
  type EnemyPrioritySkillStep,
} from "./enemyTurn";
import {
  resolveActionBoundary,
  type ActionBoundaryResult,
} from "../core/battle/actionBoundary";
import { findUnitLocation } from "../core/battle/formation";
import { beginEnemyTurnEnd } from "../core/battle/progression";
import {
  hasLivingUnit,
  type BattleState,
} from "../core/battle/state";

export interface EnemyActionResolverInput {
  /**
   * Enemy NP charge is already reset when this is a ready NP action.
   */
  state: BattleState;
  stage: "priority" | "normal";
  actionNumber: number;
  actorInstanceId: string;
  request: EnemyActionRequest;
  preflight: Extract<
    EnemyActionExecutionResult,
    { outcome: "ready" }
  >;
  priorityStep: EnemyPrioritySkillStep | null;
  normalSlot: EnemyNormalActionSlot | null;
}

export interface EnemyActionResolverResult {
  state: BattleState;
  /**
   * Opaque, serializable action detail for the later battle-log layer.
   */
  detail?: unknown;
}

export type EnemyActionResolver = (
  input: EnemyActionResolverInput,
) => EnemyActionResolverResult;

export interface EnemyActionGuardInput {
  state: BattleState;
  stage: "priority" | "normal";
  actorInstanceId: string;
  request: EnemyActionRequest;
}

export interface EnemyActionGuardResult {
  skipReason: EnemyActionSkipReason | null;
  snapshot?: unknown;
}

export type EnemyActionGuard = (
  input: EnemyActionGuardInput,
) => EnemyActionGuardResult;

function guardedPreflight(
  state: BattleState,
  actorInstanceId: string,
  request: EnemyActionRequest,
  source: "priority" | "normal",
  guardResult: EnemyActionGuardResult,
): EnemyActionExecutionResult {
  const preflight = beginEnemyActionExecution(
    state,
    actorInstanceId,
    request,
    source,
    guardResult.skipReason,
  );
  return preflight.outcome === "ready"
      && guardResult.snapshot !== undefined
    ? { ...preflight, guardSnapshot: guardResult.snapshot }
    : preflight;
}

export interface EnemyNormalActionSelectorInput {
  state: BattleState;
  slot: EnemyNormalActionSlot;
}

export type EnemyNormalActionSelector = (
  input: EnemyNormalActionSelectorInput,
) => EnemyActionRequest;

export interface EnemyTurnActionResolution {
  stage: "priority" | "normal";
  actionNumber: number;
  actorInstanceId: string;
  request: EnemyActionRequest;
  priorityStep: EnemyPrioritySkillStep | null;
  normalSlot: EnemyNormalActionSlot | null;
  selectorCalled: boolean;
  preflight: EnemyActionExecutionResult;
  resolverCalled: boolean;
  resolverDetail?: unknown;
  boundary: ActionBoundaryResult;
}

export type EnemyTurnSequenceStopReason =
  | "sequence_complete"
  | "ally_annihilated";

export interface EnemyTurnSequenceResult {
  state: BattleState;
  priorityPlan: EnemyPrioritySkillStep[];
  normalPlan: EnemyNormalActionPlan | null;
  actions: EnemyTurnActionResolution[];
  stopReason: EnemyTurnSequenceStopReason;
}

function assertEnemyActionResolverState(state: BattleState): void {
  if (state.outcome !== "ongoing" || state.phase !== "enemy_action") {
    throw new RangeError(
      "enemy action resolver must return an ongoing enemy action phase",
    );
  }
}

/**
 * Minimal deterministic AI fallback. A full charge uses a configured NP;
 * otherwise the enemy requests its normal attack. Skills require quest AI or
 * a supplied normal selector.
 */
export function defaultEnemyNormalActionRequest(
  state: BattleState,
  actorInstanceId: string,
): EnemyActionRequest {
  const location = findUnitLocation(
    state.formation,
    actorInstanceId,
  );
  if (
    location?.side === "enemy"
    && location.area === "frontline"
    && location.unit.alive
  ) {
    const charge = effectiveEnemyCharge(location.unit);
    if (
      charge.chargeMax > 0
      && charge.charge >= charge.chargeMax
    ) {
      return { kind: "noble_phantasm" };
    }
  }
  return { kind: "normal_attack" };
}

function resolveReadyAction(
  state: BattleState,
  stage: "priority" | "normal",
  actionNumber: number,
  actorInstanceId: string,
  request: EnemyActionRequest,
  preflight: EnemyActionExecutionResult,
  resolver: EnemyActionResolver,
  priorityStep: EnemyPrioritySkillStep | null,
  normalSlot: EnemyNormalActionSlot | null,
): {
  state: BattleState;
  resolverCalled: boolean;
  resolverDetail?: unknown;
} {
  if (preflight.outcome !== "ready") {
    return {
      state,
      resolverCalled: false,
    };
  }
  const resolved = resolver({
    state,
    stage,
    actionNumber,
    actorInstanceId,
    request,
    preflight,
    priorityStep,
    normalSlot,
  });
  assertEnemyActionResolverState(resolved.state);
  return {
    state: resolved.state,
    resolverCalled: true,
    ...(resolved.detail === undefined
      ? {}
      : { resolverDetail: resolved.detail }),
  };
}

function appendResolution(
  actions: EnemyTurnActionResolution[],
  input: Omit<EnemyTurnActionResolution, "actionNumber">,
): void {
  actions.push({
    ...input,
    actionNumber: actions.length + 1,
  });
}

/**
 * Resolves quest-priority skills, rebuilds the normal three-slot plan from
 * the resulting frontline, then resolves normal slots in order.
 *
 * The injected resolver owns concrete targets, Hits, damage, NP, stars, and
 * action effects. This coordinator owns ordering, execution-time actor/action
 * checks, NP charge consumption, action boundaries, early ally-annihilation
 * stop, and enemy-turn-end entry.
 */
export function resolveEnemyTurnSequence(
  state: BattleState,
  priorityRequests: readonly EnemyPrioritySkillRequest[],
  resolver: EnemyActionResolver,
  normalSelector?: EnemyNormalActionSelector,
  actionGuard?: EnemyActionGuard,
): EnemyTurnSequenceResult {
  const priorityPlan = planEnemyPrioritySkills(
    state,
    priorityRequests,
  );
  const actions: EnemyTurnActionResolution[] = [];
  let currentState = state;

  for (const step of priorityPlan) {
    if (!hasLivingUnit(currentState.formation.ally)) break;
    const actionNumber = actions.length + 1;
    const request = step.request;
    const guardResult = actionGuard?.({
      state: currentState,
      stage: "priority",
      actorInstanceId: step.actorInstanceId,
      request,
    }) ?? { skipReason: null };
    const preflight = guardedPreflight(
      currentState,
      step.actorInstanceId,
      request,
      "priority",
      guardResult,
    );
    currentState = preflight.state;
    const resolved = resolveReadyAction(
      currentState,
      "priority",
      actionNumber,
      step.actorInstanceId,
      request,
      preflight,
      resolver,
      step,
      null,
    );
    currentState = resolved.state;
    const boundary = resolveActionBoundary(currentState);
    currentState = boundary.state;
    appendResolution(actions, {
      stage: "priority",
      actorInstanceId: step.actorInstanceId,
      request,
      priorityStep: step,
      normalSlot: null,
      selectorCalled: false,
      preflight,
      resolverCalled: resolved.resolverCalled,
      ...(resolved.resolverDetail === undefined
        ? {}
        : { resolverDetail: resolved.resolverDetail }),
      boundary,
    });
  }

  let normalPlan: EnemyNormalActionPlan | null = null;
  if (hasLivingUnit(currentState.formation.ally)) {
    normalPlan = planEnemyNormalActions(currentState);
    for (const slot of normalPlan.slots) {
      if (!hasLivingUnit(currentState.formation.ally)) break;
      const actorUnavailable =
        enemyActorExecutionSkipReason(
          currentState,
          slot.actorInstanceId,
        ) !== null;
      const selectorCalled =
        !actorUnavailable && normalSelector !== undefined;
      const request = selectorCalled
        ? normalSelector({
            state: currentState,
            slot,
          })
        : defaultEnemyNormalActionRequest(
            currentState,
            slot.actorInstanceId,
          );
      const guardResult = actionGuard?.({
        state: currentState,
        stage: "normal",
        actorInstanceId: slot.actorInstanceId,
        request,
      }) ?? { skipReason: null };
      const actionNumber = actions.length + 1;
      const preflight = guardedPreflight(
        currentState,
        slot.actorInstanceId,
        request,
        "normal",
        guardResult,
      );
      currentState = preflight.state;
      const resolved = resolveReadyAction(
        currentState,
        "normal",
        actionNumber,
        slot.actorInstanceId,
        request,
        preflight,
        resolver,
        null,
        slot,
      );
      currentState = resolved.state;
      const boundary = resolveActionBoundary(currentState);
      currentState = boundary.state;
      appendResolution(actions, {
        stage: "normal",
        actorInstanceId: slot.actorInstanceId,
        request,
        priorityStep: null,
        normalSlot: slot,
        selectorCalled,
        preflight,
        resolverCalled: resolved.resolverCalled,
        ...(resolved.resolverDetail === undefined
          ? {}
          : { resolverDetail: resolved.resolverDetail }),
        boundary,
      });
    }
  }

  const stopReason: EnemyTurnSequenceStopReason =
    hasLivingUnit(currentState.formation.ally)
      ? "sequence_complete"
      : "ally_annihilated";
  return {
    state: beginEnemyTurnEnd(currentState),
    priorityPlan,
    normalPlan,
    actions,
    stopReason,
  };
}
