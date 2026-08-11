import type { DeterministicRng } from "../rng";
import type {
  BattleUnitState,
  CommandCardType,
  SideFormation,
} from "../battle/types";

export type CommandDeckRebuildReason =
  | "initial"
  | "exhausted"
  | "ally_departure"
  | "card_redistribution"
  | "forced";

export interface CommandCard {
  cardId: string;
  ownerInstanceId: string;
  cardIndex: number;
  type: CommandCardType;
}

export interface CommandCardDeckState {
  cycle: number;
  drawsInCycle: number;
  sourceCards: CommandCard[];
  remainingCards: CommandCard[];
  currentHand: CommandCard[];
  lastRebuildReason: CommandDeckRebuildReason;
}

export interface CommandCardDrawResult {
  deck: CommandCardDeckState;
  hand: CommandCard[];
  rebuiltBeforeDraw: boolean;
  exhaustedAfterDraw: boolean;
}

export interface CommandCardRedistributionResult {
  deck: CommandCardDeckState;
  hand: CommandCard[];
  cycleBefore: number;
  cycleAfter: number;
  drawsInCycleBefore: number;
  drawsInCycleAfter: number;
  previousHandCardIds: string[];
  sourceCardCount: number;
  remainingCardCount: number;
}

function livingFrontline(
  ally: SideFormation,
): BattleUnitState[] {
  return ally.frontline.filter(
    (unit): unit is BattleUnitState =>
      unit !== null && unit.alive,
  );
}

function cardId(ownerInstanceId: string, cardIndex: number): string {
  return `${ownerInstanceId}:command:${cardIndex + 1}`;
}

function buildSourceCards(ally: SideFormation): CommandCard[] {
  const frontline = livingFrontline(ally);
  if (frontline.length > 3) {
    throw new RangeError(
      "command deck supports at most 3 living frontline allies",
    );
  }
  return frontline.flatMap((unit) => {
    if (unit.commandCards.length !== 5) {
      throw new RangeError(
        `${unit.instanceId} must have exactly 5 command cards`,
      );
    }
    return unit.commandCards.map((type, cardIndex) => ({
      cardId: cardId(unit.instanceId, cardIndex),
      ownerInstanceId: unit.instanceId,
      cardIndex,
      type,
    }));
  });
}

function assertUniqueCardIds(
  cards: readonly CommandCard[],
  name: string,
): void {
  const ids = cards.map(({ cardId }) => cardId);
  if (new Set(ids).size !== ids.length) {
    throw new RangeError(`${name} contains duplicate command card IDs`);
  }
}

/** Validates the currently persisted deck before an atomic active redeal. */
export function assertCommandCardDeckCanBeRedistributed(
  deck: CommandCardDeckState,
  ally: SideFormation,
): void {
  if (!Number.isSafeInteger(deck.cycle) || deck.cycle < 1) {
    throw new RangeError("command deck cycle must be a positive safe integer");
  }
  if (!Number.isSafeInteger(deck.drawsInCycle) || deck.drawsInCycle < 0) {
    throw new RangeError("command deck drawsInCycle must be non-negative");
  }
  if (deck.currentHand.length !== 5) {
    throw new RangeError("command redistribution requires a five-card hand");
  }
  assertUniqueCardIds(deck.sourceCards, "command deck sourceCards");
  assertUniqueCardIds(deck.remainingCards, "command deck remainingCards");
  assertUniqueCardIds(deck.currentHand, "command deck currentHand");
  const sourceIds = new Set(deck.sourceCards.map(({ cardId }) => cardId));
  for (const card of [...deck.remainingCards, ...deck.currentHand]) {
    if (!sourceIds.has(card.cardId)) {
      throw new RangeError(
        `command deck card is absent from sourceCards: ${card.cardId}`,
      );
    }
  }
  const distributedIds = new Set(deck.currentHand.map(({ cardId }) => cardId));
  if (deck.remainingCards.some(({ cardId }) => distributedIds.has(cardId))) {
    throw new RangeError("command deck hand and remainingCards must be disjoint");
  }
  const nextSource = buildSourceCards(ally);
  if (nextSource.length < 5) {
    throw new RangeError(
      "command redistribution requires at least one living frontline ally",
    );
  }
  assertUniqueCardIds(nextSource, "command redistribution sourceCards");
}

