import type { BattleState } from "../battle/state";
import type { CommandCardType } from "../battle/types";
import {
  commandCardExecutionRestrictions,
  type CommandCardSelection,
  type SelectedCommandCard,
} from "./selection";

export const QUICK_CHAIN_STARS = 20 as const;
export const ARTS_CHAIN_NP_UNITS = 2_000 as const;
export const BUSTER_CHAIN_MOD_PERMILLE = 200 as const;
export const SAME_COLOR_BRAVE_EXTRA_MOD_PERMILLE = 3_500 as const;
export const OTHER_BRAVE_EXTRA_MOD_PERMILLE = 2_000 as const;
export const NOBLE_PHANTASM_MAX_OVERCHARGE_STAGE = 5 as const;

export type CommandCardPosition = 1 | 2 | 3;
export type NoblePhantasmOverchargeStage = 1 | 2 | 3 | 4 | 5;

export interface FirstCardBonus {
  /** Added directly to the damage card term. */
  readonly damagePermille: number;
  /** Added directly to the attack NP card term. */
  readonly npGainPermille: number;
  /** Added directly to the star-generation rate. */
  readonly starGenerationPermille: number;
  /** Added to normal-command-card critical rate. */
  readonly criticalRatePermille: number;
}

export interface CommandCardCalculationContext {
  readonly card: SelectedCommandCard;
  readonly position: CommandCardPosition;
  /**
   * NP cards always use first-position card values even when selected second
   * or third.
   */
  readonly calculationPosition: CommandCardPosition;
  readonly cardDamageValuePermille: number;
  readonly cardNpValuePermille: number;
  readonly cardStarValuePermille: number;
  /** NP cards never receive a first-card bonus. */
  readonly firstCardBonus: FirstCardBonus;
  /** Applies to normal Buster-chain cards only. */
  readonly busterChainModPermille: number;
  readonly extraCardModifierPermille: 1_000;
  /** Consecutive NP cards receive +1/+2 stages at selection time. */
  readonly overchargeChainBonusStages: number;
}

export interface ExtraAttackCalculationContext {
  readonly kind: "extra";
  readonly cardId: string;
  readonly ownerInstanceId: string;
  readonly position: 4;
  readonly cardDamageValuePermille: 1_000;
  readonly cardNpValuePermille: 1_000;
  readonly cardStarValuePermille: 1_000;
  readonly firstCardBonus: FirstCardBonus;
  readonly busterChainModPermille: 0;
  readonly extraCardModifierPermille:
    | typeof SAME_COLOR_BRAVE_EXTRA_MOD_PERMILLE
    | typeof OTHER_BRAVE_EXTRA_MOD_PERMILLE;
}

export interface CommandCardChainAnalysis {
  readonly chainError: boolean;
  readonly chainErrorOwnerInstanceIds: string[];
  readonly colorChain: CommandCardType | null;
  readonly mightyChain: boolean;
  readonly braveChain: boolean;
  readonly noblePhantasmChain: boolean;
  readonly firstCardType: CommandCardType;
  /** Bonus shared by normal selected cards. */
  readonly firstCardBonus: FirstCardBonus;
  readonly cards: [
    CommandCardCalculationContext,
    CommandCardCalculationContext,
    CommandCardCalculationContext,
  ];
  readonly extraAttack: ExtraAttackCalculationContext | null;
  readonly quickChainStars: number;
  readonly artsChainNpUnits: number;
  /** Unique owners in first-selected order. */
  readonly artsChainParticipantInstanceIds: string[];
}

interface CardPositionValues {
  readonly damagePermille: number;
  readonly npPermille: number;
  readonly starPermille: number;
}

const ZERO_FIRST_CARD_BONUS: FirstCardBonus = {
  damagePermille: 0,
  npGainPermille: 0,
  starGenerationPermille: 0,
  criticalRatePermille: 0,
};

const FIRST_CARD_BONUS_BY_TYPE: Readonly<
  Record<CommandCardType, FirstCardBonus>
> = {
  buster: {
    damagePermille: 500,
    npGainPermille: 0,
    starGenerationPermille: 0,
    criticalRatePermille: 0,
  },
  arts: {
    damagePermille: 0,
    npGainPermille: 1_000,
    starGenerationPermille: 0,
    criticalRatePermille: 0,
  },
  quick: {
    damagePermille: 0,
    npGainPermille: 0,
    starGenerationPermille: 200,
    criticalRatePermille: 200,
  },
};

