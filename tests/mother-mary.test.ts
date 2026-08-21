import { describe, expect, it } from "vitest";
import { createBattleAttackDataRegistry } from "../src/core/battle/actionData";
import { findUnitLocation, replaceUnit } from "../src/core/battle/formation";
import {
  beginAllyTurnEnd,
  beginEnemyTurnEnd,
} from "../src/core/battle/progression";
import {
  createBattleSuspendSave,
  replayBattleSession,
  resolveBattleSessionAllySkill,
  restoreBattleSession,
} from "../src/core/battle/session";
import { createBattleState } from "../src/core/battle/state";
import {
  resolveAllyTurnEnd,
  resolveEnemyTurnEnd,
} from "../src/core/battle/turnEndCoordinator";
import { BattleRng } from "../src/core/rng";
import {
  resolveAllyCommandAttacks,
  type AllyCommandAttackDetail,
} from "../src/core/cards/commandAttack";
import { listCommandCardChoices, selectCommandCards } from "../src/core/cards/selection";
import {
  DOMINATION_FOREIGNER,
  LIGHT_KOYANSKAYA,
  MOTHER_MARY,
  ORIGINAL_SERVANT_DEFINITIONS,
  createServantBattleInstance,
} from "../src/data/servants";
import { createBattleActionEffectDataRegistry } from "../src/effects/actionData";
import { initializeBattlePassives } from "../src/effects/actionExecution";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import { applyEffect, createEffectRuntimeCounters } from "../src/effects/runtime";
import { resolveAllySkillUse } from "../src/effects/skillExecution";
import { resolveSideTurnEnd } from "../src/effects/turnEnd";
import { calculateDamage } from "../src/formulas/damage";
import { presentNoblePhantasmDetail, registeredServantWikiUrl } from "../src/ui/battleUi";
import {
  registeredSkillIconPath,
  registeredStatusIconPath,
  unspecifiedEffectNames,
} from "../src/ui/iconRegistry";
import {
  createEmptyInitialBattleSetup,
  createInitialBattleSession,
  emptyInitialAllySlot,
  initialAllySelectionForServant,
} from "../src/ui/initialBattle";
import { combatantData } from "./helpers/attackData";
import { unit } from "./helpers/battle";

function mary(instanceId: string, initialNp = 0) {
  return createServantBattleInstance(MOTHER_MARY, {
    instanceId,
    level: 90,
    noblePhantasmLevel: 1,
    initialNp,
  });
}

function effectsOf(state: ReturnType<typeof createBattleState>, instanceId: string) {
  return findUnitLocation(state.formation, instanceId)?.unit.effects ?? [];
}

