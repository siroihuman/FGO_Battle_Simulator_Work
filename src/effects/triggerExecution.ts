import {
  findUnitLocation,
  replaceUnit,
} from "../core/battle/formation";
import {
  setBattleFormation,
  type BattleState,
} from "../core/battle/state";
import {
  addCommandStars,
  addNextCommandStars,
  type BattleStarAddition,
} from "../core/battle/starState";
import type {
  BattleFormation,
  BattleUnitState,
  UnitLocation,
} from "../core/battle/types";
import type { DeterministicRng } from "../core/rng";
import {
  executeCommonActionForTargets,
  type CommonActionBatchResult,
} from "./actions";
import { consumeUnitEffectUse } from "./runtime";
import { resolveTargetLocations } from "./targeting";
import {
  attemptTriggerActivation,
  collectTriggerActivations,
} from "./triggers";
import type {
  EffectRuntimeCounters,
  RemovedEffect,
  TriggerAction,
  TriggerEvent,
} from "./types";

export type TriggerEventActivationOutcome =
  | "activated"
  | "probability_failed"
  | "owner_unavailable"
  | "effect_unavailable";

export interface TriggerEventActionResult {
  actionIndex: number;
  action: TriggerAction;
  targetInstanceIds: string[];
  batch: CommonActionBatchResult;
  starAddition?: BattleStarAddition;
}

export interface TriggerEventActivationResult {
  ownerInstanceId: string;
  effectInstanceId: string;
  effectStableId: string;
  outcome: TriggerEventActivationOutcome;
  consumedUse: boolean;
  removedByUse?: RemovedEffect;
  actions: TriggerEventActionResult[];
}

export interface TriggerEventResolutionResult {
  state: BattleState;
  formation: BattleFormation;
  counters: EffectRuntimeCounters;
  event: TriggerEvent;
  activations: TriggerEventActivationResult[];
}

function replaceIfPresent(
  formation: BattleFormation,
  unit: BattleUnitState | null,
): BattleFormation {
  if (!unit || !findUnitLocation(formation, unit.instanceId)) {
    return formation;
  }
  return replaceUnit(formation, unit);
}

function applyBatch(
  state: BattleState,
  batch: CommonActionBatchResult,
): BattleState {
  let formation = state.formation;
  for (const target of batch.targets) {
    formation = replaceIfPresent(formation, target);
  }
  formation = replaceIfPresent(formation, batch.source);
  return formation === state.formation
    ? state
    : setBattleFormation(state, formation);
}

function targetsForTriggerAction(
  formation: BattleFormation,
  ownerInstanceId: string,
  action: TriggerAction,
  event: TriggerEvent,
): UnitLocation[] {
  const resolved = resolveTargetLocations(
    formation,
    ownerInstanceId,
    action.target,
  );
  if (action.targetAttackEventTargets !== true) return resolved;
  const eventTargetIds = new Set(
    event.targetInstanceIds
      ?? (event.targetInstanceId ? [event.targetInstanceId] : []),
  );
  return resolved.filter(({ unit }) => eventTargetIds.has(unit.instanceId));
}

/**
 * Executes one snapshotted trigger event in location, priority, and
 * registration order. Turn-end simultaneous settlements are intentionally
 * rejected here because they belong to the dedicated turn-end resolver.
 */
