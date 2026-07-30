import { describe, expect, it } from "vitest";
import {
  drawCommandCards,
  rebuildCommandCardDeck,
} from "../src/core/cards/deck";
import {
  createBattleState,
  setBattleFormation,
} from "../src/core/battle/state";
import { BattleRng } from "../src/core/rng";
import { unit } from "./helpers/battle";

// Reference checked 2026-07-30:
// https://w.atwiki.jp/f_go/pages/4673.html
// Canonical behavior: docs/specs/BATTLE_SYSTEM.md and docs/PROJECT_RULES.md.

function battle() {
  return createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally", {
          dataId: "duplicate-servant",
          commandCards: [
            "buster",
            "buster",
            "arts",
            "arts",
            "quick",
          ],
        }),
        unit("ally-b", "ally", {
          dataId: "duplicate-servant",
          commandCards: [
            "buster",
            "arts",
            "arts",
            "quick",
            "quick",
          ],
        }),
        unit("ally-c", "ally", {
          commandCards: [
            "buster",
            "buster",
            "buster",
            "arts",
            "quick",
          ],
        }),
      ],
      reserve: [unit("ally-d", "ally")],
    },
    waves: [
      {
        enemy: {
          frontline: [unit("enemy-a", "enemy"), null, null],
          reserve: [],
        },
      },
    ],
    enemyFrontlineLimit: 3,
  });
}

function ids(cards: readonly { cardId: string }[]): string[] {
  return cards.map(({ cardId }) => cardId);
}

describe("command card deck construction", () => {
  it("builds five distinct card instances per living frontline ally", () => {
    const deck = battle().commandDeck;

    expect(deck.sourceCards).toHaveLength(15);
    expect(new Set(ids(deck.sourceCards))).toHaveLength(15);
    expect(
      deck.sourceCards.map(({ ownerInstanceId }) => ownerInstanceId),
    ).toEqual([
      ...Array(5).fill("ally-a"),
      ...Array(5).fill("ally-b"),
      ...Array(5).fill("ally-c"),
    ]);
    expect(deck).toMatchObject({
      cycle: 1,
      drawsInCycle: 0,
      currentHand: [],
      lastRebuildReason: "initial",
    });
  });

  it("keeps duplicate servant data separate by battle instance ID", () => {
    const cards = battle().commandDeck.sourceCards;
    expect(
      cards.filter(({ ownerInstanceId }) => ownerInstanceId === "ally-a"),
    ).toHaveLength(5);
    expect(
      cards.filter(({ ownerInstanceId }) => ownerInstanceId === "ally-b"),
    ).toHaveLength(5);
    expect(new Set(ids(cards))).toHaveLength(15);
  });

  it("builds ten or five cards for two or one living frontliners", () => {
    const state = battle();
    const [allyA, allyB] = state.formation.ally.frontline;
    if (!allyA || !allyB) throw new Error("missing test allies");

    const two = rebuildCommandCardDeck(
      state.commandDeck,
      {
        frontline: [allyA, allyB, null],
        reserve: [],
      },
      "forced",
    );
    const one = rebuildCommandCardDeck(
      two,
      {
        frontline: [allyA, null, null],
        reserve: [],
      },
      "forced",
    );

    expect(two.sourceCards).toHaveLength(10);
    expect(one.sourceCards).toHaveLength(5);
  });

  it("allows an empty next deck while ally annihilation awaits turn-end judgment", () => {
    const state = battle();
    const rebuilt = rebuildCommandCardDeck(
      state.commandDeck,
      {
        frontline: [null, null, null],
        reserve: [],
      },
      "ally_departure",
    );

    expect(rebuilt.sourceCards).toEqual([]);
    expect(rebuilt.remainingCards).toEqual([]);
    expect(rebuilt.lastRebuildReason).toBe("ally_departure");
  });

  it("rejects an ally without exactly five intrinsic cards", () => {
    expect(() =>
      createBattleState({
        ally: {
          frontline: [
            unit("ally-a", "ally", {
              commandCards: ["buster", "arts", "quick", "quick"],
            }),
            unit("ally-b", "ally"),
            unit("ally-c", "ally"),
          ],
          reserve: [],
        },
        waves: [
          {
            enemy: {
              frontline: [unit("enemy-a", "enemy"), null, null],
              reserve: [],
            },
          },
        ],
        enemyFrontlineLimit: 3,
      }),
    ).toThrow(/exactly 5 command cards/);
  });
});

