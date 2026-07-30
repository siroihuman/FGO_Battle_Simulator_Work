import {
  findUnitLocation,
  replaceUnit,
} from "../core/battle/formation";
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
 * Executes one snapshotted trigger event in location, priority, and
 * registration order. Turn-end simultaneous settlements are intentionally
 * rejected here because they belong to the dedicated turn-end resolver.
 */
export function resolveTriggerEvent(
  formation: BattleFormation,
  locationsInResolutionOrder: readonly UnitLocation[],
  event: TriggerEvent,
  counters: EffectRuntimeCounters,
  rng: DeterministicRng,
): TriggerEventResolutionResult {
  let currentFormation = formation;
  let currentCounters = counters;
  const candidates = collectTriggerActivations(
    locationsInResolutionOrder,
    event,
  );
  const activations: TriggerEventActivationResult[] = [];

  for (const candidate of candidates) {
    const ownerLocation = findUnitLocation(
      currentFormation,
      candidate.ownerInstanceId,
    );
    if (
      !ownerLocation
      || !ownerLocation.unit.alive
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
      currentFormation = replaceUnit(currentFormation, consumed.unit);
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
      const targetLocations = resolveTargetLocations(
        currentFormation,
        candidate.ownerInstanceId,
        action.target,
      );
      const targets =
        targetLocations.length > 0
          ? targetLocations.map(({ unit }) => unit)
          : [null];
      const sourceInstanceId =
        currentEffect.sourceInstanceId ?? candidate.ownerInstanceId;
      const source =
        findUnitLocation(
          currentFormation,
          sourceInstanceId,
        )?.unit ?? null;
      const batch = executeCommonActionForTargets(
        source,
        targets,
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

  return {
    formation: currentFormation,
    counters: currentCounters,
    event,
    activations,
  };
}
