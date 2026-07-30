import type { BattleUnitState } from "../core/battle/types";
import { assertSafeInteger } from "../core/numeric";
import type { AppliedEffect, EffectClassification } from "./types";

export const COMMON_EFFECT_TYPES = {
  buffImmunity: "buff_immunity",
  buffRemovalResistance: "buff_removal_resistance",
  buffSuccess: "buff_success",
  damageCut: "damage_cut",
  defense: "defense",
  debuffImmunity: "debuff_immunity",
  debuffRemovalResistance: "debuff_removal_resistance",
  debuffResistance: "debuff_resistance",
  debuffSuccess: "debuff_success",
  evade: "evade",
  guts: "guts",
  ignoreDefense: "ignore_defense",
  instantDeathImmunity: "instant_death_immunity",
  instantDeathResistance: "instant_death_resistance",
  instantDeathSuccess: "instant_death_success",
  invincibility: "invincibility",
  invincibilityPierce: "invincibility_pierce",
  receivedBuffSuccess: "received_buff_success",
  solemnDefense: "solemn_defense",
  specialDefense: "special_defense",
  sureHit: "sure_hit",
} as const;

export function classificationsOverlap(
  left: readonly EffectClassification[],
  right: readonly EffectClassification[],
): boolean {
  return left.some((classification) => right.includes(classification));
}

/**
 * An unclassified modifier is general-purpose. A classified modifier only
 * affects a state carrying at least one of the same classifications.
 */
export function modifierMatchesClassifications(
  modifier: Pick<AppliedEffect, "classifications">,
  affectedClassifications: readonly EffectClassification[],
): boolean {
  return (
    modifier.classifications.length === 0
    || classificationsOverlap(
      modifier.classifications,
      affectedClassifications,
    )
  );
}

export function sumEffectModifiers(
  unit: BattleUnitState | null,
  effectType: string,
  affectedClassifications: readonly EffectClassification[],
): number {
  if (!unit) return 0;
  const total = unit.effects
    .filter(
      (effect) =>
        effect.effectType === effectType
        && modifierMatchesClassifications(effect, affectedClassifications),
    )
    .reduce((sum, effect) => sum + effect.value, 0);
  assertSafeInteger(total, `${effectType} modifier total`);
  return total;
}