export function createCommandCardDeck(
  ally: SideFormation,
): CommandCardDeckState {
  const sourceCards = buildSourceCards(ally);
  return {
    cycle: 1,
    drawsInCycle: 0,
    sourceCards,
    remainingCards: [...sourceCards],
    currentHand: [],
    lastRebuildReason: "initial",
  };
}

export function rebuildCommandCardDeck(
  deck: CommandCardDeckState,
  ally: SideFormation,
  reason: Exclude<CommandDeckRebuildReason, "initial">,
): CommandCardDeckState {
  const sourceCards = buildSourceCards(ally);
  return {
    cycle: deck.cycle + 1,
    drawsInCycle: 0,
    sourceCards,
    remainingCards: [...sourceCards],
    // A reset during action resolution affects the following distribution.
    currentHand: [...deck.currentHand],
    lastRebuildReason: reason,
  };
}

function drawFive(
  cards: readonly CommandCard[],
  rng: DeterministicRng,
): {
  hand: CommandCard[];
  remaining: CommandCard[];
} {
  if (cards.length < 5) {
    throw new RangeError("at least 5 cards are required for distribution");
  }
  const remaining = [...cards];
  const hand: CommandCard[] = [];
  while (hand.length < 5) {
    const index = rng.nextIntInclusive(0, remaining.length - 1);
    const [drawn] = remaining.splice(index, 1);
    if (!drawn) {
      throw new RangeError("command card draw produced no card");
    }
    hand.push(drawn);
  }
  return { hand, remaining };
}

/**
 * Resets the complete distribution cycle from the current living frontline
 * and immediately draws five normal command cards without replacement.
 */
export function redistributeCommandCards(
  deck: CommandCardDeckState,
  ally: SideFormation,
  rng: DeterministicRng,
): CommandCardRedistributionResult {
  assertCommandCardDeckCanBeRedistributed(deck, ally);
  const sourceCards = buildSourceCards(ally);
  const draw = drawFive(sourceCards, rng);
  const nextDeck: CommandCardDeckState = {
    cycle: deck.cycle + 1,
    drawsInCycle: 1,
    sourceCards,
    remainingCards: draw.remaining,
    currentHand: draw.hand,
    lastRebuildReason: "card_redistribution",
  };
  return {
    deck: nextDeck,
    hand: draw.hand,
    cycleBefore: deck.cycle,
    cycleAfter: nextDeck.cycle,
    drawsInCycleBefore: deck.drawsInCycle,
    drawsInCycleAfter: nextDeck.drawsInCycle,
    previousHandCardIds: deck.currentHand.map(({ cardId }) => cardId),
    sourceCardCount: sourceCards.length,
    remainingCardCount: draw.remaining.length,
  };
}

/**
 * Draws five cards without replacement. An exhausted cycle is rebuilt from
 * the current living frontline immediately before the next draw.
 */
export function drawCommandCards(
  deck: CommandCardDeckState,
  ally: SideFormation,
  rng: DeterministicRng,
): CommandCardDrawResult {
  const rebuiltBeforeDraw = deck.remainingCards.length === 0;
  const readyDeck = rebuiltBeforeDraw
    ? rebuildCommandCardDeck(deck, ally, "exhausted")
    : deck;
  const draw = drawFive(readyDeck.remainingCards, rng);
  const nextDeck: CommandCardDeckState = {
    ...readyDeck,
    drawsInCycle: readyDeck.drawsInCycle + 1,
    remainingCards: draw.remaining,
    currentHand: draw.hand,
  };
  return {
    deck: nextDeck,
    hand: draw.hand,
    rebuiltBeforeDraw,
    exhaustedAfterDraw: draw.remaining.length === 0,
  };
}
