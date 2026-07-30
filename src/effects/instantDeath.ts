import type { BattleUnitState } from "../core/battle/types";
import {
  assertSafeInteger,
  multiplyThenFloor,
} from "../core/numeric";
import type { DeterministicRng } from "../core/rng";
import {
  COMMON_EFFECT_TYPES,
  sumEffectModifiers,
} from "./modifiers";
import { consumeUnitEffectUse } from "./runtime";
import {
  resolveLethalHp,
  type LethalHpResolution,
} from "./survival";
import type { AppliedEffect } from "./types";

export type InstantDeathTiming =
  | "before_damage"
  | "after_damage"
  | "standalone";

export type InstantDeathOutcome =
  | "no_target"
  | "failed"
  | "immune"
  | "break_pending"
  | "guts"
  | "defeated";

export interface InstantDeathRate {
  effectRatePermille: number;
  targetDeathRatePermille: number;
  sourceSuccessPermille: number;
  targetResistancePermille: number;
  modifierFactorPermille: number;
  resolvedRatePermille: number;
}

export interface InstantDeathOptions {
  effectRatePermille: number;
  timing?: InstantDeathTiming;
  intermediateBreak?: boolean;
  ignoreResistance?: boolean;
  ignoreImmunity?: boolean;
  ignoreGuts?: boolean;
  /**
   * Instant-death demerits use this after their parent condition succeeds.
   * It bypasses the normal DR/resistance probability roll.
   */
  forceSuccess?: boolean;
  percentageGutsRecoveryModifierPermille?: number;
}

export interface InstantDeathResult {
  source: BattleUnitState | null;
  target: BattleUnitState | null;
  outcome: InstantDeathOutcome;
  rate: InstantDeathRate | null;
  deathRollSucceeded: boolean;
  immunityEffect?: AppliedEffect;
  consumedImmunityUse: boolean;
  survival?: LethalHpResolution;
  /**
   * A successful pre-damage death stops the card's hits. An immunity block or
   * failed death roll does not.
   */
  skipAttackHits: boolean;
}

function assertNonNegativeRate(value: number, name: string): void {
  assertSafeInteger(value, name);
  if (value < 0) throw new RangeError(`${name} must not be negative`);
}

/**
 * FGO instant-death formula:
 * effect rate × target DR ×
 * (100% + source success - target resistance).
 */
export function calculateInstantDeathRate(
  source: BattleUnitState | null,
  target: BattleUnitState,
  effectRatePermille: number,
  ignoreResistance = false,
): InstantDeathRate {
  assertNonNegativeRate(effectRatePermille, "effectRatePermille");
  assertNonNegativeRate(
    target.deathRatePermille,
    "target.deathRatePermille",
  );
  const sourceSuccessPermille = sumEffectModifiers(
    source,
    COMMON_EFFECT_TYPES.instantDeathSuccess,
    [],
  );
  const targetResistancePermille = ignoreResistance
    ? 0
    : sumEffectModifiers(
        target,
        COMMON_EFFECT_TYPES.instantDeathResistance,
        [],
      );
  const rawFactor =
    1000 + sourceSuccessPermille - targetResistancePermille;
  assertSafeInteger(rawFactor, "instant-death modifier factor");
  const modifierFactorPermille = Math.max(0, rawFactor);
  const resolvedRatePermille = multiplyThenFloor(
    [
      effectRatePermille,
      target.deathRatePermille,
      modifierFactorPermille,
    ],
    1_000_000,
  );
  return {
    effectRatePermille,
    targetDeathRatePermille: target.deathRatePermille,
    sourceSuccessPermille,
    targetResistancePermille,
    modifierFactorPermille,
    resolvedRatePermille,
  };
}

function rollInstantDeath(
  ratePermille: number,
  forceSuccess: boolean,
  rng: DeterministicRng,
): boolean {
  if (forceSuccess) return true;
  if (ratePermille <= 0) return false;
  if (ratePermille >= 1000) return true;
  return rng.chance(ratePermille);
}

function oldestInstantDeathImmunity(
  target: BattleUnitState,
): AppliedEffect | undefined {
  return target.effects
    .filter(
      (effect) =>
        effect.effectType === COMMON_EFFECT_TYPES.instantDeathImmunity,
    )
    .sort(
      (left, right) => left.registrationOrder - right.registrationOrder,
    )[0];
}

/**
 * Resolves one instant-death child state. Immunity is checked and consumed
 * only after the death probability itself succeeds.
 */
export function resolveInstantDeath(
  source: BattleUnitState | null,
  target: BattleUnitState | null,
  options: InstantDeathOptions,
  rng: DeterministicRng,
): InstantDeathResult {
  if (!target || !target.alive) {
    return {
      source,
      target,
      outcome: "no_target",
      rate: null,
      deathRollSucceeded: false,
      consumedImmunityUse: false,
      skipAttackHits: false,
    };
  }

  const rate = calculateInstantDeathRate(
    source,
    target,
    options.effectRatePermille,
    options.ignoreResistance,
  );
  const deathRollSucceeded = rollInstantDeath(
    rate.resolvedRatePermille,
    Boolean(options.forceSuccess),
    rng,
  );
  if (!deathRollSucceeded) {
    return {
      source,
      target,
      outcome: "failed",
      rate,
      deathRollSucceeded,
      consumedImmunityUse: false,
      skipAttackHits: false,
    };
  }

  if (!options.ignoreImmunity) {
    const immunity = oldestInstantDeathImmunity(target);
    if (immunity) {
      const consumed = consumeUnitEffectUse(target, immunity.instanceId);
      return {
        source,
        target: consumed.unit,
        outcome: "immune",
        rate,
        deathRollSucceeded,
        immunityEffect: immunity,
        consumedImmunityUse: consumed.consumed,
        skipAttackHits: false,
      };
    }
  }

  const survival = resolveLethalHp(
    { ...target, hp: 0 },
    {
      intermediateBreak: options.intermediateBreak,
      ignoreGuts: options.ignoreGuts,
      percentageRecoveryModifierPermille:
        options.percentageGutsRecoveryModifierPermille,
    },
  );
  const outcome: InstantDeathOutcome =
    survival.outcome === "break_pending"
      ? "break_pending"
      : survival.outcome === "guts"
        ? "guts"
        : "defeated";
  return {
    source,
    target: survival.unit,
    outcome,
    rate,
    deathRollSucceeded,
    consumedImmunityUse: false,
    survival,
    skipAttackHits:
      (options.timing ?? "standalone") === "before_damage",
  };
}
