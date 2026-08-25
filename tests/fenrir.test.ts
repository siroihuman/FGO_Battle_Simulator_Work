import { describe, expect, it } from "vitest";
import { createBattleAttackDataRegistry } from "../src/core/battle/actionData";
import { findUnitLocation, replaceUnit } from "../src/core/battle/formation";
import { createBattleState } from "../src/core/battle/state";
import { BattleRng } from "../src/core/rng";
import { resolveAllyCommandAttacks, type AllyCommandAttackDetail } from "../src/core/cards/commandAttack";
import { listCommandCardChoices, selectCommandCards } from "../src/core/cards/selection";
import { FENRIR, ORIGINAL_SERVANT_DEFINITIONS, createServantBattleInstance } from "../src/data/servants";
import { createBattleActionEffectDataRegistry } from "../src/effects/actionData";
import { initializeBattlePassives } from "../src/effects/actionExecution";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import { applyEffect, createEffectRuntimeCounters } from "../src/effects/runtime";
import { resolveAllySkillUse } from "../src/effects/skillExecution";
import { registeredServantWikiUrl } from "../src/ui/battleUi";
import { registeredSkillIconPath, registeredStatusIconPath, unspecifiedEffectNames } from "../src/ui/iconRegistry";
import { initialAllySelectionForServant } from "../src/ui/initialBattle";
import { combatantData } from "./helpers/attackData";
import { unit } from "./helpers/battle";

function fenrir(instanceId = "fenrir", initialNp = 0) {
  return createServantBattleInstance(FENRIR, { instanceId, level: 90, noblePhantasmLevel: 1, initialNp });
}

function baseState() {
  const source = fenrir();
  return {
    source,
    state: createBattleState({
      ally: { frontline: [source.unit, unit("ally-b", "ally"), unit("ally-c", "ally")], reserve: [] },
      waves: [{ enemy: { frontline: [unit("enemy", "enemy"), null, null], reserve: [] } }],
      enemyFrontlineLimit: 3,
    }),
  };
}

