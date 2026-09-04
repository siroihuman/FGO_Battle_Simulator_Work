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

const SELF_TURN_END_HEAL = (amount: number) => ({
  timing: "turn_end" as const,
  actions: [{
    target: { relation: "self" as const, selection: "single" as const },
    action: { kind: "heal_hp" as const, amount },
    turnEndSettlement: "recurring_hp_recovery" as const,
  }],
});

export const JULIA_FARNESE_RIDER: ServantDefinition = {
  schemaVersion: SERVANT_DATA_SCHEMA_VERSION,
  dataId: "julia-farnese-rider",
  collectionNo: 29,
  collectionLabel: "029",
  name: "ジュリア・ファルネーゼ",
  rarity: 4,
  classDisplayName: "ライダー",
  growthTendency: "平均",
  attackType: "魔術",
  contentRevision: "current_upgraded_only",
  skillLevelPolicy: "max",
  classKey: "rider",
  attributeKey: "human",
  classAttackCoefficientPermille: 1_000,
  levelStats: [
    { level: 1, hp: 2_048, attack: 1_296 },
    { level: 40, hp: 7_298, attack: 4_433 },
    { level: 50, hp: 8_706, attack: 5_289 },
    { level: 60, hp: 9_987, attack: 6_066 },
    { level: 70, hp: 11_395, attack: 6_922 },
    { level: 80, hp: 12_804, attack: 7_778 },
    { level: 100, hp: 15_525, attack: 9_417 },
    { level: 120, hp: 18_246, attack: 11_057 },
  ],
  commandCards: ["quick", "quick", "arts", "arts", "buster"],
  commandCardHitWeights: [[1, 1, 1], [1, 1, 1], [1, 1], [1, 1], [1]],
  extraAttackHitWeights: [1, 1, 1, 1, 1],
  battleRates: {
    attackNpUnits: 86,
    receivedNpUnits: 300,
    attackNpRatePermille: 1_000,
    targetNpRatePermille: 1_000,
    starRatePermille: 88,
    starWeight: 204,
    targetStarRatePermille: 0,
    deathRatePermille: 400,
  },
  traits: [
    "サーヴァント", "人型", "女性", "中立", "善", "人の力", "ライダー", "騎乗",
    "ヒト科", "猛獣", "対人", "ローマ",
  ],
  activeSkills: [
    {
      stableId: "julia-farnese-beautiful-julia",
      name: "麗しのジュリア",
      rank: "A+",
      slot: 1,
      cooldownAtMax: 7,
      effects: [
        {
          kind: "effect", stableId: "julia-farnese-beautiful-julia-charm", order: 1,
          description: "敵全体〔男性〕に高確率で魅了付与[Lv](1T)：150%",
          target: { relation: "enemies", selection: "all", requiredTraits: ["男性"] },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-beautiful-julia-charm-state", name: "魅了", effectType: "charm", category: "debuff", classifications: ["mental", "charm", "immobilize"], remainingTurns: 1, durationTick: "owner_turn_end" }, baseRatePermille: 1_500 }] },
        },
        {
          kind: "effect", stableId: "julia-farnese-beautiful-julia-debuff-resistance", order: 2,
          description: "＆弱体耐性をダウン(3T)：30%",
          target: { relation: "enemies", selection: "all" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-beautiful-julia-debuff-resistance-state", name: "弱体耐性ダウン", effectType: COMMON_EFFECT_TYPES.debuffResistance, category: "debuff", value: -300, remainingTurns: 3, durationTick: "owner_turn_end" } }] },
        },
        {
          kind: "effect", stableId: "julia-farnese-beautiful-julia-defense", order: 3,
          description: "＆防御力をダウン[Lv](3T)：20%",
          target: { relation: "enemies", selection: "all" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-beautiful-julia-defense-state", name: "防御力ダウン", effectType: COMMON_EFFECT_TYPES.defense, category: "debuff", classifications: ["defense"], value: -200, remainingTurns: 3, durationTick: "owner_turn_end" } }] } },
      ],
    },
    {
      stableId: "julia-farnese-innocent-unicorn",
      name: "無垢なる一角馬",
      rank: "C",
      slot: 2,
      cooldownAtMax: 7,
      effects: [
        {
          kind: "effect", stableId: "julia-farnese-innocent-unicorn-recurring-stars", order: 1,
          description: "自身に毎ターンスター獲得状態を付与[Lv](3T)：15",
          target: { relation: "self", selection: "single" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-innocent-unicorn-recurring-stars-state", name: "毎ターンスター獲得", effectType: COMMON_EFFECT_TYPES.recurringStarGain, category: "buff", value: 15, remainingTurns: 3, durationTick: "opponent_turn_end", trigger: { timing: "turn_end", actions: [{ target: { relation: "self", selection: "single" }, action: { kind: "gain_stars", amount: 15, destination: "next_command" } }] } } }] },
        },
        {
          kind: "effect", stableId: "julia-farnese-innocent-unicorn-self-np", order: 2,
          description: "＆NPを少し増やす：10%",
          target: { relation: "self", selection: "single" },
          action: { kind: "change_np", amount: 1_000 },
        },
        {
          kind: "effect", stableId: "julia-farnese-innocent-unicorn-female-critical", order: 3,
          description: "＋味方全体の〔女性〕のクリティカル威力をアップ[Lv](3T)：50%",
          target: { relation: "allies", selection: "all", requiredTraits: ["女性"] },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-innocent-unicorn-female-critical-state", name: "クリティカル威力アップ", effectType: COMMON_EFFECT_TYPES.criticalDamage, category: "buff", value: 500, remainingTurns: 3, durationTick: "opponent_turn_end" } }] },
        },
        {
          kind: "effect", stableId: "julia-farnese-innocent-unicorn-female-np", order: 4,
          description: "＆NPを少し増やす：10%",
          target: { relation: "allies", selection: "all", requiredTraits: ["女性"] },
          action: { kind: "change_np", amount: 1_000 },
        },
      ],
    },
    {
      stableId: "julia-farnese-white-lily-beast",
      name: "白百合の獣",
      rank: "A+++",
      slot: 3,
      cooldownAtMax: 8,
      effects: [
        {
          kind: "effect", stableId: "julia-farnese-white-lily-beast-heal", order: 1,
          description: "味方全体のHPを回復[Lv]：3000",
          target: { relation: "allies", selection: "all" },
          action: { kind: "heal_hp", amount: 3_000 },
        },
        {
          kind: "effect", stableId: "julia-farnese-white-lily-beast-clear-debuff", order: 2,
          description: "＆弱体状態を解除",
          target: { relation: "allies", selection: "all" },
          action: { kind: "remove_effects", request: { mode: "all", category: "debuff" } },
        },
        {
          kind: "effect", stableId: "julia-farnese-white-lily-beast-recurring-heal", order: 3,
          description: "＆毎ターンHP回復状態を付与[Lv](5T)：1000",
          target: { relation: "allies", selection: "all" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-white-lily-beast-recurring-heal-state", name: "毎ターンHP回復", effectType: COMMON_EFFECT_TYPES.recurringHpRecovery, category: "buff", value: 1_000, remainingTurns: 5, durationTick: "opponent_turn_end", trigger: SELF_TURN_END_HEAL(1_000) } }] },
        },
        {
          kind: "effect", stableId: "julia-farnese-white-lily-beast-recurring-np", order: 4,
          description: "＆毎ターンNP獲得状態を付与[Lv](5T)：10%",
          target: { relation: "allies", selection: "all" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-white-lily-beast-recurring-np-state", name: "毎ターンNP獲得", effectType: COMMON_EFFECT_TYPES.recurringNpGain, category: "buff", value: 1_000, remainingTurns: 5, durationTick: "opponent_turn_end", trigger: { timing: "turn_end", actions: [{ target: { relation: "self", selection: "single" }, action: { kind: "change_np", amount: 1_000 } }] } } }] },
        },
      ],
    },
  ],
  classSkills: [
    { stableId: "julia-farnese-magic-resistance", name: "対魔力", rank: "D", effects: [{ kind: "effect", stableId: "julia-farnese-magic-resistance-debuff", order: 1, description: "自身の弱体耐性を12.5%アップ", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-magic-resistance-debuff-state", name: "弱体耐性アップ", effectType: COMMON_EFFECT_TYPES.debuffResistance, value: 125, ...PASSIVE } }] } }] },
    { stableId: "julia-farnese-riding", name: "騎乗", rank: "A", effects: [{ kind: "effect", stableId: "julia-farnese-riding-quick", order: 1, description: "自身のQuickカード性能を10%アップ", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-riding-quick-state", name: "Quickカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 100, flags: { cardType: "quick" }, ...PASSIVE } }] } }] },
  ],
  noblePhantasm: {
    stableId: "julia-farnese-unicorn-lilies-farnese",
    name: "百合紋章の一角獣",
    reading: "ウニコルニス・リリオルム・ファルネシアノルム",
    rank: "A",
    cardType: "quick",
    effects: [
      { kind: "effect", stableId: "julia-farnese-np-invincibility-pierce", order: 1, description: "自身に無敵貫通状態を付与(3T)", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-np-invincibility-pierce-state", name: "無敵貫通", effectType: COMMON_EFFECT_TYPES.invincibilityPierce, category: "buff", remainingTurns: 3, durationTick: "owner_turn_end" } }] } },
      { kind: "effect", stableId: "julia-farnese-np-quick", order: 2, description: "＆Quickカード性能をアップ(3T)<OC:効果UP>：30% / 35% / 40% / 45% / 50%", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-np-quick-state", name: "Quickカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, category: "buff", value: { scaling: "overcharge", values: [300, 350, 400, 450, 500] }, remainingTurns: 3, durationTick: "owner_turn_end", flags: { cardType: "quick" } } }] } },
      { kind: "attack", stableId: "julia-farnese-np-damage", order: 3, targetScope: "all", hitWeights: [1, 1, 1, 1, 1], damageMultiplierPermilleByLevel: [800, 1_000, 1_100, 1_150, 1_200], specialAttack: { stableId: "julia-farnese-np-evil-special-attack", requiredTargetTraits: ["悪"], multiplierPermille: 1_500 } },
      { kind: "effect", stableId: "julia-farnese-np-debuff-resistance", order: 4, description: "＋自身の弱体耐性をアップ(3T)<OC:効果UP>：50% / 62.5% / 75% / 87.5% / 100%", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-np-debuff-resistance-state", name: "弱体耐性アップ", effectType: COMMON_EFFECT_TYPES.debuffResistance, category: "buff", value: { scaling: "overcharge", values: [500, 625, 750, 875, 1_000] }, remainingTurns: 3, durationTick: "owner_turn_end" } }] } },
    ],
  },
  sources: [{
    url: "https://w.atwiki.jp/siroi_human/pages/31.html",
    checkedAt: "2026-08-31",
    note: "強化後データのみ。Lv80を含む全Lv表、上位3スキル、対魔力D・騎乗A、Quick全体宝具の効果順・倍率・Hit数・特性を同ページで照合。",
  }],
};
