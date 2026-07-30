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
  beginCommandCardExecution,
  listCommandCardChoices,
  selectCommandCards,
  type SelectedCommandCard,
} from "../src/core/cards/selection";
import { drawCommandCards } from "../src/core/cards/deck";
import { BattleRng } from "../src/core/rng";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import {
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import type { EffectTemplate } from "../src/effects/types";
import { unit } from "./helpers/battle";

// Reference checked 2026-07-30:
// https://w.atwiki.jp/f_go/pages/4673.html
// Canonical behavior: docs/specs/BATTLE_SYSTEM.md and docs/PROJECT_RULES.md.

function noblePhantasm(
  stableId: string,
  cardType: "buster" | "arts" | "quick" = "buster",
  level: 1 | 2 | 3 | 4 | 5 = 1,
) {
  return {
    stableId,
    name: stableId,
    cardType,
    level,
  } as const;
}

function battle(): BattleState {
  const initial = createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally", {
          np: 18_000,
          noblePhantasm: noblePhantasm("np-a", "buster", 2),
        }),
        unit("ally-b", "ally", {
          np: 9_000,
          noblePhantasm: noblePhantasm("np-b", "arts"),
        }),
        unit("ally-c", "ally"),
      ],
      reserve: [
        unit("ally-d", "ally", {
          np: 10_000,
          noblePhantasm: noblePhantasm("np-d", "quick"),
        }),
      ],
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
  const draw = drawCommandCards(
    initial.commandDeck,
    initial.formation.ally,
    new BattleRng("card-selection").stream("cards"),
  );
  return { ...initial, commandDeck: draw.deck };
}

function selected(
  state: BattleState,
  cardIds: readonly string[],
): [
  SelectedCommandCard,
  SelectedCommandCard,
  SelectedCommandCard,
] {
  const result = selectCommandCards(state, cardIds);
  if (!result.accepted) {
    throw new Error(`selection was rejected: ${result.reason}`);
  }
  return result.selection.cards;
}

function normalCardIds(state: BattleState): string[] {
  return listCommandCardChoices(state)
    .filter(({ card }) => card.kind === "normal")
    .map(({ card }) => card.cardId);
}

function noblePhantasmCardId(
  state: BattleState,
  ownerInstanceId: string,
): string {
  const choice = listCommandCardChoices(state).find(
    ({ card }) =>
      card.kind === "noble_phantasm"
      && card.ownerInstanceId === ownerInstanceId,
  );
  if (!choice) throw new Error(`missing NP choice: ${ownerInstanceId}`);
  return choice.card.cardId;
}

function updateUnit(
  state: BattleState,
  instanceId: string,
  update: (
    current: NonNullable<
      ReturnType<typeof findUnitLocation>
    >["unit"],
  ) => NonNullable<
    ReturnType<typeof findUnitLocation>
  >["unit"],
): BattleState {
  const location = findUnitLocation(state.formation, instanceId);
  if (!location) throw new Error(`missing unit: ${instanceId}`);
  return setBattleFormation(
    state,
    replaceUnit(
      state.formation,
      update(location.unit),
    ),
  );
}

function addEffect(
  state: BattleState,
  instanceId: string,
  template: EffectTemplate,
): BattleState {
  return updateUnit(state, instanceId, (current) =>
    applyEffect(
      current,
      template,
      null,
      createEffectRuntimeCounters(),
    ).unit,
  );
}

function stun(): EffectTemplate {
  return {
    stableId: "stun",
    name: "スタン",
    effectType: "stun",
    category: "debuff",
    classifications: ["mental", "immobilize"],
    remainingTurns: 1,
  };
}

function noblePhantasmSeal(): EffectTemplate {
  return {
    stableId: "np-seal",
    name: "宝具封印",
    effectType: COMMON_EFFECT_TYPES.noblePhantasmSeal,
    category: "debuff",
    remainingTurns: 1,
  };
}