describe("No.058 フェンリル", () => {
  it("registers the complete strengthened source data in category-1 No. order", () => {
    expect(FENRIR).toMatchObject({
      collectionNo: 58, collectionLabel: "058", name: "フェンリル", rarity: 5,
      classDisplayName: "バーサーカー", growthTendency: "ATK偏重", attackType: "物理",
      classKey: "berserker", attributeKey: "beast", classAttackCoefficientPermille: 1_100,
      contentRevision: "current_upgraded_only", commandCards: ["quick", "arts", "buster", "buster", "buster"],
      battleRates: { attackNpUnits: 107, receivedNpUnits: 500, starRatePermille: 50, starWeight: 9, deathRatePermille: 390 },
    });
    expect(FENRIR.levelStats).toEqual([
      { level: 1, hp: 1_835, attack: 2_022 }, { level: 50, hp: 7_258, attack: 7_589 },
      { level: 60, hp: 7_883, attack: 8_243 }, { level: 70, hp: 9_010, attack: 9_421 },
      { level: 80, hp: 10_636, attack: 11_122 }, { level: 90, hp: 12_514, attack: 13_085 },
      { level: 100, hp: 13_710, attack: 14_324 }, { level: 120, hp: 16_112, attack: 16_813 },
    ]);
    expect(FENRIR.commandCardHitWeights.map(({ length }) => length)).toEqual([5, 2, 2, 2, 2]);
    expect(FENRIR.extraAttackHitWeights).toEqual([1, 1, 1, 1, 1]);
    expect(FENRIR.activeSkills.map(({ name, rank, cooldownAtMax }) => ({ name, rank, cooldownAtMax }))).toEqual([
      { name: "神殺しの魔狼", rank: "EX", cooldownAtMax: 8 },
      { name: "魔狼阻む三本の拘束", rank: "A++", cooldownAtMax: 9 },
      { name: "凍気迸る獣の四脚", rank: "A", cooldownAtMax: 9 },
    ]);
    expect(FENRIR.classSkills.map(({ name, rank }) => ({ name, rank }))).toEqual([
      { name: "対魔力", rank: "B" }, { name: "狂化", rank: "A+（B+相当）" },
      { name: "神性", rank: "E-" }, { name: "野性", rank: "A" },
    ]);
    expect(FENRIR.noblePhantasm).toMatchObject({ name: "咆哮轟く終焉の黄昏", reading: "ラグナロク・フローズヴィトニル", rank: "EX", cardType: "buster" });
    expect(FENRIR.noblePhantasm.effects).toMatchObject([
      { kind: "effect", order: 1 },
      { kind: "attack", order: 2, targetScope: "all", hitWeights: [1, 1, 1, 1, 1], damageMultiplierPermilleByLevel: [3_000, 4_000, 4_500, 4_750, 5_000], specialAttack: { requiredTargetTraits: ["天の力"], multiplierPermille: 1_500 } },
      { kind: "effect", order: 3, action: { kind: "reduce_hp", amount: 1_000, canDefeat: true } },
    ]);
    expect(ORIGINAL_SERVANT_DEFINITIONS.map(({ collectionNo }) => collectionNo)).toEqual([7, 24, 57, 58, 62, 70, 94, 105, 107]);
    expect(initialAllySelectionForServant("fenrir")).toMatchObject({ level: 90, noblePhantasmLevel: 1 });
    expect(registeredServantWikiUrl("fenrir")).toBe("https://w.atwiki.jp/siroi_human/pages/329.html");
    expect(fenrir().unresolvedEffectStableIds).toEqual([]);
  });

  it("resolves all three skills and every class skill with existing common effects", () => {
    const { source, state } = baseState();
    const registry = createBattleActionEffectDataRegistry([source.actionEffectData]);
    const first = resolveAllySkillUse({ state, registry, sourceInstanceId: "fenrir", skillStableId: "fenrir-god-slaying-demonic-wolf", counters: createEffectRuntimeCounters(), rng: new BattleRng("fenrir-skill-one").stream("effects") });
    expect(first).toMatchObject({ accepted: true });
    if (!first.accepted) return;
    expect(findUnitLocation(first.state.formation, "fenrir")?.unit.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.power, value: 300, flags: { requiredTargetTrait: "神性" } }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.criticalDamage, value: 300 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.starGeneration, value: 1_000 }),
    ]));
    const second = resolveAllySkillUse({ state, registry, sourceInstanceId: "fenrir", skillStableId: "fenrir-three-bindings-that-hinder-the-demonic-wolf", counters: createEffectRuntimeCounters(), rng: new BattleRng("fenrir-skill-two").stream("effects") });
    expect(second).toMatchObject({ accepted: true });
    if (!second.accepted) return;
    expect(findUnitLocation(second.state.formation, "fenrir")?.unit).toMatchObject({ np: 5_000, skillCooldowns: [0, 9, 0], effects: expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.attack, value: 300 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.noblePhantasmOverchargeStage, value: 2, remainingUses: 1 }),
    ]) });
    const third = resolveAllySkillUse({ state, registry, sourceInstanceId: "fenrir", skillStableId: "fenrir-four-legs-of-the-freezing-beast", counters: createEffectRuntimeCounters(), rng: new BattleRng("fenrir-skill-three").stream("effects") });
    expect(third).toMatchObject({ accepted: true });
    if (!third.accepted) return;
    expect(third.state.commandStars).toBe(30);
    expect(findUnitLocation(third.state.formation, "fenrir")?.unit.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.starFocus, value: 50_000, flags: { cardType: "buster" } }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.criticalDamage, value: 500, flags: { cardType: "buster" } }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.invincibilityPierce, remainingTurns: 3 }),
    ]));
    const initialized = initializeBattlePassives(state, registry, createEffectRuntimeCounters(), new BattleRng("fenrir-passives").stream("effects"));
    expect(initialized.unresolvedEffectStableIds).toEqual([]);
    expect(findUnitLocation(initialized.state.formation, "fenrir")?.unit.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.debuffResistance, value: 175, removalPolicy: "unremovable" }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 90, flags: { cardType: "buster" } }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.fixedDamage, value: 95 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.starGeneration, value: 100, removalPolicy: "unremovable" }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.criticalDamage, value: 100, removalPolicy: "unremovable" }),
    ]));
  });

  it("uses the common OC, fixed trait-special-attack, all-target 5-Hit and lethal post-NP HP reduction", () => {
    const source = fenrir("fenrir", 10_000);
    const skyEnemy = unit("enemy-sky", "enemy", { traits: ["天の力"], hp: 10_000_000, maxHp: 10_000_000, baseMaxHp: 10_000_000 });
    let state = createBattleState({ ally: { frontline: [source.unit, unit("ally-b", "ally"), unit("ally-c", "ally")], reserve: [] }, waves: [{ enemy: { frontline: [skyEnemy, null, null], reserve: [] } }], enemyFrontlineLimit: 3 });
    const overcharge = applyEffect(source.unit, { stableId: "fenrir-test-oc-up", name: "宝具OC段階アップ", effectType: COMMON_EFFECT_TYPES.noblePhantasmOverchargeStage, category: "buff", value: 2, remainingTurns: 3, remainingUses: 1 }, "fenrir", createEffectRuntimeCounters());
    state = { ...state, formation: replaceUnit(state.formation, overcharge.unit), commandStarDistributionMode: "legacy_on_command_confirmation", commandStarDistribution: null, commandDeck: { ...state.commandDeck, currentHand: state.commandDeck.sourceCards.slice(0, 5) } };
    const np = listCommandCardChoices(state).find(({ card }) => card.kind === "noble_phantasm" && card.ownerInstanceId === "fenrir")?.card;
    if (!np) throw new Error("フェンリルの宝具カードがありません");
    const selected = selectCommandCards(state, [np.cardId, ...state.commandDeck.currentHand.slice(0, 2).map(({ cardId }) => cardId)]);
    if (!selected.accepted) throw new Error("フェンリルの宝具選択に失敗しました");
    const random = new BattleRng("fenrir-np-oc3");
    const resolved = resolveAllyCommandAttacks({ state, selection: selected.selection, registry: createBattleAttackDataRegistry([source.attackData, combatantData("ally-b", "ally-b"), combatantData("ally-c", "ally-c"), combatantData("enemy-sky", "enemy-sky")]), actionEffectRegistry: createBattleActionEffectDataRegistry([source.actionEffectData]), counters: overcharge.counters, rng: { effects: random.stream("effects"), critical: random.stream("critical"), damage: random.stream("damage"), stars: random.stream("stars") }, requestedTargetInstanceId: "enemy-sky" });
    expect(resolved.sequence.accepted).toBe(true);
    if (!resolved.sequence.accepted) return;
    const detail = resolved.sequence.result.actions[0]?.resolverDetail as AllyCommandAttackDetail;
    expect(detail).toMatchObject({ outcome: "resolved", overchargeStage: 3, calculation: { npDamageMultiplierPermille: 3_000 } });
    if (detail.outcome !== "resolved") return;
    expect(detail.resolution.attack?.attack.hits).toHaveLength(5);
    expect(detail.calculation.npSpecialAttackPermille).toBe(1_500);
    expect(detail.declaredEffects.map(({ phase }) => phase)).toEqual(["before_attack", "after_attack"]);
    expect(detail.declaredEffects[0]?.result.effects).toContainEqual(expect.objectContaining({
      effectStableId: "fenrir-np-buster",
      batch: expect.objectContaining({ results: [expect.objectContaining({ applicationResults: [expect.objectContaining({ appliedEffect: expect.objectContaining({ value: 300 }) })] })] }),
    }));
    expect(detail.declaredEffects[1]?.result.effects).toContainEqual(expect.objectContaining({ effectStableId: "fenrir-np-hp-reduction", targetInstanceIds: ["fenrir"], batch: expect.objectContaining({ results: [expect.objectContaining({ action: { kind: "reduce_hp", amount: 1_000, canDefeat: true }, hpChange: -1_000 })] }) }));
    expect(findUnitLocation(resolved.sequence.result.state.formation, "fenrir")?.unit.hp).toBe(source.unit.maxHp - 1_000);
  });

  it("uses only source-confirmed formal icons", () => {
    expect(registeredSkillIconPath("神殺しの魔狼")).toContain("skill-damage-up.png");
    expect(registeredSkillIconPath("魔狼阻む三本の拘束")).toContain("skill-np-charge.png");
    expect(registeredSkillIconPath("凍気迸る獣の四脚")).toContain("skill-card-buster-star-weight.png");
    expect(registeredSkillIconPath("狂化")).toContain("class-mad-enhancement.png");
    expect(registeredSkillIconPath("野性")).toContain("skill-star-rate-up.png");
    const { source, state } = baseState();
    const resolved = resolveAllySkillUse({ state, registry: createBattleActionEffectDataRegistry([source.actionEffectData]), sourceInstanceId: "fenrir", skillStableId: "fenrir-four-legs-of-the-freezing-beast", counters: createEffectRuntimeCounters(), rng: new BattleRng("fenrir-icons").stream("effects") });
    if (!resolved.accepted) throw new Error("フェンリルの第三スキルに失敗しました");
    const effects = findUnitLocation(resolved.state.formation, "fenrir")?.unit.effects ?? [];
    expect(unspecifiedEffectNames(effects)).toEqual([]);
    expect(registeredStatusIconPath(effects.find(({ effectType }) => effectType === COMMON_EFFECT_TYPES.starFocus)!)).toContain("Busterabsorpt.webp");
    expect(registeredStatusIconPath(effects.find(({ effectType }) => effectType === COMMON_EFFECT_TYPES.invincibilityPierce)!)).toContain("Invinciblepierce.webp");
    expect(registeredStatusIconPath({
      ...effects.find(({ effectType }) => effectType === COMMON_EFFECT_TYPES.invincibilityPierce)!,
      name: "Busterカード性能アップ",
      effectType: COMMON_EFFECT_TYPES.cardPerformance,
      value: 100,
      flags: { cardType: "buster" },
    })).toContain("Busterupstatus.webp");
  });
});
