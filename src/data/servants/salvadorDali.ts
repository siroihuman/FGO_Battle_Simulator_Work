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

export const SALVADOR_DALI: ServantDefinition = {
  schemaVersion: SERVANT_DATA_SCHEMA_VERSION,
  dataId: "salvador-dali",
  collectionNo: 107,
  collectionLabel: "107",
  name: "サルバドール・ダリ",
  rarity: 5,
  classDisplayName: "アサシン",
  growthTendency: "平均",
  attackType: "魔術",
  contentRevision: "current_upgraded_only",
  skillLevelPolicy: "max",
  classKey: "assassin",
  attributeKey: "human",
  classAttackCoefficientPermille: 900,
  levelStats: [
    { level: 1, hp: 1_965, attack: 1_713 },
    { level: 50, hp: 8_175, attack: 6_763 },
    { level: 60, hp: 9_515, attack: 7_872 },
    { level: 70, hp: 10_721, attack: 8_870 },
    { level: 80, hp: 12_061, attack: 9_979 },
    { level: 90, hp: 13_402, attack: 11_088 },
    { level: 100, hp: 14_682, attack: 12_138 },
    { level: 120, hp: 17_256, attack: 14_247 },
  ],
  commandCards: ["quick", "quick", "arts", "arts", "buster"],
  commandCardHitWeights: [[1, 1, 1, 1, 1], [1, 1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]],
  extraAttackHitWeights: [1, 1, 1, 1, 1],
  battleRates: {
    attackNpUnits: 40,
    receivedNpUnits: 400,
    attackNpRatePermille: 1_000,
    targetNpRatePermille: 1_000,
    starRatePermille: 255,
    starWeight: 102,
    targetStarRatePermille: 0,
    deathRatePermille: 385,
  },
  traits: ["サーヴァント", "人型", "男性", "混沌", "中庸", "人の力", "ヒト科"],
  activeSkills: [
    {
      stableId: "salvador-dali-melting-clocks", name: "溶解する時計", rank: "A", slot: 1, cooldownAtMax: 8,
      effects: [
        { kind: "effect", stableId: "salvador-dali-melting-clocks-charge", order: 1, description: "敵全体のチャージを減らす：1", target: { relation: "enemies", selection: "all" }, action: { kind: "change_enemy_charge", amount: -1 } },
        { kind: "effect", stableId: "salvador-dali-melting-clocks-party-np", order: 2, description: "＋味方全体のNPを増やす[Lv]：20%", target: { relation: "allies", selection: "all" }, action: { kind: "change_np", amount: 2_000 } },
        { kind: "effect", stableId: "salvador-dali-melting-clocks-party-arts", order: 3, description: "＆Artsカード性能をアップ[Lv](3T)：20%", target: { relation: "allies", selection: "all" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "salvador-dali-melting-clocks-party-arts-state", name: "Artsカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, category: "buff", value: 200, remainingTurns: 3, flags: { cardType: "arts" } } }] } },
        { kind: "effect", stableId: "salvador-dali-melting-clocks-cooldown", order: 4, description: "＋自身のスキルチャージを1進める", target: { relation: "self", selection: "single" }, action: { kind: "advance_skill_cooldowns", amount: 1 } },
      ],
    },
    {
      stableId: "salvador-dali-persistence-of-memory", name: "記憶の固執", rank: "A", slot: 2, cooldownAtMax: 8,
      effects: [
        { kind: "effect", stableId: "salvador-dali-persistence-of-memory-guts", order: 1, description: "自身にガッツ状態を付与[Lv](1回・5T)：3000", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "salvador-dali-persistence-of-memory-guts-state", name: "ガッツ", effectType: COMMON_EFFECT_TYPES.guts, category: "buff", value: 3_000, remainingTurns: 5, remainingUses: 1, durationTick: "opponent_turn_end" } }] } },
        { kind: "effect", stableId: "salvador-dali-persistence-of-memory-arts", order: 2, description: "＆Artsカード性能をアップ[Lv](3T)：30%", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "salvador-dali-persistence-of-memory-arts-state", name: "Artsカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, category: "buff", value: 300, remainingTurns: 3, flags: { cardType: "arts" } } }] } },
        { kind: "effect", stableId: "salvador-dali-persistence-of-memory-np-gain", order: 3, description: "＆NP獲得量をアップ[Lv](3T)：30%", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "salvador-dali-persistence-of-memory-np-gain-state", name: "NP獲得量アップ", effectType: COMMON_EFFECT_TYPES.npGain, category: "buff", value: 300, remainingTurns: 3 } }] } },
        { kind: "effect", stableId: "salvador-dali-persistence-of-memory-np", order: 4, description: "＆NPを増やす[Lv]：30%", target: { relation: "self", selection: "single" }, action: { kind: "change_np", amount: 3_000 } },
      ],
    },
    {
      stableId: "salvador-dali-paranoiac-critical-method", name: "偏執狂的批判的方法", rank: "EX", slot: 3, cooldownAtMax: 8,
      effects: [
        { kind: "effect", stableId: "salvador-dali-paranoiac-critical-method-enemy-attack", order: 1, description: "敵全体の攻撃力をダウン[Lv](1T)：100%", target: { relation: "enemies", selection: "all" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "salvador-dali-paranoiac-critical-method-enemy-attack-state", name: "攻撃力ダウン", effectType: COMMON_EFFECT_TYPES.attack, category: "debuff", value: -1_000, remainingTurns: 1 }, baseRatePermille: 5_000 }] } },
        { kind: "effect", stableId: "salvador-dali-paranoiac-critical-method-remove-defense", order: 2, description: "＆防御強化状態を解除", target: { relation: "enemies", selection: "all" }, action: { kind: "remove_effects", request: { mode: "all", category: "buff", classifications: ["defense"] } } },
        { kind: "effect", stableId: "salvador-dali-paranoiac-critical-method-evade", order: 3, description: "＋自身に回避状態を付与(1回・3T)", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "salvador-dali-paranoiac-critical-method-evade-state", name: "回避", effectType: COMMON_EFFECT_TYPES.evade, category: "buff", remainingTurns: 3, remainingUses: 1, durationTick: "opponent_turn_end" } }] } },
        { kind: "effect", stableId: "salvador-dali-paranoiac-critical-method-np-damage", order: 4, description: "＆宝具威力をアップ[Lv](3T)：30%", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "salvador-dali-paranoiac-critical-method-np-damage-state", name: "宝具威力アップ", effectType: COMMON_EFFECT_TYPES.noblePhantasmDamage, category: "buff", value: 300, remainingTurns: 3 } }] } },
      ],
    },
  ],
  classSkills: [
    { stableId: "salvador-dali-presence-concealment", name: "気配遮断", rank: "A+", effects: [{ kind: "effect", stableId: "salvador-dali-presence-concealment-stars", order: 1, description: "自身のスター発生率をアップ：10.5%", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "salvador-dali-presence-concealment-stars-state", name: "スター発生率アップ", effectType: COMMON_EFFECT_TYPES.starGeneration, value: 105, ...PASSIVE } }] } }] },
    { stableId: "salvador-dali-distorted-artistic-favor", name: "芸術寵愛（歪曲）", rank: "B", effects: [
      { kind: "effect", stableId: "salvador-dali-distorted-artistic-favor-critical", order: 1, description: "自身のクリティカル威力をアップ：8%", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "salvador-dali-distorted-artistic-favor-critical-state", name: "クリティカル威力アップ", effectType: COMMON_EFFECT_TYPES.criticalDamage, value: 80, ...PASSIVE } }] } },
      { kind: "effect", stableId: "salvador-dali-distorted-artistic-favor-charm-resistance", order: 2, description: "＆魅了耐性をアップ：100%", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "salvador-dali-distorted-artistic-favor-charm-resistance-state", name: "魅了耐性アップ", effectType: COMMON_EFFECT_TYPES.debuffResistance, value: 1_000, ...PASSIVE, classifications: ["charm"] } }] } },
    ] },
  ],
  noblePhantasm: {
    stableId: "salvador-dali-wound-of-melted-time", name: "融解せし時の裂傷", reading: "エリーダ・デル・ティエンポ・フンディード", rank: "EX", cardType: "arts",
    effects: [
      { kind: "effect", stableId: "salvador-dali-np-arts-resistance", order: 1, description: "敵全体のArts攻撃耐性をダウン(3T)：20%", target: { relation: "enemies", selection: "all" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "salvador-dali-np-arts-resistance-state", name: "Arts攻撃耐性ダウン", effectType: COMMON_EFFECT_TYPES.cardResistance, category: "debuff", value: -200, remainingTurns: 3, flags: { cardType: "arts" } } }] } },
      { kind: "attack", stableId: "salvador-dali-np-damage", order: 2, targetScope: "all", hitWeights: [1, 1, 1, 1], damageMultiplierPermilleByLevel: [4_500, 6_000, 6_750, 7_125, 7_500], specialAttack: { stableId: "salvador-dali-np-removable-debuff-special-attack", requiresRemovableTargetDebuff: true, multiplierPermille: 1_500 } },
      { kind: "effect", stableId: "salvador-dali-np-instant-death", order: 3, description: "＆高確率で即死効果<OC:確率UP>：80% / 100% / 110% / 115% / 120%", target: { relation: "enemies", selection: "all" }, action: { kind: "instant_death", options: { effectRatePermille: { scaling: "overcharge", values: [800, 1_000, 1_100, 1_150, 1_200] }, timing: "after_damage" } } },
      { kind: "effect", stableId: "salvador-dali-np-party-np", order: 4, description: "＋味方全体のNPを少し増やす：10%", target: { relation: "allies", selection: "all" }, action: { kind: "change_np", amount: 1_000 } },
    ],
  },
  sources: [{ url: "https://w.atwiki.jp/siroi_human/pages/922.html", checkedAt: "2026-08-25", note: "強化後データのみ。Lv別ステータス、スキル・宝具・クラススキルの効果順、絆礼装の能力値と効果を照合。" }],
};
