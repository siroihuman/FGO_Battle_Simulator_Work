import type { BattleUnitState } from "../core/battle/types";
import { assertSafeInteger } from "../core/numeric";
import type { DeterministicRng } from "../core/rng";
import {
  COMMON_EFFECT_TYPES,
  classificationsOverlap,
  sumEffectModifiers,
} from "./modifiers";
import type {
  AppliedEffect,
  EffectCategory,
  EffectRemovalReason,
  RemovedEffect,
} from "./types";

export type EffectRemovalRequest =
  | {
      mode: "one";
      category: EffectCategory;
      classifications?: readonly string[];
      force?: boolean;
    }
  | {
      mode: "all";
      category: EffectCategory;
      classifications?: readonly string[];
      force?: boolean;
    }
  | { mode: "by_id"; stableId: string; force?: boolean };

function canRemove(effect: AppliedEffect, request: EffectRemovalRequest): boolean {
  if (request.force) return true;
  if (effect.removalPolicy === "unremovable") return false;
  if (request.mode === "by_id") return true;
  return effect.removalPolicy === "removable";
}

function matchesRequest(
  effect: AppliedEffect,
  request: EffectRemovalRequest,
): boolean {
  if (request.mode === "by_id") return effect.stableId === request.stableId;
  if (effect.category !== request.category) return false;
  if (!request.classifications || request.classifications.length === 0) {
    return true;
  }
  return classificationsOverlap(
    effect.classifications,
    request.classifications,
  );
}

function selectCandidates(
  unit: BattleUnitState,
  request: EffectRemovalRequest,
): AppliedEffect[] {
  const candidates = unit.effects
    .filter((effect) => matchesRequest(effect, request) && canRemove(effect, request))
    .sort((left, right) => right.registrationOrder - left.registrationOrder);
  return request.mode === "one" ? candidates.slice(0, 1) : candidates;
}

export function removeEffects(
  unit: BattleUnitState,
  request: EffectRemovalRequest,
): { unit: BattleUnitState; removed: RemovedEffect[] } {
  const selected = selectCandidates(unit, request);
  const selectedIds = new Set(selected.map(({ instanceId }) => instanceId));
  const reason: EffectRemovalReason = request.force ? "forced" : "dispel";
  return {
    unit: {
      ...unit,
      effects: unit.effects.filter(
        ({ instanceId }) => !selectedIds.has(instanceId),
      ),
    },
    removed: selected.map((effect) => ({ effect, reason })),
  };
}

export type EffectRemovalAttemptOutcome = "removed" | "resisted";

export interface EffectRemovalAttempt {
  effect: AppliedEffect;
  outcome: EffectRemovalAttemptOutcome;
  resolvedRatePermille: number;
}

export interface EffectRemovalAttemptResult {
  unit: BattleUnitState;
  removed: RemovedEffect[];
  attempts: EffectRemovalAttempt[];
}

function resistanceType(effect: AppliedEffect): string | null {
  if (effect.category === "buff") {
    return COMMON_EFFECT_TYPES.buffRemovalResistance;
  }
  if (effect.category === "debuff") {
    return COMMON_EFFECT_TYPES.debuffRemovalResistance;
  }
  return null;
}

function removalRate(
  unitAtStart: BattleUnitState,
  effect: AppliedEffect,
  baseRatePermille: number,
  force: boolean,
): number {
  if (force) return 1000;
  const type = resistanceType(effect);
  if (!type) return baseRatePermille;
  return (
    baseRatePermille
    - sumEffectModifiers(unitAtStart, type, effect.classifications)
  );
}

function rollRemoval(ratePermille: number, rng: DeterministicRng): boolean {
  if (ratePermille <= 0) return false;
  if (ratePermille >= 1000) return true;
  return rng.chance(ratePermille);
}

/**
 * Selects all candidates before rolling. A one-effect dispel therefore never
 * falls through to an older state when removal of the newest state is resisted.
 */
export function attemptRemoveEffects(
  unit: BattleUnitState,
  request: EffectRemovalRequest,
  baseRatePermille: number,
  rng: DeterministicRng,
): EffectRemovalAttemptResult {
  assertSafeInteger(baseRatePermille, "baseRatePermille");
  const selected = selectCandidates(unit, request);
  const attempts = selected.map((effect) => {
    const resolvedRatePermille = removalRate(
      unit,
      effect,
      baseRatePermille,
      request.force ?? false,
    );
    assertSafeInteger(resolvedRatePermille, "resolved removal rate");
    return {
      effect,
      outcome: rollRemoval(resolvedRatePermille, rng)
        ? "removed" as const
        : "resisted" as const,
      resolvedRatePermille,
    };
  });
  const removedIds = new Set(
    attempts
      .filter(({ outcome }) => outcome === "removed")
      .map(({ effect }) => effect.instanceId),
  );
  const reason: EffectRemovalReason = request.force ? "forced" : "dispel";
  return {
    unit: {
      ...unit,
      effects: unit.effects.filter(
        ({ instanceId }) => !removedIds.has(instanceId),
      ),
    },
    removed: attempts
      .filter(({ outcome }) => outcome === "removed")
      .map(({ effect }) => ({ effect, reason })),
    attempts,
  };
}
