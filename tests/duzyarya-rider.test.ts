import { describe, expect, it } from "vitest";
import {
  createBattleAttackDataRegistry,
} from "../src/core/battle/actionData";
import { resolveAttackModifierTotals } from "../src/core/battle/attackModifiers";
import { resolveAllyCommandAttacks, type AllyCommandAttackDetail } from "../src/core/cards/commandAttack";
import { listCommandCardChoices, selectCommandCards } from "../src/core/cards/selection";
import { findUnitLocation } from "../src/core/battle/formation";
import { initializeBattleLoadout } from "../src/core/battle/loadout";
import { createBattleState } from "../src/core/battle/state";
import { BattleRng } from "../src/core/rng";
import {
  DUZYARYA_RIDER,
  ORIGINAL_SERVANT_DEFINITIONS,
  createServantBattleInstance,
} from "../src/data/servants";
import {
  DUZYARYA_RIDER_BOND,
  INITIAL_CRAFT_ESSENCE_REGISTRY,
} from "../src/data/craftEssences";
import { createBattleActionEffectDataRegistry } from "../src/effects/actionData";
import { initializeBattlePassives } from "../src/effects/actionExecution";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import { createEffectRuntimeCounters } from "../src/effects/runtime";
import { resolveAllySkillUse } from "../src/effects/skillExecution";
import { registeredSkillIconPath, registeredStatusIconPath } from "../src/ui/iconRegistry";
import { combatantData } from "./helpers/attackData";
import { unit } from "./helpers/battle";

function duzyarya(instanceId = "duzyarya", initialNp = 0) {
  return createServantBattleInstance(DUZYARYA_RIDER, {
    instanceId,
    level: 80,
    noblePhantasmLevel: 1,
    initialNp,
  });
}

function stateWithDuzyarya(initialNp = 0) {
  const source = duzyarya("duzyarya", initialNp);
  return {
    source,
    state: createBattleState({
      ally: {
        frontline: [
          source.unit,
          unit("male-ally", "ally", { traits: ["男性"] }),
          unit("ally-c", "ally"),
        ],
        reserve: [],
      },
      waves: [{
        enemy: {
          frontline: [unit("enemy-a", "enemy", {
            hp: 10_000_000,
            maxHp: 10_000_000,
            baseMaxHp: 10_000_000,
            enemyAction: {
              maxActions: "auto",
              normalAttack: null,
              skills: [],
              noblePhantasm: null,
              charge: 2,
              chargeMax: 3,
            },
          }), null, null],
          reserve: [],
        },
      }],
      enemyFrontlineLimit: 3,
    }),
  };
}

function rngStreams(seed: string) {
  const rng = new BattleRng(seed);
  return {
    effects: rng.stream("effects"),
    critical: rng.stream("critical"),
    damage: rng.stream("damage"),
    stars: rng.stream("stars"),
  };
}

