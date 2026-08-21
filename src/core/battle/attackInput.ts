import type {
  PreparedBattleAttackInput,
} from "./attackSequence";
import {
  affinityPermille,
  combatantAttackData,
  type BattleAttackDataRegistry,
  type CombatantAttackData,
} from "./actionData";
import {
  countedSourceAttackModifierEffectInstanceIds,
  defensiveClassAffinityOverridePermille,
  resolveAttackModifierTotals,
  type AttackModifierCardType,
} from "./attackModifiers";
import { findUnitLocation } from "./formation";
import type { BattleState } from "./state";
import { hasAllBattleTraits } from "../../effects/traits";

export interface AttackCalculationData {
  cardType: AttackModifierCardType;
  isNoblePhantasm: boolean;
  isCritical: boolean;
  cardDamageValuePermille: number;
  cardNpValuePermille: number;
  cardStarValuePermille: number;
  firstCardDamageBonusPermille: number;
  firstCardNpBonusPermille: number;
  firstCardStarBonusPermille: number;
  busterChainModPermille: number;
  extraCardModifierPermille: number;
  hitWeights: readonly number[];
  npDamageMultiplierPermille?: number;
  npSpecialAttackPermille?: number;
  /** Every listed trait must be effective on each target individually. */
  npSpecialAttackRequiredTargetTraits?: readonly string[];
}

export interface PreparedAttackInputResult {
  sourceData: CombatantAttackData;
  targetDataInstanceIds: Array<string | null>;
  input: PreparedBattleAttackInput;
}

const CRITICAL_NP_MODIFIER_PERMILLE = 2_000;
const CRITICAL_STAR_BONUS_PERMILLE = 200;

function assertActionData(action: AttackCalculationData): void {
  for (const [name, value] of [
    ["cardDamageValuePermille", action.cardDamageValuePermille],
    ["cardNpValuePermille", action.cardNpValuePermille],
    ["cardStarValuePermille", action.cardStarValuePermille],
    ["firstCardDamageBonusPermille", action.firstCardDamageBonusPermille],
    ["firstCardNpBonusPermille", action.firstCardNpBonusPermille],
    ["firstCardStarBonusPermille", action.firstCardStarBonusPermille],
    ["busterChainModPermille", action.busterChainModPermille],
    ["extraCardModifierPermille", action.extraCardModifierPermille],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(
        `${name} must be a non-negative safe integer`,
      );
    }
  }
  if (
    action.npSpecialAttackRequiredTargetTraits
    && action.npSpecialAttackPermille === undefined
  ) {
    throw new RangeError(
      "npSpecialAttackRequiredTargetTraits requires npSpecialAttackPermille",
    );
  }
  const traits = action.npSpecialAttackRequiredTargetTraits ?? [];
  const seenTraits = new Set<string>();
  traits.forEach((traitId, index) => {
    if (traitId.trim().length === 0) {
      throw new RangeError(
        `npSpecialAttackRequiredTargetTraits[${index}] must not be empty`,
      );
    }
    if (seenTraits.has(traitId)) {
      throw new RangeError(
        `npSpecialAttackRequiredTargetTraits contains duplicate value: ${traitId}`,
      );
    }
    seenTraits.add(traitId);
  });
}

/**
 * Converts one already-selected action and the current post-before-attack
 * state into the existing damage/NP/star resolver input. Missing target data
 * is neutral for affinity, DTDR, DSR, and received NP; missing source data is
 * a configuration error that callers should turn into a logged no-op before
 * beginning the trigger sequence.
 */
