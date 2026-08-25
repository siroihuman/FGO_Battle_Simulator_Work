import { describe, expect, it } from "vitest";
import {
  createBattleAttackDataRegistry,
} from "../src/core/battle/actionData";
import { findUnitLocation } from "../src/core/battle/formation";
import { initializeBattleLoadout } from "../src/core/battle/loadout";
import { resolveDirectAllyExchange } from "../src/core/battle/replacement";
import {
  createBattleSession,
  createBattleSuspendSave,
  replayBattleSession,
  resolveBattleSessionTurn,
  restoreBattleSession,
} from "../src/core/battle/session";
import { createBattleState } from "../src/core/battle/state";
import { resolveAttackModifierTotals } from "../src/core/battle/attackModifiers";
import { BattleRng } from "../src/core/rng";
import {
  BLACK_GRAIL,
  INITIAL_CRAFT_ESSENCE_DEFINITIONS,
  INITIAL_CRAFT_ESSENCE_REGISTRY,
  KALEIDOSCOPE,
  createCraftEssenceDataRegistry,
} from "../src/data/craftEssences";
import { createEffectRuntimeCounters } from "../src/effects/runtime";
import { resolveSideTurnEnd } from "../src/effects/turnEnd";
import { combatantData } from "./helpers/attackData";
import { unit } from "./helpers/battle";

function state(options: { blackGrailHp?: number } = {}) {
  return createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally", {
          dataId: "same-servant",
          hp: options.blackGrailHp ?? 10_000,
        }),
        unit("ally-b", "ally", { dataId: "same-servant" }),
        unit("ally-c", "ally"),
      ],
      reserve: [unit("ally-d", "ally")],
    },
    waves: [{
      enemy: {
        frontline: [
          unit("enemy-a", "enemy", {
            hp: 1_000_000,
            maxHp: 1_000_000,
            baseMaxHp: 1_000_000,
          }),
          null,
          null,
        ],
        reserve: [],
      },
    }],
    enemyFrontlineLimit: 3,
  });
}

function attackRegistry() {
  return createBattleAttackDataRegistry([
    combatantData("ally-a", "same-servant", { attack: 10_000 }),
    combatantData("ally-b", "same-servant", { attack: 20_000 }),
    combatantData("ally-c", "ally-c", { attack: 30_000 }),
    combatantData("ally-d", "ally-d", { attack: 40_000 }),
  ]);
}

function initialize(
  craftEssenceDataIdByInstanceId: Readonly<Record<string, string>>,
  seed = "initial-craft-essences",
  initialState = state(),
) {
  const rng = new BattleRng(seed);
  const result = initializeBattleLoadout({
    state: initialState,
    rng,
    counters: createEffectRuntimeCounters(),
    attackRegistry: attackRegistry(),
    craftEssenceRegistry: INITIAL_CRAFT_ESSENCE_REGISTRY,
    selection: {
      mysticCodeDataId: null,
      craftEssenceDataIdByInstanceId,
    },
  });
  return { result, rng };
}

function battleUnit(
  initialized: ReturnType<typeof initialize>["result"],
  instanceId: string,
) {
  const found = findUnitLocation(initialized.state.formation, instanceId)?.unit;
  if (!found) throw new RangeError(`missing test unit: ${instanceId}`);
  return found;
}

