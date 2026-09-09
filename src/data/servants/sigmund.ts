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

export const SIGMUND: ServantDefinition = {
  schemaVersion: SERVANT_DATA_SCHEMA_VERSION,
  dataId: "sigmund",
  collectionNo: 10,
  collectionLabel: "010",
  name: "シグムンド",
  rarity: 4,
  classDisplayName: "セイバー",
  growthTendency: "凸型弱",
  attackType: "物理",
  contentRevision: "current_upgraded_only",
  skillLevelPolicy: "max",
  classKey: "saber",
  attributeKey: "earth",
  classAttackCoefficientPermille: 1_000,
  levelStats: [
    { level: 1, hp: 1_928, attack: 1_582 },
    { level: 40, hp: 6_870, attack: 5_412 },
    { level: 50, hp: 8_437, attack: 6_647 },
    { level: 60, hp: 10_003, attack: 7_881 },
    { level: 70, hp: 11_209, attack: 8_831 },
    { level: 80, hp: 12_053, attack: 9_496 },
    { level: 100, hp: 14_614, attack: 11_498 },
    { level: 120, hp: 17_176, attack: 13_500 },
  ],
  commandCards: ["quick", "arts", "arts", "buster", "buster"],
  commandCardHitWeights: [[1, 1], [1, 1, 1], [1, 1, 1], [1, 1], [1, 1]],
  extraAttackHitWeights: [1, 1, 1],
  battleRates: {
    attackNpUnits: 56,
    receivedNpUnits: 300,
    attackNpRatePermille: 1_000,
    targetNpRatePermille: 1_000,
    starRatePermille: 99,
    starWeight: 97,
    targetStarRatePermille: 0,
    deathRatePermille: 245,
  },
  traits: [
    "サーヴァント", "人型", "男性", "秩序", "善", "地の力", "セイバー",
    "騎乗", "ヒト科", "王", "炎",
  ],
  activeSkills: [
    {
      stableId: "sigmund-protection-of-the-gods",
      name: "神々の加護",
      rank: "A+",
      slot: 1,
      cooldownAtMax: 6,
      effects: [
        {
          kind: "effect", stableId: "sigmund-protection-of-the-gods-critical", order: 1,
          description: "自身のクリティカル威力をアップ[Lv](3T)：50%",
          target: { relation: "self", selection: "single" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "sigmund-protection-of-the-gods-critical-state", name: "クリティカル威力アップ", effectType: COMMON_EFFECT_TYPES.criticalDamage, category: "buff", value: 500, remainingTurns: 3 } }] },
        },
        {
          kind: "effect", stableId: "sigmund-protection-of-the-gods-star-focus", order: 2,
          description: "＆スター集中度をアップ(3T)：600%",
          target: { relation: "self", selection: "single" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "sigmund-protection-of-the-gods-star-focus-state", name: "スター集中度アップ", effectType: COMMON_EFFECT_TYPES.starFocus, category: "buff", value: 6_000, remainingTurns: 3 } }] },
        },
        {
          kind: "effect", stableId: "sigmund-protection-of-the-gods-np", order: 3,
          description: "＆NPを増やす[Lv]：30%",
          target: { relation: "self", selection: "single" },
          action: { kind: "change_np", amount: 3_000 },
        },
        {
          kind: "effect", stableId: "sigmund-protection-of-the-gods-stars", order: 4,
          description: "＆スターを大量獲得：25個",
          target: { relation: "self", selection: "single" },
          action: { kind: "gain_stars", amount: 25, destination: "command" },
        },
      ],
    },
    {
      stableId: "sigmund-return-to-the-wolf",
      name: "人の理を脱ぎ、王は狼へと還る",
      rank: "A+",
      slot: 2,
      cooldownAtMax: 5,
      effects: [
        {
          kind: "effect", stableId: "sigmund-return-to-the-wolf-buster", order: 1,
          description: "自身のBusterカード性能をアップ[Lv](3回・3T)：55%",
          target: { relation: "self", selection: "single" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "sigmund-return-to-the-wolf-buster-state", name: "Busterカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, category: "buff", value: 550, remainingTurns: 3, remainingUses: 3, flags: { cardType: "buster" } } }] },
        },
        {
          kind: "effect", stableId: "sigmund-return-to-the-wolf-buster-np", order: 2,
          description: "＆「Buster攻撃時にNPを増やす状態」を付与[Lv](3T)：5%",
          target: { relation: "self", selection: "single" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "sigmund-return-to-the-wolf-buster-np-state", name: "Buster攻撃時NP増加", effectType: "trigger", category: "buff", remainingTurns: 3, trigger: { timing: "on_attack", condition: { actor: "owner", attackKinds: ["normal_command", "noble_phantasm"], cardTypes: ["buster"] }, actions: [{ target: { relation: "self", selection: "single" }, action: { kind: "change_np", amount: 500 } }] } } }] },
        },
      ],
    },
    {
      stableId: "sigmund-war-kings-charisma",
      name: "戦王のカリスマ",
      rank: "A+",
      slot: 3,
      cooldownAtMax: 6,
      effects: [
        {
          kind: "effect", stableId: "sigmund-war-kings-charisma-party-attack", order: 1,
          description: "味方全体の攻撃力をアップ[Lv](3T)：20%",
          target: { relation: "allies", selection: "all" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "sigmund-war-kings-charisma-party-attack-state", name: "攻撃力アップ", effectType: COMMON_EFFECT_TYPES.attack, category: "buff", value: 200, remainingTurns: 3 } }] },
        },
        {
          kind: "effect", stableId: "sigmund-war-kings-charisma-party-critical", order: 2,
          description: "＆クリティカル威力をアップ[Lv](3T)：20%",
          target: { relation: "allies", selection: "all" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "sigmund-war-kings-charisma-party-critical-state", name: "クリティカル威力アップ", effectType: COMMON_EFFECT_TYPES.criticalDamage, category: "buff", value: 200, remainingTurns: 3 } }] },
        },
        {
          kind: "effect", stableId: "sigmund-war-kings-charisma-other-attack", order: 3,
          description: "＋自身を除く味方全体の攻撃力をアップ(3T)：30%",
          target: { relation: "allies", selection: "all", excludeSource: true },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "sigmund-war-kings-charisma-other-attack-state", name: "攻撃力アップ", effectType: COMMON_EFFECT_TYPES.attack, category: "buff", value: 300, remainingTurns: 3 } }] },
        },
        {
          kind: "effect", stableId: "sigmund-war-kings-charisma-stun", order: 4,
          description: "＋敵全体に確率でスタン状態を付与(1T)：60%",
          target: { relation: "enemies", selection: "all" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "sigmund-war-kings-charisma-stun-state", name: "スタン", effectType: "stun", category: "debuff", classifications: ["immobilize"], remainingTurns: 1, durationTick: "owner_turn_end" }, baseRatePermille: 600 }] },
        },
        {
          kind: "effect", stableId: "sigmund-war-kings-charisma-critical-resistance", order: 5,
          description: "＆クリティカル攻撃耐性をダウン(1T)：50%",
          target: { relation: "enemies", selection: "all" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "sigmund-war-kings-charisma-critical-resistance-state", name: "クリティカル攻撃耐性ダウン", effectType: COMMON_EFFECT_TYPES.targetDamage, category: "debuff", value: 500, remainingTurns: 1, durationTick: "owner_turn_end", flags: { criticalOnly: true } } }] },
        },
      ],
    },
  ],
  classSkills: [
    { stableId: "sigmund-magic-resistance", name: "対魔力", rank: "A", effects: [{ kind: "effect", stableId: "sigmund-magic-resistance-debuff", order: 1, description: "自身の弱体耐性をアップ：20%", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "sigmund-magic-resistance-debuff-state", name: "弱体耐性アップ", effectType: COMMON_EFFECT_TYPES.debuffResistance, value: 200, ...PASSIVE } }] } }] },
    { stableId: "sigmund-riding", name: "騎乗", rank: "C", effects: [{ kind: "effect", stableId: "sigmund-riding-quick", order: 1, description: "自身のQuickカード性能を少しアップ：6%", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "sigmund-riding-quick-state", name: "Quickカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 60, flags: { cardType: "quick" }, ...PASSIVE } }] } }] },
    { stableId: "sigmund-avenger", name: "復讐者", rank: "B", effects: [
      { kind: "effect", stableId: "sigmund-avenger-received-np", order: 1, description: "自身の被ダメージ時に獲得するNPアップ：18%", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "sigmund-avenger-received-np-state", name: "被ダメージ時のNP獲得量アップ", effectType: COMMON_EFFECT_TYPES.receivedNpGain, value: 180, ...PASSIVE } }] } },
      { kind: "effect", stableId: "sigmund-avenger-party-debuff-resistance", order: 2, description: "＋自身を除く味方全体<控え含む>の弱体耐性をダウン：8%【デメリット】", target: { relation: "allies", selection: "all", includeReserve: true, excludeSource: true }, action: { kind: "apply_effects", effects: [{ template: { stableId: "sigmund-avenger-party-debuff-resistance-state", name: "弱体耐性ダウン", effectType: COMMON_EFFECT_TYPES.debuffResistance, category: "debuff", value: -80, removalPolicy: "unremovable", durationTick: "manual" }, baseRatePermille: 5_000 }] } },
    ] },
    { stableId: "sigmund-antitoxin", name: "抗毒", rank: "A++", effects: [{ kind: "effect", stableId: "sigmund-antitoxin-poison-immunity", order: 1, description: "自身に毒無効状態を付与", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "sigmund-antitoxin-poison-immunity-state", name: "毒無効", effectType: COMMON_EFFECT_TYPES.debuffImmunity, classifications: ["poison"], ...PASSIVE } }] } }] },
  ],
  noblePhantasm: {
    stableId: "sigmund-barlaug-gram",
    name: "根ざす大樹の根幹、抜き取りし焔の眼",
    reading: "バーレイグ・グラム",
    rank: "A++",
    cardType: "buster",
    effects: [
      { kind: "attack", stableId: "sigmund-np-damage", order: 1, targetScope: "all", hitWeights: [1, 1, 1], damageMultiplierPermilleByLevel: [3_000, 4_000, 4_500, 4_750, 5_000] },
      { kind: "effect", stableId: "sigmund-np-party-attack", order: 2, description: "＋味方全体の攻撃力をアップ(3T)<OC:効果UP>：10% / 12.5% / 15% / 17.5% / 20%", target: { relation: "allies", selection: "all" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "sigmund-np-party-attack-state", name: "攻撃力アップ", effectType: COMMON_EFFECT_TYPES.attack, category: "buff", value: { scaling: "overcharge", values: [100, 125, 150, 175, 200] }, remainingTurns: 3 } }] } },
      { kind: "effect", stableId: "sigmund-np-guts", order: 3, description: "＋自身にガッツ状態を付与(1回・3T)：2000", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "sigmund-np-guts-state", name: "ガッツ", effectType: COMMON_EFFECT_TYPES.guts, category: "buff", classifications: ["defense"], value: 2_000, remainingTurns: 3, remainingUses: 1, durationTick: "opponent_turn_end" } }] } },
    ],
  },
  sources: [{
    url: "https://w.atwiki.jp/siroi_human/pages/258.html",
    checkedAt: "2026-09-08",
    note: "強化後データのみ。全Lv表、上位3スキル、全クラススキル、Buster全体宝具の効果順・倍率・Hit数・特性を同ページで照合。",
  }],
};
