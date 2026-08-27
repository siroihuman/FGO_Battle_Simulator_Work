import { describe, expect, it } from "vitest";
import { findUnitLocation } from "../src/core/battle/formation";
import { BattleRng } from "../src/core/rng";
import { createBattleState } from "../src/core/battle/state";
import {
  createServantBattleInstance,
  LI_GUANG,
  ORIGINAL_SERVANT_DEFINITIONS,
} from "../src/data/servants";
import { createBattleActionEffectDataRegistry } from "../src/effects/actionData";
import { initializeBattlePassives } from "../src/effects/actionExecution";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import { createEffectRuntimeCounters } from "../src/effects/runtime";
import { resolveAllySkillUse } from "../src/effects/skillExecution";
import { registeredServantWikiUrl } from "../src/ui/battleUi";
import {
  registeredSkillIconPath,
  registeredStatusIconPath,
  unspecifiedEffectNames,
} from "../src/ui/iconRegistry";
import { initialAllySelectionForServant } from "../src/ui/initialBattle";
import { unit } from "./helpers/battle";

function liGuang(instanceId = "li-guang") {
  return createServantBattleInstance(LI_GUANG, {
    instanceId,
    level: 90,
    noblePhantasmLevel: 1,
  });
}

function baseState() {
  const source = liGuang();
  return {
    source,
    state: createBattleState({
      ally: {
        frontline: [source.unit, unit("ally-b", "ally"), unit("ally-c", "ally")],
        reserve: [],
      },
      waves: [{
        enemy: {
          frontline: [unit("enemy-a", "enemy"), unit("enemy-b", "enemy"), null],
          reserve: [],
        },
      }],
      enemyFrontlineLimit: 3,
    }),
  };
}

