import { describe, expect, it } from "vitest";
import {
  createBattleAttackDataRegistry,
} from "../src/core/battle/actionData";
import {
  findUnitLocation,
} from "../src/core/battle/formation";
import {
  createBattleState,
  type BattleState,
} from "../src/core/battle/state";
import type {
  NoblePhantasmState,
} from "../src/core/battle/types";
import { BattleRng } from "../src/core/rng";
import {
  resolveAllyCommandAttacks,
  type AllyCommandAttackDetail,
} from "../src/core/cards/commandAttack";
import {
  listCommandCardChoices,
  selectCommandCards,
  type CommandCardSelection,
} from "../src/core/cards/selection";
import { combatantData } from "./helpers/attackData";
import { unit } from "./helpers/battle";

function noblePhantasm(
  cardType: NoblePhantasmState["cardType"] = "arts",
): NoblePhantasmState {
  return {
    stableId: "np-a",
    name: "NP A",
    cardType,
    level: 2,
  };
}

function battle(): BattleState {
  return createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally", {
          dataId: "same-servant",
          np: 20_000,
          noblePhantasm: noblePhantasm(),
          commandCards: [
            "buster",
            "buster",
            "buster",
            "arts",
            "quick",
          ],
        }),
        unit("ally-b", "ally", {
          dataId: "same-servant",
        }),
        unit("ally-c", "ally"),
      ],
      reserve: [],
    },
    waves: [
      {
        enemy: {
          frontline: [
            unit("enemy-a", "enemy", {
              hp: 1_000_000,
              maxHp: 1_000_000,
              baseMaxHp: 1_000_000,
            }),
            unit("enemy-b", "enemy", {
              hp: 1_000_000,
              maxHp: 1_000_000,
              baseMaxHp: 1_000_000,
            }),
            null,
          ],
          reserve: [],
        },
      },
    ],
    enemyFrontlineLimit: 3,
  });
}

function withHand(
  state: BattleState,
  requested: readonly [string, number][],
): BattleState {
  const selected = requested.map(([ownerInstanceId, cardIndex]) => {
    const card = state.commandDeck.sourceCards.find(
      (candidate) =>
        candidate.ownerInstanceId === ownerInstanceId
        && candidate.cardIndex === cardIndex,
    );
    if (!card) throw new Error("missing requested card");
    return card;
  });
  const fillers = state.commandDeck.sourceCards
    .filter(
      (candidate) =>
        !selected.some(
          ({ cardId }) => cardId === candidate.cardId,
        ),
    )
    .slice(0, 5 - selected.length);
  return {
    ...state,
    commandDeck: {
      ...state.commandDeck,
      currentHand: [...selected, ...fillers],
    },
  };
}

function cardId(
  state: BattleState,
  ownerInstanceId: string,
  cardIndex?: number,
): string {
  const choice = listCommandCardChoices(state).find(({ card }) =>
    card.ownerInstanceId === ownerInstanceId
    && (
      cardIndex === undefined
        ? card.kind === "noble_phantasm"
        : card.kind === "normal"
          && card.cardIndex === cardIndex
    )
  );
  if (!choice) throw new Error("missing card choice");
  return choice.card.cardId;
}

function selection(
  state: BattleState,
  cardIds: readonly string[],
): CommandCardSelection {
  const selected = selectCommandCards(state, cardIds);
  if (!selected.accepted) {
    throw new Error(`selection rejected: ${selected.reason}`);
  }
  return selected.selection;
}

function registry() {
  return createBattleAttackDataRegistry([
    combatantData("ally-a", "same-servant", {
      attack: 10_000,
      attackNpUnits: 100,
      starRatePermille: 1_000,
      commandCardHitWeights: [
        [1],
        [1, 1],
        [1, 1, 1],
        [1],
        [1],
      ],
      extraAttackHitWeights: [1, 1, 1, 1],
      noblePhantasms: [
        {
          stableId: "np-a",
          targetScope: "all",
          hitWeights: [1, 1],
          damageMultiplierPermilleByLevel: [
            3_000,
            4_000,
            4_500,
            4_750,
            5_000,
          ],
          specialAttackPermilleByOvercharge: [
            1_000,
            1_100,
            1_200,
            1_300,
            1_400,
          ],
        },
      ],
    }),
    combatantData("ally-b", "same-servant", {
      attack: 20_000,
    }),
  ]);
}

function streams(seed: string) {
  const rng = new BattleRng(seed);
  return {
    rng,
    streams: {
      effects: rng.stream("effects"),
      damage: rng.stream("damage"),
      stars: rng.stream("stars"),
    },
  };
}

