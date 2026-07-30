import { describe, expect, it } from "vitest";
import {
  findUnitLocation,
  replaceUnit,
} from "../src/core/battle/formation";
import {
  createBattleState,
  setBattleFormation,
  type BattleState,
} from "../src/core/battle/state";
import {
  analyzeCommandCardChain,
  resolveNoblePhantasmOverchargeStage,
} from "../src/core/cards/chain";
import type {
  CommandCardSelection,
  SelectedNoblePhantasmCard,
  SelectedNormalCommandCard,
} from "../src/core/cards/selection";
import {
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import { unit } from "./helpers/battle";

// References checked 2026-07-30:
// https://webview.fate-go.jp/webview/help/
// https://news.fate-go.jp/2022/7th_anniversary/
// https://w.atwiki.jp/f_go/pages/304.html
// https://w.atwiki.jp/f_go/pages/955.html
// https://w.atwiki.jp/f_go/pages/4673.html
// Canonical behavior: docs/specs/BATTLE_SYSTEM.md and
// docs/specs/CALCULATIONS_AND_RNG.md.

function battle(): BattleState {
  return createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally", {
          dataId: "same-servant",
          np: 30_000,
          noblePhantasm: {
            stableId: "np-a",
            name: "NP A",
            cardType: "buster",
            level: 5,
          },
        }),
        unit("ally-b", "ally", {
          dataId: "same-servant",
          np: 20_000,
          noblePhantasm: {
            stableId: "np-b",
            name: "NP B",
            cardType: "arts",
            level: 2,
          },
        }),
        unit("ally-c", "ally", {
          np: 10_000,
          noblePhantasm: {
            stableId: "np-c",
            name: "NP C",
            cardType: "quick",
            level: 1,
          },
        }),
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
}

function normal(
  ownerInstanceId: string,
  type: "buster" | "arts" | "quick",
  cardIndex: number,
): SelectedNormalCommandCard {
  return {
    kind: "normal",
    cardId: `${ownerInstanceId}:command:${cardIndex + 1}`,
    ownerInstanceId,
    cardIndex,
    type,
  };
}

function noblePhantasm(
  ownerInstanceId: "ally-a" | "ally-b" | "ally-c",
): SelectedNoblePhantasmCard {
  const definitions = {
    "ally-a": {
      type: "buster",
      stableId: "np-a",
      name: "NP A",
      level: 5,
    },
    "ally-b": {
      type: "arts",
      stableId: "np-b",
      name: "NP B",
      level: 2,
    },
    "ally-c": {
      type: "quick",
      stableId: "np-c",
      name: "NP C",
      level: 1,
    },
  } as const;
  const definition = definitions[ownerInstanceId];
  return {
    kind: "noble_phantasm",
    cardId: `${ownerInstanceId}:noble-phantasm`,
    ownerInstanceId,
    type: definition.type,
    noblePhantasmStableId: definition.stableId,
    noblePhantasmName: definition.name,
    noblePhantasmLevel: definition.level,
  };
}

function selected(
  first: CommandCardSelection["cards"][number],
  second: CommandCardSelection["cards"][number],
  third: CommandCardSelection["cards"][number],
): CommandCardSelection {
  return { cards: [first, second, third] };
}

function stun(state: BattleState, instanceId: string): BattleState {
  const location = findUnitLocation(state.formation, instanceId);
  if (!location) throw new Error(`missing unit: ${instanceId}`);
  const result = applyEffect(
    location.unit,
    {
      stableId: "stun",
      name: "スタン",
      effectType: "stun",
      category: "debuff",
      classifications: ["immobilize"],
      remainingTurns: 1,
    },
    null,
    createEffectRuntimeCounters(),
  );
  return setBattleFormation(
    state,
    replaceUnit(state.formation, result.unit),
  );
}

