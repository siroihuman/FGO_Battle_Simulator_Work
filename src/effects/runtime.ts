import type { BattleSide, BattleUnitState } from "../core/battle/types";
import { assertSafeInteger } from "../core/numeric";
import {
  applyMaxHpState,
  reconcileMaxHp,
} from "./maxHp";
import {
  assertValidNoblePhantasmCardTypeChangeTemplate,
} from "./noblePhantasmCardType";
import type {
  AppliedEffect,
  EffectTrigger,
  EffectRuntimeCounters,
  EffectTemplate,
  RemovedEffect,
} from "./types";

const TRIGGER_TIMINGS = [
  "on_apply",
  "turn_start",
  "turn_end",
  "before_attack",
  "after_attack",
  "on_attack",
  "on_hit",
  "on_damage_taken",
  "on_break",
  "on_death",
  "wave_start",
] as const;
const TRIGGER_ATTACK_KINDS = [
  "normal_command",
  "noble_phantasm",
  "extra_attack",
  "enemy_normal_attack",
] as const;
const TRIGGER_CARD_TYPES = [
  "quick",
  "arts",
  "buster",
  "extra",
] as const;
const SLIP_DAMAGE_KINDS = ["burn", "poison", "curse"] as const;
const SLIP_DAMAGE_AMPLIFIER_KINDS = [
  "spread_of_fire",
  "toxic",
  "evil_curse",
] as const;

function assertUniqueListedValues(
  values: readonly string[] | undefined,
  valid: readonly string[],
  name: string,
): void {
  if (values === undefined) return;
  if (values.length === 0) {
    throw new RangeError(`${name} must not be empty`);
  }
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (!valid.includes(value)) {
      throw new RangeError(`${name}[${index}] is invalid`);
    }
    if (seen.has(value)) {
      throw new RangeError(`${name} contains duplicate value: ${value}`);
    }
    seen.add(value);
  });
}

export function assertValidEffectTrigger(
  trigger: EffectTrigger | undefined,
  name = "trigger",
): void {
  if (!trigger) return;
  if (!TRIGGER_TIMINGS.includes(trigger.timing)) {
    throw new RangeError(`${name}.timing is invalid`);
  }
  if (
    trigger.priority !== undefined
    && !Number.isSafeInteger(trigger.priority)
  ) {
    throw new RangeError(`${name}.priority must be a safe integer`);
  }
  if (trigger.activationRatePermille !== undefined) {
    assertSafeInteger(
      trigger.activationRatePermille,
      `${name}.activationRatePermille`,
    );
    if (
      trigger.activationRatePermille < 0
      || trigger.activationRatePermille > 1_000
    ) {
      throw new RangeError(
        `${name}.activationRatePermille must be from 0 to 1000`,
      );
    }
  }
  assertUniqueListedValues(
    trigger.condition?.attackKinds,
    TRIGGER_ATTACK_KINDS,
    `${name}.condition.attackKinds`,
  );
  assertUniqueListedValues(
    trigger.condition?.cardTypes,
    TRIGGER_CARD_TYPES,
    `${name}.condition.cardTypes`,
  );
  (trigger.actions ?? []).forEach((action, index) => {
    const actionName = `${name}.actions[${index}]`;
    if (!action || typeof action !== "object" || !action.action) {
      throw new RangeError(`${actionName}.action is required`);
    }
    if (action.turnEndSettlement && trigger.timing !== "turn_end") {
      throw new RangeError(
        `${actionName}.turnEndSettlement requires turn_end timing`,
      );
    }
    if (
      action.slipDamageKind !== undefined
      && !SLIP_DAMAGE_KINDS.includes(action.slipDamageKind)
    ) {
      throw new RangeError(`${actionName}.slipDamageKind is invalid`);
    }
    if (
      action.slipDamageKind !== undefined
      && action.turnEndSettlement !== "slip_damage"
    ) {
      throw new RangeError(
        `${actionName}.slipDamageKind requires slip_damage settlement`,
      );
    }
    if (action.action.kind !== "gain_stars") return;
    assertSafeInteger(action.action.amount, `${actionName}.action.amount`);
    if (action.action.amount < 0) {
      throw new RangeError(
        `${actionName}.action.amount must not be negative`,
      );
    }
    if (
      action.action.destination !== "command"
      && action.action.destination !== "next_command"
    ) {
      throw new RangeError(
        `${actionName}.action.destination is invalid`,
      );
    }
    if (
      !action.target
      || action.target.relation !== "self"
      || action.target.selection !== "single"
    ) {
      throw new RangeError(
        `${actionName} gain_stars must use a self target`,
      );
    }
    if (
      trigger.timing === "turn_end"
      && action.action.destination !== "next_command"
    ) {
      throw new RangeError(
        `${actionName} turn_end gain_stars must use next_command destination`,
      );
    }
    if (
      trigger.timing === "turn_end"
      && action.turnEndSettlement !== undefined
    ) {
      throw new RangeError(
        `${actionName} turn_end gain_stars cannot use turnEndSettlement`,
      );
    }
  });
}

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
  assertValidEffectTrigger(template.trigger);
  if (
    template.slipDamageAmplifierKind !== undefined
    && !SLIP_DAMAGE_AMPLIFIER_KINDS.includes(
      template.slipDamageAmplifierKind,
    )
  ) {
    throw new RangeError("slipDamageAmplifierKind is invalid");
  }
  if (
    template.slipDamageAmplifierKind !== undefined
    && template.category !== "debuff"
  ) {
    throw new RangeError(
      "slip damage amplifiers must be debuff effects",
    );
  }
  if (
    template.slipDamageAmplifierKind !== undefined
    && (template.value ?? 0) < 0
  ) {
    throw new RangeError(
      "slip damage amplifier value must not be negative",
    );
  }
  assertValidNoblePhantasmCardTypeChangeTemplate(template);
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
    slipDamageAmplifierKind: template.slipDamageAmplifierKind,
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
