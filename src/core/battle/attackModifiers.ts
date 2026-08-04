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
