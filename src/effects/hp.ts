import type { BattleUnitState } from "../core/battle/types";
import {
  assertSafeInteger,
  multiplyThenFloor,
  toSafeNumber,
} from "../core/numeric";
import { COMMON_EFFECT_TYPES } from "./modifiers";
import { consumeUnitEffectUse } from "./runtime";
import {
  resolveLethalHp,
  type LethalHpResolution,
} from "./survival";
import type { AppliedEffect } from "./types";

export interface HpRecoveryOptions {
  ignoreRecoveryModifiers?: boolean;
  ignoreHealingBlock?: boolean;
}

export type HpRecoveryOutcome =
  | "no_target"
  | "dead"
  | "blocked"
  | "unchanged"
  | "healed";

export interface HpRecoveryResult {
  source: BattleUnitState | null;
  target: BattleUnitState | null;
  outcome: HpRecoveryOutcome;
  baseAmount: number;
  givenModifierPermille: number;
  receivedModifierPermille: number;
  scaledAmount: number;
  actualRecovered: number;
  blockedByEffectInstanceId?: string;
  consumedSourceEffectInstanceIds: string[];
  consumedTargetEffectInstanceIds: string[];
}

export interface HpReductionOptions {
  canDefeat: boolean;
  intermediateBreak?: boolean;
  ignoreGuts?: boolean;
  percentageGutsRecoveryModifierPermille?: number;
}

export type HpReductionOutcome =
  | "no_target"
  | "unchanged"
  | "reduced"
  | "break_pending"
  | "guts"
  | "defeated";

export interface HpReductionResult {
  target: BattleUnitState | null;
  outcome: HpReductionOutcome;
  requestedAmount: number;
  actualReduction: number;
  hpAfterReductionBeforeSurvival: number | null;
  survival?: LethalHpResolution;
}

export interface HpAbsorptionOptions
  extends HpReductionOptions, HpRecoveryOptions {
  amountPerTarget: number;
  /** 1000 heals the source for 100% of HP actually reduced. */
  recoveryRatePermille?: number;
}

export type HpAbsorptionOutcome =
  | "no_source"
  | "unchanged"
  | "absorbed";

export interface HpAbsorptionResult {
  source: BattleUnitState | null;
  targets: Array<BattleUnitState | null>;
  outcome: HpAbsorptionOutcome;
  targetResults: HpReductionResult[];
  totalActualReduction: number;
  recoveryBaseAmount: number;
  recovery?: HpRecoveryResult;
}

function assertNonNegativeAmount(value: number, name: string): void {
  assertSafeInteger(value, name);
  if (value < 0) throw new RangeError(`${name} must not be negative`);
}

function effectsOfType(
  unit: BattleUnitState | null,
  effectType: string,
): AppliedEffect[] {
  if (!unit) return [];
  return unit.effects
    .filter((effect) => effect.effectType === effectType)
    .sort(
      (left, right) => left.registrationOrder - right.registrationOrder,
    );
}

