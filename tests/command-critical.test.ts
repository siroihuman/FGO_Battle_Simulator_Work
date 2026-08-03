import { describe, expect, it } from "vitest";
import {
  createBattleAttackDataRegistry,
} from "../src/core/battle/actionData";
import {
  findUnitLocation,
  replaceUnit,
} from "../src/core/battle/formation";
import {
  createBattleState,
  setBattleFormation,
  type BattleState,
} from "../src/core/battle/state";
import { BattleRng } from "../src/core/rng";
import {
  resolveCommandCardCritical,
  resolveCommandStarDistribution,
  type CommandStarDistribution,
} from "../src/core/cards/critical";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import {
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import { combatantData } from "./helpers/attackData";
import { unit } from "./helpers/battle";

// Canonical SW, random bonus, and weighted distribution procedure checked
// 2026-08-03: https://w.atwiki.jp/f_go/pages/304.html

function battle(commandStars = 0): BattleState {
  const state = createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally"),
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
  });
  const requested = [
    ["ally-a", 0],
    ["ally-a", 1],
    ["ally-b", 0],
    ["ally-c", 0],
    ["ally-c", 1],
  ] as const;
  const currentHand = requested.map(([ownerInstanceId, cardIndex]) => {
    const card = state.commandDeck.sourceCards.find(
      (candidate) =>
        candidate.ownerInstanceId === ownerInstanceId
        && candidate.cardIndex === cardIndex,
    );
    if (!card) throw new Error("missing requested command card");
    return card;
  });
  return {
    ...state,
    commandStars,
    commandDeck: {
      ...state.commandDeck,
      currentHand,
    },
  };
}

function registry() {
  return createBattleAttackDataRegistry([
    combatantData("ally-a", "ally-a", { starWeight: 100 }),
    combatantData("ally-b", "ally-b", { starWeight: 50 }),
    combatantData("ally-c", "ally-c", { starWeight: 200 }),
  ]);
}

describe("current command-star distribution", () => {
  it("uses battle-instance SW, card-limited focus, and keeps stars 51 through 99 unassigned", () => {
    let state = battle(75);
    const owner = findUnitLocation(state.formation, "ally-a")?.unit;
    if (!owner) throw new Error("missing ally-a");
    const applied = applyEffect(
      owner,
      {
        stableId: "first-buster-focus",
        name: "first-buster-focus",
        effectType: COMMON_EFFECT_TYPES.starFocus,
        category: "buff",
        value: 1_000,
        flags: {
          cardType: "buster",
          cardIndex: 0,
        },
      },
      owner.instanceId,
      createEffectRuntimeCounters(),
    );
    state = setBattleFormation(
      state,
      replaceUnit(state.formation, applied.unit),
    );
    const rng = new BattleRng("command-star-focus").stream(
      "critical",
    );
    const result = resolveCommandStarDistribution(
      state,
      registry(),
      rng,
    );

    expect(result.outcome).toBe("resolved");
    if (result.outcome !== "resolved") return;
    expect([...result.formula.randomBonuses].sort((a, b) => b - a))
      .toEqual([50, 20, 20, 0, 0]);
    expect(result.distributed).toBe(50);
    expect(result.unassigned).toBe(25);
    expect(result.cards.reduce((sum, card) => sum + card.stars, 0))
      .toBe(50);
    expect(result.cards.every(({ stars }) => stars <= 10)).toBe(true);
    expect(result.cards[0]).toMatchObject({
      baseWeight: 100,
      starFocusModPermille: 1_000,
      criticalRatePermille: 1_000,
    });
    expect(
      (result.cards[0]?.effectiveWeight ?? 0)
      - (result.cards[0]?.randomBonus ?? 0),
    ).toBe(200);
    expect(
      (result.cards[1]?.effectiveWeight ?? 0)
      - (result.cards[1]?.randomBonus ?? 0),
    ).toBe(100);
    expect(state.commandStars).toBe(75);
  });

  it("replays the same allocation from the same fixed seed", () => {
    const state = battle(23);
    const first = resolveCommandStarDistribution(
      state,
      registry(),
      new BattleRng("fixed-command-stars").stream("critical"),
    );
    const second = resolveCommandStarDistribution(
      state,
      registry(),
      new BattleRng("fixed-command-stars").stream("critical"),
    );
    expect(second).toEqual(first);
  });

  it("skips incomplete hand data without consuming critical RNG", () => {
    const state = battle(20);
    const rng = new BattleRng("missing-star-data").stream("critical");
    const result = resolveCommandStarDistribution(
      state,
      createBattleAttackDataRegistry([]),
      rng,
    );
    expect(result).toMatchObject({
      outcome: "skipped",
      reason: "owner_attack_data_missing",
      distributed: 0,
      unassigned: 20,
    });
    expect(rng.snapshot().drawCount).toBe(0);
  });
});

describe("normal command critical roll", () => {
  const unavailableDistribution: CommandStarDistribution = {
    outcome: "skipped",
    reason: "hand_not_ready",
    commandStars: 0,
    distributed: 0,
    unassigned: 0,
    cards: [],
  };

  it("does not draw at fixed 0% or 100%", () => {
    const rng = new BattleRng("fixed-critical-rates").stream("critical");
    const zero = resolveCommandCardCritical(
      "card-zero",
      0,
      unavailableDistribution,
      rng,
    );
    const fullDistribution = resolveCommandStarDistribution(
      battle(50),
      registry(),
      rng,
    );
    const beforeFull = rng.snapshot().drawCount;
    const full = resolveCommandCardCritical(
      "ally-a:command:1",
      0,
      fullDistribution,
      rng,
    );
    expect(zero).toMatchObject({
      ratePermille: 0,
      rolled: false,
      isCritical: false,
    });
    expect(full).toMatchObject({
      assignedStars: 10,
      ratePermille: 1_000,
      rolled: false,
      isCritical: true,
    });
    expect(rng.snapshot().drawCount).toBe(beforeFull);
  });

  it("uses the critical stream for a fractional first-card bonus", () => {
    const firstRng = new BattleRng("fractional-critical").stream(
      "critical",
    );
    const secondRng = new BattleRng("fractional-critical").stream(
      "critical",
    );
    const first = resolveCommandCardCritical(
      "card",
      200,
      unavailableDistribution,
      firstRng,
    );
    const second = resolveCommandCardCritical(
      "card",
      200,
      unavailableDistribution,
      secondRng,
    );
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      assignedStars: 0,
      ratePermille: 200,
      rolled: true,
    });
    expect(firstRng.snapshot().drawCount).toBe(1);
  });
});
