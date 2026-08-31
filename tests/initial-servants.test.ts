import { describe, expect, it } from "vitest";
import { createBattleState } from "../src/core/battle/state";
import { createBattleActionEffectDataRegistry } from "../src/effects/actionData";
import { initializeBattlePassives } from "../src/effects/actionExecution";
import { createEffectRuntimeCounters } from "../src/effects/runtime";
import { resolveAllySkillUse } from "../src/effects/skillExecution";
import { findUnitLocation } from "../src/core/battle/formation";
import { BattleRng } from "../src/core/rng";
import {
  INITIAL_SERVANT_DEFINITIONS,
  AJISUKITAKAHIKONE_NO_KAMI,
  FENRIR,
  DOMINATION_FOREIGNER,
  HONDA_TADAKATSU,
  LIGHT_KOYANSKAYA,
  LUCIFERA,
  SANADA_YUKIMURA,
  SEN_NO_RIKYU,
  OCTAVIANUS,
  JULIA_FARNESE_RIDER,
  assertValidServantDefinition,
  createServantBattleInstance,
  createServantDataRegistry,
} from "../src/data/servants";
import { unit } from "./helpers/battle";

function initialState() {
  const koyan = createServantBattleInstance(LIGHT_KOYANSKAYA, {
    instanceId: "koyan",
    level: 90,
    noblePhantasmLevel: 1,
  });
  const lucifera = createServantBattleInstance(LUCIFERA, {
    instanceId: "lucifera",
    level: 90,
    noblePhantasmLevel: 1,
  });
  const secondKoyan = createServantBattleInstance(LIGHT_KOYANSKAYA, {
    instanceId: "koyan-two",
    level: 1,
    noblePhantasmLevel: 1,
  });
  const state = createBattleState({
    ally: {
      frontline: [
        koyan.unit,
        { ...lucifera.unit, hp: 500 },
        { ...secondKoyan.unit, hp: 500 },
      ],
      reserve: [],
    },
    waves: [{
      enemy: { frontline: [unit("enemy-a", "enemy"), null, null], reserve: [] },
    }],
    enemyFrontlineLimit: 3,
  });
  return { state, koyan, lucifera, secondKoyan };
}

describe("initial servant definitions", () => {
  it("registers the source-backed, current-upgraded definitions", () => {
    for (const definition of INITIAL_SERVANT_DEFINITIONS) {
      expect(() => assertValidServantDefinition(definition)).not.toThrow();
    }
    const registry = createServantDataRegistry(INITIAL_SERVANT_DEFINITIONS);
    expect(Object.keys(registry.byDataId)).toEqual([
      "koyanskaya-of-light",
      "sen-no-rikyu",
      "honda-tadakatsu",
      "domination-foreigner",
      "duzyarya-rider",
      "julia-farnese-rider",
      "octavianus",
      "augustus",
      "agrippa",
      "ajisukitakahikone-no-kami",
      "fenrir",
      "lucifera",
      "mother-mary",
      "sanada-yukimura",
      "li-guang",
      "salvador-dali",
    ]);
    expect(LIGHT_KOYANSKAYA.levelStats.at(-1)).toEqual({
      level: 120,
      hp: 16_842,
      attack: 14_925,
    });
    expect(LUCIFERA.levelStats.at(-1)).toEqual({
      level: 120,
      hp: 17_084,
      attack: 13_963,
    });
    expect(DOMINATION_FOREIGNER.levelStats.at(-1)).toEqual({
      level: 120,
      hp: 16_860,
      attack: 16_169,
    });
    expect(HONDA_TADAKATSU.levelStats.at(-1)).toEqual({
      level: 120,
      hp: 15_133,
      attack: 11_449,
    });
    expect(AJISUKITAKAHIKONE_NO_KAMI.levelStats.at(-1)).toEqual({
      level: 120,
      hp: 21_242,
      attack: 13_489,
    });
    expect(FENRIR.levelStats.at(-1)).toEqual({
      level: 120,
      hp: 16_112,
      attack: 16_813,
    });
    expect(SANADA_YUKIMURA.levelStats.at(-1)).toEqual({
      level: 120,
      hp: 18_527,
      attack: 14_544,
    });
    expect(SEN_NO_RIKYU.levelStats.at(-1)).toEqual({
      level: 120,
      hp: 15_486,
      attack: 16_013,
    });
    expect(OCTAVIANUS).toMatchObject({
      collectionNo: 54,
      name: "オクタウィアヌス",
      classDisplayName: "セイバー",
      rarity: 4,
    });
    expect(OCTAVIANUS.levelStats.at(-1)).toEqual({
      level: 120,
      hp: 18_323,
      attack: 11_847,
    });
    expect(JULIA_FARNESE_RIDER).toMatchObject({
      collectionNo: 29,
      name: "ジュリア・ファルネーゼ",
      classDisplayName: "ライダー",
      rarity: 4,
      commandCards: ["quick", "quick", "arts", "arts", "buster"],
    });
    expect(JULIA_FARNESE_RIDER.levelStats.at(-1)).toEqual({
      level: 120,
      hp: 18_246,
      attack: 11_057,
    });
  });

  it("applies class skills and preserves the conditional evil NP special attack", () => {
    const { state, koyan, lucifera } = initialState();
    const registry = createBattleActionEffectDataRegistry([
      koyan.actionEffectData,
      lucifera.actionEffectData,
    ]);
    const initialized = initializeBattlePassives(
      state,
      registry,
      createEffectRuntimeCounters(),
      new BattleRng("initial-passives").stream("effects"),
    );
    expect(initialized.unresolvedEffectStableIds).toEqual([]);
    expect(findUnitLocation(initialized.state.formation, "koyan")?.unit.effects)
      .toHaveLength(8);
    expect(findUnitLocation(initialized.state.formation, "lucifera")?.unit.effects)
      .toHaveLength(4);
    expect(lucifera.attackData.noblePhantasms[0]).toMatchObject({
      specialAttackPermilleByOvercharge: [1_500, 1_625, 1_750, 1_875, 2_000],
      specialAttackRequiredTargetTraits: ["悪"],
    });
  });

  it("uses Koyanskaya's non-lethal party HP demerit after its selected-target effects", () => {
    const { state, koyan, lucifera, secondKoyan } = initialState();
    const registry = createBattleActionEffectDataRegistry([
      koyan.actionEffectData,
      lucifera.actionEffectData,
      secondKoyan.actionEffectData,
    ]);
    const result = resolveAllySkillUse({
      state,
      registry,
      sourceInstanceId: "koyan",
      skillStableId: "koyanskaya-light-innovator-bunny",
      selectedTargetInstanceId: "lucifera",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("koyan-skill-one").stream("effects"),
    });
    expect(result).toMatchObject({ accepted: true });
    if (!result.accepted) return;
    expect(findUnitLocation(result.state.formation, "lucifera")?.unit).toMatchObject({
      np: 5_000,
      hp: 1,
      skillCooldowns: [0, 0, 0],
    });
    expect(findUnitLocation(result.state.formation, "koyan-two")?.unit.hp).toBe(1);
    expect(findUnitLocation(result.state.formation, "koyan")?.unit.skillCooldowns)
      .toEqual([8, 0, 0]);
  });
});
