import {
  combatantAttackData,
  type BattleAttackDataRegistry,
} from "../battle/actionData";
import { findUnitLocation } from "../battle/formation";
import type { BattleState } from "../battle/state";
import type { CommandCardType } from "../battle/types";
import { assertSafeInteger, clampInteger } from "../numeric";
import type { DeterministicRng } from "../rng";
import { COMMON_EFFECT_TYPES } from "../../effects/modifiers";
import type { AppliedEffect } from "../../effects/types";
import {
  distributeStarsToCards,
  type StarDistributionResult,
} from "../../formulas/stars";
import type { CommandCard } from "./deck";

export const CRITICAL_RATE_PER_STAR_PERMILLE = 100 as const;
export const CRITICAL_RATE_CAP_PERMILLE = 1_000 as const;

export type CommandStarDistributionSkipReason =
  | "hand_not_ready"
  | "owner_missing"
  | "owner_attack_data_missing";

export interface CommandCardStarAllocation {
  cardId: string;
  ownerInstanceId: string;
  cardIndex: number;
  cardType: CommandCardType;
  baseWeight: number;
  starFocusModPermille: number;
  randomBonus: number;
  effectiveWeight: number;
  stars: number;
  criticalRatePermille: number;
}

export type CommandStarDistribution =
  | {
      outcome: "resolved";
      commandStars: number;
      distributed: number;
      unassigned: number;
      cards: CommandCardStarAllocation[];
      formula: StarDistributionResult;
    }
  | {
      outcome: "skipped";
      reason: CommandStarDistributionSkipReason;
      cardId?: string;
      ownerInstanceId?: string;
      commandStars: number;
      distributed: 0;
      unassigned: number;
      cards: [];
    };

export interface CommandCardCriticalResult {
  cardId: string;
  assignedStars: number;
  starCriticalRatePermille: number;
  firstCardBonusPermille: number;
  ratePermille: number;
  rolled: boolean;
  isCritical: boolean;
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

function numberFlag(
  effect: AppliedEffect,
  name: string,
): number | undefined {
  const value = effect.flags[name];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new RangeError(
      `${name} on ${effect.instanceId} must be a safe integer`,
    );
  }
  return value;
}

function matchesCommandCard(
  effect: AppliedEffect,
  card: CommandCard,
): boolean {
  const cardType = stringFlag(effect, "cardType");
  if (cardType !== undefined && cardType !== card.type) return false;
  const cardId = stringFlag(effect, "cardId");
  if (cardId !== undefined && cardId !== card.cardId) return false;
  const cardIndex = numberFlag(effect, "cardIndex");
  return cardIndex === undefined || cardIndex === card.cardIndex;
}

function starFocusModifier(
  effects: readonly AppliedEffect[],
  card: CommandCard,
): number {
  const total = effects
    .filter(
      (effect) =>
        effect.effectType === COMMON_EFFECT_TYPES.starFocus
        && matchesCommandCard(effect, card),
    )
    .reduce((sum, effect) => sum + effect.value, 0);
  assertSafeInteger(total, `${card.cardId} star-focus modifier`);
  return total;
}

/**
 * Distributes at most the first 50 currently held stars across the five
 * normal command cards. The total inventory remains untouched, including
 * stars 51 through 99 that may still be consumed by skills.
 */
export function resolveCommandStarDistribution(
  state: BattleState,
  registry: BattleAttackDataRegistry,
  rng: DeterministicRng,
): CommandStarDistribution {
  const hand = state.commandDeck.currentHand;
  if (hand.length !== 5) {
    return {
      outcome: "skipped",
      reason: "hand_not_ready",
      commandStars: state.commandStars,
      distributed: 0,
      unassigned: state.commandStars,
      cards: [],
    };
  }

  const weightedCards: Array<{
    card: CommandCard;
    baseWeight: number;
    starFocusModPermille: number;
  }> = [];
  for (const card of hand) {
    const owner = findUnitLocation(
      state.formation,
      card.ownerInstanceId,
    )?.unit;
    if (!owner || owner.side !== "ally") {
      return {
        outcome: "skipped",
        reason: "owner_missing",
        cardId: card.cardId,
        ownerInstanceId: card.ownerInstanceId,
        commandStars: state.commandStars,
        distributed: 0,
        unassigned: state.commandStars,
        cards: [],
      };
    }
    const data = combatantAttackData(registry, owner);
    if (!data) {
      return {
        outcome: "skipped",
        reason: "owner_attack_data_missing",
        cardId: card.cardId,
        ownerInstanceId: card.ownerInstanceId,
        commandStars: state.commandStars,
        distributed: 0,
        unassigned: state.commandStars,
        cards: [],
      };
    }
    weightedCards.push({
      card,
      baseWeight: data.starWeight,
      starFocusModPermille: starFocusModifier(owner.effects, card),
    });
  }

  const formula = distributeStarsToCards(
    state.commandStars,
    weightedCards.map(({ card, baseWeight, starFocusModPermille }) => ({
      id: card.cardId,
      baseWeight,
      starFocusModPermille,
    })),
    rng,
  );
  return {
    outcome: "resolved",
    commandStars: state.commandStars,
    distributed: formula.distributed,
    unassigned: formula.unassigned,
    cards: weightedCards.map(
      ({ card, baseWeight, starFocusModPermille }, index) => {
        const stars = formula.starsByCard[index] ?? 0;
        return {
          cardId: card.cardId,
          ownerInstanceId: card.ownerInstanceId,
          cardIndex: card.cardIndex,
          cardType: card.type,
          baseWeight,
          starFocusModPermille,
          randomBonus: formula.randomBonuses[index] ?? 0,
          effectiveWeight: formula.effectiveWeights[index] ?? 0,
          stars,
          criticalRatePermille:
            stars * CRITICAL_RATE_PER_STAR_PERMILLE,
        };
      },
    ),
    formula,
  };
}

/**
 * Rolls one ready, data-backed normal card. NP and Extra cards never call
 * this function. Rates fixed at 0% or 100% do not consume critical RNG.
 */
export function resolveCommandCardCritical(
  cardId: string,
  firstCardBonusPermille: number,
  distribution: CommandStarDistribution,
  rng: DeterministicRng,
): CommandCardCriticalResult {
  assertSafeInteger(
    firstCardBonusPermille,
    "first-card critical bonus",
  );
  const allocation =
    distribution.outcome === "resolved"
      ? distribution.cards.find((card) => card.cardId === cardId)
      : undefined;
  if (distribution.outcome === "resolved" && !allocation) {
    throw new RangeError(
      `normal command card is absent from star distribution: ${cardId}`,
    );
  }
  const assignedStars = allocation?.stars ?? 0;
  const starCriticalRatePermille =
    assignedStars * CRITICAL_RATE_PER_STAR_PERMILLE;
  const ratePermille = clampInteger(
    starCriticalRatePermille + firstCardBonusPermille,
    0,
    CRITICAL_RATE_CAP_PERMILLE,
  );
  const isCritical = rng.chance(ratePermille);
  return {
    cardId,
    assignedStars,
    starCriticalRatePermille,
    firstCardBonusPermille,
    ratePermille,
    rolled: ratePermille > 0 && ratePermille < 1_000,
    isCritical,
  };
}
