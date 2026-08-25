import { describe, expect, it } from "vitest";
import { createBattleAttackDataRegistry } from "../src/core/battle/actionData";
import { findUnitLocation, replaceUnit } from "../src/core/battle/formation";
import { createBattleState } from "../src/core/battle/state";
import { BattleRng } from "../src/core/rng";
import {
  resolveAllyCommandAttacks,
  type AllyCommandAttackDetail,
} from "../src/core/cards/commandAttack";
import {
  listCommandCardChoices,
  selectCommandCards,
} from "../src/core/cards/selection";
import {
  createServantBattleInstance,
  ORIGINAL_SERVANT_DEFINITIONS,
  SANADA_YUKIMURA,
} from "../src/data/servants";
import { createBattleActionEffectDataRegistry } from "../src/effects/actionData";
import { initializeBattlePassives } from "../src/effects/actionExecution";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import { applyEffect, createEffectRuntimeCounters } from "../src/effects/runtime";
import { resolveAllySkillUse } from "../src/effects/skillExecution";
import { registeredServantWikiUrl } from "../src/ui/battleUi";
import {
  registeredSkillIconPath,
  registeredStatusIconPath,
  unspecifiedEffectNames,
} from "../src/ui/iconRegistry";
import { initialAllySelectionForServant } from "../src/ui/initialBattle";
import { combatantData } from "./helpers/attackData";
import { unit } from "./helpers/battle";

function sanada(instanceId = "sanada", initialNp = 0) {
  return createServantBattleInstance(SANADA_YUKIMURA, {
    instanceId,
    level: 90,
    noblePhantasmLevel: 1,
    initialNp,
  });
}

function baseState(initialNp = 0) {
  const source = sanada("sanada", initialNp);
  return {
    source,
    state: createBattleState({
      ally: {
        frontline: [source.unit, unit("ally-b", "ally"), unit("ally-c", "ally")],
        reserve: [],
      },
      waves: [{
        enemy: { frontline: [unit("enemy", "enemy"), null, null], reserve: [] },
      }],
      enemyFrontlineLimit: 3,
    }),
  };
}

