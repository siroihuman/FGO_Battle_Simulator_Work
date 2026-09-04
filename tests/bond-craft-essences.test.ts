import { describe, expect, it } from "vitest";
import {
  createBattleAttackDataRegistry,
} from "../src/core/battle/actionData";
import { findUnitLocation, orderedLocations } from "../src/core/battle/formation";
import { initializeBattleLoadout } from "../src/core/battle/loadout";
import { resolveDirectAllyExchange } from "../src/core/battle/replacement";
import { createBattleSession } from "../src/core/battle/session";
import { createBattleState } from "../src/core/battle/state";
import { resolveAttackModifierTotals } from "../src/core/battle/attackModifiers";
import { BattleRng } from "../src/core/rng";
import {
  DOMINATION_FOREIGNER_BOND,
  AGRIPPA_BOND,
  FENRIR_BOND,
  HONDA_TADAKATSU_BOND,
  INITIAL_CRAFT_ESSENCE_DEFINITIONS,
  INITIAL_CRAFT_ESSENCE_REGISTRY,
  LIGHT_KOYANSKAYA_BOND,
  LI_GUANG_BOND,
  LUCIFERA_BOND,
  MOTHER_MARY_BOND,
  OCTAVIANUS_BOND,
  JULIA_FARNESE_RIDER_BOND,
  SANADA_YUKIMURA_BOND,
  SEN_NO_RIKYU_BOND,
} from "../src/data/craftEssences";
import { createEffectRuntimeCounters } from "../src/effects/runtime";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import { resolveSideTurnEnd } from "../src/effects/turnEnd";
import { collectTriggerActivations } from "../src/effects/triggers";
import { presentUnitEffects } from "../src/ui/effectPresentation";
import { combatantData } from "./helpers/attackData";
import { unit } from "./helpers/battle";

function state() {
  return createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally", {
          dataId: "domination-foreigner",
          traits: ["人の力"],
        }),
        unit("ally-b", "ally", {
          dataId: "honda-tadakatsu",
          traits: ["人の力"],
        }),
        unit("ally-c", "ally", { dataId: "fenrir" }),
      ],
      reserve: [unit("ally-d", "ally", {
        dataId: "honda-tadakatsu",
        traits: ["人の力"],
      })],
    },
    waves: [{
      enemy: {
        frontline: [unit("enemy-a", "enemy"), null, null],
        reserve: [],
      },
    }],
    enemyFrontlineLimit: 3,
  });
}

function attackRegistry() {
  return createBattleAttackDataRegistry([
    combatantData("ally-a", "domination-foreigner", { attack: 10_000 }),
    combatantData("ally-b", "honda-tadakatsu", { attack: 10_000 }),
    combatantData("ally-c", "fenrir", { attack: 10_000 }),
    combatantData("ally-d", "honda-tadakatsu", { attack: 10_000 }),
  ]);
}

function initialized() {
  const rng = new BattleRng("bond-craft-essence-aura");
  const result = initializeBattleLoadout({
    state: state(),
    rng,
    counters: createEffectRuntimeCounters(),
    attackRegistry: attackRegistry(),
    craftEssenceRegistry: INITIAL_CRAFT_ESSENCE_REGISTRY,
    selection: {
      mysticCodeDataId: null,
      craftEssenceDataIdByInstanceId: {
        "ally-a": "domination-foreigner-bond",
      },
    },
  });
  return { result, rng };
}

function motherMaryState() {
  return createBattleState({
    ally: {
      frontline: [
        unit("mary", "ally", {
          dataId: "mother-mary",
          hp: 9_000,
          traits: ["領域外の生命"],
        }),
        unit("outside-front", "ally", {
          dataId: "honda-tadakatsu",
          hp: 9_000,
          traits: ["領域外の生命"],
        }),
        unit("ally-c", "ally", { dataId: "fenrir" }),
      ],
      reserve: [unit("outside-reserve", "ally", {
        dataId: "honda-tadakatsu",
        hp: 9_000,
        traits: ["領域外の生命"],
      })],
    },
    waves: [{
      enemy: {
        frontline: [unit("enemy-a", "enemy"), null, null],
        reserve: [],
      },
    }],
    enemyFrontlineLimit: 3,
  });
}

function motherMaryAttackRegistry() {
  return createBattleAttackDataRegistry([
    combatantData("mary", "mother-mary", { attack: 10_000 }),
    combatantData("outside-front", "honda-tadakatsu", { attack: 10_000 }),
    combatantData("ally-c", "fenrir", { attack: 10_000 }),
    combatantData("outside-reserve", "honda-tadakatsu", { attack: 10_000 }),
  ]);
}

