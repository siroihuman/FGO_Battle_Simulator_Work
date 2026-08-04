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
import { BattleRng } from "../src/core/rng";
import {
  analyzeCommandCardChain,
} from "../src/core/cards/chain";
import {
  beginCommandCardExecution,
  listCommandCardChoices,
  selectCommandCards,
} from "../src/core/cards/selection";
import {
  createBattleActionEffectDataRegistry,
} from "../src/effects/actionData";
import {
  createNoblePhantasmCardTypeChangeEffect,
  resolveNoblePhantasmCardType,
} from "../src/effects/noblePhantasmCardType";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import { removeEffects } from "../src/effects/removal";
import {
  advanceOwnerTurnEnd,
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import type { EffectRuntimeCounters } from "../src/effects/types";
import { resolveAllySkillUse } from "../src/effects/skillExecution";
import { unit } from "./helpers/battle";

// Reference checked 2026-08-04:
// https://w.atwiki.jp/f_go/pages/955.html
// NP type changes preserve Hit count, N/A, NP level, and gauge. The newest
// overlapping NP type-change state has priority.

function battle(): BattleState {
  const initial = createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally", {
          np: 15_000,
          commandCards: [
            "buster",
            "buster",
            "buster",
            "buster",
            "buster",
          ],
          noblePhantasm: {
            stableId: "np-a",
            name: "Arts NP",
            cardType: "arts",
            level: 2,
          },
        }),
        unit("ally-b", "ally", {
          np: 10_000,
          noblePhantasm: {
            stableId: "np-b",
            name: "Quick NP",
            cardType: "quick",
            level: 1,
          },
        }),
        unit("ally-c", "ally"),
      ],
      reserve: [],
    },
    waves: [{
      enemy: {
        frontline: [unit("enemy-a", "enemy"), null, null],
        reserve: [],
      },
    }],
    enemyFrontlineLimit: 3,
  });
  return {
    ...initial,
    commandDeck: {
      ...initial.commandDeck,
      currentHand: initial.commandDeck.sourceCards
        .filter(({ ownerInstanceId }) => ownerInstanceId === "ally-a")
        .slice(0, 5),
    },
  };
}

function applyToUnit(
  state: BattleState,
  instanceId: string,
  cardType: "quick" | "arts" | "buster",
  stableId: string,
  remainingTurns: number,
  counters: EffectRuntimeCounters,
): { state: BattleState; counters: EffectRuntimeCounters } {
  const location = findUnitLocation(state.formation, instanceId);
  if (!location) throw new Error(`missing unit: ${instanceId}`);
  const applied = applyEffect(
    location.unit,
    createNoblePhantasmCardTypeChangeEffect(
      cardType,
      `${cardType}宝具タイプ変更`,
      { stableId, remainingTurns },
    ),
    "ally-c",
    counters,
  );
  return {
    state: setBattleFormation(
      state,
      replaceUnit(state.formation, applied.unit),
    ),
    counters: applied.counters,
  };
}

