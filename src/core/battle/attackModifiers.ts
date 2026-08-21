import { assertSafeInteger } from "../numeric";
import type {
  BattleUnitState,
  CommandCardType,
} from "./types";
import { COMMON_EFFECT_TYPES } from "../../effects/modifiers";
import type { AppliedEffect } from "../../effects/types";
import { hasBattleTrait } from "../../effects/traits";

export type AttackModifierCardType = CommandCardType | "extra";

export interface AttackModifierContext {
  cardType: AttackModifierCardType;
  isNoblePhantasm: boolean;
  isCritical: boolean;
  source: BattleUnitState;
  target: BattleUnitState;
}

export interface SourceAttackModifierTotals {
  attackModPermille: number;
  cardPerformanceModPermille: number;
  powerModPermille: number;
  criticalDamageModPermille: number;
  npDamageModPermille: number;
  fixedDamage: number;
  npGainModPermille: number;
  starGenerationModPermille: number;
}

export interface TargetAttackModifierTotals {
  cardResistancePermille: number;
  targetDamageModPermille: number;
  npGainModPermille: number;
  receivedNpGainModPermille: number;
  targetStarGenerationModPermille: number;
}

export interface AttackModifierTotals {
  source: SourceAttackModifierTotals;
  target: TargetAttackModifierTotals;
}

const COUNTED_SOURCE_ATTACK_MODIFIER_TYPES = new Set<string>([
  COMMON_EFFECT_TYPES.attack,
  COMMON_EFFECT_TYPES.cardPerformance,
  COMMON_EFFECT_TYPES.power,
  COMMON_EFFECT_TYPES.criticalDamage,
  COMMON_EFFECT_TYPES.noblePhantasmDamage,
  COMMON_EFFECT_TYPES.fixedDamage,
  COMMON_EFFECT_TYPES.npGain,
  COMMON_EFFECT_TYPES.starGeneration,
]);

function stringFlag(
  effect: AppliedEffect,
  name: string,
): string | undefined {
  const value = effect.flags[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new RangeError(
      `${name} on ${effect.instanceId} must be a string`,
    );
  }
  return value;
}

function booleanFlag(
  effect: AppliedEffect,
  name: string,
): boolean | undefined {
  const value = effect.flags[name];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new RangeError(
      `${name} on ${effect.instanceId} must be a boolean`,
    );
  }
  return value;
}

function matchesAttack(
  effect: AppliedEffect,
  context: AttackModifierContext,
): boolean {
  const cardType = stringFlag(effect, "cardType");
  if (cardType && cardType !== context.cardType) return false;

  const attackKind = stringFlag(effect, "attackKind");
  if (
    attackKind
    && attackKind
      !== (
        context.isNoblePhantasm
          ? "noble_phantasm"
          : "normal"
      )
  ) {
    return false;
  }
  if (booleanFlag(effect, "criticalOnly") && !context.isCritical) {
    return false;
  }
  const requiredTargetTrait = stringFlag(
    effect,
    "requiredTargetTrait",
  );
  if (
    requiredTargetTrait
    && !hasBattleTrait(context.target, requiredTargetTrait)
  ) {
    return false;
  }
  const excludedTargetTrait = stringFlag(
    effect,
    "excludedTargetTrait",
  );
  return !(
    excludedTargetTrait
    && hasBattleTrait(context.target, excludedTargetTrait)
  );
}

/**
 * Lists count-based source modifiers that contributed to this damaging
 * action. The surrounding action sequence consumes the union once per card,
 * not once per target, Hit, or additional NP packet.
 */
export function countedSourceAttackModifierEffectInstanceIds(
  context: AttackModifierContext,
): string[] {
  return context.source.effects
    .filter(
      (effect) =>
        effect.remainingUses !== null
        && COUNTED_SOURCE_ATTACK_MODIFIER_TYPES.has(effect.effectType)
        && (
          effect.effectType !== COMMON_EFFECT_TYPES.criticalDamage
          || context.isCritical
        )
        && (
          effect.effectType !== COMMON_EFFECT_TYPES.noblePhantasmDamage
          || context.isNoblePhantasm
        )
        && matchesAttack(effect, context),
    )
    .sort(
      (left, right) => left.registrationOrder - right.registrationOrder,
    )
    .map(({ instanceId }) => instanceId);
}

/**
 * A defensive class-affinity override replaces the ordinary class table
 * result. Multiple currently registered copies must agree; differing values
 * are rejected instead of inventing an undocumented stacking rule.
 */
export function defensiveClassAffinityOverridePermille(
  target: BattleUnitState,
): number | null {
  const values = target.effects
    .filter(
      ({ effectType }) =>
        effectType
        === COMMON_EFFECT_TYPES.defensiveClassAffinityOverride,
    )
    .map(({ value }) => value);
  if (values.length === 0) return null;
  values.forEach((value) => {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(
        "defensive class-affinity override must be a positive safe integer",
      );
    }
  });
  if (new Set(values).size !== 1) {
    throw new RangeError(
      "conflicting defensive class-affinity override values",
    );
  }
  return values[0];
}

function sumMatching(
  unit: BattleUnitState,
  effectType: string,
  context: AttackModifierContext,
): number {
  const total = unit.effects
    .filter(
      (effect) =>
        effect.effectType === effectType
        && matchesAttack(effect, context),
    )
    .reduce((sum, effect) => sum + effect.value, 0);
  assertSafeInteger(total, `${effectType} attack modifier total`);
  return total;
}

/**
 * Snapshots every ordinary A/C/E-slot modifier used to construct one
 * source-target attack input after before-attack effects have finished.
 * Protection, defense, special defense, and damage cut remain in the
 * state-consuming defense resolver.
 */
export function resolveAttackModifierTotals(
  context: AttackModifierContext,
): AttackModifierTotals {
  const { source, target } = context;
  return {
    source: {
      attackModPermille: sumMatching(
        source,
        COMMON_EFFECT_TYPES.attack,
        context,
      ),
      cardPerformanceModPermille: sumMatching(
        source,
        COMMON_EFFECT_TYPES.cardPerformance,
        context,
      ),
      powerModPermille: sumMatching(
        source,
        COMMON_EFFECT_TYPES.power,
        context,
      ),
      criticalDamageModPermille: sumMatching(
        source,
        COMMON_EFFECT_TYPES.criticalDamage,
        context,
      ),
      npDamageModPermille: sumMatching(
        source,
        COMMON_EFFECT_TYPES.noblePhantasmDamage,
        context,
      ),
      fixedDamage: sumMatching(
        source,
        COMMON_EFFECT_TYPES.fixedDamage,
        context,
      ),
      npGainModPermille: sumMatching(
        source,
        COMMON_EFFECT_TYPES.npGain,
        context,
      ),
      starGenerationModPermille: sumMatching(
        source,
        COMMON_EFFECT_TYPES.starGeneration,
        context,
      ),
    },
    target: {
      cardResistancePermille: sumMatching(
        target,
        COMMON_EFFECT_TYPES.cardResistance,
        context,
      ),
      targetDamageModPermille: sumMatching(
        target,
        COMMON_EFFECT_TYPES.targetDamage,
        context,
      ),
      npGainModPermille: sumMatching(
        target,
        COMMON_EFFECT_TYPES.npGain,
        context,
      ),
      receivedNpGainModPermille: sumMatching(
        target,
        COMMON_EFFECT_TYPES.receivedNpGain,
        context,
      ),
      targetStarGenerationModPermille: sumMatching(
        target,
        COMMON_EFFECT_TYPES.targetStarGeneration,
        context,
      ),
    },
  };
}