describe("command-card position and first-card bonuses", () => {
  it("provides exact Quick, Arts, and Buster values for positions 1–3", () => {
    const result = analyzeCommandCardChain(
      battle(),
      selected(
        normal("ally-a", "quick", 0),
        normal("ally-b", "arts", 0),
        normal("ally-c", "buster", 0),
      ),
    );

    expect(
      result.cards.map((card) => ({
        calculationPosition: card.calculationPosition,
        damage: card.cardDamageValuePermille,
        np: card.cardNpValuePermille,
        stars: card.cardStarValuePermille,
      })),
    ).toEqual([
      { calculationPosition: 1, damage: 800, np: 1_000, stars: 800 },
      { calculationPosition: 2, damage: 1_200, np: 4_500, stars: 0 },
      { calculationPosition: 3, damage: 2_100, np: 0, stars: 200 },
    ]);
  });

  it("makes NP cards use first-position values and receive no first bonus", () => {
    const result = analyzeCommandCardChain(
      battle(),
      selected(
        normal("ally-a", "buster", 0),
        noblePhantasm("ally-b"),
        noblePhantasm("ally-c"),
      ),
    );

    expect(result.cards[1]).toMatchObject({
      position: 2,
      calculationPosition: 1,
      cardDamageValuePermille: 1_000,
      cardNpValuePermille: 3_000,
      cardStarValuePermille: 0,
      firstCardBonus: {
        damagePermille: 0,
        npGainPermille: 0,
        starGenerationPermille: 0,
        criticalRatePermille: 0,
      },
    });
    expect(result.cards[2]).toMatchObject({
      position: 3,
      calculationPosition: 1,
      cardDamageValuePermille: 800,
      cardNpValuePermille: 1_000,
      cardStarValuePermille: 800,
      firstCardBonus: {
        damagePermille: 0,
        npGainPermille: 0,
        starGenerationPermille: 0,
        criticalRatePermille: 0,
      },
    });
  });

  it("applies an ordinary first-card bonus to normal cards only", () => {
    const result = analyzeCommandCardChain(
      battle(),
      selected(
        noblePhantasm("ally-c"),
        normal("ally-a", "buster", 0),
        normal("ally-b", "buster", 0),
      ),
    );

    expect(result.firstCardBonus).toEqual({
      damagePermille: 0,
      npGainPermille: 0,
      starGenerationPermille: 200,
      criticalRatePermille: 200,
    });
    expect(result.cards[0].firstCardBonus).toEqual({
      damagePermille: 0,
      npGainPermille: 0,
      starGenerationPermille: 0,
      criticalRatePermille: 0,
    });
    expect(result.cards[1].firstCardBonus).toEqual(result.firstCardBonus);
    expect(result.cards[2].firstCardBonus).toEqual(result.firstCardBonus);
  });

  it("applies every first-card bonus to a Mighty chain in any order", () => {
    const result = analyzeCommandCardChain(
      battle(),
      selected(
        normal("ally-a", "arts", 0),
        normal("ally-b", "quick", 0),
        normal("ally-c", "buster", 0),
      ),
    );

    expect(result.mightyChain).toBe(true);
    expect(result.firstCardBonus).toEqual({
      damagePermille: 500,
      npGainPermille: 1_000,
      starGenerationPermille: 200,
      criticalRatePermille: 200,
    });
    expect(
      result.cards.every(
        ({ firstCardBonus }) =>
          firstCardBonus === result.firstCardBonus,
      ),
    ).toBe(true);
  });
});