describe("initial Craft Essence data and execution", () => {
  it("registers the generic maximum-limit-broken level-100 definitions with exact stats and sources", () => {
    expect(INITIAL_CRAFT_ESSENCE_DEFINITIONS).toHaveLength(14);
    expect(Object.keys(INITIAL_CRAFT_ESSENCE_REGISTRY.byDataId)).toEqual(expect.arrayContaining([
      "kaleidoscope",
      "black-grail",
    ]));
    expect(KALEIDOSCOPE).toMatchObject({
      dataId: "kaleidoscope",
      name: "カレイドスコープ",
      rarity: 5,
      limitBreak: "max",
      level: 100,
      attack: 2_000,
      hp: 0,
    });
    expect(BLACK_GRAIL).toMatchObject({
      dataId: "black-grail",
      name: "黒の聖杯",
      rarity: 5,
      limitBreak: "max",
      level: 100,
      attack: 2_400,
      hp: 0,
    });
    for (const definition of [KALEIDOSCOPE, BLACK_GRAIL]) {
      expect(definition.sources.length).toBeGreaterThanOrEqual(2);
      expect(definition.sources.every(({ checkedAt }) => checkedAt === "2026-08-10"))
        .toBe(true);
    }
  });

  it("applies Kaleidoscope NP and ATK only to independently selected wearer instances, including reserve", () => {
    const { result } = initialize({
      "ally-a": "kaleidoscope",
      "ally-d": "kaleidoscope",
    });

    expect(result.attackRegistry.byInstanceId["ally-a"].attack).toBe(12_000);
    expect(result.attackRegistry.byInstanceId["ally-b"].attack).toBe(20_000);
    expect(result.attackRegistry.byInstanceId["ally-d"].attack).toBe(42_000);
    expect(battleUnit(result, "ally-a").np).toBe(10_000);
    expect(battleUnit(result, "ally-b").np).toBe(0);
    expect(battleUnit(result, "ally-d").np).toBe(10_000);
    expect(result.state.loadout.craftEssencesByInstanceId).toMatchObject({
      "ally-a": { dataId: "kaleidoscope", attack: 2_000, hp: 0 },
      "ally-d": { dataId: "kaleidoscope", attack: 2_000, hp: 0 },
    });
  });

  it("connects Black Grail's unremovable 80% NP damage modifier only to each wearer", () => {
    const { result } = initialize({
      "ally-a": "black-grail",
      "ally-d": "black-grail",
    });
    const target = battleUnit(result, "enemy-a");
    const wearer = battleUnit(result, "ally-a");
    const duplicateServantWithoutEquipment = battleUnit(result, "ally-b");

    expect(result.attackRegistry.byInstanceId["ally-a"].attack).toBe(12_400);
    expect(result.attackRegistry.byInstanceId["ally-d"].attack).toBe(42_400);
    expect(resolveAttackModifierTotals({
      cardType: "buster",
      isNoblePhantasm: true,
      isCritical: false,
      source: wearer,
      target,
    }).source.npDamageModPermille).toBe(800);
    expect(resolveAttackModifierTotals({
      cardType: "buster",
      isNoblePhantasm: true,
      isCritical: false,
      source: duplicateServantWithoutEquipment,
      target,
    }).source.npDamageModPermille).toBe(0);
    expect(wearer.effects.every(({ removalPolicy }) =>
      removalPolicy === "unremovable"
    )).toBe(true);
    expect(battleUnit(result, "ally-d").effects).toHaveLength(2);
  });

  it("pauses Black Grail HP reduction in reserve and activates it after frontline entry", () => {
    const initialized = initialize({
      "ally-a": "black-grail",
      "ally-d": "black-grail",
    });
    const firstEnd = resolveSideTurnEnd(
      initialized.result.state.formation,
      "ally",
      initialized.result.counters,
      initialized.rng.stream("effects"),
    );

    expect(findUnitLocation(firstEnd.formation, "ally-a")?.unit.hp).toBe(9_500);
    expect(findUnitLocation(firstEnd.formation, "ally-d")?.unit.hp).toBe(10_000);

    const exchanged = resolveDirectAllyExchange(
      { ...initialized.result.state, formation: firstEnd.formation },
      "ally-c",
      "ally-d",
    );
    const secondEnd = resolveSideTurnEnd(
      exchanged.state.formation,
      "ally",
      firstEnd.counters,
      initialized.rng.stream("effects"),
    );

    expect(findUnitLocation(secondEnd.formation, "ally-a")?.unit.hp).toBe(9_000);
    expect(findUnitLocation(secondEnd.formation, "ally-d")?.unit.hp).toBe(9_500);
  });

  it("allows Black Grail's sourced HP reduction to reach zero instead of using nonlethal slip settlement", () => {
    const initialized = initialize(
      { "ally-a": "black-grail" },
      "black-grail-lethal",
      state({ blackGrailHp: 400 }),
    );
    const ended = resolveSideTurnEnd(
      initialized.result.state.formation,
      "ally",
      initialized.result.counters,
      initialized.rng.stream("effects"),
    );

    expect(findUnitLocation(ended.formation, "ally-a")?.unit).toMatchObject({
      hp: 0,
      alive: false,
    });
    expect(ended.hpSettlements).toEqual([]);
    expect(ended.activations[0].actions[0].deferredSettlement).toBeUndefined();
  });

  it("accepts no Craft Essence and rejects unregistered selection before mutation", () => {
    const empty = initialize({});
    expect(empty.result.state.loadout.craftEssencesByInstanceId).toEqual({});
    expect(empty.result.actionEffectRegistry).toBeUndefined();
    expect(empty.result.attackRegistry.byInstanceId["ally-a"].attack).toBe(10_000);

    const initialState = state();
    const rng = new BattleRng("unregistered-craft-essence");
    const beforeRng = rng.snapshot();
    expect(() => initializeBattleLoadout({
      state: initialState,
      rng,
      counters: createEffectRuntimeCounters(),
      attackRegistry: attackRegistry(),
      craftEssenceRegistry: INITIAL_CRAFT_ESSENCE_REGISTRY,
      selection: {
        mysticCodeDataId: null,
        craftEssenceDataIdByInstanceId: { "ally-a": "unknown" },
      },
    })).toThrow("selected Craft Essence is not registered");
    expect(initialState.loadout.initialized).toBe(false);
    expect(rng.snapshot()).toEqual(beforeRng);
  });

  it("marks unsupported data explicitly, rejects it before loadout mutation, and rejects removable states at registration", () => {
    const unsupportedRegistry = createCraftEssenceDataRegistry([{
      ...KALEIDOSCOPE,
      dataId: "unsupported-kaleidoscope",
      startEffects: [{
        ...KALEIDOSCOPE.startEffects[0],
        stableId: "unsupported-kaleidoscope-effect",
        action: { kind: "unsupported", mechanicId: "future_mechanic" },
      }],
    }]);
    const initialState = state();
    const rng = new BattleRng("unsupported-concrete-craft-essence");
    const beforeRng = rng.snapshot();
    expect(() => initializeBattleLoadout({
      state: initialState,
      rng,
      counters: createEffectRuntimeCounters(),
      attackRegistry: attackRegistry(),
      craftEssenceRegistry: unsupportedRegistry,
      selection: {
        mysticCodeDataId: null,
        craftEssenceDataIdByInstanceId: {
          "ally-a": "unsupported-kaleidoscope",
        },
      },
    })).toThrow("unsupported battle-start effects");
    expect(initialState.loadout.initialized).toBe(false);
    expect(rng.snapshot()).toEqual(beforeRng);

    expect(() => createCraftEssenceDataRegistry([{
      ...BLACK_GRAIL,
      dataId: "removable-black-grail",
      startEffects: [{
        ...BLACK_GRAIL.startEffects[0],
        stableId: "removable-black-grail-effect",
        action: {
          kind: "apply_effects",
          effects: [{
            template: {
              stableId: "removable-black-grail-state",
              name: "誤った解除可能状態",
              effectType: "noble_phantasm_damage",
              category: "buff",
              value: 800,
              removalPolicy: "removable",
            },
          }],
        },
      }],
    }])).toThrow("must be unremovable");
  });

  it("prevents double initialization and preserves direct resume and fixed-seed replay", () => {
    const initialized = initialize({
      "ally-a": "black-grail",
      "ally-b": "kaleidoscope",
    }, "craft-essence-save-replay");
    expect(() => initializeBattleLoadout({
      state: initialized.result.state,
      rng: initialized.rng,
      counters: initialized.result.counters,
      attackRegistry: initialized.result.attackRegistry,
      actionEffectRegistry: initialized.result.actionEffectRegistry,
      craftEssenceRegistry: INITIAL_CRAFT_ESSENCE_REGISTRY,
      selection: {
        mysticCodeDataId: null,
        craftEssenceDataIdByInstanceId: {
          "ally-a": "black-grail",
          "ally-b": "kaleidoscope",
        },
      },
    })).toThrow("already been initialized");

    let session = createBattleSession({
      state: initialized.result.state,
      rng: initialized.rng,
      counters: initialized.result.counters,
      registry: initialized.result.attackRegistry,
      actionEffectRegistry: initialized.result.actionEffectRegistry,
    });
    const cardIds = session.loop.state.commandDeck.currentHand
      .slice(0, 3)
      .map(({ cardId }) => cardId);
    const turn = resolveBattleSessionTurn(session, { cardIds });
    expect(turn.result.accepted).toBe(true);
    session = turn.session;

    const save = createBattleSuspendSave(session);
    const restored = restoreBattleSession(save);
    const replayed = replayBattleSession(save);
    expect(restored.loop.state).toEqual(session.loop.state);
    expect(replayed.loop.state).toEqual(session.loop.state);
    expect(replayed.loop.rng.snapshot()).toEqual(session.loop.rng.snapshot());
    expect(replayed.turnLogs).toEqual(session.turnLogs);
    expect(restored.registry.byInstanceId["ally-a"].attack).toBe(12_400);
    expect(restored.registry.byInstanceId["ally-b"].attack).toBe(22_000);
    expect(findUnitLocation(restored.loop.state.formation, "ally-b")?.unit.np)
      .toBe(10_000);
  });
});
