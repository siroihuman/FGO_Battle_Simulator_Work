import type { BattleUnitState } from "../core/battle/types";
import { assertSafeInteger } from "../core/numeric";
import type { DeterministicRng } from "../core/rng";
import { COMMON_EFFECT_TYPES } from "./modifiers";
import { consumeUnitEffectUse } from "./runtime";
import { hasBattleTrait } from "./traits";
import type { AppliedEffect } from "./types";

export type DefenseConsumptionUnit = "attack" | "hit";
export type DefenseCardType = "quick" | "arts" | "buster" | "extra";
export type AttackDefenseOutcome =
  | "damage_allowed"
  | "evaded"
  | "invincible"
  | "solemn_defense";

export interface AttackDefenseContext {
  /**
   * Count-based states can be consumed once per command-card attack or once
   * per hit. Call the resolver at the corresponding phase.
   */
  phase: DefenseConsumptionUnit;
  isNoblePhantasm?: boolean;
  isCritical?: boolean;
  cardType?: DefenseCardType;
  sureHit?: boolean;
  invincibilityPierce?: boolean;
  ignoreDefense?: boolean;
}

export interface ActivatedProtection {
  effect: AppliedEffect;
  kind: "evade" | "invincibility" | "solemn_defense";
  bypassed: boolean;
  consumedUse: boolean;
}

export interface AttackDefenseCapabilities {
  sureHit: boolean;
  invincibilityPierce: boolean;
  ignoreDefense: boolean;
}

export interface AttackSourceDefenseResolution
  extends AttackDefenseCapabilities {
  source: BattleUnitState | null;
  consumedSourceEffectInstanceIds: string[];
}

export interface AttackTargetDefenseResolution
  extends AttackDefenseCapabilities {
  target: BattleUnitState;
  outcome: AttackDefenseOutcome;
  /** False only when evasion/invincibility/solemn defense nullifies damage. */
  damageAllowed: boolean;
  /**
   * A protection block is separate from a successful hit whose calculated
   * final damage is zero.
   */
  countsAsSuccessfulHit: boolean;
  /**
   * FGO still resolves non-damage attack consequences such as NP/star work
   * after a protection state nullifies damage.
   */
  postAttackEffectsContinue: boolean;
  protection?: ActivatedProtection;
  sureHit: boolean;
  invincibilityPierce: boolean;
  ignoreDefense: boolean;
  defenseModPermille: number;
  specialDefenseModPermille: number;
  damageCut: number;
  /** Pass this value to DamageInput.targetFixedDamage. */
  targetFixedDamage: number;
  consumedTargetEffectInstanceIds: string[];
}

export interface AttackDefenseResolution
  extends AttackTargetDefenseResolution {
  source: BattleUnitState | null;
  consumedSourceEffectInstanceIds: string[];
}

const PROTECTION_PRIORITY = [
  COMMON_EFFECT_TYPES.solemnDefense,
  COMMON_EFFECT_TYPES.invincibility,
  COMMON_EFFECT_TYPES.evade,
] as const;

const SOURCE_ATTACK_EFFECT_TYPES = [
  COMMON_EFFECT_TYPES.sureHit,
  COMMON_EFFECT_TYPES.invincibilityPierce,
  COMMON_EFFECT_TYPES.ignoreDefense,
] as const;

const TARGET_DAMAGE_EFFECT_TYPES = [
  COMMON_EFFECT_TYPES.defense,
  COMMON_EFFECT_TYPES.specialDefense,
  COMMON_EFFECT_TYPES.damageCut,
  COMMON_EFFECT_TYPES.targetFixedDamage,
] as const;

function flagString(
  effect: AppliedEffect,
  name: string,
): string | undefined {
  const value = effect.flags[name];
  return typeof value === "string" ? value : undefined;
}

function flagBoolean(
  effect: AppliedEffect,
  name: string,
): boolean | undefined {
  const value = effect.flags[name];
  return typeof value === "boolean" ? value : undefined;
}

function flagNumber(
  effect: AppliedEffect,
  name: string,
): number | undefined {
  const value = effect.flags[name];
  if (value === undefined) return undefined;
  if (typeof value !== "number") {
    throw new RangeError(`${name} must be a number`);
  }
  assertSafeInteger(value, name);
  return value;
}

function consumptionUnit(effect: AppliedEffect): DefenseConsumptionUnit {
  const value = flagString(effect, "consumptionUnit") ?? "attack";
  if (value !== "attack" && value !== "hit") {
    throw new RangeError(
      `invalid consumptionUnit on ${effect.instanceId}: ${value}`,
    );
  }
  return value;
}

