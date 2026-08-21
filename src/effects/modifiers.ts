import type { BattleUnitState } from "../core/battle/types";
import { assertSafeInteger } from "../core/numeric";
import type { AppliedEffect, EffectClassification } from "./types";

export const COMMON_EFFECT_TYPES = {
  attack: "attack",
  buffImmunity: "buff_immunity",
  buffRemovalResistance: "buff_removal_resistance",
  buffSuccess: "buff_success",
  damageCut: "damage_cut",
  defense: "defense",
  defensiveClassAffinityOverride:
    "defensive_class_affinity_override",
  debuffImmunity: "debuff_immunity",
  debuffRemovalResistance: "debuff_removal_resistance",
  debuffResistance: "debuff_resistance",
  debuffSuccess: "debuff_success",
  /** 0.01%-point units for source data that cannot be represented in permille. */
  debuffSuccessBasisPoints: "debuff_success_basis_points",
  evade: "evade",
  guts: "guts",
  givenHpRecovery: "given_hp_recovery",
  hpRecoveryBlocked: "hp_recovery_blocked",
  ignoreDefense: "ignore_defense",
  instantDeathImmunity: "instant_death_immunity",
  instantDeathResistance: "instant_death_resistance",
  instantDeathSuccess: "instant_death_success",
  invincibility: "invincibility",
  invincibilityPierce: "invincibility_pierce",
  maxHpChange: "max_hp_change",
  cardPerformance: "card_performance",
  cardResistance: "card_resistance",
  criticalDamage: "critical_damage",
  fixedDamage: "fixed_damage",
  noblePhantasmDamage: "noble_phantasm_damage",
  noblePhantasmOverchargeStage:
    "noble_phantasm_overcharge_stage",
  noblePhantasmCardTypeChange:
    "noble_phantasm_card_type_change",
  npGain: "np_gain",
  recurringNpGain: "recurring_np_gain",
  recurringStarGain: "recurring_star_gain",
  power: "power",
  receivedNpGain: "received_np_gain",
  recurringHpRecovery: "recurring_hp_recovery",
  starGeneration: "star_generation",
  starFocus: "star_focus",
  targetFocus: "target_focus",
  targetDamage: "target_damage",
  targetFixedDamage: "target_fixed_damage",
  targetStarGeneration: "target_star_generation",
  noblePhantasmSeal: "noble_phantasm_seal",
  receivedBuffSuccess: "received_buff_success",
  receivedHpRecovery: "received_hp_recovery",
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