const MIGHTY_FIRST_CARD_BONUS: FirstCardBonus = {
  damagePermille: 500,
  npGainPermille: 1_000,
  starGenerationPermille: 200,
  criticalRatePermille: 200,
};

const CARD_POSITION_VALUES: Readonly<
  Record<
    CommandCardType,
    readonly [
      CardPositionValues,
      CardPositionValues,
      CardPositionValues,
    ]
  >
> = {
  buster: [
    { damagePermille: 1_500, npPermille: 0, starPermille: 100 },
    { damagePermille: 1_800, npPermille: 0, starPermille: 150 },
    { damagePermille: 2_100, npPermille: 0, starPermille: 200 },
  ],
  arts: [
    { damagePermille: 1_000, npPermille: 3_000, starPermille: 0 },
    { damagePermille: 1_200, npPermille: 4_500, starPermille: 0 },
    { damagePermille: 1_400, npPermille: 6_000, starPermille: 0 },
  ],
  quick: [
    { damagePermille: 800, npPermille: 1_000, starPermille: 800 },
    { damagePermille: 960, npPermille: 1_500, starPermille: 1_300 },
    { damagePermille: 1_120, npPermille: 2_000, starPermille: 1_800 },
  ],
};

function uniqueInOrder(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function actionDisabledOwners(
  state: BattleState,
  cards: readonly SelectedCommandCard[],
): string[] {
  return uniqueInOrder(
    cards.flatMap((card) =>
      commandCardExecutionRestrictions(state, card).includes(
        "owner_action_disabled",
      )
        ? [card.ownerInstanceId]
        : [],
    ),
  );
}

function sameCardType(
  cards: CommandCardSelection["cards"],
): CommandCardType | null {
  const [first, second, third] = cards;
  return first.type === second.type && first.type === third.type
    ? first.type
    : null;
}

function isMighty(cards: CommandCardSelection["cards"]): boolean {
  return new Set(cards.map(({ type }) => type)).size === 3;
}

function isBrave(cards: CommandCardSelection["cards"]): boolean {
  const [first, second, third] = cards;
  return (
    first.ownerInstanceId === second.ownerInstanceId
    && first.ownerInstanceId === third.ownerInstanceId
  );
}

function noblePhantasmChainBonuses(
  cards: CommandCardSelection["cards"],
  chainError: boolean,
): [number, number, number] {
  if (chainError) return [0, 0, 0];
  const result: [number, number, number] = [0, 0, 0];
  let consecutiveNoblePhantasms = 0;
  cards.forEach((card, index) => {
    if (card.kind !== "noble_phantasm") {
      consecutiveNoblePhantasms = 0;
      return;
    }
    result[index] = consecutiveNoblePhantasms;
    consecutiveNoblePhantasms += 1;
  });
  return result;
}

function calculationContext(
  card: SelectedCommandCard,
  position: CommandCardPosition,
  firstCardBonus: FirstCardBonus,
  colorChain: CommandCardType | null,
  overchargeChainBonusStages: number,
): CommandCardCalculationContext {
  const calculationPosition =
    card.kind === "noble_phantasm" ? 1 : position;
  const values = CARD_POSITION_VALUES[card.type][calculationPosition - 1];
  const receivesFirstCardBonus =
    card.kind === "normal"
      ? firstCardBonus
      : ZERO_FIRST_CARD_BONUS;
  return {
    card,
    position,
    calculationPosition,
    cardDamageValuePermille: values.damagePermille,
    cardNpValuePermille: values.npPermille,
    cardStarValuePermille: values.starPermille,
    firstCardBonus: receivesFirstCardBonus,
    busterChainModPermille:
      card.kind === "normal" && colorChain === "buster"
        ? BUSTER_CHAIN_MOD_PERMILLE
        : 0,
    extraCardModifierPermille: 1_000,
    overchargeChainBonusStages:
      card.kind === "noble_phantasm"
        ? overchargeChainBonusStages
        : 0,
  };
}

/**
 * Resolves command-card chain facts at command-confirmation time.
 *
 * This function is intentionally deterministic and does not mutate battle
 * state or consume RNG. Callers should keep the returned selection-time facts
 * even if an earlier card later changes another card owner's actionability.
 */
export function analyzeCommandCardChain(
  state: BattleState,
  selection: CommandCardSelection,
): CommandCardChainAnalysis {
  if (selection.cards.length !== 3) {
    throw new RangeError("command-card chain analysis requires exactly 3 cards");
  }
  const disabledOwners = actionDisabledOwners(state, selection.cards);
  const chainError = disabledOwners.length > 0;
  const firstCardDisabled = commandCardExecutionRestrictions(
    state,
    selection.cards[0],
  ).includes("owner_action_disabled");
  const rawColorChain = sameCardType(selection.cards);
  const rawMightyChain = isMighty(selection.cards);
  const rawBraveChain = isBrave(selection.cards);
  const colorChain = chainError ? null : rawColorChain;
  const mightyChain = !chainError && rawMightyChain;
  const braveChain = !chainError && rawBraveChain;
  const firstCardBonus = firstCardDisabled
    ? ZERO_FIRST_CARD_BONUS
    : mightyChain
      ? MIGHTY_FIRST_CARD_BONUS
      : FIRST_CARD_BONUS_BY_TYPE[selection.cards[0].type];
  const npChainBonuses = noblePhantasmChainBonuses(
    selection.cards,
    chainError,
  );
  const cards: CommandCardChainAnalysis["cards"] = [
    calculationContext(
      selection.cards[0],
      1,
      firstCardBonus,
      colorChain,
      npChainBonuses[0],
    ),
    calculationContext(
      selection.cards[1],
      2,
      firstCardBonus,
      colorChain,
      npChainBonuses[1],
    ),
    calculationContext(
      selection.cards[2],
      3,
      firstCardBonus,
      colorChain,
      npChainBonuses[2],
    ),
  ];
  const extraFirstCardBonus: FirstCardBonus = {
    ...firstCardBonus,
    // Extra Attack cannot critically hit.
    criticalRatePermille: 0,
  };
  const extraAttack = braveChain
    ? {
        kind: "extra" as const,
        cardId: `${selection.cards[0].ownerInstanceId}:extra`,
        ownerInstanceId: selection.cards[0].ownerInstanceId,
        position: 4 as const,
        cardDamageValuePermille: 1_000 as const,
        cardNpValuePermille: 1_000 as const,
        cardStarValuePermille: 1_000 as const,
        firstCardBonus: extraFirstCardBonus,
        busterChainModPermille: 0 as const,
        extraCardModifierPermille:
          colorChain === null
            ? OTHER_BRAVE_EXTRA_MOD_PERMILLE
            : SAME_COLOR_BRAVE_EXTRA_MOD_PERMILLE,
      }
    : null;
  const noblePhantasmChain = npChainBonuses.some(
    (bonus) => bonus > 0,
  );
  return {
    chainError,
    chainErrorOwnerInstanceIds: disabledOwners,
    colorChain,
    mightyChain,
    braveChain,
    noblePhantasmChain,
    firstCardType: selection.cards[0].type,
    firstCardBonus,
    cards,
    extraAttack,
    quickChainStars:
      colorChain === "quick" ? QUICK_CHAIN_STARS : 0,
    artsChainNpUnits:
      colorChain === "arts" ? ARTS_CHAIN_NP_UNITS : 0,
    artsChainParticipantInstanceIds:
      colorChain === "arts"
        ? uniqueInOrder(
            selection.cards.map(({ ownerInstanceId }) => ownerInstanceId),
          )
        : [],
  };
}

/**
 * Converts the consumed NP gauge plus chain/effect bonuses to OC stage 1–5.
 */
export function resolveNoblePhantasmOverchargeStage(
  npBeforeUse: number,
  chainBonusStages: number,
  additionalStages = 0,
): NoblePhantasmOverchargeStage {
  if (!Number.isSafeInteger(npBeforeUse) || npBeforeUse < 10_000) {
    throw new RangeError(
      "npBeforeUse must be a safe integer at or above 100%",
    );
  }
  for (const [name, value] of [
    ["chainBonusStages", chainBonusStages],
    ["additionalStages", additionalStages],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative safe integer`);
    }
  }
  const gaugeStage = Math.min(3, Math.floor(npBeforeUse / 10_000));
  return Math.min(
    NOBLE_PHANTASM_MAX_OVERCHARGE_STAGE,
    gaugeStage
      + Math.min(NOBLE_PHANTASM_MAX_OVERCHARGE_STAGE, chainBonusStages)
      + Math.min(NOBLE_PHANTASM_MAX_OVERCHARGE_STAGE, additionalStages),
  ) as NoblePhantasmOverchargeStage;
}