describe("temporary noble-phantasm card type", () => {
  it("uses the newest change and reveals older or intrinsic types after expiry/removal", () => {
    let target = unit("ally-a", "ally", {
      np: 12_345,
      noblePhantasm: {
        stableId: "np-a",
        name: "Arts NP",
        cardType: "arts",
        level: 4,
      },
    });
    let counters = createEffectRuntimeCounters();
    const buster = applyEffect(
      target,
      createNoblePhantasmCardTypeChangeEffect(
        "buster",
        "Buster宝具タイプ変更",
        { stableId: "change-buster", remainingTurns: 3 },
      ),
      "ally-c",
      counters,
    );
    target = buster.unit;
    counters = buster.counters;
    const quick = applyEffect(
      target,
      createNoblePhantasmCardTypeChangeEffect(
        "quick",
        "Quick宝具タイプ変更",
        { stableId: "change-quick", remainingTurns: 1 },
      ),
      "ally-c",
      counters,
    );
    target = quick.unit;

    expect(resolveNoblePhantasmCardType(target)).toMatchObject({
      baseCardType: "arts",
      cardType: "quick",
      changeEffect: { stableId: "change-quick" },
    });
    const expired = advanceOwnerTurnEnd(
      target,
      "ally",
      false,
    ).unit;
    expect(resolveNoblePhantasmCardType(expired)).toMatchObject({
      baseCardType: "arts",
      cardType: "buster",
      changeEffect: { stableId: "change-buster" },
    });
    const intrinsic = removeEffects(expired, {
      mode: "by_id",
      stableId: "change-buster",
    }).unit;
    expect(resolveNoblePhantasmCardType(intrinsic)).toEqual({
      baseCardType: "arts",
      cardType: "arts",
      changeEffect: null,
    });
    expect(intrinsic).toMatchObject({
      np: 12_345,
      noblePhantasm: {
        cardType: "arts",
        level: 4,
      },
    });
  });

  it("rejects malformed card-type change templates before registration", () => {
    expect(() => applyEffect(
      unit("ally-a", "ally"),
      {
        stableId: "not-a-buff",
        name: "不正なタイプ変更",
        effectType:
          COMMON_EFFECT_TYPES.noblePhantasmCardTypeChange,
        category: "other",
        flags: { cardType: "buster" },
      },
      null,
      createEffectRuntimeCounters(),
    )).toThrow(/must be a buff/);
    expect(() => applyEffect(
      unit("ally-a", "ally"),
      {
        stableId: "invalid-type",
        name: "不正なタイプ変更",
        effectType:
          COMMON_EFFECT_TYPES.noblePhantasmCardTypeChange,
        category: "buff",
        flags: { cardType: "extra" },
      },
      null,
      createEffectRuntimeCounters(),
    )).toThrow(/quick, arts, or buster/);
  });

  it("uses the effective NP type for choices, chains, calculations, and execution rechecks", () => {
    const changed = applyToUnit(
      battle(),
      "ally-a",
      "buster",
      "change-buster",
      1,
      createEffectRuntimeCounters(),
    );
    const choices = listCommandCardChoices(changed.state);
    const noblePhantasm = choices.find(
      ({ card }) => card.kind === "noble_phantasm"
        && card.ownerInstanceId === "ally-a",
    )?.card;
    const normalIds = choices
      .filter(({ card }) => card.kind === "normal")
      .slice(0, 2)
      .map(({ card }) => card.cardId);
    if (!noblePhantasm || noblePhantasm.kind !== "noble_phantasm") {
      throw new Error("missing changed NP choice");
    }
    expect(noblePhantasm.type).toBe("buster");
    const selected = selectCommandCards(
      changed.state,
      [noblePhantasm.cardId, ...normalIds],
    );
    expect(selected.accepted).toBe(true);
    if (!selected.accepted) return;
    const chain = analyzeCommandCardChain(
      changed.state,
      selected.selection,
    );
    expect(chain).toMatchObject({
      colorChain: "buster",
      braveChain: true,
    });
    expect(chain.cards[0]).toMatchObject({
      calculationPosition: 1,
      cardDamageValuePermille: 1_500,
      busterChainModPermille: 0,
    });
    const ready = beginCommandCardExecution(
      changed.state,
      noblePhantasm,
    );
    expect(ready).toMatchObject({
      outcome: "ready",
      npBeforeUse: 15_000,
      npConsumed: 15_000,
    });
    expect(findUnitLocation(
      ready.state.formation,
      "ally-a",
    )?.unit.np).toBe(0);

    const superseded = applyToUnit(
      changed.state,
      "ally-a",
      "quick",
      "change-quick",
      1,
      changed.counters,
    ).state;
    const fizzled = beginCommandCardExecution(
      superseded,
      noblePhantasm,
    );
    expect(fizzled).toMatchObject({
      outcome: "fizzled",
      restrictions: ["noble_phantasm_changed"],
      npConsumed: 0,
    });
    expect(findUnitLocation(
      fizzled.state.formation,
      "ally-a",
    )?.unit.np).toBe(15_000);
  });

  it("applies a selected-target Buster NP change through declared ally skill data without RNG", () => {
    const registry = createBattleActionEffectDataRegistry([{
      instanceId: "ally-a",
      dataId: "ally-a",
      passives: [],
      actions: [{
        stableId: "change-target-np-to-buster",
        name: "宝具タイプ変更スキル",
        kind: "skill",
        skillSlot: 1,
        cooldownAtMax: 6,
        attackOrder: null,
        effects: [{
          kind: "effect",
          stableId: "change-target-np-to-buster-state",
          order: 1,
          description: "選択した味方単体の宝具をBusterに変更する",
          target: { relation: "allies", selection: "single" },
          action: {
            kind: "apply_effects",
            effects: [{
              template: createNoblePhantasmCardTypeChangeEffect(
                "buster",
                "宝具タイプをBusterに変更",
                { remainingTurns: 1 },
              ),
            }],
          },
        }],
      }],
    }]);
    const rng = new BattleRng("declared-np-type-change")
      .stream("effects");
    const resolved = resolveAllySkillUse({
      state: battle(),
      registry,
      sourceInstanceId: "ally-a",
      skillStableId: "change-target-np-to-buster",
      selectedTargetInstanceId: "ally-b",
      counters: createEffectRuntimeCounters(),
      rng,
    });
    expect(resolved.accepted).toBe(true);
    if (!resolved.accepted) return;
    const target = findUnitLocation(
      resolved.state.formation,
      "ally-b",
    )?.unit;
    if (!target) throw new Error("missing target after skill");
    expect(resolveNoblePhantasmCardType(target)).toMatchObject({
      baseCardType: "quick",
      cardType: "buster",
      changeEffect: {
        category: "buff",
        remainingTurns: 1,
      },
    });
    expect(resolved).toMatchObject({
      cooldownBefore: 0,
      cooldownAfterUse: 6,
      effects: {
        effects: [{
          outcome: "resolved",
          targetInstanceIds: ["ally-b"],
          batch: {
            results: [{ outcome: "changed" }],
          },
        }],
      },
    });
    expect(rng.snapshot().drawCount).toBe(0);
  });
});
