import { describe, expect, it } from "vitest";
import { prepareBattleAttackInput } from "../src/core/battle/attackInput";
import { createBattleAttackDataRegistry } from "../src/core/battle/actionData";
import { findUnitLocation } from "../src/core/battle/formation";
import { BattleRng } from "../src/core/rng";
import { createBattleState } from "../src/core/battle/state";
import {
  createServantBattleInstance,
  ORIGINAL_SERVANT_DEFINITIONS,
  SALVADOR_DALI,
} from "../src/data/servants";
import { createBattleActionEffectDataRegistry } from "../src/effects/actionData";
import { initializeBattlePassives } from "../src/effects/actionExecution";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import { createEffectRuntimeCounters } from "../src/effects/runtime";
import { resolveAllySkillUse } from "../src/effects/skillExecution";
import { presentNoblePhantasmDetail } from "../src/ui/battleUi";
import { registeredSkillIconPath, registeredStatusIconPath } from "../src/ui/iconRegistry";
import { initialAllySelectionForServant } from "../src/ui/initialBattle";
import { unit } from "./helpers/battle";

function dali(instanceId = "dali") {
  return createServantBattleInstance(SALVADOR_DALI, {
    instanceId, level: 90, noblePhantasmLevel: 1,
  });
}

function stateWithDali() {
  const source = dali();
  return {
    source,
    state: createBattleState({
      ally: { frontline: [source.unit, unit("ally-b", "ally"), unit("ally-c", "ally")], reserve: [] },
      waves: [{ enemy: { frontline: [unit("enemy-a", "enemy"), unit("enemy-b", "enemy"), null], reserve: [] } }],
      enemyFrontlineLimit: 3,
    }),
  };
}