describe("No.094 真田信繁", () => {
  it("registers the source-backed upgraded data with uniform Hit weights", () => {
    expect(SANADA_YUKIMURA).toMatchObject({
      collectionNo: 94,
      collectionLabel: "094",
      name: "真田信繁",
      rarity: 5,
      classDisplayName: "ランサー",
      growthTendency: "ATK寄り",
      attackType: "物理",
      classKey: "lancer",
      attributeKey: "human",
      classAttackCoefficientPermille: 1_050,
      contentRevision: "current_upgraded_only",
      commandCards: ["quick", "arts", "arts", "buster", "buster"],
      battleRates: {
        attackNpUnits: 53,
        receivedNpUnits: 400,
        starRatePermille: 122,
        starWeight: 87,
        deathRatePermille: 360,
      },
    });
    expect(SANADA_YUKIMURA.levelStats).toEqual([
      { level: 1, hp: 2_110, attack: 1_749 },
      { level: 50, hp: 9_065, attack: 7_130 },
      { level: 60, hp: 10_647, attack: 8_376 },
      { level: 70, hp: 12_230, attack: 9_621 },
      { level: 80, hp: 13_381, attack: 10_526 },
      { level: 90, hp: 14_389, attack: 11_319 },
      { level: 100, hp: 15_764, attack: 12_390 },
      { level: 120, hp: 18_527, attack: 14_544 },
    ]);
    expect(SANADA_YUKIMURA.commandCardHitWeights.map(({ length }) => length))
      .toEqual([4, 3, 3, 2, 2]);
    expect(SANADA_YUKIMURA.extraAttackHitWeights).toEqual([1, 1, 1, 1]);
    expect(SANADA_YUKIMURA.activeSkills.map(
      ({ name, rank, cooldownAtMax }) => ({ name, rank, cooldownAtMax }),
    )).toEqual([
      { name: "六文銭、風雲を裂く", rank: "A+", cooldownAtMax: 8 },
      { name: "不惜身命", rank: "A", cooldownAtMax: 9 },
      { name: "真田の赤備え", rank: "A++", cooldownAtMax: 9 },
    ]);
    expect(SANADA_YUKIMURA.classSkills.map(({ name, rank }) => ({ name, rank })))
      .toEqual([{ name: "対魔力", rank: "C" }, { name: "騎乗", rank: "B" }]);
    expect(SANADA_YUKIMURA.noblePhantasm).toMatchObject({
      name: "真田丸", reading: "さなだまる", rank: "C++", cardType: "buster",
    });
    expect(SANADA_YUKIMURA.noblePhantasm.effects.map(({ kind, order }) => ({ kind, order })))
      .toEqual([
        { kind: "effect", order: 1 }, { kind: "effect", order: 2 },
        { kind: "effect", order: 3 }, { kind: "attack", order: 4 },
        { kind: "effect", order: 5 }, { kind: "effect", order: 6 },
      ]);
    expect(SANADA_YUKIMURA.noblePhantasm.effects[3]).toMatchObject({
      kind: "attack",
      targetScope: "all",
      hitWeights: [1, 1, 1, 1],
      damageMultiplierPermilleByLevel: [3_000, 4_000, 4_500, 4_750, 5_000],
    });
    expect(ORIGINAL_SERVANT_DEFINITIONS.map(({ collectionNo }) => collectionNo))
      .toEqual([7, 24, 57, 58, 62, 70, 94, 105, 107]);
    expect(initialAllySelectionForServant(SANADA_YUKIMURA.dataId))
      .toMatchObject({ level: 90, noblePhantasmLevel: 1 });
    expect(registeredServantWikiUrl(SANADA_YUKIMURA.dataId))
      .toBe("https://w.atwiki.jp/siroi_human/pages/813.html");
    expect(sanada().unresolvedEffectStableIds).toEqual([]);
  });

  it("resolves every upgraded skill, class skill, and attack-debuff removal with common effects", () => {
    const { source, state } = baseState();
    const registry = createBattleActionEffectDataRegistry([source.actionEffectData]);
    const first = resolveAllySkillUse({
      state, registry, sourceInstanceId: "sanada",
      skillStableId: "sanada-yukimura-six-coins-cleave-through-the-storm",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("sanada-skill-one").stream("effects"),
    });
    expect(first).toMatchObject({ accepted: true });
    if (!first.accepted) return;
    expect(findUnitLocation(first.state.formation, "sanada")?.unit).toMatchObject({
      np: 0,
      skillCooldowns: [8, 0, 0],
      effects: expect.arrayContaining([
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 300, flags: { cardType: "buster" } }),
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.noblePhantasmDamage, value: 300 }),
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.buffRemovalResistance, value: 1_000, remainingUses: 1 }),
      ]),
    });
    expect(findUnitLocation(first.state.formation, "ally-b")?.unit.np).toBe(2_000);
    expect(findUnitLocation(first.state.formation, "ally-c")?.unit.np).toBe(2_000);

    const second = resolveAllySkillUse({
      state, registry, sourceInstanceId: "sanada",
      skillStableId: "sanada-yukimura-selfless-devotion",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("sanada-skill-two").stream("effects"),
    });
    expect(second).toMatchObject({ accepted: true });
    if (!second.accepted) return;
    expect(findUnitLocation(second.state.formation, "sanada")?.unit).toMatchObject({
      skillCooldowns: [0, 9, 0],
      effects: expect.arrayContaining([
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.guts, value: 2_000, remainingUses: 1, durationTick: "opponent_turn_end" }),
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.defense, value: 200 }),
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.damageCut, value: 250 }),
      ]),
    });

    const attackDown = applyEffect(
      source.unit,
      { stableId: "sanada-test-attack-down", name: "攻撃力ダウン", effectType: COMMON_EFFECT_TYPES.attack, category: "debuff", classifications: ["attack"], value: -300, remainingTurns: 3 },
      "enemy",
      createEffectRuntimeCounters(),
    );
    const withAttackDown = replaceUnit(state.formation, attackDown.unit);
    const third = resolveAllySkillUse({
      state: { ...state, formation: withAttackDown }, registry, sourceInstanceId: "sanada",
      skillStableId: "sanada-yukimura-sanada-red-armour",
      counters: attackDown.counters,
      rng: new BattleRng("sanada-skill-three").stream("effects"),
    });
    expect(third).toMatchObject({ accepted: true });
    if (!third.accepted) return;
    const sanadaEffects = findUnitLocation(third.state.formation, "sanada")?.unit.effects ?? [];
    expect(sanadaEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.invincibility, remainingTurns: 1, durationTick: "opponent_turn_end" }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 300, flags: { cardType: "buster" } }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.defense, value: 300 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.debuffResistance, value: 500 }),
    ]));
    expect(sanadaEffects.some(({ stableId }) => stableId === "sanada-test-attack-down"))
      .toBe(false);
    expect(findUnitLocation(third.state.formation, "ally-b")?.unit.effects)
      .toEqual(expect.arrayContaining([expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 300 })]));

    const passives = initializeBattlePassives(
      state,
      registry,
      createEffectRuntimeCounters(),
      new BattleRng("sanada-passives").stream("effects"),
    );
    expect(passives.unresolvedEffectStableIds).toEqual([]);
    expect(findUnitLocation(passives.state.formation, "sanada")?.unit.effects)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.debuffResistance, value: 150, removalPolicy: "unremovable" }),
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 80, flags: { cardType: "quick" }, removalPolicy: "unremovable" }),
      ]));
  });

  it("uses the one-attack common ignore-defense state between the NP's source-ordered effects", () => {
    const { source, state: initialState } = baseState(10_000);
    const defense = applyEffect(
      unit("enemy", "enemy", { hp: 10_000_000, maxHp: 10_000_000, baseMaxHp: 10_000_000 }),
      { stableId: "sanada-test-defense-up", name: "防御力アップ", effectType: COMMON_EFFECT_TYPES.defense, category: "buff", classifications: ["defense"], value: 300, remainingTurns: 3 },
      "enemy",
      createEffectRuntimeCounters(),
    );
    let state = {
      ...initialState,
      formation: replaceUnit(initialState.formation, defense.unit),
      commandStarDistributionMode: "legacy_on_command_confirmation" as const,
      commandStarDistribution: null,
      commandDeck: {
        ...initialState.commandDeck,
        currentHand: initialState.commandDeck.sourceCards.slice(0, 5),
      },
    };
    const np = listCommandCardChoices(state).find(({ card }) =>
      card.kind === "noble_phantasm" && card.ownerInstanceId === "sanada",
    )?.card;
    if (!np) throw new Error("真田信繁の宝具カードがありません");
    const selected = selectCommandCards(state, [
      np.cardId,
      ...state.commandDeck.currentHand.slice(0, 2).map(({ cardId }) => cardId),
    ]);
    if (!selected.accepted) throw new Error("真田信繁の宝具選択に失敗しました");
    const random = new BattleRng("sanada-np-defense-ignore");
    const resolved = resolveAllyCommandAttacks({
      state,
      selection: selected.selection,
      registry: createBattleAttackDataRegistry([
        source.attackData,
        combatantData("ally-b", "ally-b"),
        combatantData("ally-c", "ally-c"),
        combatantData("enemy", "enemy"),
      ]),
      actionEffectRegistry: createBattleActionEffectDataRegistry([source.actionEffectData]),
      counters: defense.counters,
      rng: {
        effects: random.stream("effects"), critical: random.stream("critical"),
        damage: random.stream("damage"), stars: random.stream("stars"),
      },
      requestedTargetInstanceId: "enemy",
    });
    expect(resolved.sequence.accepted).toBe(true);
    if (!resolved.sequence.accepted) return;
    const detail = resolved.sequence.result.actions[0]?.resolverDetail as AllyCommandAttackDetail;
    expect(detail).toMatchObject({
      outcome: "resolved",
      calculation: { npDamageMultiplierPermille: 3_000 },
    });
    if (detail.outcome !== "resolved") return;
    expect(detail.resolution.attack?.attack.hits).toHaveLength(4);
    expect(detail.resolution.attack?.attack.hits[0]?.hitDefense).toMatchObject({
      ignoreDefense: true,
      defenseModPermille: 0,
    });
    expect(detail.declaredEffects.map(({ phase }) => phase))
      .toEqual(["before_attack", "after_attack"]);
    expect(detail.declaredEffects[0]?.result.effects.map(({ effectStableId }) => effectStableId))
      .toEqual([
        "sanada-yukimura-np-damage-up",
        "sanada-yukimura-np-buster-resistance-down",
        "sanada-yukimura-np-ignore-defense",
      ]);
    expect(findUnitLocation(resolved.sequence.result.state.formation, "sanada")?.unit.effects
      .some(({ effectType }) => effectType === COMMON_EFFECT_TYPES.ignoreDefense)).toBe(false);
  });

  it("uses only source-confirmed formal icons", () => {
    expect(registeredSkillIconPath("六文銭、風雲を裂く"))
      .toContain("skill-card-buster-up.png");
    expect(registeredSkillIconPath("不惜身命")).toContain("skill-guts.png");
    expect(registeredSkillIconPath("真田の赤備え"))
      .toContain("skill-immune-invincibility.png");
    const { source, state } = baseState();
    const resolved = resolveAllySkillUse({
      state,
      registry: createBattleActionEffectDataRegistry([source.actionEffectData]),
      sourceInstanceId: "sanada",
      skillStableId: "sanada-yukimura-selfless-devotion",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("sanada-icons").stream("effects"),
    });
    if (!resolved.accepted) throw new Error("真田信繁の第二スキルに失敗しました");
    const effects = findUnitLocation(resolved.state.formation, "sanada")?.unit.effects ?? [];
    expect(unspecifiedEffectNames(effects)).toEqual([]);
    expect(registeredStatusIconPath(effects.find(({ effectType }) => effectType === COMMON_EFFECT_TYPES.guts)!))
      .toContain("Gutsstatus.webp");
    expect(registeredStatusIconPath(effects.find(({ effectType }) => effectType === COMMON_EFFECT_TYPES.damageCut)!))
      .toContain("Defenseup.webp");
  });
});
