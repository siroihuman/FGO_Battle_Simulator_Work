import type { BattleSide, BattleUnitState } from "../core/battle/types";
import { assertSafeInteger } from "../core/numeric";
import {
  applyMaxHpState,
  reconcileMaxHp,
} from "./maxHp";
import type {
  AppliedEffect,
  EffectRuntimeCounters,
  EffectTemplate,
  RemovedEffect,
} from "./types";

function assertOptionalCount(value: number | null | undefined, name: string): void {
  if (value === null || value === undefined) return;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be null or a positive safe integer`);
  }
}

export function createEffectRuntimeCounters(): EffectRuntimeCounters {
  return { nextInstanceNumber: 1, nextRegistrationOrder: 1 };
}

export function applyEffect(
  target: BattleUnitState,
  template: EffectTemplate,
  sourceInstanceId: string | null,
  counters: EffectRuntimeCounters,
): {
  unit: BattleUnitState;
  effect: AppliedEffect;
  counters: EffectRuntimeCounters;
} {
  if (!template.stableId || !template.name || !template.effectType) {
    throw new RangeError("effect stableId, name and effectType are required");
  }
  assertOptionalCount(template.remainingTurns, "remainingTurns");
  assertOptionalCount(template.remainingUses, "remainingUses");
  assertSafeInteger(template.value ?? 0, "effect value");
  const classifications = [...new Set(template.classifications ?? [])];
  if (classifications.some((classification) => classification.length === 0)) {
    throw new RangeError("effect classifications must not contain empty strings");
  }
  const effect: AppliedEffect = {
    instanceId: `effect-${counters.nextInstanceNumber}`,
    stableId: template.stableId,
    name: template.name,
    effectType: template.effectType,
    category: template.category,
    sourceInstanceId,
    targetInstanceId: target.instanceId,
    classifications,
    value: template.value ?? 0,
    remainingTurns: template.remainingTurns ?? null,
    remainingUses: template.remainingUses ?? null,
    removalPolicy: template.removalPolicy ?? "removable",
    durationTick: template.durationTick ?? "owner_turn_end",
    trigger: template.trigger,
    registrationOrder: counters.nextRegistrationOrder,
    flags: { ...(template.flags ?? {}) },
  };
  const unitWithEffect = {
    ...target,
    effects: [...target.effects, effect],
  };
  return {
    unit: applyMaxHpState(unitWithEffect, effect),
    effect,
    counters: {
      nextInstanceNumber: counters.nextInstanceNumber + 1,
      nextRegistrationOrder: counters.nextRegistrationOrder + 1,
    },
  };
}

export function consumeEffectUse(
  effect: AppliedEffect,
  amount = 1,
): { effect: AppliedEffect | null; removed?: RemovedEffect } {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new RangeError("amount must be a positive safe integer");
  }
  if (effect.remainingUses === null) return { effect };
  const remainingUses = Math.max(0, effect.remainingUses - amount);
  if (remainingUses === 0) {
    return {
      effect: null,
      removed: { effect: { ...effect, remainingUses }, reason: "expired_uses" },
    };
  }
  return { effect: { ...effect, remainingUses } };
}

export interface UnitEffectUseConsumption {
  unit: BattleUnitState;
  consumed: boolean;
  removed?: RemovedEffect;
}

/**
 * Consumes a count from a concrete effect instance on a unit.
 * Unlimited effects are returned unchanged and report consumed=false.
 */
export function consumeUnitEffectUse(
  unit: BattleUnitState,
  effectInstanceId: string,
  amount = 1,
): UnitEffectUseConsumption {
  const effect = unit.effects.find(
    (candidate) => candidate.instanceId === effectInstanceId,
  );
  if (!effect) {
    return { unit, consumed: false };
  }
  const result = consumeEffectUse(effect, amount);
  if (effect.remainingUses === null) {
    return { unit, consumed: false };
  }
  return {
    unit: result.effect
      ? {
          ...unit,
          effects: unit.effects.map((candidate) =>
            candidate.instanceId === effectInstanceId
              ? result.effect!
              : candidate,
          ),
        }
      : reconcileMaxHp(
          unit,
          unit.effects.filter(
            (candidate) => candidate.instanceId !== effectInstanceId,
          ),
        ),
    consumed: true,
    removed: result.removed,
  };
}

export function advanceOwnerTurnEnd(
  unit: BattleUnitState,
  endingSide: BattleSide,
  isReserve: boolean,
  registrationCutoff = Number.MAX_SAFE_INTEGER,
): { unit: BattleUnitState; removed: RemovedEffect[] } {
  if (unit.side !== endingSide || isReserve) return { unit, removed: [] };
  const removed: RemovedEffect[] = [];
  const effects = unit.effects.flatMap((effect) => {
    if (
      effect.durationTick !== "owner_turn_end"
      || effect.remainingTurns === null
      || effect.registrationOrder > registrationCutoff
    ) {
      return [effect];
    }
    const remainingTurns = effect.remainingTurns - 1;
    if (remainingTurns <= 0) {
      removed.push({
        effect: { ...effect, remainingTurns: 0 },
        reason: "expired_turns",
      });
      return [];
    }
    return [{ ...effect, remainingTurns }];
  });
  return { unit: reconcileMaxHp(unit, effects), removed };
}