describe("command card distribution", () => {
  it("draws five without replacement and exhausts fifteen cards in three turns", () => {
    const state = battle();
    const rng = new BattleRng("three-turn-deck").stream("cards");
    let deck = state.commandDeck;
    const allDrawn: string[] = [];

    for (let turn = 1; turn <= 3; turn += 1) {
      const result = drawCommandCards(
        deck,
        state.formation.ally,
        rng,
      );
      deck = result.deck;
      allDrawn.push(...ids(result.hand));
      expect(result.hand).toHaveLength(5);
      expect(new Set(ids(result.hand))).toHaveLength(5);
      expect(result.rebuiltBeforeDraw).toBe(false);
      expect(result.exhaustedAfterDraw).toBe(turn === 3);
    }

    expect(new Set(allDrawn)).toHaveLength(15);
    expect(deck.remainingCards).toEqual([]);
    expect(deck.drawsInCycle).toBe(3);
  });

  it("rebuilds an exhausted deck from the current frontline before the next draw", () => {
    const state = battle();
    const rng = new BattleRng("exhaustion-rebuild").stream("cards");
    let deck = state.commandDeck;
    for (let index = 0; index < 3; index += 1) {
      deck = drawCommandCards(
        deck,
        state.formation.ally,
        rng,
      ).deck;
    }

    const result = drawCommandCards(
      deck,
      state.formation.ally,
      rng,
    );
    expect(result).toMatchObject({
      rebuiltBeforeDraw: true,
      exhaustedAfterDraw: false,
      deck: {
        cycle: 2,
        drawsInCycle: 1,
        lastRebuildReason: "exhausted",
      },
    });
    expect(result.deck.remainingCards).toHaveLength(10);
  });

  it("replays the same hands from the same fixed seed", () => {
    const state = battle();
    const first = drawCommandCards(
      state.commandDeck,
      state.formation.ally,
      new BattleRng("fixed-card-seed").stream("cards"),
    );
    const second = drawCommandCards(
      state.commandDeck,
      state.formation.ally,
      new BattleRng("fixed-card-seed").stream("cards"),
    );

    expect(ids(first.hand)).toEqual(ids(second.hand));
  });

  it("preserves the current hand while rebuilding the following cycle after departure", () => {
    const state = battle();
    const drawn = drawCommandCards(
      state.commandDeck,
      state.formation.ally,
      new BattleRng("departure-hand").stream("cards"),
    ).deck;
    const [allyA, , allyC] = state.formation.ally.frontline;
    const allyD = state.formation.ally.reserve[0];
    if (!allyA || !allyC || !allyD) {
      throw new Error("missing test allies");
    }
    const rebuilt = rebuildCommandCardDeck(
      drawn,
      {
        frontline: [allyA, allyD, allyC],
        reserve: [],
      },
      "ally_departure",
    );

    expect(ids(rebuilt.currentHand)).toEqual(ids(drawn.currentHand));
    expect(new Set(
      rebuilt.sourceCards.map(({ ownerInstanceId }) => ownerInstanceId),
    )).toEqual(new Set(["ally-a", "ally-c", "ally-d"]));
    expect(rebuilt).toMatchObject({
      cycle: 2,
      drawsInCycle: 0,
      lastRebuildReason: "ally_departure",
    });
  });

  it("does not rebuild merely because frontline order changes", () => {
    const state = battle();
    const [allyA, allyB, allyC] = state.formation.ally.frontline;
    const reordered = setBattleFormation(state, {
      ...state.formation,
      ally: {
        ...state.formation.ally,
        frontline: [allyC, allyB, allyA],
      },
    });

    expect(reordered.commandDeck).toBe(state.commandDeck);
    expect(reordered.commandDeck.cycle).toBe(1);
  });
});