describe("No.105 李広", () => {
  it("registers source-backed upgraded data with uniform Hit weights", () => {
    expect(LI_GUANG).toMatchObject({
      collectionNo: 105,
      collectionLabel: "105",
      name: "李広",
      rarity: 5,
      classDisplayName: "アーチャー",
      growthTendency: "ATK寄り",
      attackType: "物理",
      classKey: "archer",
      attributeKey: "human",
      classAttackCoefficientPermille: 1_000,
      contentRevision: "current_upgraded_only",
      commandCards: ["quick", "quick", "arts", "arts", "buster"],
      battleRates: {
        attackNpUnits: 43,
        receivedNpUnits: 300,
        starRatePermille: 81,
        starWeight: 148,
        deathRatePermille: 360,
      },
    });
    expect(LI_GUANG.levelStats).toEqual([
      { level: 1, hp: 2_048, attack: 1_838 },
      { level: 50, hp: 8_518, attack: 7_257 },
      { level: 60, hp: 9_915, attack: 8_447 },
      { level: 70, hp: 11_172, attack: 9_518 },
      { level: 80, hp: 12_568, attack: 10_708 },
      { level: 90, hp: 13_965, attack: 11_898 },
      { level: 100, hp: 15_299, attack: 13_024 },
      { level: 120, hp: 17_981, attack: 15_288 },
    ]);
    expect(LI_GUANG.commandCardHitWeights.map(({ length }) => length))
      .toEqual([5, 5, 4, 4, 4]);
    expect(LI_GUANG.extraAttackHitWeights).toEqual([1, 1, 1, 1, 1]);
    expect(LI_GUANG.activeSkills.map(
      ({ name, rank, cooldownAtMax }) => ({ name, rank, cooldownAtMax }),
    )).toEqual([
      { name: "飛将軍", rank: "A", cooldownAtMax: 8 },
      { name: "白虎星の咆哮", rank: "A", cooldownAtMax: 8 },
      { name: "虎穿ちの眼", rank: "A", cooldownAtMax: 8 },
    ]);
    expect(LI_GUANG.classSkills.map(({ name, rank }) => ({ name, rank })))
      .toEqual([
        { name: "対魔力", rank: "C" },
        { name: "単独行動", rank: "A" },
        { name: "星辰融合", rank: "EX" },
      ]);
    expect(LI_GUANG.noblePhantasm).toMatchObject({
      name: "白虎吼、星墜つるは秋の箭",
      reading: "びゃっここう、ほしおつるはあきのや",
      rank: "EX",
      cardType: "quick",
    });
    expect(LI_GUANG.noblePhantasm.effects.map(({ kind, order }) => ({ kind, order })))
      .toEqual([
        { kind: "effect", order: 1 },
        { kind: "effect", order: 2 },
        { kind: "attack", order: 3 },
        { kind: "effect", order: 4 },
      ]);
    expect(LI_GUANG.noblePhantasm.effects[2]).toMatchObject({
      kind: "attack",
      targetScope: "all",
      hitWeights: [1, 1, 1, 1, 1, 1, 1, 1, 1],
      damageMultiplierPermilleByLevel: [6_000, 8_000, 9_000, 9_500, 10_000],
    });
    expect(ORIGINAL_SERVANT_DEFINITIONS.map(({ collectionNo }) => collectionNo))
      .toEqual([7, 24, 25, 54, 56, 57, 58, 62, 70, 94, 105, 107]);
    expect(initialAllySelectionForServant(LI_GUANG.dataId))
      .toMatchObject({ level: 90, noblePhantasmLevel: 1 });
    expect(registeredServantWikiUrl(LI_GUANG.dataId))
      .toBe("https://w.atwiki.jp/siroi_human/pages/915.html");
    expect(liGuang().unresolvedEffectStableIds).toEqual([]);
  });

  it("resolves the three upgraded skills and class skills with common effects", () => {
    expect(registeredSkillIconPath("飛将軍"))
      .toContain("skill-card-quick-up.png");
    expect(registeredSkillIconPath("白虎星の咆哮"))
      .toContain("skill-attack-up.png");
    expect(registeredSkillIconPath("虎穿ちの眼"))
      .toContain("skill-ignore-evasion.png");
    const { source, state } = baseState();
    const registry = createBattleActionEffectDataRegistry([source.actionEffectData]);
    const first = resolveAllySkillUse({
      state, registry, sourceInstanceId: "li-guang",
      skillStableId: "li-guang-flying-general",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("li-guang-skill-one").stream("effects"),
    });
    expect(first).toMatchObject({ accepted: true });
    if (!first.accepted) return;
    expect(findUnitLocation(first.state.formation, "li-guang")?.unit).toMatchObject({
      np: 3_000,
      skillCooldowns: [8, 0, 0],
      effects: expect.arrayContaining([
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 300, flags: { cardType: "quick" } }),
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.criticalDamage, value: 300 }),
      ]),
    });

    const second = resolveAllySkillUse({
      state, registry, sourceInstanceId: "li-guang",
      skillStableId: "li-guang-white-tiger-star-roar",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("li-guang-skill-two").stream("effects"),
    });
    expect(second).toMatchObject({ accepted: true });
    if (!second.accepted) return;
    expect(findUnitLocation(second.state.formation, "ally-b")?.unit.effects)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.attack, value: 200 }),
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.npGain, value: 200 }),
      ]));
    const enemyEffects = findUnitLocation(second.state.formation, "enemy-a")?.unit.effects ?? [];
    expect(enemyEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.attack, value: -200 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.criticalChance, value: -200 }),
    ]));

    const third = resolveAllySkillUse({
      state, registry, sourceInstanceId: "li-guang",
      skillStableId: "li-guang-tiger-piercing-eye",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("li-guang-skill-three").stream("effects"),
    });
    expect(third).toMatchObject({ accepted: true });
    if (!third.accepted) return;
    expect(third.state.commandStars).toBe(15);
    const sourceEffects = findUnitLocation(third.state.formation, "li-guang")?.unit.effects ?? [];
    expect(sourceEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.sureHit }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.criticalDamage, value: 500 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.starFocus, value: 5_000 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.starGeneration, value: 1_000 }),
    ]));
    expect(registeredStatusIconPath(enemyEffects.find(
      ({ effectType }) => effectType === COMMON_EFFECT_TYPES.criticalChance,
    )!)).toContain("Critchndown.webp");
    expect(registeredStatusIconPath(sourceEffects.find(
      ({ effectType }) => effectType === COMMON_EFFECT_TYPES.sureHit,
    )!)).toContain("Surehit.webp");
    expect(unspecifiedEffectNames([...enemyEffects, ...sourceEffects])).toEqual([]);

    const passives = initializeBattlePassives(
      state, registry, createEffectRuntimeCounters(),
      new BattleRng("li-guang-passives").stream("effects"),
    );
    expect(passives.unresolvedEffectStableIds).toEqual([]);
    expect(findUnitLocation(passives.state.formation, "li-guang")?.unit.effects)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.debuffResistance, value: 150, removalPolicy: "unremovable" }),
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.criticalDamage, value: 100, removalPolicy: "unremovable" }),
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.power, value: 100, flags: { requiredTargetTrait: "神性" }, removalPolicy: "unremovable" }),
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.fixedDamage, value: 250, removalPolicy: "unremovable" }),
      ]));
  });
});
