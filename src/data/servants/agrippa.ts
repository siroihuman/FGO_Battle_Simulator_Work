import { COMMON_EFFECT_TYPES } from "../../effects/modifiers";
import {
  SERVANT_DATA_SCHEMA_VERSION,
  type ServantDefinition,
} from "./schema";

const PASSIVE = {
  category: "buff" as const,
  removalPolicy: "unremovable" as const,
  durationTick: "manual" as const,
};

export const AGRIPPA: ServantDefinition = {
  schemaVersion: SERVANT_DATA_SCHEMA_VERSION,
  dataId: "agrippa",
  collectionNo: 56,
  name: "アグリッパ",
  rarity: 3,
  classDisplayName: "キャスター",
  growthTendency: "平均",
  attackType: "物理",
  contentRevision: "current_upgraded_only",
  skillLevelPolicy: "max",
  classKey: "caster",
  attributeKey: "human",
  classAttackCoefficientPermille: 900,
  levelStats: [
    { level: 1, hp: 1_852, attack: 1_157 },
    { level: 30, hp: 5_350, attack: 3_242 },
    { level: 40, hp: 6_585, attack: 3_990 },
    { level: 50, hp: 8_232, attack: 4_988 },
    { level: 60, hp: 9_466, attack: 5_736 },
    { level: 70, hp: 10_290, attack: 6_235 },
    { level: 100, hp: 13_952, attack: 8_438 },
    { level: 120, hp: 16_399, attack: 9_911 },
  ],
  commandCards: ["quick", "arts", "arts", "buster", "buster"],
  commandCardHitWeights: [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1], [1]],
  extraAttackHitWeights: [1, 1, 1, 1, 1],
  battleRates: {
    attackNpUnits: 49,
    receivedNpUnits: 300,
    attackNpRatePermille: 1_000,
    targetNpRatePermille: 1_000,
    starRatePermille: 110,
    starWeight: 51,
    targetStarRatePermille: 0,
    deathRatePermille: 570,
  },
  traits: [
    "サーヴァント", "人型", "男性", "秩序", "善", "人の力", "キャスター",
    "ヒト科", "愛する者", "対人", "ローマ",
  ],
  activeSkills: [
    {
      stableId: "agrippa-for-your-sake",
      name: "御身のために",
      rank: "EX",
      slot: 1,
      cooldownAtMax: 8,
      effects: [
        {
          kind: "effect", stableId: "agrippa-for-your-sake-party-attack", order: 1,
          description: "味方全体の攻撃力をアップ[Lv](3T)：20%",
          target: { relation: "allies", selection: "all" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "agrippa-for-your-sake-party-attack-state", name: "攻撃力アップ", effectType: COMMON_EFFECT_TYPES.attack, category: "buff", value: 200, remainingTurns: 3 } }] },
        },
        {
          kind: "effect", stableId: "agrippa-for-your-sake-party-defense", order: 2,
          description: "＆防御力をアップ(3T)：20%",
          target: { relation: "allies", selection: "all" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "agrippa-for-your-sake-party-defense-state", name: "防御力アップ", effectType: COMMON_EFFECT_TYPES.defense, category: "buff", classifications: ["defense"], value: 200, remainingTurns: 3, durationTick: "opponent_turn_end" } }] },
        },
        {
          kind: "effect", stableId: "agrippa-for-your-sake-party-np", order: 3,
          description: "＆NPを少し増やす：10%",
          target: { relation: "allies", selection: "all" },
          action: { kind: "change_np", amount: 1_000 },
        },
        {
          kind: "effect", stableId: "agrippa-for-your-sake-first-emperor-attack", order: 4,
          description: "＋味方全体の〔初代ローマ皇帝〕の攻撃力をアップ(3T)：20%",
          target: { relation: "allies", selection: "all", requiredTraits: ["初代ローマ皇帝"] },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "agrippa-for-your-sake-first-emperor-attack-state", name: "攻撃力アップ", effectType: COMMON_EFFECT_TYPES.attack, category: "buff", value: 200, remainingTurns: 3 } }] },
        },
      ],
    },
    {
      stableId: "agrippa-joy-of-service",
      name: "尽くす事こそ我が喜び",
      rank: "A++",
      slot: 2,
      cooldownAtMax: 9,
      effects: [
        {
          kind: "effect", stableId: "agrippa-joy-of-service-arts", order: 1,
          description: "味方単体のArtsカード性能をアップ[Lv](3T)：20%",
          target: { relation: "allies", selection: "single" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "agrippa-joy-of-service-arts-state", name: "Artsカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, category: "buff", value: 200, remainingTurns: 3, flags: { cardType: "arts" } } }] },
        },
        {
          kind: "effect", stableId: "agrippa-joy-of-service-np", order: 2,
          description: "＆NPを増やす：20%",
          target: { relation: "allies", selection: "single" },
          action: { kind: "change_np", amount: 2_000 },
        },
        {
          kind: "effect", stableId: "agrippa-joy-of-service-first-emperor-arts", order: 3,
          description: "＋味方単体の〔初代ローマ皇帝〕のArtsカード性能をアップ(3T)：50%",
          target: { relation: "allies", selection: "single", requiredTraits: ["初代ローマ皇帝"] },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "agrippa-joy-of-service-first-emperor-arts-state", name: "Artsカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, category: "buff", value: 500, remainingTurns: 3, flags: { cardType: "arts" } } }] },
        },
        {
          kind: "effect", stableId: "agrippa-joy-of-service-first-emperor-np-damage", order: 4,
          description: "＆宝具威力をアップ(3T)：30%",
          target: { relation: "allies", selection: "single", requiredTraits: ["初代ローマ皇帝"] },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "agrippa-joy-of-service-first-emperor-np-damage-state", name: "宝具威力アップ", effectType: COMMON_EFFECT_TYPES.noblePhantasmDamage, category: "buff", value: 300, remainingTurns: 3 } }] },
        },
      ],
    },
    {
      stableId: "agrippa-country-of-peace",
      name: "共に、安寧と平和で護られた国を",
      rank: "EX",
      slot: 3,
      cooldownAtMax: 9,
      effects: [
        {
          kind: "effect", stableId: "agrippa-country-of-peace-defense", order: 1,
          description: "味方単体の防御力をアップ[Lv](3T)：20%",
          target: { relation: "allies", selection: "single" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "agrippa-country-of-peace-defense-state", name: "防御力アップ", effectType: COMMON_EFFECT_TYPES.defense, category: "buff", classifications: ["defense"], value: 200, remainingTurns: 3, durationTick: "opponent_turn_end" } }] },
        },
        {
          kind: "effect", stableId: "agrippa-country-of-peace-anti-person", order: 2,
          description: "＆〔対人〕特防状態を付与[Lv](3T)：30%",
          target: { relation: "allies", selection: "single" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "agrippa-country-of-peace-anti-person-state", name: "〔対人〕特防状態", effectType: COMMON_EFFECT_TYPES.specialDefense, category: "buff", classifications: ["defense"], value: 300, remainingTurns: 3, durationTick: "opponent_turn_end", flags: { requiredAttackerTrait: "対人" } } }] },
        },
        {
          kind: "effect", stableId: "agrippa-country-of-peace-first-emperor-np", order: 3,
          description: "＋味方単体の〔初代ローマ皇帝〕のNPを増やす：20%",
          target: { relation: "allies", selection: "single", requiredTraits: ["初代ローマ皇帝"] },
          action: { kind: "change_np", amount: 2_000 },
        },
        {
          kind: "effect", stableId: "agrippa-country-of-peace-first-emperor-np-gain", order: 4,
          description: "＆NP獲得量をアップ(3T)：30%",
          target: { relation: "allies", selection: "single", requiredTraits: ["初代ローマ皇帝"] },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "agrippa-country-of-peace-first-emperor-np-gain-state", name: "NP獲得量アップ", effectType: COMMON_EFFECT_TYPES.npGain, category: "buff", value: 300, remainingTurns: 3 } }] },
        },
        {
          kind: "effect", stableId: "agrippa-country-of-peace-first-emperor-invincibility", order: 5,
          description: "＆無敵状態を付与(1回・3T)",
          target: { relation: "allies", selection: "single", requiredTraits: ["初代ローマ皇帝"] },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "agrippa-country-of-peace-first-emperor-invincibility-state", name: "無敵", effectType: COMMON_EFFECT_TYPES.invincibility, category: "buff", remainingTurns: 3, remainingUses: 1, durationTick: "opponent_turn_end" } }] },
        },
      ],
    },
  ],
  classSkills: [
    {
      stableId: "agrippa-magic-resistance", name: "対魔力", rank: "A+",
      effects: [{ kind: "effect", stableId: "agrippa-magic-resistance-state", order: 1, description: "自身の弱体耐性をアップ：21%", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "agrippa-magic-resistance-state-effect", name: "弱体耐性アップ", effectType: COMMON_EFFECT_TYPES.debuffResistance, value: 210, ...PASSIVE } }] } }],
    },
    {
      stableId: "agrippa-territory-creation", name: "陣地作成", rank: "B+",
      effects: [{ kind: "effect", stableId: "agrippa-territory-creation-arts", order: 1, description: "自身のArtsカード性能をアップ：9%", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "agrippa-territory-creation-arts-state", name: "Artsカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 90, flags: { cardType: "arts" }, ...PASSIVE } }] } }],
    },
  ],
  noblePhantasm: {
    stableId: "agrippa-ad-calm-octavianus",
    name: "親愛なる皇帝へ",
    reading: "アド・カルム・オクタウィアヌス",
    rank: "A++",
    cardType: "arts",
    effects: [
      {
        kind: "effect", stableId: "agrippa-np-arts", order: 1,
        description: "自身のArtsカード性能をアップ(1T)<OC:効果UP>：20% / 25% / 30% / 35% / 40%",
        target: { relation: "self", selection: "single" },
        action: { kind: "apply_effects", effects: [{ template: { stableId: "agrippa-np-arts-state", name: "Artsカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, category: "buff", value: { scaling: "overcharge", values: [200, 250, 300, 350, 400] }, remainingTurns: 1, flags: { cardType: "arts" } } }] },
      },
      {
        kind: "attack", stableId: "agrippa-np-damage", order: 2, targetScope: "all", hitWeights: [1, 1, 1, 1],
        damageMultiplierPermilleByLevel: [4_500, 6_000, 6_750, 7_125, 7_500],
      },
      {
        kind: "effect", stableId: "agrippa-np-hp-reduction", order: 3,
        description: "＋自身のHPを減少【デメリット】：2000",
        target: { relation: "self", selection: "single" },
        action: { kind: "reduce_hp", amount: 2_000, canDefeat: true },
      },
    ],
  },
  sources: [{
    url: "https://w.atwiki.jp/siroi_human/pages/300.html",
    checkedAt: "2026-08-25",
    note: "強化後データのみ。Lv別ステータス、スキル・宝具・クラススキルの効果順を照合。スキル1のランクEXはユーザー指定を優先。",
  }],
};
