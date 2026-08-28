import { describe, expect, it } from "vitest";
import { createBattleAttackDataRegistry } from "../src/core/battle/actionData";
import { initializeBattleLoadout } from "../src/core/battle/loadout";
import { createBattleState } from "../src/core/battle/state";
import { findUnitLocation } from "../src/core/battle/formation";
import { BattleRng } from "../src/core/rng";
import {
  createServantBattleInstance,
  JULIA_FARNESE,
  ORIGINAL_SERVANT_DEFINITIONS,
} from "../src/data/servants";
import { INITIAL_CRAFT_ESSENCE_REGISTRY, JULIA_FARNESE_BOND } from "../src/data/craftEssences";
import { createBattleActionEffectDataRegistry } from "../src/effects/actionData";
import { initializeBattlePassives } from "../src/effects/actionExecution";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import { createEffectRuntimeCounters } from "../src/effects/runtime";
import { resolveAllySkillUse } from "../src/effects/skillExecution";
import { presentNoblePhantasmDetail } from "../src/ui/battleUi";
import { combatantData } from "./helpers/attackData";
import { unit } from "./helpers/battle";

function julia(instanceId = "julia") {
  return createServantBattleInstance(JULIA_FARNESE, {
    instanceId,
    level: 80,
    noblePhantasmLevel: 1,
  });
}

function stateWithJulia() {
  const source = julia();
  return {
    source,
    state: createBattleState({
      ally: {
        frontline: [
          source.unit,
          unit("female-ally", "ally", { hp: 4_000, maxHp: 10_000, baseMaxHp: 10_000, traits: ["女性"] }),
          unit("male-ally", "ally", { hp: 4_000, maxHp: 10_000, baseMaxHp: 10_000, traits: ["男性"] }),
        ],
        reserve: [],
      },
      waves: [{
        enemy: { frontline: [unit("male-enemy", "enemy", { traits: ["男性"] }), null, null], reserve: [] },
      }],
      enemyFrontlineLimit: 3,
    }),
  };
}

