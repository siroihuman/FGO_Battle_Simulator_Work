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
  if (frontline.length < 1 || frontline.length > 3) {
    throw new RangeError(
      "command deck requires from 1 to 3 living frontline allies",
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