describe("color, Brave, and Extra chains", () => {
  it("counts NP cards toward a Buster chain but excludes NP and Extra from its fixed bonus", () => {
    const result = analyzeCommandCardChain(
      battle(),
      selected(
        normal("ally-a", "buster", 0),
        noblePhantasm("ally-a"),
        normal("ally-a", "buster", 1),
      ),
    );

    expect(result.colorChain).toBe("buster");
    expect(
      result.cards.map(({ busterChainModPermille }) =>
        busterChainModPermille,
      ),
    ).toEqual([200, 0, 200]);
    expect(result.extraAttack?.busterChainModPermille).toBe(0);
  });

  it("grants 20 stars for a current Quick chain", () => {
    const result = analyzeCommandCardChain(
      battle(),
      selected(
        normal("ally-a", "quick", 0),
        normal("ally-b", "quick", 0),
        noblePhantasm("ally-c"),
      ),
    );

    expect(result.colorChain).toBe("quick");
    expect(result.quickChainStars).toBe(20);
    expect(result.artsChainNpUnits).toBe(0);
  });

  it("grants Arts-chain NP once to each unique owner in selected order", () => {
    const result = analyzeCommandCardChain(
      battle(),
      selected(
        normal("ally-a", "arts", 0),
        noblePhantasm("ally-b"),
        normal("ally-a", "arts", 1),
      ),
    );

    expect(result.colorChain).toBe("arts");
    expect(result.artsChainNpUnits).toBe(2_000);
    expect(result.artsChainParticipantInstanceIds).toEqual([
      "ally-a",
      "ally-b",
    ]);
  });

  it("creates a mixed Brave Extra Attack when NP and normal cards share one owner", () => {
    const result = analyzeCommandCardChain(
      battle(),
      selected(
        normal("ally-a", "quick", 0),
        noblePhantasm("ally-a"),
        normal("ally-a", "arts", 0),
      ),
    );

    expect(result.braveChain).toBe(true);
    expect(result.extraAttack).toMatchObject({
      kind: "extra",
      cardId: "ally-a:extra",
      ownerInstanceId: "ally-a",
      position: 4,
      cardDamageValuePermille: 1_000,
      cardNpValuePermille: 1_000,
      cardStarValuePermille: 1_000,
      extraCardModifierPermille: 2_000,
    });
  });

  it("uses the 3.5x Extra modifier for a same-color Brave chain", () => {
    const result = analyzeCommandCardChain(
      battle(),
      selected(
        normal("ally-a", "buster", 0),
        noblePhantasm("ally-a"),
        normal("ally-a", "buster", 1),
      ),
    );

    expect(result.braveChain).toBe(true);
    expect(result.extraAttack?.extraCardModifierPermille).toBe(3_500);
  });

  it("gives Mighty Brave Extra all first bonuses except critical rate", () => {
    const result = analyzeCommandCardChain(
      battle(),
      selected(
        normal("ally-a", "quick", 0),
        noblePhantasm("ally-a"),
        normal("ally-a", "arts", 0),
      ),
    );

    expect(result.mightyChain).toBe(true);
    expect(result.braveChain).toBe(true);
    expect(result.extraAttack).toMatchObject({
      firstCardBonus: {
        damagePermille: 500,
        npGainPermille: 1_000,
        starGenerationPermille: 200,
        criticalRatePermille: 0,
      },
      extraCardModifierPermille: 2_000,
    });
  });

  it("distinguishes duplicate servant data by battle instance ID", () => {
    const result = analyzeCommandCardChain(
      battle(),
      selected(
        normal("ally-a", "buster", 0),
        normal("ally-b", "arts", 0),
        normal("ally-a", "quick", 0),
      ),
    );

    expect(result.mightyChain).toBe(true);
    expect(result.braveChain).toBe(false);
    expect(result.extraAttack).toBeNull();
  });
});

