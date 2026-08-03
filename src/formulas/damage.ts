import { assertSafeInteger, toSafeNumber } from "../core/numeric";

const SCALE = 1000n;

export interface DamageInput {
  attack: number;
  isCritical?: boolean;
  isNoblePhantasm?: boolean;
  npDamageMultiplierPermille?: number;
  cardDamageValuePermille: number;
  cardPerformanceModPermille?: number;
  cardResistancePermille?: number;
  firstCardBonusPermille?: number;
  classAttackCoefficientPermille: number;
  classAffinityPermille: number;
  attributeAffinityPermille: number;
  randomModifierPermille: number;
  attackModPermille?: number;
  defenseModPermille?: number;
  criticalModifierPermille?: number;
  extraCardModifierPermille?: number;
  specialDefenseModPermille?: number;
  powerModPermille?: number;
  targetDamageModPermille?: number;
  criticalDamageModPermille?: number;
  npDamageModPermille?: number;
  specialDamageModPermille?: number;
  npSpecialAttackPermille?: number;
  fixedDamage?: number;
  targetFixedDamage?: number;
  busterChainModPermille?: number;
}

export interface DamageBreakdown {
  cardFactorPermille: number;
  cardTermNumerator: number;
  attackDefenseFactorPermille: number;
  specialDefenseFactorPermille: number;
  powerFactorPermille: number;
  specialDamageFactorPermille: number;
  damageBeforeFloorNumerator: string;
  damageBeforeFloorDenominator: string;
  damage: number;
}

function integer(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  assertSafeInteger(resolved, name);
  return resolved;
}

function nonNegative(value: number, name: string): number {
  if (value < 0) throw new RangeError(`${name} must not be negative`);
  return value;
}

function addRationalInteger(
  numerator: bigint,
  denominator: bigint,
  value: number,
): bigint {
  return numerator + BigInt(value) * denominator;
}

/**
 * Calculates one target's total damage for one card.
 *
 * All percentage-like inputs use permille (1000 = 100%). No intermediate
 * result is rounded; the final non-negative result alone is floored.
 */
export function calculateDamage(input: DamageInput): DamageBreakdown {
  const attack = nonNegative(integer(input.attack, 0, "attack"), "attack");
  const npMultiplier = nonNegative(
    integer(input.npDamageMultiplierPermille, 1000, "npDamageMultiplierPermille"),
    "npDamageMultiplierPermille",
  );
  const cardValue = nonNegative(
    integer(input.cardDamageValuePermille, 0, "cardDamageValuePermille"),
    "cardDamageValuePermille",
  );
  const cardMod = integer(input.cardPerformanceModPermille, 0, "cardPerformanceModPermille");
  const cardResistance = integer(
    input.cardResistancePermille,
    0,
    "cardResistancePermille",
  );
  const cardFactorPermille = Math.max(
    0,
    Math.min(5000, 1000 + cardMod) - cardResistance,
  );
  const firstBonus = nonNegative(
    integer(input.firstCardBonusPermille, 0, "firstCardBonusPermille"),
    "firstCardBonusPermille",
  );
  const cardTermNumerator = firstBonus * 1000 + cardValue * cardFactorPermille;
  assertSafeInteger(cardTermNumerator, "cardTermNumerator");

  const attackDefenseFactorPermille = Math.max(
    0,
    1000
      + integer(input.attackModPermille, 0, "attackModPermille")
      - integer(input.defenseModPermille, 0, "defenseModPermille"),
  );
  const specialDefenseFactorPermille = Math.max(
    0,
    1000 - integer(input.specialDefenseModPermille, 0, "specialDefenseModPermille"),
  );
  const powerFactorPermille = Math.max(
    1,
    1000
      + integer(input.powerModPermille, 0, "powerModPermille")
      + integer(input.targetDamageModPermille, 0, "targetDamageModPermille")
      + (input.isCritical
        ? integer(input.criticalDamageModPermille, 0, "criticalDamageModPermille")
        : 0)
      + (input.isNoblePhantasm
        ? integer(input.npDamageModPermille, 0, "npDamageModPermille")
        : 0),
  );
  const specialDamageFactorPermille = Math.max(
    1,
    1000 + integer(input.specialDamageModPermille, 0, "specialDamageModPermille"),
  );

  const factors = [
    nonNegative(integer(input.classAttackCoefficientPermille, 0, "classAttackCoefficientPermille"), "classAttackCoefficientPermille"),
    nonNegative(integer(input.classAffinityPermille, 0, "classAffinityPermille"), "classAffinityPermille"),
    nonNegative(integer(input.attributeAffinityPermille, 0, "attributeAffinityPermille"), "attributeAffinityPermille"),
    nonNegative(integer(input.randomModifierPermille, 0, "randomModifierPermille"), "randomModifierPermille"),
    230,
    attackDefenseFactorPermille,
    nonNegative(
      integer(
        input.criticalModifierPermille,
        input.isCritical ? 2000 : 1000,
        "criticalModifierPermille",
      ),
      "criticalModifierPermille",
    ),
    nonNegative(integer(input.extraCardModifierPermille, 1000, "extraCardModifierPermille"), "extraCardModifierPermille"),
    specialDefenseFactorPermille,
    powerFactorPermille,
    specialDamageFactorPermille,
    nonNegative(integer(input.npSpecialAttackPermille, 1000, "npSpecialAttackPermille"), "npSpecialAttackPermille"),
  ];

  let numerator = BigInt(attack) * BigInt(npMultiplier) * BigInt(cardTermNumerator);
  let denominator = SCALE * 1_000_000n;
  for (const factor of factors) {
    numerator *= BigInt(factor);
    denominator *= SCALE;
  }

  numerator = addRationalInteger(
    numerator,
    denominator,
    integer(input.fixedDamage, 0, "fixedDamage"),
  );
  numerator = addRationalInteger(
    numerator,
    denominator,
    integer(input.targetFixedDamage, 0, "targetFixedDamage"),
  );

  const busterChainMod = integer(
    input.busterChainModPermille,
    0,
    "busterChainModPermille",
  );
  numerator = numerator * SCALE
    + BigInt(attack) * BigInt(busterChainMod) * denominator;
  denominator *= SCALE;

  const damage = toSafeNumber(
    numerator <= 0n ? 0n : numerator / denominator,
    "damage",
  );

  return {
    cardFactorPermille,
    cardTermNumerator,
    attackDefenseFactorPermille,
    specialDefenseFactorPermille,
    powerFactorPermille,
    specialDamageFactorPermille,
    damageBeforeFloorNumerator: numerator.toString(),
    damageBeforeFloorDenominator: denominator.toString(),
    damage,
  };
}
