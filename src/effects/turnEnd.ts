import {
  findUnitLocation,
  orderedLocations,
  replaceUnit,
} from "../core/battle/formation";
import type {
  BattleFormation,
  BattleSide,
  BattleUnitState,
} from "../core/battle/types";
import type { DeterministicRng } from "../core/rng";
import {
  executeCommonActionForTargets,
  type CommonActionBatchResult,
} from "./actions";
import {
  advanceOwnerTurnEnd,
  consumeUnitEffectUse,
} from "./runtime";
import { resolveTargetLocations } from "./targeting";
import {
  attemptTriggerActivation,
  collectTriggerActivations,
} from "./triggers";
import type {
  EffectRuntimeCounters,
  RemovedEffect,
  TriggerAction,
} from "./types";

export type TurnEndActivationOutcome =
  | "activated"
  | "probability_failed"
  | "owner_unavailable"
  | "effect_unavailable";

export interface TurnEndActionResult {
  actionIndex: number;
  action: TriggerAction;
  targetInstanceIds: string[];
  batch: CommonActionBatchResult;
}

export interface TurnEndActivationResult {
  ownerInstanceId: string;
  effectInstanceId: string;
  effectStableId: string;
  outcome: TurnEndActivationOutcome;
  consumedUse: boolean;
  removedByUse?: RemovedEffect;
  actions: TurnEndActionResult[];
}

export interface TurnEndDurationResult {
  ownerInstanceId: string;
  removed: RemovedEffect[];
}

export interface SideTurnEndResult {
  formation: BattleFormation;
  counters: EffectRuntimeCounters;
  registrationCutoff: number;
  activations: TurnEndActivationResult[];
  durations: TurnEndDurationResult[];
}

function latestRegistrationOrder(formation: BattleFormation): number {
  let latest = 0;
  for (const side of ["ally", "enemy"] as const) {
    for (const { unit } of orderedLocations(formation, side, true)) {
      for (const effect of unit.effects) {
        latest = Math.max(latest, effect.registrationOrder);
      }
    }
  }
  return latest;
}

function replaceIfPresent(
  formation: BattleFormation,
  unit: BattleUnitState | null,
): BattleFormation {
  if (!unit || !findUnitLocation(formation, unit.instanceId)) return formation;
  return replaceUnit(formation, unit);
}

function applyBatch(
  formation: BattleFormation,
  batch: CommonActionBatchResult,
): BattleFormation {
  let current = formation;
  for (const target of batch.targets) {
    current = replaceIfPresent(current, target);
  }
  return replaceIfPresent(current, batch.source);
}

/**
 * Resolves the recurring effects owned by one side, then decreases durations
 * for that side's frontline. Reserve units neither activate nor tick.
 *
 * The activation list and registration cutoff are snapshotted at phase start.
 * Effects added during this phase therefore wait until the next matching turn
 * end and retain their full duration.
 */
export function resolveSideTurnEnd(
  formation: BattleFormation,
  endingSide: BattleSide,
  counters: EffectRuntimeCounters,
  rng: DeterministicRng,
): SideTurnEndResult {
  let currentFormation = formation;
  let currentCounters = counters;
  const registrationCutoff = latestRegistrationOrder(formation);
  if (currentCounters.nextRegistrationOrder <= registrationCutoff) {
    throw new RangeError(
      "effect runtime counters must be ahead of registered effects",
    );
  }
  const candidates = collectTriggerActivations(
    orderedLocations(formation, endingSide, false),
    { timing: "turn_end" },
  ).filter(
    ({ effect }) => effect.registrationOrder <= registrationCutoff,
  );
  const activations: TurnEndActivationResult[] = [];

  for (const candidate of candidates) {
    const ownerLocation = findUnitLocation(
      currentFormation,
      candidate.ownerInstanceId,
    );
    if (
      !ownerLocation
      || ownerLocation.side !== endingSide
      || ownerLocation.area !== "frontline"
      || !ownerLocation.unit.alive
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
      || currentEffect.registrationOrder > registrationCutoff
      || currentEffect.trigger?.timing !== "turn_end"
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
      currentFormation = replaceUnit(currentFormation, consumed.unit);
      removedByUse = consumed.removed;
    }

    const actionResults: TurnEndActionResult[] = [];
    const actions = currentEffect.trigger.actions ?? [];
    for (const [actionIndex, action] of actions.entries()) {
      const targetLocations = resolveTargetLocations(
        currentFormation,
        candidate.ownerInstanceId,
        action.target,
      );
      const actionTargets =
        targetLocations.length > 0
          ? targetLocations.map(({ unit }) => unit)
          : [null];
      const sourceInstanceId =
        currentEffect.sourceInstanceId ?? candidate.ownerInstanceId;
      const actionSource =
        findUnitLocation(currentFormation, sourceInstanceId)?.unit ?? null;
      const batch = executeCommonActionForTargets(
        actionSource,
        actionTargets,
        action.action,
        currentCounters,
        rng,
      );
      currentCounters = batch.counters;
      currentFormation = applyBatch(currentFormation, batch);
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

  const durations: TurnEndDurationResult[] = [];
  for (const location of orderedLocations(
    currentFormation,
    endingSide,
    false,
  )) {
    const duration = advanceOwnerTurnEnd(
      location.unit,
      endingSide,
      false,
      registrationCutoff,
    );
    currentFormation = replaceUnit(currentFormation, duration.unit);
    durations.push({
      ownerInstanceId: location.unit.instanceId,
      removed: duration.removed,
    });
  }

  return {
    formation: currentFormation,
    counters: currentCounters,
    registrationCutoff,
    activations,
    durations,
  };
}