describe("No.070 聖母マリア", () => {
  it("registers the final-ascension current-upgraded data and original No. order", () => {
    expect(MOTHER_MARY).toMatchObject({
      collectionNo: 70,
      name: "聖母マリア",
      rarity: 5,
      classDisplayName: "フォーリナー",
      growthTendency: "HP偏重",
      attackType: "魔術",
      classKey: "foreigner",
      attributeKey: "earth",
      commandCards: ["quick", "arts", "arts", "arts", "buster"],
      battleRates: {
        attackNpUnits: 43,
        receivedNpUnits: 300,
        starRatePermille: 145,
        starWeight: 156,
        deathRatePermille: 55,
      },
    });
    expect(MOTHER_MARY.levelStats).toEqual([
      { level: 1, hp: 2_347, attack: 1_575 },
      { level: 50, hp: 9_282, attack: 5_914 },
      { level: 60, hp: 10_083, attack: 6_424 },
      { level: 70, hp: 11_523, attack: 7_341 },
      { level: 80, hp: 13_604, attack: 8_667 },
      { level: 90, hp: 16_005, attack: 10_197 },
      { level: 100, hp: 17_534, attack: 11_162 },
      { level: 120, hp: 20_607, attack: 13_102 },
    ]);
    expect(MOTHER_MARY.commandCardHitWeights.map(({ length }) => length))
      .toEqual([3, 4, 4, 4, 3]);
    expect(MOTHER_MARY.extraAttackHitWeights).toHaveLength(7);
    expect(MOTHER_MARY.traits).toEqual([
      "サーヴァント", "人型", "女性", "秩序", "善", "地の力", "神性",
      "領域外の生命", "ヒト科", "人類の脅威", "クトゥルフ", "対人",
      "エヌマ特攻無効",
    ]);
    expect(MOTHER_MARY.activeSkills.map(
      ({ name, rank, cooldownAtMax }) => ({ name, rank, cooldownAtMax }),
    )).toEqual([
      { name: "聖霊の加護", rank: undefined, cooldownAtMax: 7 },
      { name: "身籠る聖処女", rank: "A++", cooldownAtMax: 7 },
      { name: "外道の知識（姉なるもの）", rank: "EX", cooldownAtMax: 3 },
    ]);
    expect(MOTHER_MARY.noblePhantasm).toMatchObject({
      name: "千の仔を孕みし森の黒山羊",
      reading: "マザー・オブ・オール",
      rank: "A++",
      cardType: "arts",
    });
    expect(ORIGINAL_SERVANT_DEFINITIONS.map(({ collectionNo }) => collectionNo))
      .toEqual([7, 24, 57, 62, 70]);
    expect(initialAllySelectionForServant(MOTHER_MARY.dataId))
      .toMatchObject({ level: 90, noblePhantasmLevel: 1 });
    expect(registeredServantWikiUrl(MOTHER_MARY.dataId))
      .toBe("https://w.atwiki.jp/siroi_human/pages/781.html");
    expect(mary("mary").unresolvedEffectStableIds).toEqual([]);
  });

  it("applies all class skills and settles the Saint recovery and stars", () => {
    const source = mary("mary");
    const state = createBattleState({
      ally: {
        frontline: [{ ...source.unit, hp: 10_000 }, unit("ally-b", "ally"), unit("ally-c", "ally")],
        reserve: [],
      },
      waves: [{ enemy: { frontline: [unit("enemy", "enemy"), null, null], reserve: [] } }],
      enemyFrontlineLimit: 3,
    });
    const initialized = initializeBattlePassives(
      state,
      createBattleActionEffectDataRegistry([source.actionEffectData]),
      createEffectRuntimeCounters(),
      new BattleRng("mary-passives").stream("effects"),
    );
    const passiveEffects = effectsOf(initialized.state, "mary");
    expect(passiveEffects.map(({ stableId }) => stableId)).toEqual([
      "mother-mary-outside-domain-stars-state",
      "mother-mary-outside-domain-resistance-state",
      "mother-mary-madness-buster-state",
      "mother-mary-divinity-fixed-damage-state",
      "mother-mary-magic-resistance-debuff-state",
      "mother-mary-saint-resistance-state",
      "mother-mary-saint-recurring-heal-state",
    ]);
    expect(unspecifiedEffectNames(passiveEffects)).toEqual([]);

    const ended = resolveSideTurnEnd(
      initialized.state.formation,
      "ally",
      initialized.counters,
      new BattleRng("mary-passive-end").stream("effects"),
      {
        resolveStarGain: ({ requested }) => ({
          bucket: "next_command", requested, before: 0,
          added: requested, after: requested, overflow: 0,
        }),
      },
    );
    expect(findUnitLocation(ended.formation, "mary")?.unit.hp).toBe(10_210);
    expect(ended.activations.flatMap(({ actions }) => actions)
      .filter(({ starGainRequest }) => starGainRequest)
      .map(({ starGainRequest }) => starGainRequest?.requested)).toEqual([2]);
  });

  it("resolves the strengthened Skill 1 targets and Skill 3 recurring recovery", () => {
    const source = mary("mary");
    const state = createBattleState({
      ally: {
        frontline: [
          { ...source.unit, hp: 10_000 },
          unit("outside-ally", "ally", {
            hp: 5_000, traits: ["領域外の生命"], skillCooldowns: [5, 4, 3],
          }),
          unit("ordinary-ally", "ally", { hp: 5_000, skillCooldowns: [5, 4, 3] }),
        ],
        reserve: [unit("outside-reserve", "ally", { traits: ["領域外の生命"] })],
      },
      waves: [{ enemy: { frontline: [unit("enemy", "enemy"), null, null], reserve: [] } }],
      enemyFrontlineLimit: 3,
    });
    const registry = createBattleActionEffectDataRegistry([source.actionEffectData]);
    const skillOne = resolveAllySkillUse({
      state,
      registry,
      sourceInstanceId: "mary",
      skillStableId: "mother-mary-holy-spirit-protection",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("mary-skill-one").stream("effects"),
    });
    expect(skillOne.accepted).toBe(true);
    if (!skillOne.accepted) return;
    expect(skillOne.effects.effects.map(({ targetInstanceIds }) => targetInstanceIds))
      .toEqual([
        ["mary", "outside-ally", "ordinary-ally"],
        ["mary", "outside-ally", "ordinary-ally"],
        ["mary", "outside-ally", "ordinary-ally"],
        ["mary", "outside-ally"],
        ["mary", "outside-ally"],
        ["mary", "outside-ally"],
      ]);
    expect(findUnitLocation(skillOne.state.formation, "mary")?.unit)
      .toMatchObject({ hp: 14_000, np: 4_000, skillCooldowns: [6, 0, 0] });
    expect(findUnitLocation(skillOne.state.formation, "outside-ally")?.unit)
      .toMatchObject({ hp: 9_000, np: 4_000, skillCooldowns: [4, 3, 2] });
    expect(findUnitLocation(skillOne.state.formation, "ordinary-ally")?.unit)
      .toMatchObject({ hp: 7_000, np: 2_000, skillCooldowns: [5, 4, 3] });
    expect(effectsOf(skillOne.state, "outside-reserve")).toEqual([]);

    const skillThree = resolveAllySkillUse({
      state,
      registry,
      sourceInstanceId: "mary",
      skillStableId: "mother-mary-knowledge-of-the-heretic",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("mary-skill-three").stream("effects"),
    });
    expect(skillThree.accepted).toBe(true);
    if (!skillThree.accepted) return;
    const ended = resolveSideTurnEnd(
      skillThree.state.formation,
      "ally",
      skillThree.counters,
      new BattleRng("mary-skill-three-end").stream("effects"),
    );
    expect(findUnitLocation(ended.formation, "mary")?.unit.hp).toBe(11_000);
    expect(findUnitLocation(ended.formation, "outside-ally")?.unit.hp).toBe(6_000);
    expect(findUnitLocation(ended.formation, "ordinary-ally")?.unit.hp).toBe(6_000);
  });

  it("keeps Skill 2 target focus and solemn defense through the enemy action window", () => {
    const source = mary("mary");
    const state = createBattleState({
      ally: { frontline: [source.unit, unit("ally-b", "ally"), unit("ally-c", "ally")], reserve: [] },
      waves: [{ enemy: { frontline: [unit("enemy", "enemy"), null, null], reserve: [] } }],
      enemyFrontlineLimit: 3,
    });
    const result = resolveAllySkillUse({
      state,
      registry: createBattleActionEffectDataRegistry([source.actionEffectData]),
      sourceInstanceId: "mary",
      skillStableId: "mother-mary-pregnant-holy-virgin",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("mary-skill-two").stream("effects"),
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(findUnitLocation(result.state.formation, "mary")?.unit).toMatchObject({
      np: 3_000,
      skillCooldowns: [0, 7, 0],
      effects: expect.arrayContaining([
        expect.objectContaining({
          effectType: COMMON_EFFECT_TYPES.targetFocus,
          value: 3_000,
          remainingTurns: 1,
          durationTick: "opponent_turn_end",
        }),
        expect.objectContaining({
          effectType: COMMON_EFFECT_TYPES.solemnDefense,
          remainingTurns: 1,
          durationTick: "opponent_turn_end",
        }),
      ]),
    });
    expect(unspecifiedEffectNames(effectsOf(result.state, "mary"))).toEqual([]);

    const allyEnd = resolveAllyTurnEnd(
      beginAllyTurnEnd(result.state),
      result.counters,
      new BattleRng("mary-skill-two-ally-end").stream("effects"),
    );
    expect(effectsOf(allyEnd.state, "mary")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        effectType: COMMON_EFFECT_TYPES.targetFocus,
        remainingTurns: 1,
      }),
      expect.objectContaining({
        effectType: COMMON_EFFECT_TYPES.solemnDefense,
        remainingTurns: 1,
      }),
    ]));
    expect(allyEnd.durations.durations.flatMap(({ removed }) => removed))
      .toEqual([]);

    const enemyEnd = resolveEnemyTurnEnd(
      beginEnemyTurnEnd(allyEnd.state),
      allyEnd.counters,
      new BattleRng("mary-skill-two-enemy-end").stream("effects"),
    );
    expect(effectsOf(enemyEnd.state, "mary").filter(({ effectType }) =>
      effectType === COMMON_EFFECT_TYPES.targetFocus
      || effectType === COMMON_EFFECT_TYPES.solemnDefense
    )).toEqual([]);
    expect(enemyEnd.durations.durations.flatMap(({ removed }) =>
      removed.map(({ effect }) => effect.stableId)
    )).toEqual([
      "mother-mary-holy-virgin-target-focus-state",
      "mother-mary-holy-virgin-solemn-defense-state",
    ]);
  });

  it("resolves the final-ascension strengthened NP at OC3 in source order", () => {
    const source = mary("mary", 10_000);
    const outsideAlly = createServantBattleInstance(DOMINATION_FOREIGNER, {
      instanceId: "outside-ally", level: 90, noblePhantasmLevel: 1,
    });
    const ordinaryAlly = createServantBattleInstance(LIGHT_KOYANSKAYA, {
      instanceId: "ordinary-ally", level: 90, noblePhantasmLevel: 1,
    });
    const skyEnemy = unit("sky-enemy", "enemy", {
      dataId: "sky-enemy-data",
      traits: ["天の力"],
      hp: 10_000_000,
      maxHp: 10_000_000,
      baseMaxHp: 10_000_000,
    });
    let state = createBattleState({
      ally: {
        frontline: [
          { ...source.unit, hp: 10_000 },
          { ...outsideAlly.unit, hp: 5_000 },
          { ...ordinaryAlly.unit, hp: 5_000 },
        ],
        reserve: [],
      },
      waves: [{ enemy: { frontline: [skyEnemy, null, null], reserve: [] } }],
      enemyFrontlineLimit: 3,
    });
    const overcharge = applyEffect(
      findUnitLocation(state.formation, "mary")!.unit,
      {
        stableId: "test-oc-up",
        name: "宝具OC段階アップ",
        effectType: COMMON_EFFECT_TYPES.noblePhantasmOverchargeStage,
        category: "buff",
        value: 2,
        remainingTurns: 3,
        remainingUses: 1,
      },
      "mary",
      createEffectRuntimeCounters(),
    );
    state = {
      ...state,
      formation: replaceUnit(state.formation, overcharge.unit),
      commandStarDistributionMode: "legacy_on_command_confirmation",
      commandStarDistribution: null,
      commandDeck: {
        ...state.commandDeck,
        currentHand: state.commandDeck.sourceCards.slice(0, 5),
      },
    };
    const choices = listCommandCardChoices(state);
    const np = choices.find(({ card }) =>
      card.kind === "noble_phantasm" && card.ownerInstanceId === "mary"
    )?.card;
    if (!np) throw new Error("聖母マリアの宝具カードがありません");
    const selected = selectCommandCards(state, [
      np.cardId,
      ...state.commandDeck.currentHand.slice(0, 2).map(({ cardId }) => cardId),
    ]);
    if (!selected.accepted) throw new Error("聖母マリアのカード選択に失敗しました");

    const random = new BattleRng("mary-np-oc3");
    const resolved = resolveAllyCommandAttacks({
      state,
      selection: selected.selection,
      registry: createBattleAttackDataRegistry([
        source.attackData,
        outsideAlly.attackData,
        ordinaryAlly.attackData,
        combatantData("sky-enemy", "sky-enemy-data"),
      ]),
      actionEffectRegistry: createBattleActionEffectDataRegistry([source.actionEffectData]),
      counters: overcharge.counters,
      rng: {
        effects: random.stream("effects"),
        critical: random.stream("critical"),
        damage: random.stream("damage"),
        stars: random.stream("stars"),
      },
      requestedTargetInstanceId: "sky-enemy",
    });
    expect(resolved.sequence.accepted).toBe(true);
    if (!resolved.sequence.accepted) return;
    const detail = resolved.sequence.result.actions[0]
      ?.resolverDetail as AllyCommandAttackDetail;
    expect(detail).toMatchObject({
      outcome: "resolved",
      overchargeStage: 3,
      calculation: {
        npDamageMultiplierPermille: 6_000,
        npSpecialAttackPermille: 1_750,
      },
    });
    if (detail.outcome !== "resolved") return;
    expect(detail.resolution.attack?.attack.targets[0]?.damageBreakdown)
      .toMatchObject({ powerFactorPermille: 1_300 });
    expect(detail.declaredEffects.map(({ phase }) => phase))
      .toEqual(["before_attack", "after_attack"]);
    expect(detail.declaredEffects[0]?.result.effects.map(({ effectStableId }) => effectStableId))
      .toEqual(["mother-mary-np-damage-up"]);
    expect(detail.declaredEffects[1]?.result.effects.map(
      ({ effectStableId, targetInstanceIds, resolvedAmount }) => ({
        effectStableId,
        targetInstanceIds,
        ...(resolvedAmount === undefined ? {} : { resolvedAmount }),
      }),
    )).toEqual([
      {
        effectStableId: "mother-mary-np-outside-domain-heal",
        targetInstanceIds: ["mary", "outside-ally"],
        resolvedAmount: 2_500,
      },
      {
        effectStableId: "mother-mary-np-outside-domain-np",
        targetInstanceIds: ["mary", "outside-ally"],
        resolvedAmount: 2_000,
      },
      {
        effectStableId: "mother-mary-np-outside-domain-max-hp",
        targetInstanceIds: ["mary", "outside-ally"],
      },
    ]);
    const finalState = resolved.sequence.result.state;
    expect(findUnitLocation(finalState.formation, "mary")?.unit)
      .toMatchObject({ hp: 14_500, maxHp: 18_005, np: 4_643 });
    expect(findUnitLocation(finalState.formation, "outside-ally")?.unit)
      .toMatchObject({ hp: 9_500, maxHp: 15_095, np: 2_000 });
    expect(findUnitLocation(finalState.formation, "ordinary-ally")?.unit)
      .toMatchObject({ hp: 5_000, maxHp: 13_081, np: 0 });
  });

  it("applies pre-attack NP power, Earth-Sky disadvantage, and Sky special attack in the initial battle", () => {
    const setup = {
      ...createEmptyInitialBattleSetup(),
      frontline: [
        initialAllySelectionForServant(MOTHER_MARY.dataId),
        initialAllySelectionForServant(DOMINATION_FOREIGNER.dataId),
        initialAllySelectionForServant(LIGHT_KOYANSKAYA.dataId),
      ],
      reserve: [emptyInitialAllySlot(), emptyInitialAllySlot(), emptyInitialAllySlot()],
      seedMode: "fixed" as const,
      seed: "mary-initial-oc1-damage",
      mysticCodeDataId: "normal-chaldea-uniform",
    };
    const started = createInitialBattleSession(setup);
    const source = findUnitLocation(
      started.loop.state.formation,
      "ally-frontline-1",
    )?.unit;
    if (!source || !started.actionEffectRegistry) {
      throw new Error("初期戦闘の聖母マリアまたは効果レジストリがありません");
    }
    const state = {
      ...started.loop.state,
      formation: replaceUnit(started.loop.state.formation, {
        ...source,
        np: 10_000,
      }),
    };
    const enemy = findUnitLocation(state.formation, "enemy-w1-1")?.unit;
    expect(enemy?.traits).toContain("天の力");
    expect(started.registry.affinities.attribute.earth?.sky).toBe(900);

    const np = listCommandCardChoices(state).find(({ card }) =>
      card.kind === "noble_phantasm"
        && card.ownerInstanceId === "ally-frontline-1"
    )?.card;
    if (!np) throw new Error("初期戦闘の聖母マリア宝具カードがありません");
    const selected = selectCommandCards(state, [
      np.cardId,
      ...state.commandDeck.currentHand.slice(0, 2).map(({ cardId }) => cardId),
    ]);
    if (!selected.accepted) throw new Error("初期戦闘のカード選択に失敗しました");
    const random = new BattleRng("mary-initial-oc1-damage-resolution");
    const resolved = resolveAllyCommandAttacks({
      state,
      selection: selected.selection,
      registry: started.registry,
      actionEffectRegistry: started.actionEffectRegistry,
      counters: started.loop.counters,
      rng: {
        effects: random.stream("effects"),
        critical: random.stream("critical"),
        damage: random.stream("damage"),
        stars: random.stream("stars"),
      },
      requestedTargetInstanceId: "enemy-w1-1",
    });
    expect(resolved.sequence.accepted).toBe(true);
    if (!resolved.sequence.accepted) return;
    const detail = resolved.sequence.result.actions[0]
      ?.resolverDetail as AllyCommandAttackDetail;
    expect(detail).toMatchObject({
      outcome: "resolved",
      overchargeStage: 1,
      calculation: {
        npDamageMultiplierPermille: 6_000,
        npSpecialAttackPermille: 1_500,
      },
    });
    if (detail.outcome !== "resolved") return;
    const target = detail.resolution.attack?.attack.targets.find(
      ({ targetInstanceId }) => targetInstanceId === "enemy-w1-1",
    );
    expect(target?.damageBreakdown).toMatchObject({
      powerFactorPermille: 1_300,
    });
    expect(target?.totalDamage).toBeGreaterThanOrEqual(22_401);
    expect(target?.totalDamage).toBeLessThanOrEqual(27_316);
    expect([900, 1_000, 1_099].map((randomModifierPermille) =>
      calculateDamage({
        attack: 10_197,
        isNoblePhantasm: true,
        npDamageMultiplierPermille: 6_000,
        cardDamageValuePermille: 1_000,
        classAttackCoefficientPermille: 1_000,
        classAffinityPermille: 1_000,
        attributeAffinityPermille: 900,
        randomModifierPermille,
        npDamageModPermille: 300,
        npSpecialAttackPermille: 1_500,
        fixedDamage: 175,
      }).damage
    )).toEqual([22_401, 24_871, 27_316]);
  });

  it("preserves Skill 2 states through schema-4 save, restore, and replay", () => {
    const setup = {
      ...createEmptyInitialBattleSetup(),
      frontline: [
        initialAllySelectionForServant(MOTHER_MARY.dataId),
        initialAllySelectionForServant(DOMINATION_FOREIGNER.dataId),
        initialAllySelectionForServant(LIGHT_KOYANSKAYA.dataId),
      ],
      reserve: [emptyInitialAllySlot(), emptyInitialAllySlot(), emptyInitialAllySlot()],
      seedMode: "fixed" as const,
      seed: "mary-save-replay",
      mysticCodeDataId: "normal-chaldea-uniform",
    };
    const started = createInitialBattleSession(setup);
    const used = resolveBattleSessionAllySkill(started, {
      kind: "ally_skill",
      sourceInstanceId: "ally-frontline-1",
      skillStableId: "mother-mary-pregnant-holy-virgin",
    });
    expect(used.result.accepted).toBe(true);
    const save = createBattleSuspendSave(used.session);
    const restored = restoreBattleSession(save);
    const replayed = replayBattleSession(save);
    expect(save).toMatchObject({ schemaVersion: 4, dataSchemaVersion: "1.38.0" });
    expect(replayed.loop.state).toEqual(restored.loop.state);
    expect(replayed.loop.rng.snapshot()).toEqual(restored.loop.rng.snapshot());
    expect(replayed.operationHistory).toEqual(restored.operationHistory);
    expect(effectsOf(restored.loop.state, "ally-frontline-1"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          effectType: COMMON_EFFECT_TYPES.targetFocus,
          durationTick: "opponent_turn_end",
        }),
        expect.objectContaining({
          effectType: COMMON_EFFECT_TYPES.solemnDefense,
          durationTick: "opponent_turn_end",
        }),
      ]));
  });

  it("uses only registered formal icons and presents the OC special attack", () => {
    expect(registeredSkillIconPath("聖霊の加護"))
      .toBe("/FGO_Battle_Simulator_Work/assets/skill-icons/skill-immune-invincibility.png");
    expect(registeredSkillIconPath("身籠る聖処女"))
      .toBe("/FGO_Battle_Simulator_Work/assets/skill-icons/skill-np-charge.png");
    expect(registeredSkillIconPath("外道の知識（姉なるもの）"))
      .toBe("/FGO_Battle_Simulator_Work/assets/skill-icons/skill-hp-heal-per-turn.png");

    const iconEffect = {
      stableId: "icon",
      instanceId: "effect-1",
      name: "ターゲット集中",
      effectType: COMMON_EFFECT_TYPES.targetFocus,
      category: "buff" as const,
      removalPolicy: "removable" as const,
      durationTick: "owner_turn_end" as const,
      flags: {},
      sourceInstanceId: "mary",
      targetInstanceId: "mary",
      classifications: [],
      value: 3_000,
      remainingTurns: 1,
      remainingUses: null,
      registrationOrder: 1,
    };
    expect(registeredStatusIconPath(iconEffect))
      .toBe("/FGO_Battle_Simulator_Work/assets/status-icons/Tauntup.webp");
    expect(registeredStatusIconPath({
      ...iconEffect,
      name: "対粛清防御",
      effectType: COMMON_EFFECT_TYPES.solemnDefense,
      value: 0,
    })).toBe("/FGO_Battle_Simulator_Work/assets/status-icons/Specialinvincible.webp");
    expect(registeredStatusIconPath({
      ...iconEffect,
      name: "毎ターンHP回復",
      effectType: COMMON_EFFECT_TYPES.recurringHpRecovery,
      value: 1_000,
    })).toBe("/FGO_Battle_Simulator_Work/assets/status-icons/Hpregen.webp");
    expect(registeredStatusIconPath({
      ...iconEffect,
      name: "最大HPアップ",
      effectType: COMMON_EFFECT_TYPES.maxHpChange,
      value: 2_000,
    })).toBe("/FGO_Battle_Simulator_Work/assets/status-icons/Maxhpup.webp");

    expect(presentNoblePhantasmDetail(mary("detail").unit)).toMatchObject({
      title: "千の仔を孕みし森の黒山羊",
      rank: "A++",
      descriptions: expect.arrayContaining([
        "＆〔天の力を持つ敵〕特攻<OC:特攻威力UP>：150% / 162.5% / 175% / 187.5% / 200%",
      ]),
    });
  });
});