function effectMatchesContext(
  effect: AppliedEffect,
  context: AttackDefenseContext,
  attacker: BattleUnitState | null,
): boolean {
  if (consumptionUnit(effect) !== context.phase) return false;
  const attackKind = flagString(effect, "attackKind");
  if (
    attackKind
    && attackKind
      !== (context.isNoblePhantasm ? "noble_phantasm" : "normal")
  ) {
    return false;
  }
  const cardType = flagString(effect, "cardType");
  if (cardType && cardType !== context.cardType) return false;
  if (flagBoolean(effect, "criticalOnly") && !context.isCritical) return false;
  const requiredAttackerTrait = flagString(effect, "requiredAttackerTrait");
  if (requiredAttackerTrait && !attacker) return false;
  if (requiredAttackerTrait && !hasBattleTrait(attacker!, requiredAttackerTrait)) {
    return false;
  }
  return true;
}

function matchingEffects(
  unit: BattleUnitState | null,
  effectType: string,
  context: AttackDefenseContext,
  attacker: BattleUnitState | null = null,
): AppliedEffect[] {
  if (!unit) return [];
  return unit.effects
    .filter(
      (effect) =>
        effect.effectType === effectType
        && effectMatchesContext(effect, context, attacker),
    )
    .sort(
      (left, right) => left.registrationOrder - right.registrationOrder,
    );
}

function hasMatchingEffect(
  unit: BattleUnitState | null,
  effectType: string,
  context: AttackDefenseContext,
): boolean {
  return matchingEffects(unit, effectType, context).length > 0;
}

function rollProtectionActivation(
  effect: AppliedEffect,
  rng: DeterministicRng,
): boolean {
  const rate = flagNumber(effect, "activationRatePermille") ?? 1000;
  if (rate <= 0) return false;
  if (rate >= 1000) return true;
  return rng.chance(rate);
}

function protectionKind(
  effectType: string,
): ActivatedProtection["kind"] {
  if (effectType === COMMON_EFFECT_TYPES.solemnDefense) {
    return "solemn_defense";
  }
  if (effectType === COMMON_EFFECT_TYPES.invincibility) {
    return "invincibility";
  }
  return "evade";
}

function protectionOutcome(
  kind: ActivatedProtection["kind"],
): Exclude<AttackDefenseOutcome, "damage_allowed"> {
  if (kind === "solemn_defense") return "solemn_defense";
  if (kind === "invincibility") return "invincible";
  return "evaded";
}

function isProtectionBypassed(
  kind: ActivatedProtection["kind"],
  sureHit: boolean,
  invincibilityPierce: boolean,
): boolean {
  if (kind === "solemn_defense") return false;
  if (kind === "invincibility") return invincibilityPierce;
  return sureHit || invincibilityPierce;
}

function consumeEffects(
  unit: BattleUnitState,
  effects: readonly AppliedEffect[],
): {
  unit: BattleUnitState;
  consumedEffectInstanceIds: string[];
} {
  let current = unit;
  const consumedEffectInstanceIds: string[] = [];
  for (const effect of effects) {
    const result = consumeUnitEffectUse(current, effect.instanceId);
    current = result.unit;
    if (result.consumed) {
      consumedEffectInstanceIds.push(effect.instanceId);
    }
  }
  return { unit: current, consumedEffectInstanceIds };
}

function sumValues(effects: readonly AppliedEffect[], name: string): number {
  const total = effects.reduce((sum, effect) => sum + effect.value, 0);
  assertSafeInteger(total, name);
  return total;
}

/**
 * Resolves and consumes source-side penetration states once for an attack or
 * emitted Hit. Multi-target attacks reuse the returned capabilities for every
 * target in the same phase.
 */
export function resolveAttackSourceDefense(
  source: BattleUnitState | null,
  context: AttackDefenseContext,
): AttackSourceDefenseResolution {
  const sourceMatches = Object.fromEntries(
    SOURCE_ATTACK_EFFECT_TYPES.map((effectType) => [
      effectType,
      matchingEffects(source, effectType, context),
    ]),
  ) as Record<(typeof SOURCE_ATTACK_EFFECT_TYPES)[number], AppliedEffect[]>;

  const sureHit =
    Boolean(context.sureHit)
    || sourceMatches[COMMON_EFFECT_TYPES.sureHit].length > 0;
  const invincibilityPierce =
    Boolean(context.invincibilityPierce)
    || sourceMatches[COMMON_EFFECT_TYPES.invincibilityPierce].length > 0;
  const ignoreDefense =
    Boolean(context.ignoreDefense)
    || sourceMatches[COMMON_EFFECT_TYPES.ignoreDefense].length > 0;

  let currentSource = source;
  const consumedSourceEffectInstanceIds: string[] = [];
  if (currentSource) {
    const consumed = consumeEffects(
      currentSource,
      SOURCE_ATTACK_EFFECT_TYPES.flatMap(
        (effectType) => sourceMatches[effectType],
      ),
    );
    currentSource = consumed.unit;
    consumedSourceEffectInstanceIds.push(
      ...consumed.consumedEffectInstanceIds,
    );
  }

  return {
    source: currentSource,
    sureHit,
    invincibilityPierce,
    ignoreDefense,
    consumedSourceEffectInstanceIds,
  };
}

/**
 * Resolves one target's protection and target-side damage buckets for an
 * attack/hit phase. Protection priority is solemn defense, invincibility,
 * then evasion. A penetrated count-based protection still consumes one use.
 */