export function prepareBattleAttackInput(
  state: BattleState,
  registry: BattleAttackDataRegistry,
  sourceInstanceId: string,
  targetInstanceIds: readonly string[],
  action: AttackCalculationData,
  allowDefeatedTargets = false,
): PreparedAttackInputResult {
  assertActionData(action);
  const sourceLocation = findUnitLocation(
    state.formation,
    sourceInstanceId,
  );
  if (!sourceLocation || !sourceLocation.unit.alive) {
    throw new RangeError(
      `attack-input source is unavailable: ${sourceInstanceId}`,
    );
  }
  const source = sourceLocation.unit;
  const sourceData = combatantAttackData(registry, source);
  if (!sourceData) {
    throw new RangeError(
      `attack-input source data is missing: ${sourceInstanceId}`,
    );
  }

  const targetDataInstanceIds: Array<string | null> = [];
  const sourceModifierEffectInstanceIds = new Set<string>();
  const targets = targetInstanceIds.map((targetInstanceId) => {
    const targetLocation = findUnitLocation(
      state.formation,
      targetInstanceId,
    );
    if (
      !targetLocation
      || (!allowDefeatedTargets && !targetLocation.unit.alive)
    ) {
      throw new RangeError(
        `attack-input target is unavailable: ${targetInstanceId}`,
      );
    }
    const target = targetLocation.unit;
    const targetData = combatantAttackData(registry, target);
    targetDataInstanceIds.push(
      targetData?.instanceId ?? null,
    );
    const modifiers = resolveAttackModifierTotals({
      cardType: action.cardType,
      isNoblePhantasm: action.isNoblePhantasm,
      isCritical: action.isCritical,
      source,
      target,
    });
    countedSourceAttackModifierEffectInstanceIds({
      cardType: action.cardType,
      isNoblePhantasm: action.isNoblePhantasm,
      isCritical: action.isCritical,
      source,
      target,
    }).forEach((instanceId) =>
      sourceModifierEffectInstanceIds.add(instanceId)
    );
    const sourceModifiers = modifiers.source;
    const targetModifiers = modifiers.target;
    const specialAttackMatches = hasAllBattleTraits(
      target,
      action.npSpecialAttackRequiredTargetTraits ?? [],
    );
    return {
      targetInstanceId,
      damage: {
        attack: sourceData.attack,
        isCritical: action.isCritical,
        isNoblePhantasm: action.isNoblePhantasm,
        npDamageMultiplierPermille:
          action.npDamageMultiplierPermille,
        cardDamageValuePermille:
          action.cardDamageValuePermille,
        cardPerformanceModPermille:
          sourceModifiers.cardPerformanceModPermille,
        cardResistancePermille:
          targetModifiers.cardResistancePermille,
        firstCardBonusPermille:
          action.firstCardDamageBonusPermille,
        classAttackCoefficientPermille:
          sourceData.classAttackCoefficientPermille,
        classAffinityPermille:
          defensiveClassAffinityOverridePermille(target)
          ?? affinityPermille(
            registry.affinities.class,
            sourceData.classKey,
            targetData?.classKey ?? "neutral",
          ),
        attributeAffinityPermille: affinityPermille(
          registry.affinities.attribute,
          sourceData.attributeKey,
          targetData?.attributeKey ?? "neutral",
        ),
        attackModPermille:
          sourceModifiers.attackModPermille,
        criticalDamageModPermille:
          sourceModifiers.criticalDamageModPermille,
        extraCardModifierPermille:
          action.extraCardModifierPermille,
        powerModPermille:
          sourceModifiers.powerModPermille,
        targetDamageModPermille:
          targetModifiers.targetDamageModPermille,
        npDamageModPermille:
          sourceModifiers.npDamageModPermille,
        npSpecialAttackPermille:
          specialAttackMatches
            ? action.npSpecialAttackPermille
            : undefined,
        fixedDamage: sourceModifiers.fixedDamage,
        busterChainModPermille:
          action.busterChainModPermille,
      },
      ...(source.side === "ally"
        && source.noblePhantasm
        && sourceData.attackNpUnits > 0
        ? {
            attackNp: {
              baseNpUnits: sourceData.attackNpUnits,
              cardNpValuePermille:
                action.cardNpValuePermille,
              cardPerformanceModPermille:
                sourceModifiers.cardPerformanceModPermille,
              cardResistancePermille:
                targetModifiers.cardResistancePermille,
              firstCardBonusPermille:
                action.firstCardNpBonusPermille,
              targetNpRatePermille:
                targetData?.targetNpRatePermille ?? 1_000,
              npGainModPermille:
                sourceModifiers.npGainModPermille,
              criticalModifierPermille:
                action.isCritical
                  ? CRITICAL_NP_MODIFIER_PERMILLE
                  : 1_000,
            },
          }
        : {}),
      ...(target.side === "ally"
        && target.noblePhantasm
        && targetData
        && targetData.receivedNpUnits > 0
        ? {
            receivedNp: {
              baseDefenseNpUnits:
                targetData.receivedNpUnits,
              attackerNpRatePermille:
                sourceData.attackNpRatePermille,
              npGainModPermille:
                targetModifiers.npGainModPermille,
              receivedNpGainModPermille:
                targetModifiers.receivedNpGainModPermille,
            },
            receivedNpLevel:
              target.noblePhantasm.level,
          }
        : {}),
      ...(source.side === "ally"
        ? {
            stars: {
              servantStarRatePermille:
                sourceData.starRatePermille,
              cardStarValuePermille:
                action.cardStarValuePermille,
              cardPerformanceModPermille:
                sourceModifiers.cardPerformanceModPermille,
              cardResistancePermille:
                targetModifiers.cardResistancePermille,
              firstCardBonusPermille:
                action.firstCardStarBonusPermille,
              enemyStarRatePermille:
                targetData?.targetStarRatePermille ?? 0,
              starGenerationModPermille:
                sourceModifiers.starGenerationModPermille,
              enemyStarGenerationModPermille:
                targetModifiers.targetStarGenerationModPermille,
              criticalBonusPermille:
                action.isCritical
                  ? CRITICAL_STAR_BONUS_PERMILLE
                  : 0,
            },
          }
        : {}),
    };
  });

  return {
    sourceData,
    targetDataInstanceIds,
    input: {
      targets,
      hitWeights: action.hitWeights,
      sourceModifierEffectInstanceIds: [
        ...sourceModifierEffectInstanceIds,
      ],
      defense: {
        cardType: action.cardType,
        isNoblePhantasm: action.isNoblePhantasm,
        isCritical: action.isCritical,
      },
      ...(source.noblePhantasm
        ? { sourceNpLevel: source.noblePhantasm.level }
        : {}),
    },
  };
}