describe("chain error", () => {
  it("suppresses every chain while preserving a valid first-card bonus", () => {
    const state = stun(battle(), "ally-a");
    const original = structuredClone(state);
    const result = analyzeCommandCardChain(
      state,
      selected(
        normal("ally-b", "buster", 0),
        normal("ally-a", "buster", 0),
        normal("ally-b", "buster", 1),
      ),
    );

    expect(result).toMatchObject({
      chainError: true,
      chainErrorOwnerInstanceIds: ["ally-a"],
      colorChain: null,
      mightyChain: false,
      braveChain: false,
      noblePhantasmChain: false,
      firstCardBonus: {
        damagePermille: 500,
        npGainPermille: 0,
        starGenerationPermille: 0,
        criticalRatePermille: 0,
      },
      quickChainStars: 0,
      artsChainNpUnits: 0,
      extraAttack: null,
    });
    expect(state).toEqual(original);
  });

  it("also suppresses the first-card bonus when its owner is disabled", () => {
    const state = stun(battle(), "ally-a");
    const result = analyzeCommandCardChain(
      state,
      selected(
        normal("ally-a", "quick", 0),
        normal("ally-b", "arts", 0),
        normal("ally-c", "buster", 0),
      ),
    );

    expect(result.chainError).toBe(true);
    expect(result.firstCardBonus).toEqual({
      damagePermille: 0,
      npGainPermille: 0,
      starGenerationPermille: 0,
      criticalRatePermille: 0,
    });
    expect(
      result.cards.every(
        ({ firstCardBonus }) =>
          firstCardBonus.damagePermille === 0
          && firstCardBonus.npGainPermille === 0
          && firstCardBonus.starGenerationPermille === 0
          && firstCardBonus.criticalRatePermille === 0,
      ),
    ).toBe(true);
  });
});

describe("NP chain and overcharge stage", () => {
  it.each([
    {
      name: "three consecutive NPs",
      cards: [
        noblePhantasm("ally-a"),
        noblePhantasm("ally-b"),
        noblePhantasm("ally-c"),
      ] as const,
      bonuses: [0, 1, 2],
      active: true,
    },
    {
      name: "a normal card before two consecutive NPs",
      cards: [
        normal("ally-a", "quick", 0),
        noblePhantasm("ally-b"),
        noblePhantasm("ally-c"),
      ] as const,
      bonuses: [0, 0, 1],
      active: true,
    },
    {
      name: "a normal card after two consecutive NPs",
      cards: [
        noblePhantasm("ally-a"),
        noblePhantasm("ally-b"),
        normal("ally-c", "quick", 0),
      ] as const,
      bonuses: [0, 1, 0],
      active: true,
    },
    {
      name: "NPs separated by a normal card",
      cards: [
        noblePhantasm("ally-a"),
        normal("ally-b", "arts", 0),
        noblePhantasm("ally-c"),
      ] as const,
      bonuses: [0, 0, 0],
      active: false,
    },
  ])("resolves $name", ({ cards, bonuses, active }) => {
    const result = analyzeCommandCardChain(
      battle(),
      selected(cards[0], cards[1], cards[2]),
    );

    expect(result.noblePhantasmChain).toBe(active);
    expect(
      result.cards.map(({ overchargeChainBonusStages }) =>
        overchargeChainBonusStages,
      ),
    ).toEqual(bonuses);
  });

  it("combines gauge, NP-chain, and effect OC stages with a stage-5 cap", () => {
    expect(resolveNoblePhantasmOverchargeStage(10_000, 0)).toBe(1);
    expect(resolveNoblePhantasmOverchargeStage(19_999, 1)).toBe(2);
    expect(resolveNoblePhantasmOverchargeStage(20_000, 1)).toBe(3);
    expect(resolveNoblePhantasmOverchargeStage(30_000, 2)).toBe(5);
    expect(resolveNoblePhantasmOverchargeStage(10_000, 2, 8)).toBe(5);
    expect(
      resolveNoblePhantasmOverchargeStage(
        10_000,
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
      ),
    ).toBe(5);
  });

  it("rejects an unusable gauge or invalid OC additions", () => {
    expect(() =>
      resolveNoblePhantasmOverchargeStage(9_999, 0),
    ).toThrow(/at or above 100%/);
    expect(() =>
      resolveNoblePhantasmOverchargeStage(10_000, -1),
    ).toThrow(/chainBonusStages/);
    expect(() =>
      resolveNoblePhantasmOverchargeStage(
        10_000,
        0,
        Number.MAX_SAFE_INTEGER + 1,
      ),
    ).toThrow(/additionalStages/);
  });
});