describe("No.025 ドゥズヤールヤー〔騎〕", () => {
  it("registers the current-upgraded Rider data, exact SR, specified traits, and icons", () => {
    expect(DUZYARYA_RIDER).toMatchObject({
      collectionNo: 25,
      collectionLabel: "025",
      name: "ドゥズヤールヤー",
      rarity: 4,
      classDisplayName: "ライダー",
      growthTendency: "凸型",
      attackType: "魔術",
      commandCards: ["quick", "quick", "arts", "arts", "buster"],
      battleRates: {
        attackNpUnits: 88,
        receivedNpUnits: 300,
        starRatePermille: 91,
        starRateBasisPoints: 918,
        starWeight: 194,
        deathRatePermille: 300,
      },
      traits: expect.arrayContaining(["悪魔", "対人"]),
    });
    expect(DUZYARYA_RIDER.levelStats.at(-1)).toEqual({
      level: 120,
      hp: 16_587,
      attack: 12_658,
    });
    expect(DUZYARYA_RIDER.commandCardHitWeights.map(({ length }) => length))
      .toEqual([3, 3, 2, 2, 2]);
    expect(DUZYARYA_RIDER.noblePhantasm.effects).toHaveLength(7);
    expect(DUZYARYA_RIDER.noblePhantasm.effects.every(
      ({ kind }) => kind === "effect",
    )).toBe(true);
    expect(DUZYARYA_RIDER.activeSkills[0].effects[0]?.action)
      .toMatchObject({ kind: "change_enemy_charge", amount: -1, successRatePermille: 800 });
    expect(ORIGINAL_SERVANT_DEFINITIONS.map(({ collectionNo }) => collectionNo))
      .toEqual([7, 24, 25, 56, 57, 58, 62, 70, 94, 105, 107]);
    expect(registeredSkillIconPath("呪術（魔）"))
      .toContain("skill-np-gauge-down.png");
    expect(registeredSkillIconPath("高速神言（呪）"))
      .toContain("skill-np-charge.png");
    expect(registeredSkillIconPath("凶年の寵愛"))
      .toContain("skill-attack-up.png");
  });

  it("uses the three skills and Rider passive effects through common actions", () => {
    const { source, state } = stateWithDuzyarya();
    const registry = createBattleActionEffectDataRegistry([source.actionEffectData]);
    const skill2 = resolveAllySkillUse({
      state,
      registry,
      sourceInstanceId: "duzyarya",
      skillStableId: "duzyarya-rider-high-speed-incantation-curse",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("duzyarya-skill-two").stream("effects"),
    });
    expect(skill2).toMatchObject({ accepted: true });
    if (!skill2.accepted) return;
    const cursedEnemy = findUnitLocation(skill2.state.formation, "enemy-a")?.unit;
    expect(cursedEnemy?.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectType: "curse", value: 4_000 }),
      expect.objectContaining({ effectType: "evil_curse", value: 100 }),
    ]));
    expect(registeredStatusIconPath(cursedEnemy?.effects.find(
      ({ effectType }) => effectType === "curse",
    )!)).toContain("Curse.webp");
    expect(registeredStatusIconPath(cursedEnemy?.effects.find(
      ({ effectType }) => effectType === "evil_curse",
    )!)).toContain("CurseDmgUp.webp");

    const skill3 = resolveAllySkillUse({
      state,
      registry,
      sourceInstanceId: "duzyarya",
      selectedTargetInstanceId: "male-ally",
      skillStableId: "duzyarya-rider-love-of-the-inauspicious-year",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("duzyarya-skill-three").stream("effects"),
    });
    expect(skill3).toMatchObject({ accepted: true });
    if (!skill3.accepted) return;
    expect(findUnitLocation(skill3.state.formation, "male-ally")?.unit)
      .toMatchObject({ np: 3_000 });

    const passives = initializeBattlePassives(
      state,
      registry,
      createEffectRuntimeCounters(),
      new BattleRng("duzyarya-passives").stream("effects"),
    );
    expect(findUnitLocation(passives.state.formation, "male-ally")?.unit.effects)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.npGain, value: 110 }),
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.starGeneration, value: 110 }),
      ]));
  });

  it("executes the Quick support NP in source order without creating attack hits", () => {
    const { source, state } = stateWithDuzyarya(10_000);
    const readyState = {
      ...state,
      commandStarDistributionMode: "legacy_on_command_confirmation" as const,
      commandStarDistribution: null,
      commandDeck: {
        ...state.commandDeck,
        currentHand: state.commandDeck.sourceCards.slice(0, 5),
      },
    };
    const np = listCommandCardChoices(readyState).find(({ card }) =>
      card.kind === "noble_phantasm" && card.ownerInstanceId === "duzyarya"
    )?.card;
    if (!np) throw new Error("ドゥズヤールヤーの宝具カードがありません");
    const selected = selectCommandCards(readyState, [
      np.cardId,
      ...readyState.commandDeck.currentHand.slice(0, 2).map(({ cardId }) => cardId),
    ]);
    if (!selected.accepted) throw new Error("補助宝具のカード選択に失敗しました");
    const resolved = resolveAllyCommandAttacks({
      state: readyState,
      selection: selected.selection,
      registry: createBattleAttackDataRegistry([
        source.attackData,
        combatantData("male-ally", "male-ally"),
        combatantData("ally-c", "ally-c"),
        combatantData("enemy-a", "enemy-a"),
      ]),
      actionEffectRegistry: createBattleActionEffectDataRegistry([source.actionEffectData]),
      counters: createEffectRuntimeCounters(),
      rng: rngStreams("duzyarya-support-np"),
      requestedTargetInstanceId: "enemy-a",
    });
    expect(resolved.sequence.accepted).toBe(true);
    if (!resolved.sequence.accepted) return;
    const detail = resolved.sequence.result.actions[0]
      ?.resolverDetail as AllyCommandAttackDetail;
    expect(detail).toMatchObject({
      outcome: "resolved",
      overchargeStage: 1,
      resolution: { attack: null, hitTriggers: [] },
    });
    if (detail.outcome !== "resolved") return;
    expect(detail.declaredEffects.map(({ phase }) => phase))
      .toEqual(["non_damaging"]);
    expect(detail.declaredEffects[0]?.result.effects.map(({ order }) => order))
      .toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(findUnitLocation(resolved.sequence.result.state.formation, "enemy-a")?.unit.effects)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "Quick攻撃耐性ダウン", value: -100 }),
        expect.objectContaining({ name: "Arts攻撃耐性ダウン", value: -100 }),
        expect.objectContaining({ name: "Buster攻撃耐性ダウン", value: -100 }),
      ]));
  });

  it("applies the bond's 15% field effect plus 15% self effect only to removable-debuff targets", () => {
    const { source, state } = stateWithDuzyarya();
    const initialized = initializeBattleLoadout({
      state,
      rng: new BattleRng("duzyarya-bond"),
      counters: createEffectRuntimeCounters(),
      attackRegistry: createBattleAttackDataRegistry([
        source.attackData,
        combatantData("male-ally", "male-ally"),
        combatantData("ally-c", "ally-c"),
        combatantData("enemy-a", "enemy-a"),
      ]),
      craftEssenceRegistry: INITIAL_CRAFT_ESSENCE_REGISTRY,
      selection: {
        mysticCodeDataId: null,
        craftEssenceDataIdByInstanceId: {
          duzyarya: DUZYARYA_RIDER_BOND.dataId,
        },
      },
    });
    const sourceAfterLoadout = findUnitLocation(
      initialized.state.formation,
      "duzyarya",
    )?.unit;
    const allyAfterLoadout = findUnitLocation(
      initialized.state.formation,
      "male-ally",
    )?.unit;
    const removableTarget = unit("removable", "enemy", {
      effects: [{
        instanceId: "removable-debuff",
        stableId: "removable-debuff",
        name: "攻撃力ダウン",
        effectType: COMMON_EFFECT_TYPES.attack,
        category: "debuff",
        classifications: [],
        value: -100,
        remainingTurns: 3,
        remainingUses: null,
        removalPolicy: "removable",
        durationTick: "owner_turn_end",
        flags: {},
        sourceInstanceId: null,
        targetInstanceId: "removable",
        registrationOrder: 1,
      }],
    });
    const framedTarget = {
      ...removableTarget,
      instanceId: "framed",
      effects: removableTarget.effects.map((effect) => ({
        ...effect,
        targetInstanceId: "framed",
        removalPolicy: "unremovable" as const,
      })),
    };
    if (!sourceAfterLoadout || !allyAfterLoadout) throw new Error("絆礼装の対象がありません");
    const modifiers = (sourceUnit: typeof sourceAfterLoadout, target: typeof removableTarget) =>
      resolveAttackModifierTotals({
        cardType: "quick",
        isNoblePhantasm: false,
        isCritical: false,
        source: sourceUnit,
        target,
      }).source.powerModPermille;
    expect(modifiers(sourceAfterLoadout, removableTarget)).toBe(300);
    expect(modifiers(allyAfterLoadout, removableTarget)).toBe(150);
    expect(modifiers(sourceAfterLoadout, framedTarget)).toBe(0);
  });
});
