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
import type { AppliedEffect, SlipDamageKind } from "./types";

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

export interface RecurringHpRecoveryContribution {
  source: BattleUnitState | null;
  baseAmount: number;
  ignoreRecoveryModifiers?: boolean;
  ignoreHealingBlock?: boolean;
}

export interface TurnEndSlipDamageContribution {
  baseAmount: number;
  kind: SlipDamageKind | null;
  amplifierPermille: number;
}

export interface TurnEndSlipDamageCategoryResult {
  kind: SlipDamageKind;
  baseAmount: number;
  resolvedDamage: number;
}

export type TurnEndHpSettlementOutcome =
  | "no_target"
  | "dead"
  | "unchanged"
  | "healed"
  | "damaged";

export interface TurnEndHpSourceModifier {
  sourceInstanceId: string | null;
  givenModifierPermille: number;
}

export interface TurnEndHpSettlementResult {
  target: BattleUnitState | null;
  sourceUnits: BattleUnitState[];
  outcome: TurnEndHpSettlementOutcome;
  totalBaseRecovery: number;
  scaledRecovery: number;
  totalSlipDamage: number;
  slipDamageCategories: TurnEndSlipDamageCategoryResult[];
  hpBefore: number | null;
  hpAfter: number | null;
  hpChange: number;
  receivedModifierPermille: number;
  sourceModifiers: TurnEndHpSourceModifier[];
  blockedByEffectInstanceId?: string;
  consumedSourceEffectInstanceIds: string[];
  consumedTargetEffectInstanceIds: string[];
  slipPreventedDefeat: boolean;
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
  const recovery =
    totalActualReduction === 0
      ? undefined
      : resolveHpRecovery(
          currentSource,
          currentSource,
          recoveryBaseAmount,
          options,
        );
  currentSource = recovery?.target ?? currentSource;
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

function uniqueUnits(
  units: readonly (BattleUnitState | null)[],
): BattleUnitState[] {
  return units.filter(
    (unit, index): unit is BattleUnitState =>
      unit !== null
      && units.findIndex(
        (candidate) => candidate?.instanceId === unit.instanceId,
      ) === index,
  );
}

/**
 * Settles standard recurring HP recovery and slip damage for one target.
 *
 * All recovery contributions share one received-recovery modifier use and one
 * healing-block use. Given-recovery modifiers are applied once per distinct
 * original source. Recovery and slip damage are then combined before the
 * target's HP is clamped between 1 and maximum HP.
 */
export function resolveTurnEndHpSettlement(
  target: BattleUnitState | null,
  recoveries: readonly RecurringHpRecoveryContribution[],
  slipDamageContributions: readonly TurnEndSlipDamageContribution[],
): TurnEndHpSettlementResult {
  recoveries.forEach(({ baseAmount }, index) => {
    assertNonNegativeAmount(
      baseAmount,
      `turn-end recovery contribution[${index}]`,
    );
  });
  slipDamageContributions.forEach((contribution, index) => {
    assertNonNegativeAmount(
      contribution.baseAmount,
      `turn-end slip damage[${index}].baseAmount`,
    );
    assertNonNegativeAmount(
      contribution.amplifierPermille,
      `turn-end slip damage[${index}].amplifierPermille`,
    );
  });

  const originalSourceUnits = uniqueUnits(
    recoveries.map(({ source }) => source),
  );
  const totalBaseRecovery = toSafeNumber(
    recoveries.reduce(
      (sum, { baseAmount }) => sum + BigInt(baseAmount),
      0n,
    ),
    "total turn-end base recovery",
  );
  const slipDamageCategories: TurnEndSlipDamageCategoryResult[] = [];
  let untypedSlipDamage = 0n;
  for (const kind of ["burn", "poison", "curse"] as const) {
    const matching = slipDamageContributions.filter(
      (contribution) => contribution.kind === kind,
    );
    if (matching.length === 0) continue;
    const baseAmount = matching.reduce(
      (sum, contribution) => sum + BigInt(contribution.baseAmount),
      0n,
    );
    const amplifiedNumerator = matching.reduce(
      (sum, contribution) =>
        sum
        + BigInt(contribution.baseAmount)
          * BigInt(1000 + contribution.amplifierPermille),
      0n,
    );
    slipDamageCategories.push({
      kind,
      baseAmount: toSafeNumber(
        baseAmount,
        `${kind} turn-end base damage`,
      ),
      resolvedDamage: toSafeNumber(
        amplifiedNumerator / 1000n,
        `${kind} amplified turn-end damage`,
      ),
    });
  }
  for (const contribution of slipDamageContributions) {
    if (contribution.kind === null) {
      untypedSlipDamage += BigInt(contribution.baseAmount);
    }
  }
  const totalSlipDamage = toSafeNumber(
    untypedSlipDamage
      + slipDamageCategories.reduce(
        (sum, category) => sum + BigInt(category.resolvedDamage),
        0n,
      ),
    "total turn-end slip damage",
  );
  const emptyResult = (
    outcome: "no_target" | "dead",
  ): TurnEndHpSettlementResult => ({
    target,
    sourceUnits: originalSourceUnits,
    outcome,
    totalBaseRecovery,
    scaledRecovery: 0,
    totalSlipDamage,
    slipDamageCategories,
    hpBefore: target?.hp ?? null,
    hpAfter: target?.hp ?? null,
    hpChange: 0,
    receivedModifierPermille: 0,
    sourceModifiers: [],
    consumedSourceEffectInstanceIds: [],
    consumedTargetEffectInstanceIds: [],
    slipPreventedDefeat: false,
  });
  if (!target) return emptyResult("no_target");
  if (!target.alive) return emptyResult("dead");

  const positiveRecoveries = recoveries.filter(
    ({ baseAmount }) => baseAmount > 0,
  );
  const blockEffect = positiveRecoveries.some(
    ({ ignoreHealingBlock }) => !ignoreHealingBlock,
  )
    ? effectsOfType(target, COMMON_EFFECT_TYPES.hpRecoveryBlocked)[0]
    : undefined;
  const receivedEffects = positiveRecoveries.some(
    ({ ignoreRecoveryModifiers }) => !ignoreRecoveryModifiers,
  )
    ? effectsOfType(target, COMMON_EFFECT_TYPES.receivedHpRecovery)
    : [];
  const receivedModifierPermille = sumEffectValues(
    receivedEffects,
    "received HP recovery modifier",
  );
  const receivedFactor = Math.max(0, 1000 + receivedModifierPermille);

  const sourceRecords = new Map<string, {
    source: BattleUnitState;
    effects: AppliedEffect[];
    modifierPermille: number;
  }>();
  for (const { source, baseAmount, ignoreRecoveryModifiers } of recoveries) {
    if (!source || baseAmount === 0 || ignoreRecoveryModifiers) continue;
    if (sourceRecords.has(source.instanceId)) continue;
    const effects = effectsOfType(
      source,
      COMMON_EFFECT_TYPES.givenHpRecovery,
    );
    sourceRecords.set(source.instanceId, {
      source,
      effects,
      modifierPermille: sumEffectValues(
        effects,
        "given HP recovery modifier",
      ),
    });
  }
  const sourceModifiers: TurnEndHpSourceModifier[] = [
    ...sourceRecords.values(),
  ].map(({ source, modifierPermille }) => ({
    sourceInstanceId: source.instanceId,
    givenModifierPermille: modifierPermille,
  }));
  if (recoveries.some(({ source }) => source === null)) {
    sourceModifiers.push({
      sourceInstanceId: null,
      givenModifierPermille: 0,
    });
  }

  const recoveryNumerator = recoveries.reduce(
    (
      sum,
      {
        source,
        baseAmount,
        ignoreRecoveryModifiers,
        ignoreHealingBlock,
      },
    ) => {
      if (
        baseAmount === 0
        || (blockEffect && !ignoreHealingBlock)
      ) {
        return sum;
      }
      const givenFactor = ignoreRecoveryModifiers
        ? 1000
        : Math.max(
            0,
            1000
              + (source
                ? sourceRecords.get(source.instanceId)?.modifierPermille ?? 0
                : 0),
          );
      const targetFactor = ignoreRecoveryModifiers
        ? 1000
        : receivedFactor;
      return sum
        + BigInt(baseAmount) * BigInt(givenFactor) * BigInt(targetFactor);
    },
    0n,
  );
  const scaledRecovery = toSafeNumber(
    recoveryNumerator / 1_000_000n,
    "scaled turn-end recovery",
  );

  let currentTarget = target;
  const currentSources = new Map(
    originalSourceUnits.map((source) => [source.instanceId, source]),
  );
  const consumedSourceEffectInstanceIds: string[] = [];
  for (const {
    source,
    effects,
  } of sourceRecords.values()) {
    const currentSource =
      source.instanceId === currentTarget.instanceId
        ? currentTarget
        : currentSources.get(source.instanceId) ?? source;
    const consumed = consumeEffects(currentSource, effects);
    consumedSourceEffectInstanceIds.push(
      ...consumed.consumedEffectInstanceIds,
    );
    currentSources.set(source.instanceId, consumed.unit);
    if (source.instanceId === currentTarget.instanceId) {
      currentTarget = consumed.unit;
    }
  }

  const consumedTarget = consumeEffects(
    currentTarget,
    [
      ...receivedEffects,
      ...(blockEffect ? [blockEffect] : []),
    ],
  );
  currentTarget = consumedTarget.unit;
  const consumedTargetEffectInstanceIds =
    consumedTarget.consumedEffectInstanceIds;

  const hpBefore = currentTarget.hp;
  const rawHp =
    BigInt(hpBefore)
    + BigInt(scaledRecovery)
    - BigInt(totalSlipDamage);
  const minimumHp = 1n;
  const maximumHp = BigInt(currentTarget.maxHp);
  const hpAfter = toSafeNumber(
    rawHp < minimumHp
      ? minimumHp
      : rawHp > maximumHp ? maximumHp : rawHp,
    "HP after turn-end settlement",
  );
  const hpChange = hpAfter - hpBefore;
  const finalTarget =
    hpAfter === hpBefore
      ? currentTarget
      : { ...currentTarget, hp: hpAfter, alive: true };
  if (currentSources.has(finalTarget.instanceId)) {
    currentSources.set(finalTarget.instanceId, finalTarget);
  }

  return {
    target: finalTarget,
    sourceUnits: [...currentSources.values()],
    outcome:
      hpChange > 0
        ? "healed"
        : hpChange < 0 ? "damaged" : "unchanged",
    totalBaseRecovery,
    scaledRecovery,
    totalSlipDamage,
    slipDamageCategories,
    hpBefore,
    hpAfter,
    hpChange,
    receivedModifierPermille,
    sourceModifiers,
    blockedByEffectInstanceId: blockEffect?.instanceId,
    consumedSourceEffectInstanceIds,
    consumedTargetEffectInstanceIds,
    slipPreventedDefeat:
      totalSlipDamage > 0 && rawHp < minimumHp,
  };
}