function sumEffectValues(
  effects: readonly AppliedEffect[],
  name: string,
): number {
  const value = effects.reduce((sum, effect) => {
    assertSafeInteger(effect.value, `${name} effect value`);
    return sum + BigInt(effect.value);
  }, 0n);
  return toSafeNumber(value, name);
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

/**
 * Resolves one ordinary HP recovery event.
 *
 * Given-recovery and received-recovery modifiers are additive within their
 * own groups, then multiplicative with each other. Maximum-HP changes and
 * fixed-value guts do not call this function.
 */
export function resolveHpRecovery(
  source: BattleUnitState | null,
  target: BattleUnitState | null,
  baseAmount: number,
  options: HpRecoveryOptions = {},
): HpRecoveryResult {
  assertNonNegativeAmount(baseAmount, "HP recovery amount");
  if (!target) {
    return {
      source,
      target,
      outcome: "no_target",
      baseAmount,
      givenModifierPermille: 0,
      receivedModifierPermille: 0,
      scaledAmount: 0,
      actualRecovered: 0,
      consumedSourceEffectInstanceIds: [],
      consumedTargetEffectInstanceIds: [],
    };
  }
  if (!target.alive) {
    return {
      source,
      target,
      outcome: "dead",
      baseAmount,
      givenModifierPermille: 0,
      receivedModifierPermille: 0,
      scaledAmount: 0,
      actualRecovered: 0,
      consumedSourceEffectInstanceIds: [],
      consumedTargetEffectInstanceIds: [],
    };
  }

  const givenEffects = options.ignoreRecoveryModifiers
    ? []
    : effectsOfType(source, COMMON_EFFECT_TYPES.givenHpRecovery);
  const receivedEffects = options.ignoreRecoveryModifiers
    ? []
    : effectsOfType(target, COMMON_EFFECT_TYPES.receivedHpRecovery);
  const blockEffect = options.ignoreHealingBlock
    ? undefined
    : effectsOfType(target, COMMON_EFFECT_TYPES.hpRecoveryBlocked)[0];
  const givenModifierPermille = sumEffectValues(
    givenEffects,
    "given HP recovery modifier",
  );
  const receivedModifierPermille = sumEffectValues(
    receivedEffects,
    "received HP recovery modifier",
  );
  const givenFactor = Math.max(0, 1000 + givenModifierPermille);
  const receivedFactor = Math.max(0, 1000 + receivedModifierPermille);
  const scaledAmount = options.ignoreRecoveryModifiers
    ? baseAmount
    : multiplyThenFloor(
        [baseAmount, givenFactor, receivedFactor],
        1_000_000,
      );

  let currentSource = source;
  let currentTarget = target;
  const consumedSourceEffectInstanceIds: string[] = [];
  const consumedTargetEffectInstanceIds: string[] = [];
  if (source?.instanceId === target.instanceId) {
    const usedEffects = [
      ...givenEffects,
      ...receivedEffects,
      ...(blockEffect ? [blockEffect] : []),
    ].filter(
      (effect, index, effects) =>
        effects.findIndex(
          (candidate) => candidate.instanceId === effect.instanceId,
        ) === index,
    );
    const consumed = consumeEffects(target, usedEffects);
    currentSource = consumed.unit;
    currentTarget = consumed.unit;
    const sourceIds = new Set(givenEffects.map(({ instanceId }) => instanceId));
    for (const instanceId of consumed.consumedEffectInstanceIds) {
      if (sourceIds.has(instanceId)) {
        consumedSourceEffectInstanceIds.push(instanceId);
      } else {
        consumedTargetEffectInstanceIds.push(instanceId);
      }
    }
  } else {
    if (source) {
      const consumedSource = consumeEffects(source, givenEffects);
      currentSource = consumedSource.unit;
      consumedSourceEffectInstanceIds.push(
        ...consumedSource.consumedEffectInstanceIds,
      );
    }
    const consumedTarget = consumeEffects(
      target,
      [
        ...receivedEffects,
        ...(blockEffect ? [blockEffect] : []),
      ],
    );
    currentTarget = consumedTarget.unit;
    consumedTargetEffectInstanceIds.push(
      ...consumedTarget.consumedEffectInstanceIds,
    );
  }

  if (blockEffect) {
    return {
      source: currentSource,
      target: currentTarget,
      outcome: "blocked",
      baseAmount,
      givenModifierPermille,
      receivedModifierPermille,
      scaledAmount,
      actualRecovered: 0,
      blockedByEffectInstanceId: blockEffect.instanceId,
      consumedSourceEffectInstanceIds,
      consumedTargetEffectInstanceIds,
    };
  }

  const actualRecovered = Math.min(
    scaledAmount,
    Math.max(0, currentTarget.maxHp - currentTarget.hp),
  );
  const healedTarget =
    actualRecovered === 0
      ? currentTarget
      : { ...currentTarget, hp: currentTarget.hp + actualRecovered };
  if (currentSource?.instanceId === healedTarget.instanceId) {
    currentSource = healedTarget;
  }
  return {
    source: currentSource,
    target: healedTarget,
    outcome: actualRecovered > 0 ? "healed" : "unchanged",
    baseAmount,
    givenModifierPermille,
    receivedModifierPermille,
    scaledAmount,
    actualRecovered,
    consumedSourceEffectInstanceIds,
    consumedTargetEffectInstanceIds,
  };
}

export function resolveHpReduction(
  target: BattleUnitState | null,
  amount: number,
  options: HpReductionOptions,
): HpReductionResult {
  assertNonNegativeAmount(amount, "HP reduction amount");
  if (!target || !target.alive) {
    return {
      target,
      outcome: "no_target",
      requestedAmount: amount,
      actualReduction: 0,
      hpAfterReductionBeforeSurvival: null,
    };
  }
  const minimumHp = options.canDefeat ? 0 : 1;
  const reducibleHp = Math.max(0, target.hp - minimumHp);
  const actualReduction = Math.min(amount, reducibleHp);
  if (actualReduction === 0) {
    return {
      target,
      outcome: "unchanged",
      requestedAmount: amount,
      actualReduction,
      hpAfterReductionBeforeSurvival: target.hp,
    };
  }
  const hp = target.hp - actualReduction;
  const reducedTarget = { ...target, hp, alive: hp > 0 };
  const survival =
    options.canDefeat && hp === 0
      ? resolveLethalHp(reducedTarget, {
          intermediateBreak: options.intermediateBreak,
          ignoreGuts: options.ignoreGuts,
          percentageRecoveryModifierPermille:
            options.percentageGutsRecoveryModifierPermille,
        })
      : undefined;
  const outcome: HpReductionOutcome =
    survival?.outcome === "break_pending"
      ? "break_pending"
      : survival?.outcome === "guts"
        ? "guts"
        : survival?.outcome === "defeated"
          ? "defeated"
          : "reduced";
  return {
    target: survival?.unit ?? reducedTarget,
    outcome,
    requestedAmount: amount,
    actualReduction,
    hpAfterReductionBeforeSurvival: hp,
    survival,
  };
}

/**
 * Reduces each target in the supplied order, totals the HP actually removed,
 * then performs exactly one recovery event on the source.
 */
export function resolveHpAbsorption(
  source: BattleUnitState | null,
  targets: readonly (BattleUnitState | null)[],
  options: HpAbsorptionOptions,
): HpAbsorptionResult {
  assertNonNegativeAmount(options.amountPerTarget, "HP absorption amount");
  const recoveryRatePermille = options.recoveryRatePermille ?? 1000;
  assertNonNegativeAmount(
    recoveryRatePermille,
    "HP absorption recovery rate",
  );
  if (!source || !source.alive) {
    return {
      source,
      targets: [...targets],
      outcome: "no_source",
      targetResults: targets.map((target) => ({
        target,
        outcome: "no_target",
        requestedAmount: options.amountPerTarget,
        actualReduction: 0,
        hpAfterReductionBeforeSurvival: null,
      })),
      totalActualReduction: 0,
      recoveryBaseAmount: 0,
    };
  }

  let currentSource = source;
  const targetResults = targets.map((target) => {
    const currentTarget =
      target?.instanceId === currentSource.instanceId
        ? currentSource
        : target;
    const result = resolveHpReduction(
      currentTarget,
      options.amountPerTarget,
      options,
    );
    if (result.target?.instanceId === currentSource.instanceId) {
      currentSource = result.target;
    }
    return result;
  });
  const totalActualReduction = toSafeNumber(
    targetResults.reduce(
      (sum, result) => sum + BigInt(result.actualReduction),
      0n,
    ),
    "total absorbed HP",
  );
  const recoveryBaseAmount = multiplyThenFloor(
    [totalActualReduction, recoveryRatePermille],
    1000,
  );
  const recovery = resolveHpRecovery(
    currentSource,
    currentSource,
    recoveryBaseAmount,
    options,
  );
  currentSource = recovery.target ?? currentSource;
  const finalTargets = targetResults.map((result) =>
    result.target?.instanceId === currentSource.instanceId
      ? currentSource
      : result.target,
  );
  return {
    source: currentSource,
    targets: finalTargets,
    outcome: totalActualReduction > 0 ? "absorbed" : "unchanged",
    targetResults,
    totalActualReduction,
    recoveryBaseAmount,
    recovery,
  };
}
