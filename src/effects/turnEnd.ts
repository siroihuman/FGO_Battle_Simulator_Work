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
import { slipDamageAmplifierPermille } from "./slipDamage";
import { resolveTargetLocations } from "./targeting";
import {
  attemptTriggerActivation,
  collectTriggerActivations,
} from "./triggers";
import type {
  EffectRuntimeCounters,
  RemovedEffect,
  TriggerActivation,
  TriggerAction,
  SlipDamageKind,
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
  starGainRequest?: TurnEndStarGainRequest;
  starAddition?: TurnEndStarAddition;
}

export interface TurnEndStarGainRequest {
  destination: "next_command";
  requested: number;
}

export interface TurnEndStarAddition {
  bucket: "next_command";
  requested: number;
  before: number;
  added: number;
  after: number;
  overflow: number;
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
  slipDamageKind?: SlipDamageKind;
  amplifierPermille?: number;
  categoryBaseAmount?: number;
  categoryResolvedDamage?: number;
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

export interface SideTurnEndSnapshot {
  side: BattleSide;
  registrationCutoff: number;
  candidates: TriggerActivation[];
  durationOwnerInstanceIds: string[];
}

export interface ResolveSideTurnEndOptions {
  snapshot?: SideTurnEndSnapshot;
  advanceDurations?: boolean;
  resolveStarGain?: (
    request: TurnEndStarGainRequest,
  ) => TurnEndStarAddition;
}

export interface SideTurnEndDurationResult {
  formation: BattleFormation;
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

export function createSideTurnEndSnapshot(
  formation: BattleFormation,
  endingSide: BattleSide,
): SideTurnEndSnapshot {
  const owners = orderedLocations(formation, endingSide, false);
  return {
    side: endingSide,
    registrationCutoff: latestRegistrationOrder(formation),
    candidates: collectTriggerActivations(
      owners,
      { timing: "turn_end" },
    ),
    durationOwnerInstanceIds: owners.map(({ unit }) => unit.instanceId),
  };
}

export function advanceSideTurnEndDurations(
  formation: BattleFormation,
  endingSide: BattleSide,
  snapshot: SideTurnEndSnapshot,
): SideTurnEndDurationResult {
  if (snapshot.side !== endingSide) {
    throw new RangeError("turn-end snapshot side does not match");
  }
  let currentFormation = formation;
  const durations: TurnEndDurationResult[] = [];
  for (const ownerInstanceId of snapshot.durationOwnerInstanceIds) {
    const location = findUnitLocation(currentFormation, ownerInstanceId);
    if (!location || location.side !== endingSide) continue;
    const duration = advanceOwnerTurnEnd(
      location.unit,
      endingSide,
      false,
      snapshot.registrationCutoff,
    );
    currentFormation = replaceUnit(currentFormation, duration.unit);
    durations.push({
      ownerInstanceId,
      removed: duration.removed,
    });
  }
  return {
    formation: currentFormation,
    durations,
  };
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
  formation: BattleFormation,
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
    const target = findUnitLocation(formation, targetInstanceId)?.unit;
    if (!target) {
      throw new RangeError(
        `missing turn-end settlement target: ${targetInstanceId}`,
      );
    }
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
      ...(action.turnEndSettlement === "slip_damage"
        ? {
            ...(action.slipDamageKind
              ? { slipDamageKind: action.slipDamageKind }
              : {}),
            amplifierPermille: slipDamageAmplifierPermille(
              target,
              action.slipDamageKind ?? null,
            ),
          }
        : {}),
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
  options: ResolveSideTurnEndOptions = {},
): SideTurnEndResult {
  let currentFormation = formation;
  let currentCounters = counters;
  const snapshot =
    options.snapshot
    ?? createSideTurnEndSnapshot(formation, endingSide);
  if (snapshot.side !== endingSide) {
    throw new RangeError("turn-end snapshot side does not match");
  }
  const registrationCutoff = snapshot.registrationCutoff;
  if (currentCounters.nextRegistrationOrder <= registrationCutoff) {
    throw new RangeError(
      "effect runtime counters must be ahead of registered effects",
    );
  }
  const candidates = snapshot.candidates.filter(
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
      || !collectTriggerActivations(
        [ownerLocation],
        { timing: "turn_end" },
      ).some(({ effect }) => effect.instanceId === currentEffect.instanceId)
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
      if (action.action.kind === "gain_stars") {
        if (
          action.action.destination !== "next_command"
          || action.turnEndSettlement !== undefined
        ) {
          throw new RangeError(
            "turn_end gain_stars requires next_command without settlement",
          );
        }
        const request = targetLocations.length === 0
          ? undefined
          : {
              destination: "next_command" as const,
              requested: action.action.amount,
            };
        if (request && !options.resolveStarGain) {
          throw new RangeError(
            "turn_end gain_stars requires the battle-state coordinator",
          );
        }
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
          ...(request
            ? {
                starGainRequest: request,
                starAddition: options.resolveStarGain!(request),
              }
            : {}),
        });
        continue;
      }
      if (action.turnEndSettlement) {
        queueHpSettlement(
          pendingHpSettlements,
          currentFormation,
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
      pending.slipDamageContributions.map((contribution) => ({
        baseAmount: contribution.amount,
        kind: contribution.slipDamageKind ?? null,
        amplifierPermille: contribution.amplifierPermille ?? 0,
      })),
    );
    currentFormation = applyHpSettlement(currentFormation, result);
    hpSettlements.push({
      targetInstanceId: pending.targetInstanceId,
      recoveryContributions: pending.recoveryContributions,
      slipDamageContributions: pending.slipDamageContributions.map(
        (contribution) => {
          const category = contribution.slipDamageKind
            ? result.slipDamageCategories.find(
                ({ kind }) => kind === contribution.slipDamageKind,
              )
            : undefined;
          return {
            ...contribution,
            ...(category
              ? {
                  categoryBaseAmount: category.baseAmount,
                  categoryResolvedDamage: category.resolvedDamage,
                }
              : {}),
          };
        },
      ),
      result,
    });
  }

  const durationResult =
    options.advanceDurations === false
      ? {
          formation: currentFormation,
          durations: [],
        }
      : advanceSideTurnEndDurations(
          currentFormation,
          endingSide,
          snapshot,
        );
  currentFormation = durationResult.formation;

  return {
    formation: currentFormation,
    counters: currentCounters,
    registrationCutoff,
    activations,
    hpSettlements,
    durations: durationResult.durations,
  };
}
