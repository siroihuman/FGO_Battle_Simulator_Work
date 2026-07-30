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
  resolveTurnEndHpSettlement,
  type TurnEndHpSettlementResult,
} from "./hp";
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
  TurnEndSettlementKind,
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
  deferredSettlement?: TurnEndSettlementKind;
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

export interface TurnEndHpContribution {
  ownerInstanceId: string;
  effectInstanceId: string;
  effectStableId: string;
  actionIndex: number;
  sourceInstanceId: string | null;
  amount: number;
  ignoreRecoveryModifiers?: boolean;
  ignoreHealingBlock?: boolean;
}

export interface TurnEndHpSettlementLog {
  targetInstanceId: string;
  recoveryContributions: TurnEndHpContribution[];
  slipDamageContributions: TurnEndHpContribution[];
  result: TurnEndHpSettlementResult;
}

export interface SideTurnEndResult {
  formation: BattleFormation;
  counters: EffectRuntimeCounters;
  registrationCutoff: number;
  activations: TurnEndActivationResult[];
  hpSettlements: TurnEndHpSettlementLog[];
  durations: TurnEndDurationResult[];
}

interface PendingHpSettlement {
  targetInstanceId: string;
  recoveryContributions: TurnEndHpContribution[];
  slipDamageContributions: TurnEndHpContribution[];
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

function applyHpSettlement(
  formation: BattleFormation,
  result: TurnEndHpSettlementResult,
): BattleFormation {
  let current = formation;
  for (const source of result.sourceUnits) {
    current = replaceIfPresent(current, source);
  }
  return replaceIfPresent(current, result.target);
}

function assertSettlementAction(action: TriggerAction): void {
  if (
    action.turnEndSettlement !== "recurring_hp_recovery"
    && action.turnEndSettlement !== "slip_damage"
  ) {
    throw new RangeError("unknown turn-end settlement kind");
  }
  if (
    action.turnEndSettlement === "recurring_hp_recovery"
    && action.action.kind !== "heal_hp"
  ) {
    throw new RangeError(
      "recurring_hp_recovery settlement requires a heal_hp action",
    );
  }
  if (
    action.turnEndSettlement === "slip_damage"
    && (
      action.action.kind !== "reduce_hp"
      || action.action.canDefeat
    )
  ) {
    throw new RangeError(
      "slip_damage settlement requires a nonlethal reduce_hp action",
    );
  }
}

function queueHpSettlement(
  pendingSettlements: Map<string, PendingHpSettlement>,
  candidate: {
    ownerInstanceId: string;
    effect: {
      instanceId: string;
      stableId: string;
    };
  },
  actionIndex: number,
  action: TriggerAction,
  sourceInstanceId: string | null,
  targetInstanceIds: readonly string[],
): void {
  assertSettlementAction(action);
  if (
    action.action.kind !== "heal_hp"
    && action.action.kind !== "reduce_hp"
  ) {
    throw new RangeError(
      "turn-end HP settlement requires an HP action",
    );
  }
  for (const targetInstanceId of targetInstanceIds) {
    let pending = pendingSettlements.get(targetInstanceId);
    if (!pending) {
      pending = {
        targetInstanceId,
        recoveryContributions: [],
        slipDamageContributions: [],
      };
      pendingSettlements.set(targetInstanceId, pending);
    }
    const contribution: TurnEndHpContribution = {
      ownerInstanceId: candidate.ownerInstanceId,
      effectInstanceId: candidate.effect.instanceId,
      effectStableId: candidate.effect.stableId,
      actionIndex,
      sourceInstanceId,
      amount: action.action.amount,
      ...(action.action.kind === "heal_hp"
        ? {
            ignoreRecoveryModifiers:
              action.action.ignoreRecoveryModifiers,
            ignoreHealingBlock: action.action.ignoreHealingBlock,
          }
        : {}),
    };
    if (action.turnEndSettlement === "recurring_hp_recovery") {
      pending.recoveryContributions.push(contribution);
    } else {
      pending.slipDamageContributions.push(contribution);
    }
  }
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
  const pendingHpSettlements = new Map<string, PendingHpSettlement>();

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
      if (action.turnEndSettlement) {
        queueHpSettlement(
          pendingHpSettlements,
          candidate,
          actionIndex,
          action,
          actionSource?.instanceId ?? null,
          targetLocations.map(({ unit }) => unit.instanceId),
        );
        actionResults.push({
          actionIndex,
          action,
          targetInstanceIds: targetLocations.map(
            ({ unit }) => unit.instanceId,
          ),
          batch: {
            source: actionSource,
            targets: actionTargets,
            counters: currentCounters,
            results: [],
          },
          deferredSettlement: action.turnEndSettlement,
        });
        continue;
      }
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

  const hpSettlements: TurnEndHpSettlementLog[] = [];
  for (const pending of pendingHpSettlements.values()) {
    const target =
      findUnitLocation(
        currentFormation,
        pending.targetInstanceId,
      )?.unit ?? null;
    const recoveryContributions =
      pending.recoveryContributions.map((contribution) => ({
        source: contribution.sourceInstanceId
          ? findUnitLocation(
              currentFormation,
              contribution.sourceInstanceId,
            )?.unit ?? null
          : null,
        baseAmount: contribution.amount,
        ignoreRecoveryModifiers:
          contribution.ignoreRecoveryModifiers,
        ignoreHealingBlock: contribution.ignoreHealingBlock,
      }));
    const result = resolveTurnEndHpSettlement(
      target,
      recoveryContributions,
      pending.slipDamageContributions.map(({ amount }) => amount),
    );
    currentFormation = applyHpSettlement(currentFormation, result);
    hpSettlements.push({
      targetInstanceId: pending.targetInstanceId,
      recoveryContributions: pending.recoveryContributions,
      slipDamageContributions:
        pending.slipDamageContributions,
      result,
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
    hpSettlements,
    durations,
  };
}