export function resolveAttackTargetDefense(
  target: BattleUnitState,
  context: AttackDefenseContext,
  capabilities: AttackDefenseCapabilities,
  rng: DeterministicRng,
  attacker: BattleUnitState | null = null,
): AttackTargetDefenseResolution {
  const {
    sureHit,
    invincibilityPierce,
    ignoreDefense,
  } = capabilities;
  let currentTarget = target;
  const consumedTargetEffectInstanceIds: string[] = [];
  let protection: ActivatedProtection | undefined;

  for (const effectType of PROTECTION_PRIORITY) {
    const candidates = matchingEffects(
      currentTarget,
      effectType,
      context,
      attacker,
    );
    const activated = candidates.find((effect) =>
      rollProtectionActivation(effect, rng)
    );
    if (!activated) continue;

    const kind = protectionKind(effectType);
    const bypassed = isProtectionBypassed(
      kind,
      sureHit,
      invincibilityPierce,
    );
    const consumed = consumeUnitEffectUse(
      currentTarget,
      activated.instanceId,
    );
    currentTarget = consumed.unit;
    if (consumed.consumed) {
      consumedTargetEffectInstanceIds.push(activated.instanceId);
    }
    protection = {
      effect: activated,
      kind,
      bypassed,
      consumedUse: consumed.consumed,
    };

    if (!bypassed) {
      return {
        target: currentTarget,
        outcome: protectionOutcome(kind),
        damageAllowed: false,
        countsAsSuccessfulHit: false,
        postAttackEffectsContinue: true,
        protection,
        sureHit,
        invincibilityPierce,
        ignoreDefense,
        defenseModPermille: 0,
        specialDefenseModPermille: 0,
        damageCut: 0,
        targetFixedDamage: 0,
        consumedTargetEffectInstanceIds,
      };
    }
    // One activated protection owns this phase. A bypass does not then consume
    // a lower-priority protection on the same phase.
    break;
  }

  const targetMatches = Object.fromEntries(
    TARGET_DAMAGE_EFFECT_TYPES.map((effectType) => [
      effectType,
      matchingEffects(currentTarget, effectType, context, attacker),
    ]),
  ) as Record<(typeof TARGET_DAMAGE_EFFECT_TYPES)[number], AppliedEffect[]>;

  const allDefenseEffects = targetMatches[COMMON_EFFECT_TYPES.defense];
  const usedDefenseEffects = ignoreDefense
    ? allDefenseEffects.filter((effect) => effect.value < 0)
    : allDefenseEffects;
  const defenseModPermille = sumValues(
    usedDefenseEffects,
    "defense modifier total",
  );
  const specialDefenseModPermille = sumValues(
    targetMatches[COMMON_EFFECT_TYPES.specialDefense],
    "special defense modifier total",
  );
  const damageCut = sumValues(
    targetMatches[COMMON_EFFECT_TYPES.damageCut],
    "damage cut total",
  );
  const receivedFixedDamage = sumValues(
    targetMatches[COMMON_EFFECT_TYPES.targetFixedDamage],
    "received fixed damage total",
  );
  const targetFixedDamage = receivedFixedDamage - damageCut;
  assertSafeInteger(targetFixedDamage, "target fixed damage");

  const consumed = consumeEffects(
    currentTarget,
    TARGET_DAMAGE_EFFECT_TYPES.flatMap(
      (effectType) => targetMatches[effectType],
    ),
  );
  currentTarget = consumed.unit;
  consumedTargetEffectInstanceIds.push(
    ...consumed.consumedEffectInstanceIds,
  );

  return {
    target: currentTarget,
    outcome: "damage_allowed",
    damageAllowed: true,
    countsAsSuccessfulHit: true,
    postAttackEffectsContinue: true,
    protection,
    sureHit,
    invincibilityPierce,
    ignoreDefense,
    defenseModPermille,
    specialDefenseModPermille,
    damageCut,
    targetFixedDamage,
    consumedTargetEffectInstanceIds,
  };
}

/**
 * Convenience resolver for one source-target pair. Multi-target attack
 * engines should call the source resolver once, then the target resolver for
 * each target so source-side count states are not consumed per target.
 */
export function resolveAttackDefense(
  source: BattleUnitState | null,
  target: BattleUnitState,
  context: AttackDefenseContext,
  rng: DeterministicRng,
): AttackDefenseResolution {
  const sourceResolution = resolveAttackSourceDefense(source, context);
  const targetResolution = resolveAttackTargetDefense(
    target,
    context,
    sourceResolution,
    rng,
    sourceResolution.source,
  );
  return {
    ...targetResolution,
    source: sourceResolution.source,
    consumedSourceEffectInstanceIds:
      sourceResolution.consumedSourceEffectInstanceIds,
  };
}

/**
 * Public predicate used by future action builders when they need to inspect a
 * phase-scoped state without consuming it.
 */
export function hasPhaseEffect(
  unit: BattleUnitState | null,
  effectType: string,
  context: AttackDefenseContext,
): boolean {
  return hasMatchingEffect(unit, effectType, context);
}