export function resolveTriggerEvent(
  state: BattleState,
  locationsInResolutionOrder: readonly UnitLocation[],
  event: TriggerEvent,
  counters: EffectRuntimeCounters,
  rng: DeterministicRng,
): TriggerEventResolutionResult {
  let currentState = state;
  let currentCounters = counters;
  const candidates = collectTriggerActivations(
    locationsInResolutionOrder,
    event,
  );
  const activations: TriggerEventActivationResult[] = [];

  for (const candidate of candidates) {
    const ownerLocation = findUnitLocation(
      currentState.formation,
      candidate.ownerInstanceId,
    );
    const ownerIsAvailable =
      event.timing === "on_death"
        ? ownerLocation?.unit.alive === false
        : ownerLocation?.unit.alive === true;
    if (
      !ownerLocation
      || !ownerIsAvailable
      || (
        ownerLocation.area === "reserve"
        && candidate.effect.flags.activeWhileReserve !== true
      )
    ) {
      activations.push({
        ownerInstanceId: candidate.ownerInstanceId,
        effectInstanceId: candidate.effect.instanceId,
        effectStableId: candidate.effect.stableId,
        outcome: "owner_unavailable",
        consumedUse: false,
        actions: [],
      });
      continue;
    }

    const currentEffect = ownerLocation.unit.effects.find(
      ({ instanceId }) => instanceId === candidate.effect.instanceId,
    );
    if (
      !currentEffect
      || currentEffect.trigger?.timing !== event.timing
    ) {
      activations.push({
        ownerInstanceId: candidate.ownerInstanceId,
        effectInstanceId: candidate.effect.instanceId,
        effectStableId: candidate.effect.stableId,
        outcome: "effect_unavailable",
        consumedUse: false,
        actions: [],
      });
      continue;
    }

    const attempt = attemptTriggerActivation(currentEffect, rng);
    if (!attempt.activated) {
      activations.push({
        ownerInstanceId: candidate.ownerInstanceId,
        effectInstanceId: currentEffect.instanceId,
        effectStableId: currentEffect.stableId,
        outcome: "probability_failed",
        consumedUse: false,
        actions: [],
      });
      continue;
    }

    let removedByUse: RemovedEffect | undefined;
    if (attempt.consumedUse) {
      const consumed = consumeUnitEffectUse(
        ownerLocation.unit,
        currentEffect.instanceId,
      );
      currentState = setBattleFormation(
        currentState,
        replaceUnit(currentState.formation, consumed.unit),
      );
      removedByUse = consumed.removed;
    }

    const actionResults: TriggerEventActionResult[] = [];
    for (
      const [actionIndex, action] of
      (currentEffect.trigger.actions ?? []).entries()
    ) {
      if (action.turnEndSettlement) {
        throw new RangeError(
          "turnEndSettlement is only valid for turn_end triggers",
        );
      }
      const targetLocations = targetsForTriggerAction(
        currentState.formation,
        candidate.ownerInstanceId,
        action,
        event,
      );
      const targets =
        targetLocations.length > 0
          ? targetLocations.map(({ unit }) => unit)
          : [null];
      const sourceInstanceId =
        currentEffect.sourceInstanceId ?? candidate.ownerInstanceId;
      const source =
        findUnitLocation(
          currentState.formation,
          sourceInstanceId,
        )?.unit ?? null;
      if (action.action.kind === "gain_stars") {
        const addition =
          targetLocations.length === 0
            ? undefined
            : action.action.destination === "command"
              ? addCommandStars(currentState, action.action.amount)
              : addNextCommandStars(currentState, action.action.amount);
        if (addition) currentState = addition.state;
        actionResults.push({
          actionIndex,
          action,
          targetInstanceIds: targetLocations.map(
            ({ unit }) => unit.instanceId,
          ),
          batch: {
            source,
            targets,
            counters: currentCounters,
            results: [],
          },
          ...(addition ? { starAddition: addition } : {}),
        });
        continue;
      }
      const batch = executeCommonActionForTargets(
        source,
        targets,
        action.action,
        currentCounters,
        rng,
      );
      currentCounters = batch.counters;
      currentState = applyBatch(currentState, batch);
      actionResults.push({
        actionIndex,
        action,
        targetInstanceIds: targetLocations.map(
          ({ unit }) => unit.instanceId,
        ),
        batch,
      });
    }

    activations.push({
      ownerInstanceId: candidate.ownerInstanceId,
      effectInstanceId: currentEffect.instanceId,
      effectStableId: currentEffect.stableId,
      outcome: "activated",
      consumedUse: attempt.consumedUse,
      removedByUse,
      actions: actionResults,
    });
  }

  return {
    state: currentState,
    formation: currentState.formation,
    counters: currentCounters,
    event,
    activations,
  };
}
