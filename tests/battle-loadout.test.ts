import { describe, expect, it } from "vitest";
import {
  createBattleAttackDataRegistry,
} from "../src/core/battle/actionData";
import {
  initializeBattleLoadout,
  type BattleLoadoutSelection,
} from "../src/core/battle/loadout";
import {
  createBattleSession,
  createBattleSuspendSave,
  replayBattleSession,
  restoreBattleSession,
} from "../src/core/battle/session";
import { createBattleState } from "../src/core/battle/state";
import { BattleRng } from "../src/core/rng";
import {
  CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
  createCraftEssenceDataRegistry,
  type CraftEssenceDefinition,
} from "../src/data/craftEssences";
import {
  MYSTIC_CODE_DATA_SCHEMA_VERSION,
  createMysticCodeDataRegistry,
  type MysticCodeDefinition,
} from "../src/data/mysticCodes";
import { createEffectRuntimeCounters } from "../src/effects/runtime";
import { findUnitLocation } from "../src/core/battle/formation";
import { combatantData } from "./helpers/attackData";
import { unit } from "./helpers/battle";

const checkedSource = [{
  url: "https://example.com/reference",
  checkedAt: "2026-08-10",
}];

function craftEssence(
  overrides: Partial<CraftEssenceDefinition> = {},
): CraftEssenceDefinition {
  return {
    schemaVersion: CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
    dataId: "test-craft-essence",
    name: "検査用概念礼装",
    rarity: 5,
    limitBreak: "max",
    level: 100,
    attack: 2_000,
    hp: 3_000,
    startEffects: [{
      kind: "effect",
      stableId: "test-craft-essence-start-np",
      order: 1,
      description: "自身のNPを50%増やす",
      target: { relation: "self", selection: "single" },
      action: { kind: "change_np", amount: 5_000 },
    }],
    sources: checkedSource,
    ...overrides,
  };
}

function mysticCode(): MysticCodeDefinition {
  const skill = (slot: 1 | 2 | 3) => ({
    stableId: `test-mystic-code-skill-${slot}`,
    name: `スキル${slot}`,
    slot,
    cooldownAtMax: 10 + slot,
    execution: "effects" as const,
    effects: [{
      kind: "effect" as const,
      stableId: `test-mystic-code-skill-${slot}-np`,
      order: 1,
      description: "味方単体のNPを増やす",
      target: { relation: "allies" as const, selection: "single" as const },
      action: { kind: "change_np" as const, amount: 1_000 },
    }],
  });
  return {
    schemaVersion: MYSTIC_CODE_DATA_SCHEMA_VERSION,
    dataId: "test-mystic-code",
    name: "検査用魔術礼装",
    levelPolicy: "max",
    skills: [skill(1), skill(2), skill(3)],
    sources: checkedSource,
  };
}

function state() {
  return createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally", { dataId: "same-servant" }),
        unit("ally-b", "ally", { dataId: "same-servant" }),
        unit("ally-c", "ally"),
      ],
      reserve: [unit("ally-d", "ally")],
    },
    waves: [{
      enemy: {
        frontline: [unit("enemy-a", "enemy"), null, null],
        reserve: [],
      },
    }],
    enemyFrontlineLimit: 3,
    mysticCodeCooldowns: [7, 7, 7],
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

function selection(): BattleLoadoutSelection {
  return {
    mysticCodeDataId: "test-mystic-code",
    craftEssenceDataIdByInstanceId: {
      "ally-a": "test-craft-essence",
      "ally-d": "test-craft-essence",
    },
  };
}

function initialize(seed = "loadout-seed") {
  const rng = new BattleRng(seed);
  const result = initializeBattleLoadout({
    state: state(),
    rng,
    counters: createEffectRuntimeCounters(),
    attackRegistry: attackRegistry(),
    mysticCodeRegistry: createMysticCodeDataRegistry([mysticCode()]),
    craftEssenceRegistry: createCraftEssenceDataRegistry([craftEssence()]),
    selection: selection(),
  });
  return { result, rng };
}