describe("No.107 サルバドール・ダリ", () => {
  it("registers the upgraded data, all skills, passives, and bond-compatible record", () => {
    expect(SALVADOR_DALI).toMatchObject({
      collectionNo: 107, name: "サルバドール・ダリ", rarity: 5,
      classDisplayName: "アサシン", growthTendency: "平均", attackType: "魔術",
      classKey: "assassin", attributeKey: "human", classAttackCoefficientPermille: 900,
      commandCards: ["quick", "quick", "arts", "arts", "buster"],
      battleRates: { attackNpUnits: 40, receivedNpUnits: 400, starRatePermille: 255, starWeight: 102, deathRatePermille: 385 },
    });
    expect(SALVADOR_DALI.levelStats.at(-1)).toEqual({ level: 120, hp: 17_256, attack: 14_247 });
    expect(SALVADOR_DALI.commandCardHitWeights.map(({ length }) => length)).toEqual([5, 5, 4, 4, 4]);
    expect(SALVADOR_DALI.extraAttackHitWeights).toHaveLength(5);
    expect(SALVADOR_DALI.activeSkills.map(({ name, rank, cooldownAtMax }) => ({ name, rank, cooldownAtMax }))).toEqual([
      { name: "溶解する時計", rank: "A", cooldownAtMax: 8 },
      { name: "記憶の固執", rank: "A", cooldownAtMax: 8 },
      { name: "偏執狂的批判的方法", rank: "EX", cooldownAtMax: 8 },
    ]);
    expect(SALVADOR_DALI.noblePhantasm.effects[1]).toMatchObject({
      kind: "attack", hitWeights: [1, 1, 1, 1],
      damageMultiplierPermilleByLevel: [4_500, 6_000, 6_750, 7_125, 7_500],
      specialAttack: { multiplierPermille: 1_500, requiresRemovableTargetDebuff: true },
    });
    expect(presentNoblePhantasmDetail(dali().unit)?.descriptions).toContain(
      "＆〔弱体状態(解除不能な状態は除く)〕特攻：150%",
    );
    expect(registeredStatusIconPath({ name: "Arts攻撃耐性ダウン" } as Parameters<typeof registeredStatusIconPath>[0]))
      .toContain("Artsresistdown.webp");
    expect(ORIGINAL_SERVANT_DEFINITIONS.map(({ collectionNo }) => collectionNo))
      .toEqual([7, 24, 25, 54, 55, 56, 57, 58, 62, 70, 94, 105, 107]);
    expect(initialAllySelectionForServant(SALVADOR_DALI.dataId)).toMatchObject({ level: 90, noblePhantasmLevel: 1 });
    expect(dali().unresolvedEffectStableIds).toEqual([]);
  });

  it("uses common actions for every active and passive effect", () => {
    expect(registeredSkillIconPath("溶解する時計")).toContain("skill-np-gauge-down.png");
    expect(registeredSkillIconPath("記憶の固執")).toContain("skill-guts.png");
    expect(registeredSkillIconPath("偏執狂的批判的方法")).toContain("skill-attack-down.png");
    const { source, state } = stateWithDali();
    const registry = createBattleActionEffectDataRegistry([source.actionEffectData]);
    const first = resolveAllySkillUse({ state, registry, sourceInstanceId: "dali", skillStableId: "salvador-dali-melting-clocks", counters: createEffectRuntimeCounters(), rng: new BattleRng("dali-one").stream("effects") });
    expect(first).toMatchObject({ accepted: true });
    if (!first.accepted) return;
    expect(findUnitLocation(first.state.formation, "dali")?.unit).toMatchObject({ np: 2_000, skillCooldowns: [7, 0, 0] });
    expect(findUnitLocation(first.state.formation, "ally-b")?.unit.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 200, flags: { cardType: "arts" } }),
    ]));

    const second = resolveAllySkillUse({ state, registry, sourceInstanceId: "dali", skillStableId: "salvador-dali-persistence-of-memory", counters: createEffectRuntimeCounters(), rng: new BattleRng("dali-two").stream("effects") });
    expect(second).toMatchObject({ accepted: true });
    if (!second.accepted) return;
    expect(findUnitLocation(second.state.formation, "dali")?.unit).toMatchObject({ np: 3_000, effects: expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.guts, value: 3_000, remainingUses: 1, remainingTurns: 5 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 300, flags: { cardType: "arts" } }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.npGain, value: 300 }),
    ]) });

    const third = resolveAllySkillUse({ state, registry, sourceInstanceId: "dali", skillStableId: "salvador-dali-paranoiac-critical-method", counters: createEffectRuntimeCounters(), rng: new BattleRng("dali-three").stream("effects") });
    expect(third).toMatchObject({ accepted: true });
    if (!third.accepted) return;
    const enemyEffect = findUnitLocation(third.state.formation, "enemy-a")?.unit.effects[0];
    expect(enemyEffect).toMatchObject({ effectType: COMMON_EFFECT_TYPES.attack, value: -1_000, remainingTurns: 1 });
    expect(registeredStatusIconPath(enemyEffect!)).toContain("Attackdown.webp");
    const passives = initializeBattlePassives(state, registry, createEffectRuntimeCounters(), new BattleRng("dali-passives").stream("effects"));
    expect(findUnitLocation(passives.state.formation, "dali")?.unit.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.starGeneration, value: 105 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.criticalDamage, value: 80 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.debuffResistance, classifications: ["charm"], value: 1_000 }),
    ]));
  });

  it("activates NP special attack only for targets with removable debuffs", () => {
    const source = dali();
    const base = unit("enemy", "enemy");
    const action = {
      cardType: "arts" as const, isNoblePhantasm: true, isCritical: false,
      cardDamageValuePermille: 1_000, cardNpValuePermille: 3_000, cardStarValuePermille: 0,
      firstCardDamageBonusPermille: 0, firstCardNpBonusPermille: 0, firstCardStarBonusPermille: 0,
      busterChainModPermille: 0, extraCardModifierPermille: 1_000, hitWeights: [1, 1, 1, 1],
      npDamageMultiplierPermille: 4_500, npSpecialAttackPermille: 1_500,
      npSpecialAttackRequiresRemovableTargetDebuff: true,
    };
    const registry = createBattleAttackDataRegistry([source.attackData]);
    const prepare = (enemy = base) => prepareBattleAttackInput(createBattleState({ ally: { frontline: [source.unit, unit("ally-b", "ally"), unit("ally-c", "ally")], reserve: [] }, waves: [{ enemy: { frontline: [enemy, null, null], reserve: [] } }], enemyFrontlineLimit: 3 }), registry, "dali", ["enemy"], action).input.targets[0]?.damage.npSpecialAttackPermille;
    expect(prepare()).toBeUndefined();
    expect(prepare({ ...base, effects: [{ instanceId: "frame", stableId: "frame", name: "枠付き弱体", effectType: "attack", category: "debuff", classifications: [], value: -100, remainingTurns: null, remainingUses: null, removalPolicy: "unremovable", durationTick: "manual", flags: {}, sourceInstanceId: null, targetInstanceId: "enemy", registrationOrder: 1 }] })).toBeUndefined();
    expect(prepare({ ...base, effects: [{ instanceId: "normal", stableId: "normal", name: "攻撃力ダウン", effectType: "attack", category: "debuff", classifications: [], value: -100, remainingTurns: 3, remainingUses: null, removalPolicy: "removable", durationTick: "owner_turn_end", flags: {}, sourceInstanceId: null, targetInstanceId: "enemy", registrationOrder: 1 }] })).toBe(1_500);
  });
});
