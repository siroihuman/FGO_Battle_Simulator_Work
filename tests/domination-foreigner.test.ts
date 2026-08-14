import { describe, expect, it } from "vitest";
import {
  createBattleAttackDataRegistry,
} from "../src/core/battle/actionData";
import {
  findUnitLocation,
  replaceUnit,
} from "../src/core/battle/formation";
import {
  createBattleSuspendSave,
  replayBattleSession,
  resolveBattleSessionAllySkill,
  restoreBattleSession,
} from "../src/core/battle/session";
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
  DOMINATION_FOREIGNER,
  LIGHT_KOYANSKAYA,
  createServantBattleInstance,
} from "../src/data/servants";
import {
  createBattleActionEffectDataRegistry,
} from "../src/effects/actionData";
import {
  initializeBattlePassives,
} from "../src/effects/actionExecution";
import {
  calculateEffectApplicationRate,
} from "../src/effects/application";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import {
  advanceOwnerTurnEnd,
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import { resolveAllySkillUse } from "../src/effects/skillExecution";
import { resolveSideTurnEnd } from "../src/effects/turnEnd";
import {
  effectValueLabel,
} from "../src/ui/effectPresentation";
import {
  presentNoblePhantasmDetail,
} from "../src/ui/battleUi";
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

function servant(instanceId: string, initialNp = 0) {
  return createServantBattleInstance(DOMINATION_FOREIGNER, {
    instanceId,
    level: 90,
    noblePhantasmLevel: 1,
    initialNp,
  });
}

function effectIds(instanceId: string, formation: ReturnType<typeof createBattleState>["formation"]) {
  return findUnitLocation(formation, instanceId)?.unit.effects.map(
    ({ stableId }) => stableId,
  ) ?? [];
}

describe("No.024’ 支配のフォーリナー", () => {
  it("registers exact current-upgraded data and fixed Human-force special attack", () => {
    expect(DOMINATION_FOREIGNER).toMatchObject({
      collectionNo: 24,
      collectionLabel: "024’",
      name: "支配のフォーリナー",
      rarity: 5,
      classDisplayName: "フォーリナー",
      growthTendency: "ATK偏重",
      attackType: "魔術",
      classKey: "foreigner",
      attributeKey: "earth",
      commandCards: ["quick", "arts", "arts", "arts", "buster"],
      battleRates: {
        attackNpUnits: 78,
        receivedNpUnits: 300,
        starRatePermille: 145,
        starWeight: 145,
        deathRatePermille: 50,
      },
      traits: [
        "サーヴァント",
        "性別不明",
        "混沌",
        "悪",
        "地の力",
        "人の力",
        "神性",
        "領域外の生命",
        "人類の脅威",
        "クトゥルフ",
        "エヌマ特攻無効",
      ],
    });
    expect(DOMINATION_FOREIGNER.levelStats).toEqual([
      { level: 1, hp: 1_920, attack: 1_944 },
      { level: 50, hp: 7_857, attack: 7_550 },
      { level: 60, hp: 8_773, attack: 8_431 },
      { level: 70, hp: 9_952, attack: 9_563 },
      { level: 80, hp: 11_392, attack: 10_948 },
      { level: 90, hp: 13_095, attack: 12_584 },
      { level: 100, hp: 14_346, attack: 13_775 },
      { level: 120, hp: 16_860, attack: 16_169 },
    ]);
    expect(DOMINATION_FOREIGNER.commandCardHitWeights.map(
      (weights) => weights.length,
    )).toEqual([5, 2, 2, 2, 4]);
    expect(DOMINATION_FOREIGNER.extraAttackHitWeights).toHaveLength(3);
    expect(DOMINATION_FOREIGNER.noblePhantasm).toMatchObject({
      name: "旧き共鳴する海底の都",
      reading: "コール・オブ・クトゥルフ",
      rank: "EX",
      cardType: "quick",
    });
    expect(DOMINATION_FOREIGNER.noblePhantasm.effects).toHaveLength(5);

    const instance = servant("domination");
    expect(instance.unresolvedEffectStableIds).toEqual([]);
    expect(instance.attackData.noblePhantasms[0]).toMatchObject({
      hitWeights: [1, 1, 1],
      damageMultiplierPermilleByLevel: [
        8_000,
        10_000,
        11_000,
        11_500,
        12_000,
      ],
      specialAttackPermille: 1_500,
      specialAttackRequiredTargetTraits: ["人の力"],
    });
    expect(
      instance.attackData.noblePhantasms[0]
        ?.specialAttackPermilleByOvercharge,
    ).toBeUndefined();
    expect(initialAllySelectionForServant(DOMINATION_FOREIGNER.dataId))
      .toMatchObject({ level: 90, noblePhantasmLevel: 1 });
    expect(DOMINATION_FOREIGNER.sources[0]?.url).toBe(
      "https://w.atwiki.jp/siroi_human/pages/766.html",
    );
  });

  it("applies all five class skills, including exact 11.75% debuff success", () => {
    const source = servant("domination");
    const state = createBattleState({
      ally: {
        frontline: [
          source.unit,
          unit("cthulhu-ally", "ally", { traits: ["クトゥルフ"] }),
          unit("ordinary-ally", "ally"),
        ],
        reserve: [unit("reserve-ally", "ally")],
      },
      waves: [{
        enemy: { frontline: [unit("enemy", "enemy"), null, null], reserve: [] },
      }],
      enemyFrontlineLimit: 3,
    });
    const initialized = initializeBattlePassives(
      state,
      createBattleActionEffectDataRegistry([source.actionEffectData]),
      createEffectRuntimeCounters(),
      new BattleRng("domination-passives").stream("effects"),
    );

    expect(effectIds("domination", initialized.state.formation)).toEqual([
      "domination-foreigner-manifester-party-np-state",
      "domination-foreigner-manifester-debuff-resistance-state",
      "domination-foreigner-water-quick-state",
      "domination-foreigner-water-fixed-damage-state",
      "domination-foreigner-outside-domain-stars-state",
      "domination-foreigner-outside-domain-debuff-resistance-state",
      "domination-foreigner-territory-arts-state",
      "domination-foreigner-item-construction-debuff-success-state",
    ]);
    expect(effectIds("cthulhu-ally", initialized.state.formation)).toEqual([
      "domination-foreigner-manifester-cthulhu-np-state",
      "domination-foreigner-manifester-party-np-state",
      "domination-foreigner-manifester-debuff-resistance-state",
    ]);
    expect(effectIds("ordinary-ally", initialized.state.formation)).toEqual([
      "domination-foreigner-manifester-party-np-state",
      "domination-foreigner-manifester-debuff-resistance-state",
    ]);
    expect(effectIds("reserve-ally", initialized.state.formation)).toEqual([]);
    const cthulhuRecurringNp = findUnitLocation(
      initialized.state.formation,
      "cthulhu-ally",
    )?.unit.effects.filter(
      ({ effectType }) => effectType === COMMON_EFFECT_TYPES.recurringNpGain,
    );
    expect(cthulhuRecurringNp?.map(({ value }) => value)).toEqual([75, 25]);
    expect(cthulhuRecurringNp?.map((effect) =>
      effectValueLabel(effect, effect.value)
    )).toEqual(["7.5%", "2.5%"]);

    const sourceUnit = findUnitLocation(
      initialized.state.formation,
      "domination",
    )?.unit;
    const exactRateEffect = sourceUnit?.effects.find(
      ({ effectType }) =>
        effectType === COMMON_EFFECT_TYPES.debuffSuccessBasisPoints,
    );
    expect(exactRateEffect).toMatchObject({ value: 1_175 });
    expect(effectValueLabel(exactRateEffect!, exactRateEffect!.value))
      .toBe("11.75%");
    expect(calculateEffectApplicationRate(
      sourceUnit!,
      unit("rate-target", "enemy"),
      {
        template: {
          stableId: "test-debuff",
          name: "テスト弱体",
          effectType: "test_debuff",
          category: "debuff",
        },
        baseRatePermille: 800,
      },
    ).resolvedRatePermille).toBe(917.5);
    expect(unspecifiedEffectNames(sourceUnit?.effects ?? [])).toEqual([]);
  });

  it("separates Skill 1 targets and applies Skill 2 only to other frontline allies", () => {
    const source = servant("domination");
    const state = createBattleState({
      ally: {
        frontline: [
          source.unit,
          unit("selected-ally", "ally"),
          unit("other-ally", "ally"),
        ],
        reserve: [unit("reserve-ally", "ally")],
      },
      waves: [{
        enemy: { frontline: [unit("enemy", "enemy"), null, null], reserve: [] },
      }],
      enemyFrontlineLimit: 3,
    });
    const registry = createBattleActionEffectDataRegistry([
      source.actionEffectData,
    ]);
    const first = resolveAllySkillUse({
      state,
      registry,
      sourceInstanceId: "domination",
      skillStableId: "domination-foreigner-eternal-search",
      selectedTargetInstanceId: "selected-ally",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("domination-skill-one").stream("effects"),
    });
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    expect(first.effects.effects.map(({ targetInstanceIds }) => targetInstanceIds))
      .toEqual([
        ["domination", "selected-ally", "other-ally"],
        ["domination", "selected-ally", "other-ally"],
        ["selected-ally"],
        ["selected-ally"],
      ]);
    expect(effectIds("reserve-ally", first.state.formation)).toEqual([]);

    const second = resolveAllySkillUse({
      state,
      registry,
      sourceInstanceId: "domination",
      skillStableId: "domination-foreigner-picture-in-the-house",
      selectedTargetInstanceId: "selected-ally",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("domination-skill-two").stream("effects"),
    });
    expect(second.accepted).toBe(true);
    if (!second.accepted) return;
    expect(second.effects.effects.map(({ targetInstanceIds }) => targetInstanceIds))
      .toEqual([
        ["selected-ally"],
        ["selected-ally", "other-ally"],
        ["selected-ally", "other-ally"],
      ]);
    expect(effectIds("domination", second.state.formation)).toEqual([]);
    expect(effectIds("reserve-ally", second.state.formation)).toEqual([]);

    const ended = resolveSideTurnEnd(
      second.state.formation,
      "ally",
      second.counters,
      new BattleRng("domination-skill-two-end").stream("effects"),
      {
        resolveStarGain: ({ requested }) => ({
          bucket: "next_command",
          requested,
          before: 0,
          added: requested,
          after: requested,
          overflow: 0,
        }),
      },
    );
    expect(findUnitLocation(ended.formation, "selected-ally")?.unit.np)
      .toBe(500);
    expect(findUnitLocation(ended.formation, "other-ally")?.unit.np)
      .toBe(500);
    expect(findUnitLocation(ended.formation, "domination")?.unit.np).toBe(0);
    expect(ended.activations.flatMap(({ actions }) => actions)
      .filter(({ starGainRequest }) => starGainRequest)
      .map(({ starGainRequest }) => starGainRequest?.requested))
      .toEqual([10, 10]);
  });

  it("consumes Skill 3 OC+2 once, removes defense buffs before damage, and resolves OC3 post-effects", () => {
    const source = servant("domination", 10_000);
    const humanAlly = servant("human-ally");
    const otherAlly = createServantBattleInstance(LIGHT_KOYANSKAYA, {
      instanceId: "other-ally",
      level: 90,
      noblePhantasmLevel: 1,
    });
    const enemy = unit("human-enemy", "enemy", {
      dataId: "human-enemy-data",
      traits: ["人の力"],
      hp: 10_000_000,
      maxHp: 10_000_000,
      baseMaxHp: 10_000_000,
    });
    let state = createBattleState({
      ally: {
        frontline: [source.unit, humanAlly.unit, otherAlly.unit],
        reserve: [],
      },
      waves: [{
        enemy: { frontline: [enemy, null, null], reserve: [] },
      }],
      enemyFrontlineLimit: 3,
    });
    state = {
      ...state,
      commandStarDistributionMode: "legacy_on_command_confirmation",
      commandStarDistribution: null,
      commandDeck: {
        ...state.commandDeck,
        currentHand: state.commandDeck.sourceCards.slice(0, 5),
      },
    };
    const defense = applyEffect(
      enemy,
      {
        stableId: "test-defense-buff",
        name: "防御力アップ",
        effectType: COMMON_EFFECT_TYPES.defense,
        category: "buff",
        classifications: ["defense"],
        value: 500,
        remainingTurns: 3,
      },
      "human-enemy",
      createEffectRuntimeCounters(),
    );
    state = {
      ...state,
      formation: replaceUnit(state.formation, defense.unit),
    };
    const actionRegistry = createBattleActionEffectDataRegistry([
      source.actionEffectData,
    ]);
    const skill = resolveAllySkillUse({
      state,
      registry: actionRegistry,
      sourceInstanceId: "domination",
      skillStableId: "domination-foreigner-at-the-mountains-of-madness",
      selectedTargetInstanceId: "domination",
      counters: defense.counters,
      rng: new BattleRng("domination-skill-three").stream("effects"),
    });
    expect(skill.accepted).toBe(true);
    if (!skill.accepted) return;
    expect(skill.state.commandStars).toBe(15);
    expect(findUnitLocation(skill.state.formation, "domination")?.unit)
      .toMatchObject({ np: 10_000 });

    const choices = listCommandCardChoices(skill.state);
    const np = choices.find(
      ({ card }) =>
        card.kind === "noble_phantasm"
        && card.ownerInstanceId === "domination",
    )?.card;
    if (!np) throw new Error("支配のフォーリナーの宝具カードがありません");
    const normals = skill.state.commandDeck.currentHand.slice(0, 2);
    const selected = selectCommandCards(skill.state, [
      np.cardId,
      ...normals.map(({ cardId }) => cardId),
    ]);
    if (!selected.accepted) {
      throw new Error(`カード選択失敗: ${JSON.stringify(selected)}`);
    }
    const random = new BattleRng("domination-np");
    const resolved = resolveAllyCommandAttacks({
      state: skill.state,
      selection: selected.selection,
      registry: createBattleAttackDataRegistry([
        source.attackData,
        humanAlly.attackData,
        otherAlly.attackData,
        combatantData("human-enemy", "human-enemy-data"),
      ]),
      actionEffectRegistry: actionRegistry,
      counters: skill.counters,
      rng: {
        effects: random.stream("effects"),
        critical: random.stream("critical"),
        damage: random.stream("damage"),
        stars: random.stream("stars"),
      },
      requestedTargetInstanceId: "human-enemy",
    });
    expect(resolved.sequence.accepted).toBe(true);
    if (!resolved.sequence.accepted) return;
    const detail = resolved.sequence.result.actions[0]
      ?.resolverDetail as AllyCommandAttackDetail;
    expect(detail).toMatchObject({
      outcome: "resolved",
      overchargeStage: 3,
      calculation: {
        npDamageMultiplierPermille: 8_000,
        npSpecialAttackPermille: 1_500,
      },
    });
    if (detail.outcome !== "resolved") return;
    expect(detail.declaredEffects.map(({ phase }) => phase)).toEqual([
      "before_attack",
      "after_attack",
    ]);
    expect(detail.declaredEffects[0]?.result.effects[0]).toMatchObject({
      effectStableId: "domination-foreigner-np-remove-defense-buffs",
      order: 1,
      targetInstanceIds: ["human-enemy"],
    });
    expect(detail.declaredEffects[1]?.result.effects.map(
      ({ effectStableId, order, targetInstanceIds, resolvedAmount }) => ({
        effectStableId,
        order,
        targetInstanceIds,
        ...(resolvedAmount === undefined ? {} : { resolvedAmount }),
      }),
    )).toEqual([
      {
        effectStableId: "domination-foreigner-np-human-allies-np",
        order: 3,
        targetInstanceIds: ["human-ally"],
        resolvedAmount: 2_000,
      },
      {
        effectStableId: "domination-foreigner-np-human-allies-attack",
        order: 4,
        targetInstanceIds: ["human-ally"],
      },
      {
        effectStableId: "domination-foreigner-np-human-allies-np-damage",
        order: 5,
        targetInstanceIds: ["human-ally"],
      },
    ]);
    const finalFormation = resolved.sequence.result.state.formation;
    expect(findUnitLocation(finalFormation, "human-enemy")?.unit.effects)
      .not.toContainEqual(expect.objectContaining({ stableId: "test-defense-buff" }));
    expect(findUnitLocation(finalFormation, "domination")?.unit.effects)
      .not.toContainEqual(expect.objectContaining({
        stableId: "domination-foreigner-mountains-overcharge-state",
      }));
    expect(findUnitLocation(finalFormation, "human-ally")?.unit).toMatchObject({
      np: 2_000,
      effects: expect.arrayContaining([
        expect.objectContaining({
          stableId: "domination-foreigner-np-human-allies-attack-state",
          value: 300,
        }),
        expect.objectContaining({
          stableId: "domination-foreigner-np-human-allies-np-damage-state",
          value: 200,
        }),
      ]),
    });
    expect(resolved.battleLog.entries[0]).toMatchObject({
      overchargeStage: 3,
      declaredEffects: [
        { phase: "before_attack" },
        { phase: "after_attack" },
      ],
    });
  });

  it("preserves the OC state through save/replay and expires it after three owner turns", () => {
    const selected = initialAllySelectionForServant(
      DOMINATION_FOREIGNER.dataId,
    );
    const setup = {
      ...createEmptyInitialBattleSetup(),
      frontline: [
        selected,
        initialAllySelectionForServant(LIGHT_KOYANSKAYA.dataId),
        initialAllySelectionForServant(LIGHT_KOYANSKAYA.dataId),
      ],
      reserve: [
        emptyInitialAllySlot(),
        emptyInitialAllySlot(),
        emptyInitialAllySlot(),
      ],
      seedMode: "fixed" as const,
      seed: "domination-oc-save-replay",
      mysticCodeDataId: "normal-chaldea-uniform",
    };
    const started = createInitialBattleSession(setup);
    const used = resolveBattleSessionAllySkill(started, {
      kind: "ally_skill",
      sourceInstanceId: "ally-frontline-1",
      skillStableId: "domination-foreigner-at-the-mountains-of-madness",
      selectedTargetInstanceId: "ally-frontline-2",
    });
    expect(used.result.accepted).toBe(true);
    const save = createBattleSuspendSave(used.session);
    const restored = restoreBattleSession(save);
    const replayed = replayBattleSession(save);
    expect(save).toMatchObject({
      schemaVersion: 4,
      dataSchemaVersion: "1.38.0",
    });
    expect(replayed.loop.state).toEqual(restored.loop.state);
    expect(replayed.loop.rng.snapshot()).toEqual(restored.loop.rng.snapshot());
    expect(replayed.operationHistory).toEqual(restored.operationHistory);

    let target = findUnitLocation(
      restored.loop.state.formation,
      "ally-frontline-2",
    )?.unit;
    if (!target) throw new Error("OC対象が存在しません");
    expect(target.effects).toContainEqual(expect.objectContaining({
      stableId: "domination-foreigner-mountains-overcharge-state",
      remainingTurns: 3,
      remainingUses: 1,
      value: 2,
    }));
    for (let turn = 0; turn < 3; turn += 1) {
      target = advanceOwnerTurnEnd(target, "ally", false).unit;
    }
    expect(target.effects).not.toContainEqual(expect.objectContaining({
      stableId: "domination-foreigner-mountains-overcharge-state",
    }));
  });

  it("uses only registered formal skill/status icons and presents the fixed special attack", () => {
    expect(registeredSkillIconPath("永劫の探求"))
      .toBe("/FGO_Battle_Simulator_Work/assets/skill-icons/skill-np-damafe-up.png");
    expect(registeredSkillIconPath("家のなかの絵"))
      .toBe("/FGO_Battle_Simulator_Work/assets/skill-icons/skill-card-quick-up.png");
    expect(registeredSkillIconPath("狂気の山脈にて"))
      .toBe("/FGO_Battle_Simulator_Work/assets/skill-icons/skill-np-charge.png");

    const recurringNp = {
      stableId: "recurring-np",
      instanceId: "effect-1",
      name: "毎ターンNP獲得",
      effectType: COMMON_EFFECT_TYPES.recurringNpGain,
      category: "buff" as const,
      removalPolicy: "removable" as const,
      durationTick: "owner_turn_end" as const,
      flags: {},
      sourceInstanceId: "source",
      targetInstanceId: "target",
      classifications: [],
      value: 50,
      remainingTurns: 5,
      remainingUses: null,
      registrationOrder: 1,
    };
    expect(registeredStatusIconPath(recurringNp))
      .toBe("/FGO_Battle_Simulator_Work/assets/status-icons/Npgainturn.webp");
    expect(registeredStatusIconPath({
      ...recurringNp,
      stableId: "recurring-stars",
      name: "毎ターンスター獲得",
      effectType: COMMON_EFFECT_TYPES.recurringStarGain,
    })).toBe("/FGO_Battle_Simulator_Work/assets/status-icons/Stargainturn.webp");
    expect(registeredStatusIconPath({
      ...recurringNp,
      stableId: "overcharge",
      name: "宝具OC段階アップ",
      effectType: COMMON_EFFECT_TYPES.noblePhantasmOverchargeStage,
    })).toBe("/FGO_Battle_Simulator_Work/assets/status-icons/NPOvercharge.webp");

    const detail = presentNoblePhantasmDetail(servant("detail").unit);
    expect(detail).toMatchObject({
      title: "旧き共鳴する海底の都",
      rank: "EX",
      descriptions: expect.arrayContaining([
        "＆〔人の力を持つ敵〕特攻：150%",
      ]),
    });
  });
});
