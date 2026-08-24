import { describe, expect, it } from "vitest";
import {
  createBattleAttackDataRegistry,
} from "../src/core/battle/actionData";
import { findUnitLocation } from "../src/core/battle/formation";
import { initializeBattleLoadout } from "../src/core/battle/loadout";
import { resolveDirectAllyExchange } from "../src/core/battle/replacement";
import { createBattleSession } from "../src/core/battle/session";
import { createBattleState } from "../src/core/battle/state";
import { resolveAttackModifierTotals } from "../src/core/battle/attackModifiers";
import { BattleRng } from "../src/core/rng";
import {
  DOMINATION_FOREIGNER_BOND,
  FENRIR_BOND,
  HONDA_TADAKATSU_BOND,
  INITIAL_CRAFT_ESSENCE_DEFINITIONS,
  INITIAL_CRAFT_ESSENCE_REGISTRY,
  LIGHT_KOYANSKAYA_BOND,
  SEN_NO_RIKYU_BOND,
} from "../src/data/craftEssences";
import { createEffectRuntimeCounters } from "../src/effects/runtime";
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
    expect(INITIAL_CRAFT_ESSENCE_DEFINITIONS).toHaveLength(10);
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
    expect(LIGHT_KOYANSKAYA_BOND.eligibleServantDataIds).toEqual([
      "koyanskaya-of-light",
    ]);
    expect(SEN_NO_RIKYU_BOND.eligibleServantDataIds).toEqual(["sen-no-rikyu"]);
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
});
