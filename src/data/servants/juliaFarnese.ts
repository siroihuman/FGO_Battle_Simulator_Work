import { COMMON_EFFECT_TYPES } from "../../effects/modifiers";
import { SERVANT_DATA_SCHEMA_VERSION, type ServantDefinition } from "./schema";

const PASSIVE = { category: "buff" as const, removalPolicy: "unremovable" as const, durationTick: "manual" as const };
const SELF = { relation: "self" as const, selection: "single" as const };
const turnEndHpRecovery = (amount: number) => ({ timing: "turn_end" as const, actions: [{ target: SELF, action: { kind: "heal_hp" as const, amount }, turnEndSettlement: "recurring_hp_recovery" as const }] });
const turnEndNpGain = (amount: number) => ({ timing: "turn_end" as const, actions: [{ target: SELF, action: { kind: "change_np" as const, amount } }] });

export const JULIA_FARNESE: ServantDefinition = {
  schemaVersion: SERVANT_DATA_SCHEMA_VERSION,
  dataId: "julia-farnese",
  collectionNo: 29,
  collectionLabel: "029",
  name: "ジュリア・ファルネーゼ",
  rarity: 4,
  classDisplayName: "ライダー",
  growthTendency: "HP偏重",
  attackType: "魔術",
  contentRevision: "current_upgraded_only",
  skillLevelPolicy: "max",
  classKey: "rider",
  attributeKey: "human",
  classAttackCoefficientPermille: 1_000,
  levelStats: [
    { level: 1, hp: 2_048, attack: 1_296 }, { level: 40, hp: 7_298, attack: 4_433 },
    { level: 50, hp: 8_706, attack: 5_289 }, { level: 60, hp: 9_987, attack: 6_066 },
    { level: 70, hp: 11_395, attack: 6_922 }, { level: 80, hp: 12_804, attack: 7_778 },
    { level: 100, hp: 15_525, attack: 9_417 }, { level: 120, hp: 18_246, attack: 11_057 },
  ],
  commandCards: ["quick", "quick", "arts", "arts", "buster"],
  commandCardHitWeights: [[1, 1, 1], [1, 1, 1], [1, 1], [1, 1], [1]],
  extraAttackHitWeights: [1, 1, 1, 1, 1],
  battleRates: { attackNpUnits: 86, receivedNpUnits: 300, attackNpRatePermille: 1_000, targetNpRatePermille: 1_000, starRatePermille: 88, starWeight: 204, targetStarRatePermille: 0, deathRatePermille: 400 },
  traits: ["サーヴァント", "人型", "女性", "中立", "善", "人の力", "ライダー", "騎乗", "ヒト科", "猛獣", "対人", "ローマ"],
  activeSkills: [
    {
      stableId: "julia-farnese-lovely-julia", name: "麗しのジュリア", rank: "A+", slot: 1, cooldownAtMax: 7,
      effects: [
        { kind: "effect", stableId: "julia-farnese-lovely-julia-charm", order: 1, description: "敵全体〔男性〕に高確率で魅了付与[Lv](1T)：150%", target: { relation: "enemies", selection: "all", requiredTraits: ["男性"] }, action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-lovely-julia-charm-state", name: "魅了", effectType: "charm", category: "debuff", classifications: ["mental", "charm", "immobilize"], remainingTurns: 1, durationTick: "owner_turn_end" }, baseRatePermille: 1_500 }] } },
        { kind: "effect", stableId: "julia-farnese-lovely-julia-debuff-resistance", order: 2, description: "＆弱体耐性をダウン(3T)：30%", target: { relation: "enemies", selection: "all", requiredTraits: ["男性"] }, action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-lovely-julia-debuff-resistance-state", name: "弱体耐性ダウン", effectType: COMMON_EFFECT_TYPES.debuffResistance, category: "debuff", value: -300, remainingTurns: 3, durationTick: "owner_turn_end" } }] } },
        { kind: "effect", stableId: "julia-farnese-lovely-julia-defense", order: 3, description: "＆防御力をダウン[Lv](3T)：20%", target: { relation: "enemies", selection: "all", requiredTraits: ["男性"] }, action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-lovely-julia-defense-state", name: "防御力ダウン", effectType: COMMON_EFFECT_TYPES.defense, category: "debuff", classifications: ["defense"], value: -200, remainingTurns: 3, durationTick: "owner_turn_end" } }] } },
      ],
    },
    {
      stableId: "julia-farnese-innocent-unicorn", name: "無垢なる一角馬", rank: "C", slot: 2, cooldownAtMax: 7,
      effects: [
        { kind: "effect", stableId: "julia-farnese-innocent-unicorn-stars", order: 1, description: "自身に毎ターンスター獲得状態を付与[Lv](3T)：15個", target: SELF, action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-innocent-unicorn-stars-state", name: "毎ターンスター獲得", effectType: COMMON_EFFECT_TYPES.recurringStarGain, category: "buff", value: 15, remainingTurns: 3, durationTick: "opponent_turn_end", trigger: { timing: "turn_end", actions: [{ target: SELF, action: { kind: "gain_stars", amount: 15, destination: "next_command" } }] } } }] } },
        { kind: "effect", stableId: "julia-farnese-innocent-unicorn-self-np", order: 2, description: "＆NPを少し増やす：10%", target: SELF, action: { kind: "change_np", amount: 1_000 } },
        { kind: "effect", stableId: "julia-farnese-innocent-unicorn-female-critical", order: 3, description: "＋味方全体の〔女性〕のクリティカル威力をアップ[Lv](3T)：50%", target: { relation: "allies", selection: "all", requiredTraits: ["女性"] }, action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-innocent-unicorn-female-critical-state", name: "クリティカル威力アップ", effectType: COMMON_EFFECT_TYPES.criticalDamage, category: "buff", value: 500, remainingTurns: 3 } }] } },
        { kind: "effect", stableId: "julia-farnese-innocent-unicorn-female-np", order: 4, description: "＆NPを少し増やす：10%", target: { relation: "allies", selection: "all", requiredTraits: ["女性"] }, action: { kind: "change_np", amount: 1_000 } },
      ],
    },
    {
      stableId: "julia-farnese-white-lily-beast", name: "白百合の獣", rank: "A+++", slot: 3, cooldownAtMax: 8,
      effects: [
        { kind: "effect", stableId: "julia-farnese-white-lily-beast-heal", order: 1, description: "味方全体のHPを回復[Lv]：3000", target: { relation: "allies", selection: "all" }, action: { kind: "heal_hp", amount: 3_000 } },
        { kind: "effect", stableId: "julia-farnese-white-lily-beast-remove-debuff", order: 2, description: "＆弱体状態を解除", target: { relation: "allies", selection: "all" }, action: { kind: "remove_effects", request: { mode: "all", category: "debuff" } } },
        { kind: "effect", stableId: "julia-farnese-white-lily-beast-recurring-heal", order: 3, description: "＆毎ターンHP回復状態を付与[Lv](5T)：1000", target: { relation: "allies", selection: "all" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-white-lily-beast-recurring-heal-state", name: "毎ターンHP回復", effectType: COMMON_EFFECT_TYPES.recurringHpRecovery, category: "buff", value: 1_000, remainingTurns: 5, durationTick: "opponent_turn_end", trigger: turnEndHpRecovery(1_000) } }] } },
        { kind: "effect", stableId: "julia-farnese-white-lily-beast-recurring-np", order: 4, description: "＆毎ターンNP獲得状態を付与[Lv](5T)：10%", target: { relation: "allies", selection: "all" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-white-lily-beast-recurring-np-state", name: "毎ターンNP獲得", effectType: COMMON_EFFECT_TYPES.recurringNpGain, category: "buff", value: 1_000, remainingTurns: 5, durationTick: "opponent_turn_end", trigger: turnEndNpGain(1_000) } }] } },
      ],
    },
  ],
  classSkills: [
    { stableId: "julia-farnese-magic-resistance", name: "対魔力", rank: "D", effects: [{ kind: "effect", stableId: "julia-farnese-magic-resistance-state", order: 1, description: "自身の弱体耐性を少しアップ：12.5%", target: SELF, action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-magic-resistance-effect", name: "弱体耐性アップ", effectType: COMMON_EFFECT_TYPES.debuffResistance, value: 125, ...PASSIVE } }] } }] },
    { stableId: "julia-farnese-riding", name: "騎乗", rank: "A", effects: [{ kind: "effect", stableId: "julia-farnese-riding-quick", order: 1, description: "自身のQuickカード性能をアップ：10%", target: SELF, action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-riding-quick-state", name: "Quickカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 100, flags: { cardType: "quick" }, ...PASSIVE } }] } }] },
  ],
  noblePhantasm: {
    stableId: "julia-farnese-unicorn-farnese", name: "百合紋章の一角獣", reading: "ウニコルニス・リリオルム・ファルネシアノルム", rank: "A", cardType: "quick",
    effects: [
      { kind: "effect", stableId: "julia-farnese-np-invincibility-pierce", order: 1, description: "自身に無敵貫通状態を付与(3T)", target: SELF, action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-np-invincibility-pierce-state", name: "無敵貫通", effectType: COMMON_EFFECT_TYPES.invincibilityPierce, category: "buff", remainingTurns: 3 } }] } },
      { kind: "effect", stableId: "julia-farnese-np-quick", order: 2, description: "＆Quickカード性能をアップ(3T)<OC:効果UP>：30% / 35% / 40% / 45% / 50%", target: SELF, action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-np-quick-state", name: "Quickカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, category: "buff", value: { scaling: "overcharge", values: [300, 350, 400, 450, 500] }, remainingTurns: 3, flags: { cardType: "quick" } } }] } },
      { kind: "attack", stableId: "julia-farnese-np-attack", order: 3, description: "＋敵全体に強力な攻撃[Lv]　Quick(x0.8)：800% / 1000% / 1100% / 1150% / 1200%", targetScope: "all", hitWeights: [1, 1, 1, 1, 1], damageMultiplierPermilleByLevel: [8_000, 10_000, 11_000, 11_500, 12_000], specialAttack: { stableId: "julia-farnese-np-evil-special-attack", requiredTargetTraits: ["悪"], multiplierPermille: 1_500 } },
      { kind: "effect", stableId: "julia-farnese-np-debuff-resistance", order: 4, description: "＋自身の弱体耐性をアップ(3T)<OC:効果UP>：50% / 62.5% / 75% / 87.5% / 100%", target: SELF, action: { kind: "apply_effects", effects: [{ template: { stableId: "julia-farnese-np-debuff-resistance-state", name: "弱体耐性アップ", effectType: COMMON_EFFECT_TYPES.debuffResistance, category: "buff", value: { scaling: "overcharge", values: [500, 625, 750, 875, 1_000] }, remainingTurns: 3 } }] } },
    ],
  },
  sources: [{ url: "https://w.atwiki.jp/siroi_human/pages/31.html", checkedAt: "2026-08-28", note: "強化後のスキル3種・宝具、全クラススキル、Lv別能力値、特性、効果順を照合。絆礼装の名称と効果は同ページおよびユーザー指定を照合。" }],
};