describe("battle loadout selection and start application", () => {
  it("applies selected ATK, HP, and start effects per instance including reserve", () => {
    const { result } = initialize();

    expect(result.attackRegistry.byInstanceId["ally-a"].attack).toBe(12_000);
    expect(result.attackRegistry.byInstanceId["ally-b"].attack).toBe(20_000);
    expect(result.attackRegistry.byInstanceId["ally-d"].attack).toBe(42_000);
    expect(findUnitLocation(result.state.formation, "ally-a")?.unit).toMatchObject({
      baseMaxHp: 13_000,
      maxHp: 13_000,
      hp: 13_000,
      np: 5_000,
    });
    expect(findUnitLocation(result.state.formation, "ally-b")?.unit).toMatchObject({
      baseMaxHp: 10_000,
      np: 0,
    });
    expect(findUnitLocation(result.state.formation, "ally-d")?.unit).toMatchObject({
      baseMaxHp: 13_000,
      np: 5_000,
    });
    expect(result.passiveInitialization?.groups.map(({ sourceInstanceId }) =>
      sourceInstanceId
    )).toEqual(["ally-a", "ally-d"]);
    expect(result.state.mysticCodeCooldowns).toEqual([0, 0, 0]);
    expect(result.state.loadout).toMatchObject({
      initialized: true,
      mysticCode: {
        dataId: "test-mystic-code",
        skillStableIds: [
          "test-mystic-code-skill-1",
          "test-mystic-code-skill-2",
          "test-mystic-code-skill-3",
        ],
      },
      craftEssencesByInstanceId: {
        "ally-a": { dataId: "test-craft-essence", attack: 2_000, hp: 3_000 },
        "ally-d": { dataId: "test-craft-essence", attack: 2_000, hp: 3_000 },
      },
    });
  });

  it("allows no selected equipment without inventing effects", () => {
    const rng = new BattleRng("empty-loadout");
    const result = initializeBattleLoadout({
      state: state(),
      rng,
      counters: createEffectRuntimeCounters(),
      attackRegistry: attackRegistry(),
      selection: {
        mysticCodeDataId: null,
        craftEssenceDataIdByInstanceId: {},
      },
    });

    expect(result.passiveInitialization).toBeNull();
    expect(result.actionEffectRegistry).toBeUndefined();
    expect(result.state.loadout).toEqual({
      initialized: true,
      mysticCode: null,
      craftEssencesByInstanceId: {},
    });
    expect(result.attackRegistry.byInstanceId["ally-a"].attack).toBe(10_000);
  });

  it("reproduces the same initialized state and RNG positions for the same seed and selection", () => {
    const first = initialize("fixed-loadout");
    const second = initialize("fixed-loadout");

    expect(second.result.state).toEqual(first.result.state);
    expect(second.result.counters).toEqual(first.result.counters);
    expect(second.rng.snapshot()).toEqual(first.rng.snapshot());
  });

  it("rejects unsupported start effects before changing state, counters, or RNG", () => {
    const initialState = state();
    const rng = new BattleRng("unsupported-loadout");
    const beforeRng = rng.snapshot();
    const counters = createEffectRuntimeCounters();
    const unsupported = craftEssence({
      startEffects: [{
        kind: "effect",
        stableId: "unsupported-craft-start",
        order: 1,
        description: "未対応効果",
        target: { relation: "self", selection: "single" },
        action: { kind: "unsupported", mechanicId: "future_mechanic" },
      }],
    });

    expect(() => initializeBattleLoadout({
      state: initialState,
      rng,
      counters,
      attackRegistry: attackRegistry(),
      craftEssenceRegistry: createCraftEssenceDataRegistry([unsupported]),
      selection: {
        mysticCodeDataId: null,
        craftEssenceDataIdByInstanceId: {
          "ally-a": "test-craft-essence",
        },
      },
    })).toThrow("unsupported battle-start effects");
    expect(initialState.loadout.initialized).toBe(false);
    expect(findUnitLocation(initialState.formation, "ally-a")?.unit.maxHp)
      .toBe(10_000);
    expect(counters).toEqual(createEffectRuntimeCounters());
    expect(rng.snapshot()).toEqual(beforeRng);
  });

  it("rejects removable Craft Essence status data at registration", () => {
    const removable = craftEssence({
      startEffects: [{
        kind: "effect",
        stableId: "removable-craft-start",
        order: 1,
        description: "解除可能な誤った概念礼装効果",
        target: { relation: "self", selection: "single" },
        action: {
          kind: "apply_effects",
          effects: [{
            template: {
              stableId: "removable-craft-status",
              name: "解除可能状態",
              effectType: "attack_up",
              category: "buff",
              value: 100,
              removalPolicy: "removable",
            },
          }],
        },
      }],
    });

    expect(() => createCraftEssenceDataRegistry([removable])).toThrow(
      "must be unremovable",
    );
  });

  it("retains exact selections and adjusted registries through suspend restore and replay", () => {
    const initialized = initialize("saved-loadout");
    const session = createBattleSession({
      state: initialized.result.state,
      rng: initialized.rng,
      counters: initialized.result.counters,
      registry: initialized.result.attackRegistry,
      actionEffectRegistry: initialized.result.actionEffectRegistry,
      mysticCodeRegistry: createMysticCodeDataRegistry([mysticCode()]),
    });
    const save = createBattleSuspendSave(session);
    const restored = restoreBattleSession(save);
    const replayed = replayBattleSession(save);

    expect(restored.loop.state.loadout).toEqual(initialized.result.loadout);
    expect(replayed.loop.state.loadout).toEqual(initialized.result.loadout);
    expect(restored.registry.byInstanceId["ally-a"].attack).toBe(12_000);
    expect(replayed.registry.byInstanceId["ally-d"].attack).toBe(42_000);
  });

  it("rejects corrupted saved loadout metadata", () => {
    const initialized = initialize("corrupt-loadout");
    const session = createBattleSession({
      state: initialized.result.state,
      rng: initialized.rng,
      counters: initialized.result.counters,
      registry: initialized.result.attackRegistry,
      actionEffectRegistry: initialized.result.actionEffectRegistry,
      mysticCodeRegistry: createMysticCodeDataRegistry([mysticCode()]),
    });
    const save = createBattleSuspendSave(session);
    const corrupt = {
      ...save,
      current: {
        ...save.current,
        state: {
          ...save.current.state,
          loadout: {
            ...save.current.state.loadout,
            craftEssencesByInstanceId: {
              "enemy-a": {
                ...save.current.state.loadout.craftEssencesByInstanceId["ally-a"],
                instanceId: "enemy-a",
              },
            },
          },
        },
      },
    };

    expect(() => restoreBattleSession(corrupt)).toThrow(
      "selected Craft Essence state is invalid",
    );
  });
});
