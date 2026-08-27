import { describe, expect, it } from "vitest";
import {
  createBattleAttackDataRegistry,
} from "../src/core/battle/actionData";
import { prepareBattleAttackInput } from "../src/core/battle/attackInput";
import { findUnitLocation, replaceUnit } from "../src/core/battle/formation";
import {
  createBattleSuspendSave,
  replayBattleSession,
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
  AJISUKITAKAHIKONE_NO_KAMI,
  LIGHT_KOYANSKAYA,
  ORIGINAL_SERVANT_DEFINITIONS,
  createServantBattleInstance,
} from "../src/data/servants";
import {
  createBattleActionEffectDataRegistry,
} from "../src/effects/actionData";
import { initializeBattlePassives } from "../src/effects/actionExecution";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import { createEffectRuntimeCounters } from "../src/effects/runtime";
import { resolveAllySkillUse } from "../src/effects/skillExecution";
import {
  presentNoblePhantasmDetail,
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

function ajisuki(instanceId = "ajisuki", initialNp = 0) {
  return createServantBattleInstance(AJISUKITAKAHIKONE_NO_KAMI, {
    instanceId,
    level: 90,
    noblePhantasmLevel: 1,
    initialNp,
  });
}

function baseState() {
  const source = ajisuki();
  return {
    source,
    state: createBattleState({
      ally: {
        frontline: [
          source.unit,
          unit("ally-b", "ally"),
          unit("ally-c", "ally"),
        ],
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

describe("No.057 阿遅鉏高日子根神", () => {
  it("registers the complete strengthened source data", () => {
    expect(AJISUKITAKAHIKONE_NO_KAMI).toMatchObject({
      collectionNo: 57,
      collectionLabel: "057",
      name: "阿遅鉏高日子根神",
      rarity: 5,
      classDisplayName: "セイバー",
      growthTendency: "HP偏重",
      attackType: "物理",
      classKey: "saber",
      attributeKey: "sky",
      classAttackCoefficientPermille: 1_000,
      commandCards: ["quick", "arts", "buster", "buster", "buster"],
      battleRates: {
        attackNpUnits: 115,
        receivedNpUnits: 300,
        starRatePermille: 103,
        starWeight: 99,
        deathRatePermille: 192,
      },
    });
    expect(AJISUKITAKAHIKONE_NO_KAMI.levelStats).toEqual([
      { level: 1, hp: 2_419, attack: 1_622 },
      { level: 50, hp: 9_568, attack: 6_088 },
      { level: 60, hp: 10_393, attack: 6_613 },
      { level: 70, hp: 11_878, attack: 7_558 },
      { level: 80, hp: 14_023, attack: 8_923 },
      { level: 90, hp: 16_498, attack: 10_498 },
      { level: 100, hp: 18_074, attack: 11_492 },
      { level: 120, hp: 21_242, attack: 13_489 },
    ]);
    expect(AJISUKITAKAHIKONE_NO_KAMI.commandCardHitWeights.map(
      ({ length }) => length,
    )).toEqual([3, 2, 3, 3, 3]);
    expect(AJISUKITAKAHIKONE_NO_KAMI.extraAttackHitWeights)
      .toEqual([1, 1, 1]);
    expect(AJISUKITAKAHIKONE_NO_KAMI.activeSkills.map(
      ({ name, rank, cooldownAtMax }) => ({ name, rank, cooldownAtMax }),
    )).toEqual([
      { name: "魔力放出（雷神）", rank: "A+", cooldownAtMax: 6 },
      { name: "豊穣の加護", rank: "EX", cooldownAtMax: 7 },
      { name: "怒りの力", rank: "A", cooldownAtMax: 7 },
    ]);
    expect(AJISUKITAKAHIKONE_NO_KAMI.classSkills.map(
      ({ name, rank }) => ({ name, rank }),
    )).toEqual([
      { name: "対魔力", rank: "C" },
      { name: "騎乗", rank: "C" },
      { name: "神性", rank: "EX" },
    ]);
    expect(AJISUKITAKAHIKONE_NO_KAMI.noblePhantasm.effects[1])
      .toMatchObject({
        kind: "attack",
        targetScope: "all",
        hitWeights: [1, 1, 1, 1, 1, 1, 1, 1, 1],
        damageMultiplierPermilleByLevel: [
          4_000,
          5_000,
          5_500,
          5_750,
          6_000,
        ],
        additionalAttack: {
          hitWeights: [1, 1, 1, 1, 1, 1, 1, 1, 1],
          damageMultiplierPermilleByOvercharge: [
            0,
            2_000,
            3_000,
            4_000,
            5_000,
          ],
        },
      });
    expect(ORIGINAL_SERVANT_DEFINITIONS.map(({ collectionNo }) => collectionNo))
      .toEqual([7, 24, 25, 54, 55, 56, 57, 58, 62, 70, 94, 105, 107]);
    expect(initialAllySelectionForServant(AJISUKITAKAHIKONE_NO_KAMI.dataId))
      .toMatchObject({ level: 90, noblePhantasmLevel: 1 });
    expect(registeredServantWikiUrl(AJISUKITAKAHIKONE_NO_KAMI.dataId))
      .toBe("https://w.atwiki.jp/siroi_human/pages/50.html");
    expect(ajisuki().unresolvedEffectStableIds).toEqual([]);
  });

  it("resolves all skills, passives, and the 150% defensive affinity override", () => {
    const { source, state } = baseState();
    const actionRegistry = createBattleActionEffectDataRegistry([
      source.actionEffectData,
    ]);
    const first = resolveAllySkillUse({
      state,
      registry: actionRegistry,
      sourceInstanceId: "ajisuki",
      skillStableId: "ajisukitakahikone-mana-burst-thunder-god",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("ajisuki-skill-one").stream("effects"),
    });
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    expect(findUnitLocation(first.state.formation, "ajisuki")?.unit)
      .toMatchObject({
        np: 3_000,
        skillCooldowns: [6, 0, 0],
        effects: expect.arrayContaining([
          expect.objectContaining({
            effectType: COMMON_EFFECT_TYPES.cardPerformance,
            value: 350,
          }),
          expect.objectContaining({
            effectType: COMMON_EFFECT_TYPES.evade,
            durationTick: "opponent_turn_end",
          }),
        ]),
      });

    const second = resolveAllySkillUse({
      state: {
        ...state,
        formation: replaceUnit(state.formation, {
          ...source.unit,
          hp: source.unit.maxHp - 5_000,
        }),
      },
      registry: actionRegistry,
      sourceInstanceId: "ajisuki",
      skillStableId: "ajisukitakahikone-blessing-of-fertility",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("ajisuki-skill-two").stream("effects"),
    });
    expect(second.accepted).toBe(true);
    if (!second.accepted) return;
    expect(second.state.commandStars).toBe(10);
    expect(findUnitLocation(second.state.formation, "ajisuki")?.unit)
      .toMatchObject({ hp: source.unit.maxHp - 2_000, np: 3_000 });

    const third = resolveAllySkillUse({
      state,
      registry: actionRegistry,
      sourceInstanceId: "ajisuki",
      skillStableId: "ajisukitakahikone-power-of-anger",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("ajisuki-skill-three").stream("effects"),
    });
    expect(third.accepted).toBe(true);
    if (!third.accepted) return;
    const thirdUnit = findUnitLocation(
      third.state.formation,
      "ajisuki",
    )?.unit;
    expect(thirdUnit?.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        effectType: COMMON_EFFECT_TYPES.attack,
        value: 500,
        remainingUses: 3,
      }),
      expect.objectContaining({
        effectType: COMMON_EFFECT_TYPES.criticalDamage,
        value: 1_000,
        remainingUses: 3,
      }),
      expect.objectContaining({
        effectType: COMMON_EFFECT_TYPES.fixedDamage,
        value: 2_000,
      }),
      expect.objectContaining({
        effectType: COMMON_EFFECT_TYPES.defensiveClassAffinityOverride,
        value: 1_500,
        durationTick: "opponent_turn_end",
      }),
    ]));
    if (!thirdUnit) throw new Error("怒りの力の対象がありません");
    const incomingState = {
      ...third.state,
      phase: "enemy_action" as const,
    };
    const input = prepareBattleAttackInput(
      incomingState,
      createBattleAttackDataRegistry([
        combatantData("enemy", "enemy", { classKey: "archer" }),
        source.attackData,
      ], {
        class: { archer: { saber: 2_000 } },
        attribute: {},
      }),
      "enemy",
      ["ajisuki"],
      {
        cardType: "buster",
        isNoblePhantasm: false,
        isCritical: false,
        cardDamageValuePermille: 1_500,
        cardNpValuePermille: 0,
        cardStarValuePermille: 0,
        firstCardDamageBonusPermille: 0,
        firstCardNpBonusPermille: 0,
        firstCardStarBonusPermille: 0,
        busterChainModPermille: 0,
        extraCardModifierPermille: 1_000,
        hitWeights: [1],
      },
    );
    expect(input.input.targets[0].damage.classAffinityPermille).toBe(1_500);

    const initialized = initializeBattlePassives(
      state,
      actionRegistry,
      createEffectRuntimeCounters(),
      new BattleRng("ajisuki-passives").stream("effects"),
    );
    expect(findUnitLocation(initialized.state.formation, "ajisuki")?.unit.effects)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          effectType: COMMON_EFFECT_TYPES.debuffResistance,
          value: 150,
        }),
        expect.objectContaining({
          effectType: COMMON_EFFECT_TYPES.cardPerformance,
          value: 60,
          flags: { cardType: "quick" },
        }),
        expect.objectContaining({
          effectType: COMMON_EFFECT_TYPES.fixedDamage,
          value: 250,
        }),
      ]));
  });

  it("emits the second 9-Hit attack even at OC1 0% and consumes counted buffs once", () => {
    const source = ajisuki("ajisuki", 10_000);
    let state = createBattleState({
      ally: {
        frontline: [
          source.unit,
          unit("ally-b", "ally"),
          unit("ally-c", "ally"),
        ],
        reserve: [],
      },
      waves: [{
        enemy: {
          frontline: [unit("enemy", "enemy", {
            hp: 1,
            maxHp: 1,
            baseMaxHp: 1,
          }), null, null],
          reserve: [],
        },
      }],
      enemyFrontlineLimit: 3,
    });
    const actionRegistry = createBattleActionEffectDataRegistry([
      source.actionEffectData,
    ]);
    const skill = resolveAllySkillUse({
      state,
      registry: actionRegistry,
      sourceInstanceId: "ajisuki",
      skillStableId: "ajisukitakahikone-power-of-anger",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("ajisuki-np-skill").stream("effects"),
    });
    if (!skill.accepted) throw new Error("怒りの力に失敗しました");
    state = {
      ...skill.state,
      commandStarDistributionMode: "legacy_on_command_confirmation",
      commandStarDistribution: null,
      commandDeck: {
        ...skill.state.commandDeck,
        currentHand: skill.state.commandDeck.sourceCards.slice(0, 5),
      },
    };
    const np = listCommandCardChoices(state).find(({ card }) =>
      card.kind === "noble_phantasm"
      && card.ownerInstanceId === "ajisuki"
    )?.card;
    if (!np) throw new Error("神度剣がありません");
    const selected = selectCommandCards(state, [
      np.cardId,
      ...state.commandDeck.currentHand.slice(0, 2).map(({ cardId }) => cardId),
    ]);
    if (!selected.accepted) throw new Error("宝具選択に失敗しました");
    const random = new BattleRng("ajisuki-np-oc1-zero-additional");
    const resolved = resolveAllyCommandAttacks({
      state,
      selection: selected.selection,
      registry: createBattleAttackDataRegistry([
        source.attackData,
        combatantData("ally-b", "ally-b"),
        combatantData("ally-c", "ally-c"),
        combatantData("enemy", "enemy"),
      ]),
      actionEffectRegistry: actionRegistry,
      counters: skill.counters,
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
      overchargeStage: 1,
      calculation: { npDamageMultiplierPermille: 4_000 },
    });
    if (detail.outcome !== "resolved") return;
    expect(detail.resolution.attack?.attack.hits).toHaveLength(9);
    expect(detail.resolution.additionalAttacks).toHaveLength(1);
    const additional = detail.resolution.additionalAttacks[0];
    expect(additional).toMatchObject({
      stableId: "ajisukitakahikone-np-overcharge-additional-attack",
      resolution: {
        attack: {
          targets: [
            {
              damageBreakdown: { damage: 2_000 },
              totalDamage: 2_000,
            },
          ],
        },
      },
    });
    expect(additional.resolution.attack.hits).toHaveLength(9);
    expect(additional.resolution.attack.hits.every((hit) =>
      hit.hpBefore === 0
      && hit.hpAfter === 0
      && hit.overkillOrOvergauge
    )).toBe(true);
    expect(detail.resolution.hitTriggers).toHaveLength(18);
    const finalSource = findUnitLocation(
      resolved.sequence.result.state.formation,
      "ajisuki",
    )?.unit;
    expect(finalSource?.effects.find(
      ({ effectType }) => effectType === COMMON_EFFECT_TYPES.attack,
    )?.remainingUses).toBe(2);
    expect(finalSource?.effects.find(
      ({ effectType }) => effectType === COMMON_EFFECT_TYPES.criticalDamage,
    )?.remainingUses).toBe(3);
    const loggedAttack = resolved.battleLog.entries[0]?.attack;
    expect(loggedAttack?.hits).toHaveLength(18);
    expect(loggedAttack?.packets?.map(({ kind, hits }) => ({
      kind,
      hits: hits.length,
    }))).toEqual([
      { kind: "primary", hits: 9 },
      { kind: "additional", hits: 9 },
    ]);
    expect(loggedAttack?.targets[0]?.distributedDamage).toHaveLength(18);
  });

  it("uses only the confirmed icons and presents the additional attack", () => {
    expect(registeredSkillIconPath("魔力放出（雷神）"))
      .toContain("skill-card-buster-up.png");
    expect(registeredSkillIconPath("豊穣の加護"))
      .toContain("skill-hp-heal.png");
    expect(registeredSkillIconPath("怒りの力"))
      .toContain("skill-attack-up.png");
    expect(registeredSkillIconPath("騎乗")).toContain("class-riding.png");
    expect(registeredSkillIconPath("神性")).toContain("class-divinity.png");

    const { source, state } = baseState();
    const first = resolveAllySkillUse({
      state,
      registry: createBattleActionEffectDataRegistry([source.actionEffectData]),
      sourceInstanceId: "ajisuki",
      skillStableId: "ajisukitakahikone-mana-burst-thunder-god",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("ajisuki-icons").stream("effects"),
    });
    if (!first.accepted) throw new Error("第一スキルに失敗しました");
    const evade = findUnitLocation(first.state.formation, "ajisuki")?.unit.effects
      .find(({ effectType }) => effectType === COMMON_EFFECT_TYPES.evade);
    if (!evade) throw new Error("回避がありません");
    expect(registeredStatusIconPath(evade)).toContain("Avoid.webp");

    const statusBase = { ...evade, value: 0, flags: {} };
    expect(registeredStatusIconPath({
      ...statusBase,
      stableId: "ajisuki-buster-resistance-icon",
      name: "Buster攻撃耐性ダウン",
      effectType: COMMON_EFFECT_TYPES.cardResistance,
      value: -100,
    })).toContain("Busterresistdown.webp");
    expect(registeredStatusIconPath({
      ...statusBase,
      stableId: "ajisuki-class-affinity-icon",
      name: "防御時クラス相性不利",
      effectType: COMMON_EFFECT_TYPES.defensiveClassAffinityOverride,
      value: 1_500,
    })).toContain("Changeclass.webp");
    expect(unspecifiedEffectNames([
      evade,
      {
        ...statusBase,
        stableId: "ajisuki-class-affinity-icon",
        name: "防御時クラス相性不利",
        effectType: COMMON_EFFECT_TYPES.defensiveClassAffinityOverride,
        value: 1_500,
      },
    ])).toEqual([]);
    const detail = presentNoblePhantasmDetail(source.unit);
    expect(detail?.descriptions).toContain(
      "＆オーバーチャージで追加で強力な攻撃<OC:威力UP>：0% / 200% / 300% / 400% / 500%",
    );
  });

  it("preserves schema 4, data 1.38.0, and fixed-seed replay", () => {
    const setup = {
      ...createEmptyInitialBattleSetup(),
      frontline: [
        initialAllySelectionForServant(AJISUKITAKAHIKONE_NO_KAMI.dataId),
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
      seed: "ajisuki-save-replay",
    };
    const started = createInitialBattleSession(setup);
    const save = createBattleSuspendSave(started);
    const restored = restoreBattleSession(save);
    const replayed = replayBattleSession(save);
    expect(save).toMatchObject({
      schemaVersion: 4,
      dataSchemaVersion: "1.38.0",
    });
    expect(replayed.loop.state).toEqual(restored.loop.state);
    expect(replayed.loop.rng.snapshot()).toEqual(restored.loop.rng.snapshot());
  });
});