describe("No.029 ジュリア・ファルネーゼ", () => {
  it("registers the strengthened skills, class skills, NP order, traits, and exact bond restriction", () => {
    expect(JULIA_FARNESE).toMatchObject({
      collectionNo: 29,
      collectionLabel: "029",
      name: "ジュリア・ファルネーゼ",
      rarity: 4,
      classDisplayName: "ライダー",
      commandCards: ["quick", "quick", "arts", "arts", "buster"],
      battleRates: { attackNpUnits: 86, receivedNpUnits: 300, starRatePermille: 88, starWeight: 204, deathRatePermille: 400 },
      traits: expect.arrayContaining(["女性", "猛獣", "ローマ"]),
    });
    expect(JULIA_FARNESE.levelStats.at(-1)).toEqual({ level: 120, hp: 18_246, attack: 11_057 });
    expect(JULIA_FARNESE.activeSkills.map(({ name, rank, cooldownAtMax }) => ({ name, rank, cooldownAtMax }))).toEqual([
      { name: "麗しのジュリア", rank: "A+", cooldownAtMax: 7 },
      { name: "無垢なる一角馬", rank: "C", cooldownAtMax: 7 },
      { name: "白百合の獣", rank: "A+++", cooldownAtMax: 8 },
    ]);
    expect(JULIA_FARNESE.classSkills.map(({ name, rank }) => ({ name, rank }))).toEqual([
      { name: "対魔力", rank: "D" },
      { name: "騎乗", rank: "A" },
    ]);
    expect(JULIA_FARNESE.noblePhantasm.effects).toMatchObject([
      { kind: "effect", description: "自身に無敵貫通状態を付与(3T)" },
      { kind: "effect", description: "＆Quickカード性能をアップ(3T)<OC:効果UP>：30% / 35% / 40% / 45% / 50%" },
      { kind: "attack", damageMultiplierPermilleByLevel: [8_000, 10_000, 11_000, 11_500, 12_000], specialAttack: { requiredTargetTraits: ["悪"], multiplierPermille: 1_500 } },
      { kind: "effect", description: "＋自身の弱体耐性をアップ(3T)<OC:効果UP>：50% / 62.5% / 75% / 87.5% / 100%" },
    ]);
    expect(presentNoblePhantasmDetail(julia().unit)?.descriptions).toEqual([
      "自身に無敵貫通状態を付与(3T)",
      "＆Quickカード性能をアップ(3T)<OC:効果UP>：30% / 35% / 40% / 45% / 50%",
      "＋敵全体に強力な攻撃[Lv]　Quick(x0.8)：800% / 1000% / 1100% / 1150% / 1200%",
      "＆〔悪〕特攻：150%",
      "＋自身の弱体耐性をアップ(3T)<OC:効果UP>：50% / 62.5% / 75% / 87.5% / 100%",
    ]);
    expect(JULIA_FARNESE_BOND).toMatchObject({
      name: "六輪の青百合",
      eligibleServantDataIds: ["julia-farnese"],
      fieldEffects: [
        { description: "自身がフィールドにいる間、味方全体の〔女性〕のQuickカード性能をアップ：10%" },
        { description: "＆クリティカル威力をアップ：20%" },
      ],
    });
    expect(ORIGINAL_SERVANT_DEFINITIONS.map(({ collectionNo }) => collectionNo))
      .toEqual([7, 24, 25, 29, 54, 55, 56, 57, 58, 62, 70, 94, 105, 107]);
    expect(julia().unresolvedEffectStableIds).toEqual([]);
  });

  it("uses common actions for male-targeted charm, female support, party recovery, and passives", () => {
    const { source, state } = stateWithJulia();
    const registry = createBattleActionEffectDataRegistry([source.actionEffectData]);
    const skill1 = resolveAllySkillUse({ state, registry, sourceInstanceId: "julia", skillStableId: "julia-farnese-lovely-julia", counters: createEffectRuntimeCounters(), rng: new BattleRng("julia-skill-one").stream("effects") });
    expect(skill1).toMatchObject({ accepted: true });
    if (!skill1.accepted) return;
    expect(findUnitLocation(skill1.state.formation, "male-enemy")?.unit.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "魅了", classifications: expect.arrayContaining(["charm", "immobilize"]), remainingTurns: 1 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.debuffResistance, value: -300 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.defense, value: -200 }),
    ]));

    const skill2 = resolveAllySkillUse({ state, registry, sourceInstanceId: "julia", skillStableId: "julia-farnese-innocent-unicorn", counters: createEffectRuntimeCounters(), rng: new BattleRng("julia-skill-two").stream("effects") });
    expect(skill2).toMatchObject({ accepted: true });
    if (!skill2.accepted) return;
    expect(findUnitLocation(skill2.state.formation, "julia")?.unit).toMatchObject({ np: 2_000, effects: expect.arrayContaining([expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.recurringStarGain, value: 15 }), expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.criticalDamage, value: 500 })]) });
    expect(findUnitLocation(skill2.state.formation, "female-ally")?.unit).toMatchObject({ np: 1_000, effects: expect.arrayContaining([expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.criticalDamage, value: 500 })]) });
    expect(findUnitLocation(skill2.state.formation, "male-ally")?.unit).toMatchObject({ np: 0, effects: [] });

    const skill3 = resolveAllySkillUse({ state, registry, sourceInstanceId: "julia", skillStableId: "julia-farnese-white-lily-beast", counters: createEffectRuntimeCounters(), rng: new BattleRng("julia-skill-three").stream("effects") });
    expect(skill3).toMatchObject({ accepted: true });
    if (!skill3.accepted) return;
    expect(findUnitLocation(skill3.state.formation, "female-ally")?.unit).toMatchObject({ hp: 7_000, effects: expect.arrayContaining([expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.recurringHpRecovery, value: 1_000, remainingTurns: 5 }), expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.recurringNpGain, value: 1_000, remainingTurns: 5 })]) });

    const passives = initializeBattlePassives(state, registry, createEffectRuntimeCounters(), new BattleRng("julia-passives").stream("effects"));
    expect(findUnitLocation(passives.state.formation, "julia")?.unit.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.debuffResistance, value: 125 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 100, flags: expect.objectContaining({ cardType: "quick" }) }),
    ]));
  });

  it("applies the bond field effects only to female allies while the exact wearer is frontline", () => {
    const { source, state } = stateWithJulia();
    const result = initializeBattleLoadout({
      state,
      rng: new BattleRng("julia-bond"),
      counters: createEffectRuntimeCounters(),
      attackRegistry: createBattleAttackDataRegistry([
        source.attackData,
        combatantData("female-ally", "female-ally"),
        combatantData("male-ally", "male-ally"),
      ]),
      craftEssenceRegistry: INITIAL_CRAFT_ESSENCE_REGISTRY,
      selection: {
        mysticCodeDataId: null,
        craftEssenceDataIdByInstanceId: { julia: "julia-farnese-bond" },
      },
    });
    expect(result.passiveInitialization?.unresolvedEffectStableIds).toEqual([]);
    expect(findUnitLocation(result.state.formation, "julia")?.unit.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 100, flags: expect.objectContaining({ cardType: "quick" }) }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.criticalDamage, value: 200 }),
    ]));
    expect(findUnitLocation(result.state.formation, "female-ally")?.unit.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 100, flags: expect.objectContaining({ cardType: "quick" }) }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.criticalDamage, value: 200 }),
    ]));
    expect(findUnitLocation(result.state.formation, "male-ally")?.unit.effects).toEqual([]);
  });
});
