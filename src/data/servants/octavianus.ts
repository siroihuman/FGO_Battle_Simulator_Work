import { COMMON_EFFECT_TYPES } from "../../effects/modifiers";
import {
  SERVANT_DEFAULT_DEMERIT_APPLICATION_RATE_PERMILLE,
  SERVANT_DATA_SCHEMA_VERSION,
  type ServantDefinition,
} from "./schema";

const PASSIVE = {
  category: "buff" as const,
  removalPolicy: "unremovable" as const,
  durationTick: "manual" as const,
};

export const OCTAVIANUS: ServantDefinition = {
  schemaVersion: SERVANT_DATA_SCHEMA_VERSION,
  dataId: "octavianus",
  collectionNo: 54,
  collectionLabel: "054",
  name: "オクタウィアヌス",
  rarity: 4,
  classDisplayName: "セイバー",
  growthTendency: "HP寄り",
  attackType: "物理",
  contentRevision: "current_upgraded_only",
  skillLevelPolicy: "max",
  classKey: "saber",
  attributeKey: "human",
  classAttackCoefficientPermille: 1_000,
  levelStats: [
    { level: 1, hp: 2_057, attack: 1_388 },
    { level: 40, hp: 6_743, attack: 5_666 },
    { level: 50, hp: 7_329, attack: 6_499 },
    { level: 60, hp: 10_029, attack: 7_416 },
    { level: 70, hp: 11_443, attack: 8_333 },
    { level: 80, hp: 12_858, attack: 9_208 },
    { level: 100, hp: 15_590, attack: 10_090 },
    { level: 120, hp: 18_323, attack: 11_847 },
  ],
  commandCards: ["quick", "arts", "arts", "buster", "buster"],
  commandCardHitWeights: [[1, 1, 1, 1, 1], [1, 1], [1, 1], [1, 1], [1, 1]],
  extraAttackHitWeights: [1, 1, 1, 1, 1],
  battleRates: {
    attackNpUnits: 83,
    receivedNpUnits: 300,
    attackNpRatePermille: 1_000,
    targetNpRatePermille: 1_000,
    starRatePermille: 98,
    starWeight: 102,
    targetStarRatePermille: 0,
    deathRatePermille: 280,
  },
  traits: [
    "サーヴァント", "人型", "男性", "秩序", "中庸", "人の力", "セイバー",
    "騎乗", "神性", "ヒト科", "王", "愛する者", "対人", "初代ローマ皇帝",
    "ローマ", "霊衣を持つ者", "夏モード（サマーロマーナ）",
  ],
  activeSkills: [
    {
      stableId: "octavianus-glorious-emperor",
      name: "華麗の皇帝",
      rank: "B+",
      slot: 1,
      cooldownAtMax: 7,
      effects: [
        {
          kind: "effect", stableId: "octavianus-glorious-emperor-target-focus", order: 1,
          description: "自身にターゲット集中状態を付与[Lv](3T)：300%",
          target: { relation: "self", selection: "single" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "octavianus-glorious-emperor-target-focus-state", name: "ターゲット集中", effectType: COMMON_EFFECT_TYPES.targetFocus, category: "buff", value: 3_000, remainingTurns: 3, durationTick: "opponent_turn_end" } }] },
        },
        {
          kind: "effect", stableId: "octavianus-glorious-emperor-received-np", order: 2,
          description: "＆被ダメージ時のNP獲得量をアップ[Lv](3T)：30%",
          target: { relation: "self", selection: "single" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "octavianus-glorious-emperor-received-np-state", name: "被ダメージ時のNP獲得量アップ", effectType: COMMON_EFFECT_TYPES.receivedNpGain, category: "buff", value: 300, remainingTurns: 3, durationTick: "opponent_turn_end" } }] },
        },
        {
          kind: "effect", stableId: "octavianus-glorious-emperor-party-attack", order: 3,
          description: "＋味方全体の攻撃力をアップ[Lv](3T)：20%",
          target: { relation: "allies", selection: "all" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "octavianus-glorious-emperor-party-attack-state", name: "攻撃力アップ", effectType: COMMON_EFFECT_TYPES.attack, category: "buff", value: 200, remainingTurns: 3 } }] },
        },
      ],
    },
    {
      stableId: "octavianus-the-one-who-becomes-a-god",
      name: "神人となる者",
      rank: "EX",
      slot: 2,
      cooldownAtMax: 9,
      effects: [
        {
          kind: "effect", stableId: "octavianus-the-one-who-becomes-a-god-party-defense", order: 1,
          description: "味方全体の防御力をアップ[Lv](3T)：20%",
          target: { relation: "allies", selection: "all" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "octavianus-the-one-who-becomes-a-god-party-defense-state", name: "防御力アップ", effectType: COMMON_EFFECT_TYPES.defense, category: "buff", classifications: ["defense"], value: 200, remainingTurns: 3, durationTick: "opponent_turn_end" } }] },
        },
        {
          kind: "effect", stableId: "octavianus-the-one-who-becomes-a-god-party-damage-cut", order: 2,
          description: "＆被ダメージカット状態を付与(3回・3T)：1000",
          target: { relation: "allies", selection: "all" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "octavianus-the-one-who-becomes-a-god-party-damage-cut-state", name: "被ダメージカット", effectType: COMMON_EFFECT_TYPES.damageCut, category: "buff", classifications: ["defense"], value: 1_000, remainingTurns: 3, remainingUses: 3, durationTick: "opponent_turn_end" } }] },
        },
        {
          kind: "effect", stableId: "octavianus-the-one-who-becomes-a-god-party-guts", order: 3,
          description: "＆ガッツ状態を付与(1回・3T)：1",
          target: { relation: "allies", selection: "all" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "octavianus-the-one-who-becomes-a-god-party-guts-state", name: "ガッツ", effectType: COMMON_EFFECT_TYPES.guts, category: "buff", value: 1, remainingTurns: 3, remainingUses: 1, durationTick: "opponent_turn_end" } }] },
        },
        {
          kind: "effect", stableId: "octavianus-the-one-who-becomes-a-god-target-np", order: 4,
          description: "＋味方単体のNPを増やす[Lv]：30%",
          target: { relation: "allies", selection: "single" },
          action: { kind: "change_np", amount: 3_000 },
        },
        {
          kind: "effect", stableId: "octavianus-the-one-who-becomes-a-god-target-focus", order: 5,
          description: "＆ターゲット集中状態を付与(3T)：300%",
          target: { relation: "allies", selection: "single" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "octavianus-the-one-who-becomes-a-god-target-focus-state", name: "ターゲット集中", effectType: COMMON_EFFECT_TYPES.targetFocus, category: "buff", value: 3_000, remainingTurns: 3, durationTick: "opponent_turn_end" } }] },
        },
        {
          kind: "effect", stableId: "octavianus-the-one-who-becomes-a-god-target-stars-on-damage", order: 6,
          description: "＆「被ダメージ時、スターを獲得する状態」を付与(3T)：5個",
          target: { relation: "allies", selection: "single" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "octavianus-the-one-who-becomes-a-god-target-stars-on-damage-state", name: "被ダメージ時スター獲得", effectType: "trigger", category: "buff", remainingTurns: 3, durationTick: "opponent_turn_end", trigger: { timing: "on_damage_taken", actions: [{ target: { relation: "self", selection: "single" }, action: { kind: "gain_stars", amount: 5, destination: "next_command" } }] } } }] },
        },
      ],
    },
    {
      stableId: "octavianus-majestic-my-king-sword",
      name: "荘厳なるや我が王剣",
      rank: "A+",
      slot: 3,
      cooldownAtMax: 9,
      effects: [
        {
          kind: "effect", stableId: "octavianus-majestic-my-king-sword-attack", order: 1,
          description: "味方単体の攻撃力をアップ[Lv](3T)：20%",
          target: { relation: "allies", selection: "single" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "octavianus-majestic-my-king-sword-attack-state", name: "攻撃力アップ", effectType: COMMON_EFFECT_TYPES.attack, category: "buff", value: 200, remainingTurns: 3 } }] },
        },
        {
          kind: "effect", stableId: "octavianus-majestic-my-king-sword-critical", order: 2,
          description: "＆クリティカル威力をアップ[Lv](3T)：30%",
          target: { relation: "allies", selection: "single" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "octavianus-majestic-my-king-sword-critical-state", name: "クリティカル威力アップ", effectType: COMMON_EFFECT_TYPES.criticalDamage, category: "buff", value: 300, remainingTurns: 3 } }] },
        },
        {
          kind: "effect", stableId: "octavianus-majestic-my-king-sword-star-focus", order: 3,
          description: "＆スター集中度をアップ(3T)：3000%",
          target: { relation: "allies", selection: "single" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "octavianus-majestic-my-king-sword-star-focus-state", name: "スター集中度アップ", effectType: COMMON_EFFECT_TYPES.starFocus, category: "buff", value: 30_000, remainingTurns: 3 } }] },
        },
        {
          kind: "effect", stableId: "octavianus-majestic-my-king-sword-recurring-stars", order: 4,
          description: "＆毎ターンスター獲得状態を付与(3T)：10個",
          target: { relation: "allies", selection: "single" },
          action: { kind: "apply_effects", effects: [{ template: { stableId: "octavianus-majestic-my-king-sword-recurring-stars-state", name: "毎ターンスター獲得", effectType: COMMON_EFFECT_TYPES.recurringStarGain, category: "buff", value: 10, remainingTurns: 3, durationTick: "opponent_turn_end", trigger: { timing: "turn_end", actions: [{ target: { relation: "self", selection: "single" }, action: { kind: "gain_stars", amount: 10, destination: "next_command" } }] } } }] },
        },
      ],
    },
  ],
  classSkills: [
    {
      stableId: "octavianus-magic-resistance", name: "対魔力", rank: "D",
      effects: [{ kind: "effect", stableId: "octavianus-magic-resistance-state", order: 1, description: "自身の弱体耐性を少しアップ：12.5%", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "octavianus-magic-resistance-state-effect", name: "弱体耐性アップ", effectType: COMMON_EFFECT_TYPES.debuffResistance, value: 125, ...PASSIVE } }] } }],
    },
    {
      stableId: "octavianus-riding", name: "騎乗", rank: "E",
      effects: [{ kind: "effect", stableId: "octavianus-riding-quick", order: 1, description: "自身のQuickカード性能を少しアップ：2%", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "octavianus-riding-quick-state", name: "Quickカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 20, flags: { cardType: "quick" }, ...PASSIVE } }] } }],
    },
    {
      stableId: "octavianus-divinity", name: "神性", rank: "E",
      effects: [{ kind: "effect", stableId: "octavianus-divinity-fixed-damage", order: 1, description: "自身に与ダメージプラス状態を付与：100", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "octavianus-divinity-fixed-damage-state", name: "与ダメージプラス", effectType: COMMON_EFFECT_TYPES.fixedDamage, value: 100, ...PASSIVE } }] } }],
    },
  ],
  noblePhantasm: {
    stableId: "octavianus-pax-romana",
    name: "永久なりし我が祖国の秩序",
    reading: "パクス・ロマーナ",
    rank: "A+",
    cardType: "arts",
    effects: [
      {
        kind: "effect", stableId: "octavianus-np-invincibility", order: 1,
        description: "自身に無敵状態を付与(2回・3T)",
        target: { relation: "self", selection: "single" },
        action: { kind: "apply_effects", effects: [{ template: { stableId: "octavianus-np-invincibility-state", name: "無敵", effectType: COMMON_EFFECT_TYPES.invincibility, category: "buff", remainingTurns: 3, remainingUses: 2, durationTick: "opponent_turn_end" } }] },
      },
      {
        kind: "effect", stableId: "octavianus-np-attack", order: 2,
        description: "＆攻撃力をアップ(3T)<OC:効果UP>：30% / 40% / 45% / 47.5% / 50%",
        target: { relation: "self", selection: "single" },
        action: { kind: "apply_effects", effects: [{ template: { stableId: "octavianus-np-attack-state", name: "攻撃力アップ", effectType: COMMON_EFFECT_TYPES.attack, category: "buff", value: { scaling: "overcharge", values: [300, 400, 450, 475, 500] }, remainingTurns: 3 } }] },
      },
      {
        kind: "effect", stableId: "octavianus-np-critical", order: 3,
        description: "＆クリティカル威力をアップ(3T)<OC:効果UP>：30% / 40% / 45% / 47.5% / 50%",
        target: { relation: "self", selection: "single" },
        action: { kind: "apply_effects", effects: [{ template: { stableId: "octavianus-np-critical-state", name: "クリティカル威力アップ", effectType: COMMON_EFFECT_TYPES.criticalDamage, category: "buff", value: { scaling: "overcharge", values: [300, 400, 450, 475, 500] }, remainingTurns: 3 } }] },
      },
      {
        kind: "effect", stableId: "octavianus-np-defense", order: 4,
        description: "＆防御力をアップ[Lv](3T)：30%",
        target: { relation: "self", selection: "single" },
        action: { kind: "apply_effects", effects: [{ template: { stableId: "octavianus-np-defense-state", name: "防御力アップ", effectType: COMMON_EFFECT_TYPES.defense, category: "buff", classifications: ["defense"], value: 300, remainingTurns: 3, durationTick: "opponent_turn_end" } }] },
      },
      {
        kind: "effect", stableId: "octavianus-np-recurring-stars", order: 5,
        description: "＆毎ターンスター獲得状態を付与[Lv](3T)：30個",
        target: { relation: "self", selection: "single" },
        action: { kind: "apply_effects", effects: [{ template: { stableId: "octavianus-np-recurring-stars-state", name: "毎ターンスター獲得", effectType: COMMON_EFFECT_TYPES.recurringStarGain, category: "buff", value: 30, remainingTurns: 3, durationTick: "opponent_turn_end", trigger: { timing: "turn_end", actions: [{ target: { relation: "self", selection: "single" }, action: { kind: "gain_stars", amount: 30, destination: "next_command" } }] } } }] },
      },
    ],
  },
  sources: [{
    url: "https://w.atwiki.jp/siroi_human/pages/25.html",
    checkedAt: "2026-08-27",
    note: "強化後データのみ。Lv別ステータス、スキル・クラススキル・宝具の効果順、絆礼装の名称と効果を照合。",
  }],
};