function motherMaryInitialized() {
  const rng = new BattleRng("mother-mary-bond-aura");
  const result = initializeBattleLoadout({
    state: motherMaryState(),
    rng,
    counters: createEffectRuntimeCounters(),
    attackRegistry: motherMaryAttackRegistry(),
    craftEssenceRegistry: INITIAL_CRAFT_ESSENCE_REGISTRY,
    selection: {
      mysticCodeDataId: null,
      craftEssenceDataIdByInstanceId: { mary: "mother-mary-bond" },
    },
  });
  return { result, rng };
}

function battleUnit(
  formation: ReturnType<typeof state>["formation"],
  instanceId: string,
) {
  const found = findUnitLocation(formation, instanceId)?.unit;
  if (!found) throw new RangeError(`missing test unit: ${instanceId}`);
  return found;
}

describe("bond Craft Essences", () => {
  it("registers all requested bond essences with exact wearer restrictions and fixed Lv80 stats", () => {
    expect(INITIAL_CRAFT_ESSENCE_DEFINITIONS).toHaveLength(18);
    for (const definition of INITIAL_CRAFT_ESSENCE_DEFINITIONS.filter(
      ({ eligibleServantDataIds }) => eligibleServantDataIds !== undefined,
    )) {
      expect(definition).toMatchObject({
        rarity: 4,
        limitBreak: "max",
        level: 80,
        attack: 100,
        hp: 100,
      });
      expect(definition.eligibleServantDataIds).toHaveLength(1);
    }
    expect(HONDA_TADAKATSU_BOND.name).toBe("傷ひとつなき具足");
    expect(DOMINATION_FOREIGNER_BOND.name).toBe("一九二八年二月号");
    expect(FENRIR_BOND.name).toBe("六つのありえざるもの");
    expect(SANADA_YUKIMURA_BOND).toMatchObject({
      name: "六文の渡し賃",
      eligibleServantDataIds: ["sanada-yukimura"],
    });
    expect(LI_GUANG_BOND).toMatchObject({
      name: "桃李の下の蹊",
      eligibleServantDataIds: ["li-guang"],
    });
    expect(AGRIPPA_BOND).toMatchObject({
      name: "船嘴の黄金冠",
      eligibleServantDataIds: ["agrippa"],
    });
    expect(OCTAVIANUS_BOND).toMatchObject({
      name: "父から継いだ名",
      eligibleServantDataIds: ["octavianus"],
    });
    expect(JULIA_FARNESE_RIDER_BOND).toMatchObject({
      name: "六輪の青百合",
      eligibleServantDataIds: ["julia-farnese-rider"],
    });
    expect(LIGHT_KOYANSKAYA_BOND.eligibleServantDataIds).toEqual([
      "koyanskaya-of-light",
    ]);
    expect(SEN_NO_RIKYU_BOND.eligibleServantDataIds).toEqual(["sen-no-rikyu"]);
    expect(FENRIR_BOND.startEffects[1].action).toMatchObject({
      kind: "apply_effects",
      effects: expect.arrayContaining([expect.objectContaining({
        template: expect.objectContaining({
          stableId: "fenrir-bond-buster-np-state",
          trigger: expect.objectContaining({ activationRatePermille: 300 }),
        }),
      })]),
    });
    expect(LUCIFERA_BOND.startEffects[0].action).toMatchObject({
      kind: "apply_effects",
      effects: [expect.objectContaining({
        template: expect.objectContaining({
          stableId: "lucifera-bond-np-damage-state",
        }),
      })],
    });
    expect(HONDA_TADAKATSU_BOND.startEffects.map(({ description }) => description)).toEqual([
      "自身のQuickカード性能をアップ",
      "＆クリティカル威力をアップ",
    ]);
    expect(DOMINATION_FOREIGNER_BOND.fieldEffects?.map(({ description }) => description)).toEqual([
      "＋自身を除く味方全体の〔人の力を持つ味方〕の攻撃力をアップ",
      "＆NP獲得量をアップ",
    ]);
    expect(FENRIR_BOND.startEffects.map(({ description }) => description)).toEqual([
      "自身のクリティカル威力をアップ",
      "＆「Buster通常攻撃時確率(30％)でNPを増やす状態」を付与",
    ]);
    expect(MOTHER_MARY_BOND.fieldEffects?.map(({ description }) => description)).toEqual([
      "〔領域外の生命〕特性の味方全体のHP回復量をアップ",
      "＆毎ターンHP回復状態を付与",
    ]);
    expect(SANADA_YUKIMURA_BOND.fieldEffects?.map(({ description }) => description)).toEqual([
      "自身がフィールドにいる間、味方全体のクリティカル威力をアップ",
      "＆防御力をアップ",
      "＆被ダメージ時のNP獲得量をアップ",
    ]);
    expect(LI_GUANG_BOND.fieldEffects?.map(({ description }) => description)).toEqual([
      "自身がフィールドにいる間、味方全体の攻撃力をアップ",
      "＆NP獲得量をアップ",
    ]);
    expect(LI_GUANG_BOND.fieldEffects?.map(({ action }) => action)).toEqual([
      expect.objectContaining({
        kind: "apply_effects",
        effects: [expect.objectContaining({ template: expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.attack, value: 100 }) })],
      }),
      expect.objectContaining({
        kind: "apply_effects",
        effects: [expect.objectContaining({ template: expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.npGain, value: 150 }) })],
      }),
    ]);
    expect(AGRIPPA_BOND.fieldEffects?.map(({ description }) => description)).toEqual([
      "自身がフィールドにいる間、味方全体のArtsカード性能をアップ",
      "＋味方全体の〔初代ローマ皇帝〕の防御力をアップ",
    ]);
  });

  it("registers 真田信繁's bond effects for every current frontline ally only", () => {
    const initialState = createBattleState({
      ally: {
        frontline: [
          unit("sanada", "ally", { dataId: "sanada-yukimura" }),
          unit("ally-b", "ally", { dataId: "honda-tadakatsu" }),
          unit("ally-c", "ally", { dataId: "fenrir" }),
        ],
        reserve: [unit("ally-d", "ally", { dataId: "honda-tadakatsu" })],
      },
      waves: [{ enemy: { frontline: [unit("enemy-a", "enemy"), null, null], reserve: [] } }],
      enemyFrontlineLimit: 3,
    });
    const result = initializeBattleLoadout({
      state: initialState,
      rng: new BattleRng("sanada-bond"),
      counters: createEffectRuntimeCounters(),
      attackRegistry: createBattleAttackDataRegistry([
        combatantData("sanada", "sanada-yukimura", { attack: 10_000 }),
        combatantData("ally-b", "honda-tadakatsu", { attack: 10_000 }),
        combatantData("ally-c", "fenrir", { attack: 10_000 }),
        combatantData("ally-d", "honda-tadakatsu", { attack: 10_000 }),
      ]),
      craftEssenceRegistry: INITIAL_CRAFT_ESSENCE_REGISTRY,
      selection: {
        mysticCodeDataId: null,
        craftEssenceDataIdByInstanceId: { sanada: "sanada-yukimura-bond" },
      },
    });
    const effects = battleUnit(result.state.formation, "ally-b").effects;
    expect(effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.criticalDamage, value: 100 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.defense, value: 100 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.receivedNpGain, value: 100 }),
    ]));
    expect(battleUnit(result.state.formation, "ally-d").effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ stableId: "sanada-yukimura-bond-party-critical-state", value: 0 }),
    ]));
  });

  it("rejects a bond essence before mutating state when the exact servant data ID does not match", () => {
    const initialState = state();
    const rng = new BattleRng("bond-craft-essence-ineligible");
    const beforeRng = rng.snapshot();
    expect(() => initializeBattleLoadout({
      state: initialState,
      rng,
      counters: createEffectRuntimeCounters(),
      attackRegistry: attackRegistry(),
      craftEssenceRegistry: INITIAL_CRAFT_ESSENCE_REGISTRY,
      selection: {
        mysticCodeDataId: null,
        craftEssenceDataIdByInstanceId: {
          "ally-b": "domination-foreigner-bond",
        },
      },
    })).toThrow(
      "Craft Essence domination-foreigner-bond cannot be equipped by servant: honda-tadakatsu",
    );
    expect(initialState.loadout.initialized).toBe(false);
    expect(rng.snapshot()).toEqual(beforeRng);
  });

  it("activates a frontline field aura for current entrants, disables it in reserve, and hides inactive status rows", () => {
    const { result, rng } = initialized();
    const target = battleUnit(result.state.formation, "enemy-a");
    const frontlineRecipient = battleUnit(result.state.formation, "ally-b");
    const reserveRecipient = battleUnit(result.state.formation, "ally-d");

    expect(resolveAttackModifierTotals({
      cardType: "quick",
      isNoblePhantasm: false,
      isCritical: false,
      source: frontlineRecipient,
      target,
    }).source.attackModPermille).toBe(100);
    expect(reserveRecipient.effects).toEqual(expect.arrayContaining([expect.objectContaining({
      stableId: "domination-foreigner-bond-human-allies-attack-state",
      value: 0,
    })]));

    const entered = resolveDirectAllyExchange(result.state, "ally-b", "ally-d");
    const enteredRecipient = battleUnit(entered.state.formation, "ally-d");
    const withdrawnRecipient = battleUnit(entered.state.formation, "ally-b");
    expect(resolveAttackModifierTotals({
      cardType: "quick",
      isNoblePhantasm: false,
      isCritical: false,
      source: enteredRecipient,
      target,
    }).source.attackModPermille).toBe(100);
    expect(withdrawnRecipient.effects).toEqual(expect.arrayContaining([expect.objectContaining({
      stableId: "domination-foreigner-bond-human-allies-attack-state",
      value: 0,
    })]));

    const sourceWithdrawn = resolveDirectAllyExchange(
      entered.state,
      "ally-a",
      "ally-b",
    );
    const inactiveRecipient = battleUnit(sourceWithdrawn.state.formation, "ally-d");
    expect(resolveAttackModifierTotals({
      cardType: "quick",
      isNoblePhantasm: false,
      isCritical: false,
      source: inactiveRecipient,
      target,
    }).source.attackModPermille).toBe(0);

    const session = createBattleSession({
      state: sourceWithdrawn.state,
      rng,
      counters: result.counters,
      registry: result.attackRegistry,
      actionEffectRegistry: result.actionEffectRegistry,
    });
    expect(presentUnitEffects(session, inactiveRecipient).some(
      ({ applied }) => applied.stableId === "domination-foreigner-bond-human-allies-attack-state",
    )).toBe(false);
  });

  it("activates Fenrir's bond NP trigger only for a normal Buster attack", () => {
    const rng = new BattleRng("fenrir-bond-trigger");
    const result = initializeBattleLoadout({
      state: state(),
      rng,
      counters: createEffectRuntimeCounters(),
      attackRegistry: attackRegistry(),
      craftEssenceRegistry: INITIAL_CRAFT_ESSENCE_REGISTRY,
      selection: {
        mysticCodeDataId: null,
        craftEssenceDataIdByInstanceId: { "ally-c": "fenrir-bond" },
      },
    });
    const locations = orderedLocations(result.state.formation, "ally", false);
    const triggerIds = (cardType: "arts" | "buster") => collectTriggerActivations(
      locations,
      {
        timing: "on_attack",
        actorInstanceId: "ally-c",
        actorSide: "ally",
        attackKind: "normal_command",
        cardType,
      },
    ).map(({ effect }) => effect.stableId);

    expect(triggerIds("buster")).toContain("fenrir-bond-buster-np-state");
    expect(triggerIds("arts")).not.toContain("fenrir-bond-buster-np-state");
  });

  it("keeps Mother Mary's trait-limited recurring recovery active only for the current frontline", () => {
    const { result, rng } = motherMaryInitialized();
    const firstEnd = resolveSideTurnEnd(
      result.state.formation,
      "ally",
      result.counters,
      rng.stream("effects"),
    );
    expect(battleUnit(firstEnd.formation, "mary").hp).toBe(9_750);
    expect(battleUnit(firstEnd.formation, "outside-front").hp).toBe(9_650);
    expect(battleUnit(firstEnd.formation, "outside-reserve").hp).toBe(9_000);

    const entered = resolveDirectAllyExchange(
      { ...result.state, formation: firstEnd.formation },
      "outside-front",
      "outside-reserve",
    );
    const secondEnd = resolveSideTurnEnd(
      entered.state.formation,
      "ally",
      firstEnd.counters,
      rng.stream("effects"),
    );
    expect(battleUnit(secondEnd.formation, "outside-front").hp).toBe(9_650);
    expect(battleUnit(secondEnd.formation, "outside-reserve").hp).toBe(9_650);

    const sourceWithdrawn = resolveDirectAllyExchange(
      { ...entered.state, formation: secondEnd.formation },
      "mary",
      "outside-front",
    );
    const thirdEnd = resolveSideTurnEnd(
      sourceWithdrawn.state.formation,
      "ally",
      secondEnd.counters,
      rng.stream("effects"),
    );
    expect(battleUnit(thirdEnd.formation, "outside-reserve").hp).toBe(9_650);
  });
});