describe("ally command data-to-attack integration", () => {
  it("uses card-specific Hits, critical input, and Extra data through one full Brave chain", () => {
    const state = withHand(battle(), [
      ["ally-a", 0],
      ["ally-a", 1],
      ["ally-a", 2],
    ]);
    const selected = selection(state, [
      cardId(state, "ally-a", 0),
      cardId(state, "ally-a", 1),
      cardId(state, "ally-a", 2),
    ]);
    const firstCardId = selected.cards[0].cardId;
    const random = streams("command-attack-brave");
    const resolved = resolveAllyCommandAttacks({
      state,
      selection: selected,
      registry: registry(),
      rng: random.streams,
      criticalCardIds: [firstCardId],
    });

    expect(resolved.sequence.accepted).toBe(true);
    if (!resolved.sequence.accepted) return;
    const actions = resolved.sequence.result.actions;
    expect(actions).toHaveLength(4);
    const details = actions.map(
      ({ resolverDetail }) =>
        resolverDetail as AllyCommandAttackDetail,
    );
    expect(details.every(({ outcome }) => outcome === "resolved"))
      .toBe(true);
    expect(
      details.map((detail) =>
        detail.outcome === "resolved"
          ? detail.resolution.attack?.attack.hits.length
          : 0
      ),
    ).toEqual([1, 2, 3, 4]);
    expect(
      details[0]?.outcome === "resolved"
        ? details[0].calculation.isCritical
        : null,
    ).toBe(true);
    expect(
      details[3]?.outcome === "resolved"
        ? details[3].calculation.extraCardModifierPermille
        : null,
    ).toBe(3_500);
    expect(resolved.sequence.result.state.phase).toBe(
      "ally_turn_end",
    );
  });

  it("uses NP level and OC for an all-target NP, then refunds NP from every target", () => {
    const state = withHand(battle(), [
      ["ally-b", 0],
      ["ally-c", 0],
    ]);
    const npCardId = cardId(state, "ally-a");
    const selected = selection(state, [
      npCardId,
      cardId(state, "ally-b", 0),
      cardId(state, "ally-c", 0),
    ]);
    const random = streams("command-attack-np");
    const resolved = resolveAllyCommandAttacks({
      state,
      selection: selected,
      registry: registry(),
      rng: random.streams,
      additionalOverchargeStagesByCardId: {
        [npCardId]: 1,
      },
    });

    expect(resolved.sequence.accepted).toBe(true);
    if (!resolved.sequence.accepted) return;
    const detail = resolved.sequence.result.actions[0]
      ?.resolverDetail as AllyCommandAttackDetail;
    expect(detail).toMatchObject({
      outcome: "resolved",
      targetScope: "all",
      targetInstanceIds: ["enemy-a", "enemy-b"],
      overchargeStage: 3,
      calculation: {
        npDamageMultiplierPermille: 4_000,
        npSpecialAttackPermille: 1_200,
      },
    });
    if (detail.outcome !== "resolved") return;
    expect(detail.resolution.attack?.attack.hits).toHaveLength(4);
    expect(
      findUnitLocation(
        resolved.sequence.result.state.formation,
        "ally-a",
      )?.unit.np,
    ).toBeGreaterThan(0);
  });

  it("logs missing command data as safe no-ops without attack RNG", () => {
    const state = withHand(battle(), [
      ["ally-a", 0],
      ["ally-b", 0],
      ["ally-c", 0],
    ]);
    const selected = selection(state, [
      cardId(state, "ally-a", 0),
      cardId(state, "ally-b", 0),
      cardId(state, "ally-c", 0),
    ]);
    const random = streams("missing-command-data");
    const resolved = resolveAllyCommandAttacks({
      state,
      selection: selected,
      registry: createBattleAttackDataRegistry([]),
      rng: random.streams,
    });

    expect(resolved.sequence.accepted).toBe(true);
    if (!resolved.sequence.accepted) return;
    expect(
      resolved.sequence.result.actions.map(
        ({ resolverDetail }) => resolverDetail,
      ),
    ).toEqual([
      {
        outcome: "skipped",
        reason: "source_attack_data_missing",
      },
      {
        outcome: "skipped",
        reason: "source_attack_data_missing",
      },
      {
        outcome: "skipped",
        reason: "source_attack_data_missing",
      },
    ]);
    expect(
      Object.values(random.rng.snapshot().streams).every(
        ({ drawCount }) => drawCount === 0,
      ),
    ).toBe(true);
  });
});
