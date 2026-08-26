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

export const DUZYARYA_RIDER: ServantDefinition = {
  schemaVersion: SERVANT_DATA_SCHEMA_VERSION,
  dataId: "duzyarya-rider",
  collectionNo: 25,
  collectionLabel: "025",
  name: "ドゥズヤールヤー",
  rarity: 4,
  classDisplayName: "ライダー",
  growthTendency: "凸型",
  attackType: "魔術",
  contentRevision: "current_upgraded_only",
  skillLevelPolicy: "max",
  classKey: "rider",
  attributeKey: "earth",
  classAttackCoefficientPermille: 1_000,
  levelStats: [
    { level: 1, hp: 1_862, attack: 1_484 },
    { level: 40, hp: 6_867, attack: 5_253 },
    { level: 50, hp: 8_730, attack: 6_678 },
    { level: 60, hp: 10_243, attack: 7_835 },
    { level: 70, hp: 11_290, attack: 8_636 },
    { level: 80, hp: 11_640, attack: 8_904 },
    { level: 100, hp: 14_113, attack: 10_781 },
    { level: 120, hp: 16_587, attack: 12_658 },
  ],
  commandCards: ["quick", "quick", "arts", "arts", "buster"],
  commandCardHitWeights: [[1, 1, 1], [1, 1, 1], [1, 1], [1, 1], [1, 1]],
  extraAttackHitWeights: [1, 1, 1],
  battleRates: {
    attackNpUnits: 88,
    receivedNpUnits: 300,
    attackNpRatePermille: 1_000,
    targetNpRatePermille: 1_000,
    starRatePermille: 91,
    starRateBasisPoints: 918,
    starWeight: 194,
    targetStarRatePermille: 0,
    deathRatePermille: 300,
  },
  traits: [
    "サーヴァント", "人型", "女性", "混沌", "悪", "地の力", "ライダー",
    "騎乗", "ヒト科以外", "悪魔", "対人",
  ],
  activeSkills: [
    {
      stableId: "duzyarya-rider-sorcery-demonic",
      name: "呪術（魔）",
      rank: "A",
      slot: 1,
      cooldownAtMax: 8,
      effects: [
        {
          kind: "effect", stableId: "duzyarya-rider-sorcery-demonic-charge", order: 1,
          description: "敵単体のチャージを減らす[Lv]：80%",
          target: { relation: "enemies", selection: "single" },
          action: { kind: "change_enemy_charge", amount: -1, successRatePermille: 800 },
        },
        {
          kind: "effect", stableId: "duzyarya-rider-sorcery-demonic-arts", order: 2,
          description: "＋自身のArtsカード性能をアップ[Lv](3T)：20%",
          target: { relation: "self", selection: "single" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "duzyarya-rider-sorcery-demonic-arts-state", name: "Artsカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, category: "buff", value: 200, remainingTurns: 3, flags: { cardType: "arts" } } }] },
        },
        {
          kind: "effect", stableId: "duzyarya-rider-sorcery-demonic-np-gain", order: 3,
          description: "＆NP獲得量をアップ[Lv](3T)：30%",
          target: { relation: "self", selection: "single" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "duzyarya-rider-sorcery-demonic-np-gain-state", name: "NP獲得量アップ", effectType: COMMON_EFFECT_TYPES.npGain, category: "buff", value: 300, remainingTurns: 3 } }] },
        },
      ],
    },
    {
      stableId: "duzyarya-rider-high-speed-incantation-curse",
      name: "高速神言（呪）",
      rank: "B",
      slot: 2,
      cooldownAtMax: 9,
      effects: [
        {
          kind: "effect", stableId: "duzyarya-rider-high-speed-incantation-curse-np", order: 1,
          description: "自身のNPを増やす[Lv]：80%",
          target: { relation: "self", selection: "single" },
          action: { kind: "change_np", amount: 8_000 },
        },
        {
          kind: "effect", stableId: "duzyarya-rider-high-speed-incantation-curse-curse", order: 2,
          description: "＋敵全体に呪い状態を付与[Lv](5T)：4000",
          target: { relation: "enemies", selection: "all" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "duzyarya-rider-high-speed-incantation-curse-curse-state", name: "呪い", effectType: "curse", category: "debuff", classifications: ["curse"], value: 4_000, remainingTurns: 5, durationTick: "owner_turn_end", trigger: { timing: "turn_end", actions: [{ target: { relation: "self", selection: "single" }, action: { kind: "reduce_hp", amount: 4_000, canDefeat: false }, turnEndSettlement: "slip_damage", slipDamageKind: "curse" }] } }, baseRatePermille: 5_000 }] },
        },
        {
          kind: "effect", stableId: "duzyarya-rider-high-speed-incantation-curse-evil-curse", order: 3,
          description: "＆呪厄状態を付与[Lv](5T)：100%",
          target: { relation: "enemies", selection: "all" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "duzyarya-rider-high-speed-incantation-curse-evil-curse-state", name: "呪厄", effectType: "evil_curse", category: "debuff", value: 1_000, remainingTurns: 5, durationTick: "owner_turn_end", slipDamageAmplifierKind: "evil_curse" }, baseRatePermille: 5_000 }] },
        },
      ],
    },
    {
      stableId: "duzyarya-rider-love-of-the-inauspicious-year",
      name: "凶年の寵愛",
      rank: "A++",
      slot: 3,
      cooldownAtMax: 9,
      effects: [
        {
          kind: "effect", stableId: "duzyarya-rider-love-of-the-inauspicious-year-party-attack", order: 1,
          description: "味方全体の攻撃力をアップ[Lv](3T)：20%",
          target: { relation: "allies", selection: "all" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "duzyarya-rider-love-of-the-inauspicious-year-party-attack-state", name: "攻撃力アップ", effectType: COMMON_EFFECT_TYPES.attack, category: "buff", value: 200, remainingTurns: 3 } }] },
        },
        {
          kind: "effect", stableId: "duzyarya-rider-love-of-the-inauspicious-year-party-critical", order: 2,
          description: "＆クリティカル威力をアップ[Lv](3T)：30%",
          target: { relation: "allies", selection: "all" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "duzyarya-rider-love-of-the-inauspicious-year-party-critical-state", name: "クリティカル威力アップ", effectType: COMMON_EFFECT_TYPES.criticalDamage, category: "buff", value: 300, remainingTurns: 3 } }] },
        },
        {
          kind: "effect", stableId: "duzyarya-rider-love-of-the-inauspicious-year-party-np-gain", order: 3,
          description: "＆NP獲得量をアップ[Lv](3T)：30%",
          target: { relation: "allies", selection: "all" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "duzyarya-rider-love-of-the-inauspicious-year-party-np-gain-state", name: "NP獲得量アップ", effectType: COMMON_EFFECT_TYPES.npGain, category: "buff", value: 300, remainingTurns: 3 } }] },
        },
        {
          kind: "effect", stableId: "duzyarya-rider-love-of-the-inauspicious-year-target-np", order: 4,
          description: "＋味方単体のNPを増やす[Lv]：30%",
          target: { relation: "allies", selection: "single" },
          action: { kind: "change_np", amount: 3_000 },
        },
      ],
    },
  ],
  classSkills: [
    {
      stableId: "duzyarya-rider-magic-resistance", name: "対魔力", rank: "C",
      effects: [{ kind: "effect", stableId: "duzyarya-rider-magic-resistance-state", order: 1, description: "自身の弱体耐性をアップ：15%", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "duzyarya-rider-magic-resistance-state-effect", name: "弱体耐性アップ", effectType: COMMON_EFFECT_TYPES.debuffResistance, value: 150, ...PASSIVE } }] } }],
    },
    {
      stableId: "duzyarya-rider-shooting-star-riding", name: "騎乗（流星）", rank: "A+",
      effects: [
        { kind: "effect", stableId: "duzyarya-rider-shooting-star-riding-quick", order: 1, description: "自身のQuickカード性能をアップ：11%", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "duzyarya-rider-shooting-star-riding-quick-state", name: "Quickカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 110, flags: { cardType: "quick" }, ...PASSIVE } }] } },
        { kind: "effect", stableId: "duzyarya-rider-shooting-star-riding-male-np-gain", order: 2, description: "＋味方全体の〔男性〕のNP獲得量をアップ：11%", target: { relation: "allies", selection: "all", requiredTraits: ["男性"] }, action: { kind: "apply_effects", effects: [{ template: { stableId: "duzyarya-rider-shooting-star-riding-male-np-gain-state", name: "NP獲得量アップ", effectType: COMMON_EFFECT_TYPES.npGain, value: 110, ...PASSIVE } }] } },
        { kind: "effect", stableId: "duzyarya-rider-shooting-star-riding-male-stars", order: 3, description: "＆スター発生率をアップ：11%", target: { relation: "allies", selection: "all", requiredTraits: ["男性"] }, action: { kind: "apply_effects", effects: [{ template: { stableId: "duzyarya-rider-shooting-star-riding-male-stars-state", name: "スター発生率アップ", effectType: COMMON_EFFECT_TYPES.starGeneration, value: 110, ...PASSIVE } }] } },
      ],
    },
  ],
  noblePhantasm: {
    stableId: "duzyarya-rider-parika",
    name: "禍の天光",
    reading: "パリカー",
    rank: "A+",
    cardType: "quick",
    effects: [
      { kind: "effect", stableId: "duzyarya-rider-np-attack-down", order: 1, description: "敵全体の攻撃力をダウン(5T)<宝具Lv:効果UP>：20% / 25% / 30% / 35% / 40%", target: { relation: "enemies", selection: "all" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "duzyarya-rider-np-attack-down-state", name: "攻撃力ダウン", effectType: COMMON_EFFECT_TYPES.attack, category: "debuff", value: { scaling: "noble_phantasm_level", values: [-200, -250, -300, -350, -400] }, remainingTurns: 5, durationTick: "owner_turn_end" }, baseRatePermille: 1_500 }] } },
      { kind: "effect", stableId: "duzyarya-rider-np-defense-down", order: 2, description: "＆防御力をダウン(5T)<宝具Lv:効果UP>：20% / 25% / 30% / 35% / 40%", target: { relation: "enemies", selection: "all" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "duzyarya-rider-np-defense-down-state", name: "防御力ダウン", effectType: COMMON_EFFECT_TYPES.defense, category: "debuff", classifications: ["defense"], value: { scaling: "noble_phantasm_level", values: [-200, -250, -300, -350, -400] }, remainingTurns: 5, durationTick: "owner_turn_end" }, baseRatePermille: 1_500 }] } },
      { kind: "effect", stableId: "duzyarya-rider-np-quick-resistance-down", order: 3, description: "＆Quick攻撃耐性をダウン(5T)<OC:効果UP>：10% / 12.5% / 15% / 17.5% / 20%", target: { relation: "enemies", selection: "all" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "duzyarya-rider-np-quick-resistance-down-state", name: "Quick攻撃耐性ダウン", effectType: COMMON_EFFECT_TYPES.cardResistance, category: "debuff", value: { scaling: "overcharge", values: [-100, -125, -150, -175, -200] }, remainingTurns: 5, durationTick: "owner_turn_end", flags: { cardType: "quick" } }, baseRatePermille: 1_500 }] } },
      { kind: "effect", stableId: "duzyarya-rider-np-arts-resistance-down", order: 4, description: "＆Arts攻撃耐性をダウン(5T)<OC:効果UP>：10% / 12.5% / 15% / 17.5% / 20%", target: { relation: "enemies", selection: "all" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "duzyarya-rider-np-arts-resistance-down-state", name: "Arts攻撃耐性ダウン", effectType: COMMON_EFFECT_TYPES.cardResistance, category: "debuff", value: { scaling: "overcharge", values: [-100, -125, -150, -175, -200] }, remainingTurns: 5, durationTick: "owner_turn_end", flags: { cardType: "arts" } }, baseRatePermille: 1_500 }] } },
      { kind: "effect", stableId: "duzyarya-rider-np-buster-resistance-down", order: 5, description: "＆Buster攻撃耐性をダウン(5T)<OC:効果UP>：10% / 12.5% / 15% / 17.5% / 20%", target: { relation: "enemies", selection: "all" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "duzyarya-rider-np-buster-resistance-down-state", name: "Buster攻撃耐性ダウン", effectType: COMMON_EFFECT_TYPES.cardResistance, category: "debuff", value: { scaling: "overcharge", values: [-100, -125, -150, -175, -200] }, remainingTurns: 5, durationTick: "owner_turn_end", flags: { cardType: "buster" } }, baseRatePermille: 1_500 }] } },
      { kind: "effect", stableId: "duzyarya-rider-np-party-np-gain", order: 6, description: "＋味方全体のNP獲得量をアップ(5T)<宝具Lv:効果UP>：20% / 25% / 30% / 35% / 40%", target: { relation: "allies", selection: "all" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "duzyarya-rider-np-party-np-gain-state", name: "NP獲得量アップ", effectType: COMMON_EFFECT_TYPES.npGain, category: "buff", value: { scaling: "noble_phantasm_level", values: [200, 250, 300, 350, 400] }, remainingTurns: 5, durationTick: "opponent_turn_end" } }] } },
      { kind: "effect", stableId: "duzyarya-rider-np-cooldown", order: 7, description: "＋自身のスキルチャージを1進める", target: { relation: "self", selection: "single" }, action: { kind: "advance_skill_cooldowns", amount: 1 } },
    ],
  },
  sources: [{
    url: "https://w.atwiki.jp/siroi_human/pages/33.html",
    checkedAt: "2026-08-26",
    note: "強化後データのみ。Lv別ステータス、スキル・クラススキル・補助宝具の効果順を照合。特性の〔対人〕と絆礼装名・効果はユーザー指定を優先。SR 9.18%は丸めず0.01%単位で保持する。",
  }],
};