describe("command card choices and selection", () => {
  it("lists five normal cards and configured frontline NPs in formation order", () => {
    const choices = listCommandCardChoices(battle());

    expect(
      choices.filter(({ card }) => card.kind === "normal"),
    ).toHaveLength(5);
    expect(
      choices
        .filter(({ card }) => card.kind === "noble_phantasm")
        .map(({ card, selectable, executionRestrictions }) => ({
          ownerInstanceId: card.ownerInstanceId,
          selectable,
          executionRestrictions,
        })),
    ).toEqual([
      {
        ownerInstanceId: "ally-a",
        selectable: true,
        executionRestrictions: [],
      },
      {
        ownerInstanceId: "ally-b",
        selectable: false,
        executionRestrictions: ["insufficient_np"],
      },
    ]);
  });

  it("accepts exactly three distinct cards and preserves their selected order", () => {
    const state = battle();
    const normals = normalCardIds(state);
    const npCardId = noblePhantasmCardId(state, "ally-a");
    const ids = [normals[1]!, npCardId, normals[0]!];
    const result = selectCommandCards(state, ids);

    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.selection.cards.map(({ cardId }) => cardId)).toEqual(ids);
    expect(result.selection.cards.map(({ kind }) => kind)).toEqual([
      "normal",
      "noble_phantasm",
      "normal",
    ]);
  });

  it("rejects a count other than three before changing state", () => {
    const state = battle();
    const normals = normalCardIds(state);

    expect(selectCommandCards(state, normals.slice(0, 2))).toEqual({
      accepted: false,
      reason: "wrong_card_count",
    });
    expect(selectCommandCards(state, normals.slice(0, 4))).toEqual({
      accepted: false,
      reason: "wrong_card_count",
    });
  });

  it("rejects duplicate physical cards", () => {
    const state = battle();
    const normals = normalCardIds(state);

    expect(
      selectCommandCards(
        state,
        [normals[0]!, normals[0]!, normals[1]!],
      ),
    ).toEqual({
      accepted: false,
      reason: "duplicate_card",
      cardId: normals[0],
    });
  });

  it("rejects a normal card that is not in the current hand", () => {
    const state = battle();
    const normals = normalCardIds(state);
    const undistributed = state.commandDeck.remainingCards[0];
    if (!undistributed) throw new Error("missing undistributed test card");

    expect(
      selectCommandCards(
        state,
        [normals[0]!, normals[1]!, undistributed.cardId],
      ),
    ).toEqual({
      accepted: false,
      reason: "card_not_available",
      cardId: undistributed.cardId,
    });
  });

  it("rejects selection outside the ongoing ally action phase", () => {
    const state = {
      ...battle(),
      phase: "ally_turn_end" as const,
    };
    expect(
      selectCommandCards(state, normalCardIds(state).slice(0, 3)),
    ).toEqual({
      accepted: false,
      reason: "invalid_phase",
    });
  });

  it("keeps an action-disabled normal card selectable", () => {
    let state = battle();
    const firstNormal = listCommandCardChoices(state).find(
      ({ card }) => card.kind === "normal",
    );
    if (!firstNormal) throw new Error("missing normal card");
    state = addEffect(
      state,
      firstNormal.card.ownerInstanceId,
      stun(),
    );
    const normals = normalCardIds(state);

    const result = selectCommandCards(state, normals.slice(0, 3));
    expect(result.accepted).toBe(true);
    expect(
      listCommandCardChoices(state).find(
        ({ card }) => card.cardId === firstNormal.card.cardId,
      ),
    ).toMatchObject({
      selectable: true,
      executionRestrictions: ["owner_action_disabled"],
    });
  });

  it("rejects an NP with insufficient gauge at selection time", () => {
    const state = battle();
    const normals = normalCardIds(state);
    const npCardId = noblePhantasmCardId(state, "ally-b");

    expect(
      selectCommandCards(
        state,
        [normals[0]!, npCardId, normals[1]!],
      ),
    ).toEqual({
      accepted: false,
      reason: "noble_phantasm_unavailable",
      cardId: npCardId,
      executionRestrictions: ["insufficient_np"],
    });
  });

  it("rejects a sealed or action-disabled NP at selection time", () => {
    const base = battle();
    const normals = normalCardIds(base);
    const npCardId = noblePhantasmCardId(base, "ally-a");
    const sealed = addEffect(base, "ally-a", noblePhantasmSeal());
    const disabled = addEffect(base, "ally-a", stun());

    expect(
      selectCommandCards(
        sealed,
        [normals[0]!, npCardId, normals[1]!],
      ),
    ).toMatchObject({
      accepted: false,
      reason: "noble_phantasm_unavailable",
      executionRestrictions: ["noble_phantasm_sealed"],
    });
    expect(
      selectCommandCards(
        disabled,
        [normals[0]!, npCardId, normals[1]!],
      ),
    ).toMatchObject({
      accepted: false,
      reason: "noble_phantasm_unavailable",
      executionRestrictions: ["owner_action_disabled"],
    });
  });

  it("rejects a defeated NP owner at selection time", () => {
    const base = battle();
    const defeated = updateUnit(
      base,
      "ally-a",
      (current) => ({ ...current, hp: 0, alive: false }),
    );
    const normals = normalCardIds(defeated);
    const npCardId = noblePhantasmCardId(defeated, "ally-a");

    expect(
      selectCommandCards(
        defeated,
        [normals[0]!, npCardId, normals[1]!],
      ),
    ).toMatchObject({
      accepted: false,
      reason: "noble_phantasm_unavailable",
      executionRestrictions: ["owner_defeated"],
    });
  });

  it("does not expose a reserve or unconfigured NP as a selectable card", () => {
    const choices = listCommandCardChoices(battle());
    expect(
      choices.some(
        ({ card }) =>
          card.kind === "noble_phantasm"
          && card.ownerInstanceId === "ally-c",
      ),
    ).toBe(false);
    expect(
      choices.some(
        ({ card }) =>
          card.kind === "noble_phantasm"
          && card.ownerInstanceId === "ally-d",
      ),
    ).toBe(false);
  });

  it("rejects an NP gauge above the configured NP-level cap", () => {
    expect(() =>
      createBattleState({
        ally: {
          frontline: [
            unit("ally-a", "ally", {
              np: 10_001,
              noblePhantasm: noblePhantasm("np-a", "buster", 1),
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
    ).toThrow(/NP exceeds the noblePhantasm level cap/);
  });

  it("supports explicit action-disable and NP-seal flags for exceptional states", () => {
    const base = battle();
    const restricted = addEffect(base, "ally-a", {
      stableId: "quest-card-lock",
      name: "クエスト固有行動制限",
      effectType: "quest_card_lock",
      category: "other",
      flags: {
        preventsCommandCardAction: true,
        sealsNoblePhantasm: true,
      },
    });
    const choice = listCommandCardChoices(restricted).find(
      ({ card }) =>
        card.kind === "noble_phantasm"
        && card.ownerInstanceId === "ally-a",
    );

    expect(choice).toMatchObject({
      selectable: false,
      executionRestrictions: [
        "owner_action_disabled",
        "noble_phantasm_sealed",
      ],
    });
  });
});

describe("command card execution preflight", () => {
  it("fizzles an action-disabled normal card without changing state", () => {
    let state = battle();
    const normal = listCommandCardChoices(state).find(
      ({ card }) => card.kind === "normal",
    );
    if (!normal) throw new Error("missing normal card");
    state = addEffect(state, normal.card.ownerInstanceId, stun());

    const result = beginCommandCardExecution(state, normal.card);
    expect(result).toMatchObject({
      outcome: "fizzled",
      state,
      restrictions: ["owner_action_disabled"],
      npBeforeUse: null,
      npConsumed: 0,
    });
  });

  it("sets a valid NP gauge to zero and reports the consumed amount", () => {
    const state = battle();
    const normals = normalCardIds(state);
    const npCardId = noblePhantasmCardId(state, "ally-a");
    const [, npCard] = selected(
      state,
      [normals[0]!, npCardId, normals[1]!],
    );
    const result = beginCommandCardExecution(state, npCard);

    expect(result).toMatchObject({
      outcome: "ready",
      npBeforeUse: 18_000,
      npConsumed: 18_000,
    });
    expect(
      findUnitLocation(
        result.state.formation,
        "ally-a",
      )?.unit.np,
    ).toBe(0);
    expect(
      findUnitLocation(
        state.formation,
        "ally-a",
      )?.unit.np,
    ).toBe(18_000);
  });

  it("rechecks NP immediately before execution and preserves an insufficient gauge", () => {
    const state = battle();
    const normals = normalCardIds(state);
    const npCardId = noblePhantasmCardId(state, "ally-a");
    const [, npCard] = selected(
      state,
      [normals[0]!, npCardId, normals[1]!],
    );
    const reduced = updateUnit(
      state,
      "ally-a",
      (current) => ({ ...current, np: 9_999 }),
    );
    const result = beginCommandCardExecution(reduced, npCard);

    expect(result).toMatchObject({
      outcome: "fizzled",
      state: reduced,
      restrictions: ["insufficient_np"],
      npBeforeUse: 9_999,
      npConsumed: 0,
    });
    expect(
      findUnitLocation(
        result.state.formation,
        "ally-a",
      )?.unit.np,
    ).toBe(9_999);
  });

  it("rechecks NP seal immediately before execution without consuming NP", () => {
    const state = battle();
    const normals = normalCardIds(state);
    const npCardId = noblePhantasmCardId(state, "ally-a");
    const [, npCard] = selected(
      state,
      [normals[0]!, npCardId, normals[1]!],
    );
    const sealed = addEffect(state, "ally-a", noblePhantasmSeal());
    const result = beginCommandCardExecution(sealed, npCard);

    expect(result).toMatchObject({
      outcome: "fizzled",
      restrictions: ["noble_phantasm_sealed"],
      npBeforeUse: 18_000,
      npConsumed: 0,
    });
    expect(
      findUnitLocation(
        result.state.formation,
        "ally-a",
      )?.unit.np,
    ).toBe(18_000);
  });

  it("rechecks NP owner survival immediately before execution", () => {
    const state = battle();
    const normals = normalCardIds(state);
    const npCardId = noblePhantasmCardId(state, "ally-a");
    const [, npCard] = selected(
      state,
      [normals[0]!, npCardId, normals[1]!],
    );
    const defeated = updateUnit(
      state,
      "ally-a",
      (current) => ({ ...current, hp: 0, alive: false }),
    );

    expect(
      beginCommandCardExecution(defeated, npCard),
    ).toMatchObject({
      outcome: "fizzled",
      restrictions: ["owner_defeated"],
      npBeforeUse: 18_000,
      npConsumed: 0,
    });
  });

  it("fizzles after the selected owner leaves the frontline", () => {
    const state = battle();
    const normal = listCommandCardChoices(state).find(
      ({ card }) =>
        card.kind === "normal"
        && card.ownerInstanceId === "ally-a",
    );
    const reserve = state.formation.ally.reserve[0];
    const [, allyB, allyC] = state.formation.ally.frontline;
    const allyA = state.formation.ally.frontline[0];
    if (!normal || !reserve || !allyA) {
      throw new Error("missing order-change test unit");
    }
    const changed = setBattleFormation(state, {
      ...state.formation,
      ally: {
        frontline: [reserve, allyB, allyC],
        reserve: [allyA],
      },
    });

    expect(
      beginCommandCardExecution(changed, normal.card),
    ).toMatchObject({
      outcome: "fizzled",
      restrictions: ["owner_not_frontline"],
      npConsumed: 0,
    });
  });

  it("fizzles a selected NP if its definition disappears before execution", () => {
    const state = battle();
    const normals = normalCardIds(state);
    const npCardId = noblePhantasmCardId(state, "ally-a");
    const [, npCard] = selected(
      state,
      [normals[0]!, npCardId, normals[1]!],
    );
    const unconfigured = updateUnit(
      state,
      "ally-a",
      (current) => ({ ...current, noblePhantasm: null }),
    );

    expect(
      beginCommandCardExecution(unconfigured, npCard),
    ).toMatchObject({
      outcome: "fizzled",
      restrictions: ["noble_phantasm_not_configured"],
      npBeforeUse: 18_000,
      npConsumed: 0,
    });
  });
});
