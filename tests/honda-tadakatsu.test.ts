import { describe, expect, it } from "vitest";
import { createBattleAttackDataRegistry } from "../src/core/battle/actionData";
import { findUnitLocation, replaceUnit } from "../src/core/battle/formation";
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
  HONDA_TADAKATSU,
  LIGHT_KOYANSKAYA,
  ORIGINAL_SERVANT_DEFINITIONS,
  createServantBattleInstance,
} from "../src/data/servants";
import { createBattleActionEffectDataRegistry } from "../src/effects/actionData";
import { initializeBattlePassives } from "../src/effects/actionExecution";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import { applyEffect, createEffectRuntimeCounters } from "../src/effects/runtime";
import { resolveAllySkillUse } from "../src/effects/skillExecution";
import {
  confirmedAllyActionPlayback,
  registeredServantWikiUrl,
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

function honda(instanceId = "honda", initialNp = 0) {
  return createServantBattleInstance(HONDA_TADAKATSU, {
    instanceId,
    level: 70,
    noblePhantasmLevel: 1,
    initialNp,
  });
}

function baseState() {
  const source = honda();
  return {
    source,
    state: createBattleState({
      ally: {
        frontline: [source.unit, unit("ally-b", "ally"), unit("ally-c", "ally")],
        reserve: [],
      },
      waves: [{
        enemy: {
          frontline: [unit("enemy", "enemy"), null, null],
          reserve: [],
        },
      }],
      enemyFrontlineLimit: 3,
    }),
  };
}

describe("No.007 本多忠勝", () => {
  it("registers the source-backed upgraded data in category-1 No. order", () => {
    expect(HONDA_TADAKATSU).toMatchObject({
      collectionNo: 7,
      collectionLabel: "007",
      name: "本多忠勝",
      rarity: 3,
      classDisplayName: "ランサー",
      growthTendency: "ATK寄り",
      attackType: "物理",
      classKey: "lancer",
      attributeKey: "human",
      classAttackCoefficientPermille: 1_050,
      contentRevision: "current_upgraded_only",
      commandCards: ["quick", "quick", "arts", "arts", "buster"],
      battleRates: {
        attackNpUnits: 79,
        receivedNpUnits: 400,
        starRatePermille: 122,
        starWeight: 90,
        deathRatePermille: 360,
      },
    });
    expect(HONDA_TADAKATSU.levelStats).toEqual([
      { level: 1, hp: 1_709, attack: 1_337 },
      { level: 30, hp: 5_222, attack: 3_961 },
      { level: 40, hp: 5_887, attack: 4_465 },
      { level: 50, hp: 6_837, attack: 5_186 },
      { level: 60, hp: 8_071, attack: 6_122 },
      { level: 70, hp: 9_496, attack: 7_203 },
      { level: 100, hp: 12_875, attack: 9_748 },
      { level: 120, hp: 15_133, attack: 11_449 },
    ]);
    expect(HONDA_TADAKATSU.commandCardHitWeights.map(({ length }) => length))
      .toEqual([4, 4, 2, 2, 3]);
    expect(HONDA_TADAKATSU.commandCardHitWeights.every((weights) =>
      weights.every((weight) => weight === 1)
    )).toBe(true);
    expect(HONDA_TADAKATSU.extraAttackHitWeights).toEqual([1, 1, 1]);
    expect(HONDA_TADAKATSU.traits).toEqual([
      "サーヴァント", "人型", "男性", "秩序", "善", "人の力", "ヒト科", "対人",
    ]);
    expect(HONDA_TADAKATSU.activeSkills.map(
      ({ name, rank, cooldownAtMax }) => ({ name, rank, cooldownAtMax }),
    )).toEqual([
      { name: "徳川四天王", rank: "C+", cooldownAtMax: 5 },
      { name: "東国無双", rank: "B", cooldownAtMax: 5 },
      { name: "八幡鹿角", rank: "D", cooldownAtMax: 6 },
    ]);
    expect(HONDA_TADAKATSU.classSkills.map(({ name, rank }) => ({ name, rank })))
      .toEqual([{ name: "対魔力", rank: "D" }]);
    expect(HONDA_TADAKATSU.noblePhantasm).toMatchObject({
      name: "蜻蛉切",
      reading: "とんぼきり",
      rank: "B",
      cardType: "quick",
    });
    expect(HONDA_TADAKATSU.noblePhantasm.effects.map(({ kind, order }) => ({
      kind,
      order,
    }))).toEqual([
      { kind: "effect", order: 1 },
      { kind: "effect", order: 2 },
      { kind: "effect", order: 3 },
      { kind: "attack", order: 4 },
      { kind: "effect", order: 5 },
    ]);
    expect(HONDA_TADAKATSU.noblePhantasm.effects[3]).toMatchObject({
      kind: "attack",
      targetScope: "single",
      hitWeights: [1, 1, 1],
      damageMultiplierPermilleByLevel: [
        16_000,
        20_000,
        22_000,
        23_000,
        24_000,
      ],
    });
    expect(HONDA_TADAKATSU.noblePhantasm.effects[4]).toMatchObject({
      kind: "effect",
      target: { relation: "enemies", selection: "single" },
      action: {
        kind: "reduce_hp",
        amount: {
          scaling: "overcharge",
          values: [1_000, 1_500, 2_000, 2_500, 3_000],
        },
        canDefeat: true,
      },
    });
    expect(ORIGINAL_SERVANT_DEFINITIONS.map(({ collectionNo }) => collectionNo))
      .toEqual([7, 24, 57, 58, 62, 70, 94]);
    expect(initialAllySelectionForServant(HONDA_TADAKATSU.dataId))
      .toMatchObject({ level: 70, noblePhantasmLevel: 1 });
    expect(registeredServantWikiUrl(HONDA_TADAKATSU.dataId))
      .toBe("https://w.atwiki.jp/siroi_human/pages/274.html");
    expect(honda().unresolvedEffectStableIds).toEqual([]);
  });

  it("resolves all three strengthened skills at level 10", () => {
    const { source, state } = baseState();
    const registry = createBattleActionEffectDataRegistry([source.actionEffectData]);

    const first = resolveAllySkillUse({
      state,
      registry,
      sourceInstanceId: "honda",
      skillStableId: "honda-tadakatsu-four-heavenly-kings",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("honda-skill-one").stream("effects"),
    });
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    expect(findUnitLocation(first.state.formation, "honda")?.unit).toMatchObject({
      skillCooldowns: [5, 0, 0],
      effects: expect.arrayContaining([
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.starFocus, value: 40_000 }),
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.criticalDamage, value: 300 }),
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.npGain, value: 200, flags: { cardType: "quick" } }),
      ]),
    });

    const second = resolveAllySkillUse({
      state,
      registry,
      sourceInstanceId: "honda",
      skillStableId: "honda-tadakatsu-peerless-east",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("honda-skill-two").stream("effects"),
    });
    expect(second.accepted).toBe(true);
    if (!second.accepted) return;
    expect(findUnitLocation(second.state.formation, "honda")?.unit).toMatchObject({
      skillCooldowns: [0, 5, 0],
      effects: expect.arrayContaining([
        expect.objectContaining({
          effectType: COMMON_EFFECT_TYPES.invincibility,
          remainingUses: 3,
          remainingTurns: null,
          durationTick: "manual",
        }),
        expect.objectContaining({
          effectType: COMMON_EFFECT_TYPES.defense,
          value: 300,
          remainingTurns: 3,
          durationTick: "opponent_turn_end",
        }),
      ]),
    });

    const third = resolveAllySkillUse({
      state,
      registry,
      sourceInstanceId: "honda",
      skillStableId: "honda-tadakatsu-hachiman-antlers",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("honda-skill-three").stream("effects"),
    });
    expect(third.accepted).toBe(true);
    if (!third.accepted) return;
    expect(third.state.commandStars).toBe(10);
    expect(findUnitLocation(third.state.formation, "honda")?.unit).toMatchObject({
      skillCooldowns: [0, 0, 6],
      effects: expect.arrayContaining([
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 200, flags: { cardType: "quick" } }),
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.defense, value: 300, durationTick: "opponent_turn_end" }),
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.starGeneration, value: 1_000 }),
      ]),
    });
  });

  it("applies Magic Resistance D as an unremovable class skill", () => {
    const { source, state } = baseState();
    const initialized = initializeBattlePassives(
      state,
      createBattleActionEffectDataRegistry([source.actionEffectData]),
      createEffectRuntimeCounters(),
      new BattleRng("honda-passive").stream("effects"),
    );
    expect(initialized.unresolvedEffectStableIds).toEqual([]);
    expect(findUnitLocation(initialized.state.formation, "honda")?.unit.effects)
      .toContainEqual(expect.objectContaining({
        stableId: "honda-tadakatsu-magic-resistance-debuff-state",
        effectType: COMMON_EFFECT_TYPES.debuffResistance,
        value: 125,
        removalPolicy: "unremovable",
        durationTick: "manual",
      }));
  });

  it("resolves the upgraded NP at OC3 in pre-attack, attack, post-attack order", () => {
    const source = honda("honda", 10_000);
    const enemy = unit("enemy", "enemy", {
      hp: 10_000_000,
      maxHp: 10_000_000,
      baseMaxHp: 10_000_000,
    });
    let state = createBattleState({
      ally: {
        frontline: [
          source.unit,
          unit("ally-b", "ally"),
          unit("ally-c", "ally"),
        ],
        reserve: [],
      },
      waves: [{ enemy: { frontline: [enemy, null, null], reserve: [] } }],
      enemyFrontlineLimit: 3,
    });
    const overcharge = applyEffect(
      source.unit,
      {
        stableId: "honda-test-oc-up",
        name: "宝具OC段階アップ",
        effectType: COMMON_EFFECT_TYPES.noblePhantasmOverchargeStage,
        category: "buff",
        value: 2,
        remainingTurns: 3,
        remainingUses: 1,
      },
      "honda",
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
    const np = listCommandCardChoices(state).find(({ card }) =>
      card.kind === "noble_phantasm" && card.ownerInstanceId === "honda"
    )?.card;
    if (!np) throw new Error("本多忠勝の宝具カードがありません");
    const selected = selectCommandCards(state, [
      np.cardId,
      ...state.commandDeck.currentHand.slice(0, 2).map(({ cardId }) => cardId),
    ]);
    if (!selected.accepted) throw new Error("本多忠勝のカード選択に失敗しました");

    const random = new BattleRng("honda-np-oc3");
    const resolved = resolveAllyCommandAttacks({
      state,
      selection: selected.selection,
      registry: createBattleAttackDataRegistry([
        source.attackData,
        combatantData("ally-b", "ally-b"),
        combatantData("ally-c", "ally-c"),
        combatantData("enemy", "enemy"),
      ]),
      actionEffectRegistry: createBattleActionEffectDataRegistry([
        source.actionEffectData,
      ]),
      counters: overcharge.counters,
      rng: {
        effects: random.stream("effects"),
        critical: random.stream("critical"),
        damage: random.stream("damage"),
        stars: random.stream("stars"),
      },
      requestedTargetInstanceId: "enemy",
    });
    expect(resolved.sequence.accepted).toBe(true);
    if (!resolved.sequence.accepted) return;
    const detail = resolved.sequence.result.actions[0]
      ?.resolverDetail as AllyCommandAttackDetail;
    expect(detail).toMatchObject({
      outcome: "resolved",
      overchargeStage: 3,
      calculation: { npDamageMultiplierPermille: 16_000 },
    });
    if (detail.outcome !== "resolved") return;
    expect(detail.declaredEffects.map(({ phase }) => phase))
      .toEqual(["before_attack", "after_attack"]);
    expect(detail.declaredEffects[0]?.result.effects.map(({ effectStableId }) =>
      effectStableId
    )).toEqual([
      "honda-tadakatsu-np-invincibility-pierce",
      "honda-tadakatsu-np-ignore-defense",
      "honda-tadakatsu-np-quick",
    ]);
    expect(detail.declaredEffects[1]?.result.effects).toContainEqual(
      expect.objectContaining({
        effectStableId: "honda-tadakatsu-np-hp-reduction",
        resolvedAmount: 2_000,
        targetInstanceIds: ["enemy"],
      }),
    );
    expect(detail.declaredEffects[1]?.result.effects[0]?.batch?.results[0])
      .toMatchObject({
        action: { kind: "reduce_hp", amount: 2_000, canDefeat: true },
        hpChange: -2_000,
        hpReductionResult: {
          requestedAmount: 2_000,
          actualReduction: 2_000,
          outcome: "reduced",
        },
      });
    const sourceEffects = findUnitLocation(
      resolved.sequence.result.state.formation,
      "honda",
    )?.unit.effects ?? [];
    expect(sourceEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.invincibilityPierce, remainingTurns: 3 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.ignoreDefense, remainingTurns: 3 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 200 }),
    ]));
    expect(unspecifiedEffectNames(sourceEffects)).toEqual([]);
  });

  it("finishes Honda's consecutive Q and A on a defeated target before Foreigner's B retargets", () => {
    const hondaSource = honda("honda");
    const foreigner = createServantBattleInstance(
      DOMINATION_FOREIGNER,
      {
        instanceId: "foreigner",
        level: 90,
        noblePhantasmLevel: 1,
      },
    );
    const third = createServantBattleInstance(
      LIGHT_KOYANSKAYA,
      {
        instanceId: "ally-c",
        level: 90,
        noblePhantasmLevel: 1,
      },
    );
    let state = createBattleState({
      ally: {
        frontline: [hondaSource.unit, foreigner.unit, third.unit],
        reserve: [],
      },
      waves: [{
        enemy: {
          frontline: [
            unit("enemy-a", "enemy", {
              hp: 1,
              maxHp: 1,
              baseMaxHp: 1,
            }),
            unit("enemy-b", "enemy", {
              hp: 1_000_000,
              maxHp: 1_000_000,
              baseMaxHp: 1_000_000,
            }),
            null,
          ],
          reserve: [],
        },
      }],
      enemyFrontlineLimit: 3,
    });
    const requestedCards = [
      state.commandDeck.sourceCards.find(({ ownerInstanceId, cardIndex }) =>
        ownerInstanceId === "honda" && cardIndex === 0
      ),
      state.commandDeck.sourceCards.find(({ ownerInstanceId, cardIndex }) =>
        ownerInstanceId === "honda" && cardIndex === 2
      ),
      state.commandDeck.sourceCards.find(({ ownerInstanceId, cardIndex }) =>
        ownerInstanceId === "foreigner" && cardIndex === 4
      ),
    ];
    if (requestedCards.some((card) => !card)) {
      throw new Error("Q→A→Bの検査カードがありません");
    }
    const selectedCards = requestedCards as [
      NonNullable<(typeof requestedCards)[number]>,
      NonNullable<(typeof requestedCards)[number]>,
      NonNullable<(typeof requestedCards)[number]>,
    ];
    const fillers = state.commandDeck.sourceCards.filter((candidate) =>
      !selectedCards.some(({ cardId }) => cardId === candidate.cardId)
    ).slice(0, 2);
    state = {
      ...state,
      commandStarDistributionMode: "legacy_on_command_confirmation",
      commandStarDistribution: null,
      commandDeck: {
        ...state.commandDeck,
        currentHand: [...selectedCards, ...fillers],
      },
    };
    const selection = selectCommandCards(
      state,
      selectedCards.map(({ cardId }) => cardId),
    );
    if (!selection.accepted) {
      throw new Error("Q→A→Bのカード選択に失敗しました");
    }
    const registry = createBattleAttackDataRegistry([
      hondaSource.attackData,
      foreigner.attackData,
      third.attackData,
      combatantData("enemy-a", "enemy-a"),
      combatantData("enemy-b", "enemy-b"),
    ]);
    const run = () => {
      const random = new BattleRng("honda-normal-card-target-continuation");
      return resolveAllyCommandAttacks({
        state,
        selection: selection.selection,
        registry,
        rng: {
          effects: random.stream("effects"),
          critical: random.stream("critical"),
          damage: random.stream("damage"),
          stars: random.stream("stars"),
        },
        requestedTargetInstanceId: "enemy-a",
      });
    };
    const resolved = run();

    expect(resolved.sequence.accepted).toBe(true);
    if (!resolved.sequence.accepted) return;
    const actions = resolved.sequence.result.actions;
    expect(actions.map(({ targetAtStart }) => targetAtStart.instanceId))
      .toEqual(["enemy-a", "enemy-a", "enemy-b"]);
    expect(actions.map(
      ({ defeatedTargetContinuation }) => defeatedTargetContinuation,
    )).toEqual([false, true, false]);
    expect(actions[0]?.boundary).toMatchObject({
      enemyReplacement: { departures: [] },
      nextEnemyTarget: { instanceId: "enemy-a" },
    });
    const arts = actions[1]?.resolverDetail as AllyCommandAttackDetail;
    expect(arts).toMatchObject({
      outcome: "resolved",
      targetScope: "single",
      targetInstanceIds: ["enemy-a"],
    });
    if (arts.outcome !== "resolved") return;
    expect(arts.resolution.attack?.attack.hits).toHaveLength(2);
    expect(arts.resolution.attack?.attack.hits.every((hit) =>
      hit.overkillOrOvergauge
      && hit.actualHpLoss === 0
    )).toBe(true);
    expect(actions[1]?.boundary).toMatchObject({
      enemyReplacement: {
        departures: [expect.objectContaining({ instanceId: "enemy-a" })],
      },
      nextEnemyTarget: { instanceId: "enemy-b" },
    });
    const artsPlayback = confirmedAllyActionPlayback(actions[1]!);
    expect(artsPlayback.keepsDefeatedTargetVisible).toBe(true);
    expect(artsPlayback.continuedTargetHp).toEqual({
      instanceId: "enemy-a",
      name: "enemy-a",
      side: "enemy",
      hpBefore: 0,
      hpAfter: 0,
      maxHp: 1,
    });
    expect(findUnitLocation(
      artsPlayback.state.formation,
      "enemy-a",
    )?.unit).toMatchObject({ hp: 0, alive: false });
    expect(findUnitLocation(
      actions[1]!.boundary.state.formation,
      "enemy-a",
    )).toBeUndefined();
    const foreignerPlayback = confirmedAllyActionPlayback(actions[2]!);
    expect(foreignerPlayback.keepsDefeatedTargetVisible).toBe(false);
    expect(foreignerPlayback.continuedTargetHp).toBeNull();
    expect(findUnitLocation(
      foreignerPlayback.state.formation,
      "enemy-a",
    )).toBeUndefined();
    expect(findUnitLocation(
      resolved.sequence.result.state.formation,
      "enemy-a",
    )).toBeUndefined();
    expect(findUnitLocation(
      resolved.sequence.result.state.formation,
      "enemy-b",
    )?.unit.hp).toBeLessThan(1_000_000);

    const replayed = run();
    expect(replayed).toEqual(resolved);
  });

  it("uses only the specified formal skill and status icons", () => {
    expect(registeredSkillIconPath("徳川四天王"))
      .toContain("skill-star-weight-up.png");
    expect(registeredSkillIconPath("東国無双"))
      .toContain("skill-immune-invincibility.png");
    expect(registeredSkillIconPath("八幡鹿角"))
      .toContain("skill-card-quick-up.png");
    expect(registeredSkillIconPath("対魔力"))
      .toContain("class-magic-resistance.png");

    const { source, state } = baseState();
    const first = resolveAllySkillUse({
      state,
      registry: createBattleActionEffectDataRegistry([source.actionEffectData]),
      sourceInstanceId: "honda",
      skillStableId: "honda-tadakatsu-four-heavenly-kings",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("honda-icons").stream("effects"),
    });
    if (!first.accepted) throw new Error("本多忠勝の第一スキルに失敗しました");
    const npGain = findUnitLocation(first.state.formation, "honda")?.unit.effects
      .find(({ effectType }) => effectType === COMMON_EFFECT_TYPES.npGain);
    if (!npGain) throw new Error("本多忠勝のNP獲得量アップがありません");
    expect(registeredStatusIconPath(npGain)).toContain("Npchargeup.webp");

    const statusBase = {
      ...npGain,
      value: 0,
      flags: {},
    };
    expect(registeredStatusIconPath({
      ...statusBase,
      stableId: "honda-invincibility-pierce-icon",
      name: "無敵貫通",
      effectType: COMMON_EFFECT_TYPES.invincibilityPierce,
    })).toContain("Invinciblepierce.webp");
    expect(registeredStatusIconPath({
      ...statusBase,
      stableId: "honda-ignore-defense-icon",
      name: "防御無視",
      effectType: COMMON_EFFECT_TYPES.ignoreDefense,
    })).toContain("Ignoredefense.webp");
  });

  it("preserves the new servant through schema-4 fixed-seed save and replay", () => {
    const setup = {
      ...createEmptyInitialBattleSetup(),
      frontline: [
        initialAllySelectionForServant(HONDA_TADAKATSU.dataId),
        initialAllySelectionForServant(LIGHT_KOYANSKAYA.dataId),
        initialAllySelectionForServant(LIGHT_KOYANSKAYA.dataId),
      ],
      reserve: [
        emptyInitialAllySlot(),
        emptyInitialAllySlot(),
        emptyInitialAllySlot(),
      ],
      mysticCodeDataId: "normal-chaldea-uniform",
      seedMode: "fixed" as const,
      seed: "honda-save-replay",
    };
    const started = createInitialBattleSession(setup);
    const used = resolveBattleSessionAllySkill(started, {
      kind: "ally_skill",
      sourceInstanceId: "ally-frontline-1",
      skillStableId: "honda-tadakatsu-hachiman-antlers",
    });
    expect(used.result.accepted).toBe(true);
    const save = createBattleSuspendSave(used.session);
    const restored = restoreBattleSession(save);
    const replayed = replayBattleSession(save);
    expect(save).toMatchObject({
      schemaVersion: 4,
      dataSchemaVersion: "1.38.0",
    });
    expect(restored.loop.state.commandStars).toBe(10);
    expect(replayed.loop.state).toEqual(restored.loop.state);
    expect(replayed.loop.rng.snapshot()).toEqual(restored.loop.rng.snapshot());
    expect(replayed.operationHistory).toEqual(restored.operationHistory);
  });
});
