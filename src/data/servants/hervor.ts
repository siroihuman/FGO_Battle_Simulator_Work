import { COMMON_EFFECT_TYPES } from "../../effects/modifiers";
import { SERVANT_DATA_SCHEMA_VERSION, type ServantDefinition } from "./schema";

const SELF = { relation: "self" as const, selection: "single" as const };
const ENEMIES = { relation: "enemies" as const, selection: "all" as const };
const PASSIVE = { category: "buff" as const, removalPolicy: "unremovable" as const, durationTick: "manual" as const };

const curse = (stableId: string) => ({
  template: {
    stableId,
    name: "呪い",
    effectType: "slip_damage",
    category: "debuff" as const,
    classifications: ["curse"],
    value: 1_000,
    remainingTurns: 5,
    trigger: { timing: "turn_end" as const, actions: [{ target: SELF, action: { kind: "reduce_hp" as const, amount: 1_000, canDefeat: false }, turnEndSettlement: "slip_damage" as const, slipDamageKind: "curse" as const }] },
  },
  baseRatePermille: 1_000,
});

const evilCurse = (stableId: string, value: number) => ({
  template: { stableId, name: "呪厄", effectType: "evil_curse", category: "debuff" as const, classifications: ["evil_curse"], value, remainingTurns: 5, slipDamageAmplifierKind: "evil_curse" as const },
  baseRatePermille: 1_000,
});

export const HERVOR: ServantDefinition = {
  schemaVersion: SERVANT_DATA_SCHEMA_VERSION,
  dataId: "hervor",
  collectionNo: 30,
  collectionLabel: "030",
  name: "ヘルヴォール",
  rarity: 4,
  classDisplayName: "バーサーカー",
  growthTendency: "凸型弱",
  attackType: "物理",
  contentRevision: "current_upgraded_only",
  skillLevelPolicy: "max",
  classKey: "berserker",
  attributeKey: "earth",
  classAttackCoefficientPermille: 1_100,
  levelStats: [
    { level: 1, hp: 1_620, attack: 1_674 }, { level: 40, hp: 5_771, attack: 5_725 },
    { level: 50, hp: 7_087, attack: 7_030 }, { level: 60, hp: 8_403, attack: 8_336 },
    { level: 70, hp: 9_416, attack: 9_340 }, { level: 80, hp: 10_125, attack: 10_044 },
    { level: 100, hp: 12_276, attack: 12_161 }, { level: 120, hp: 14_428, attack: 14_279 },
  ],
  commandCards: ["quick", "arts", "buster", "buster", "buster"],
  commandCardHitWeights: [[1, 1, 1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]],
  extraAttackHitWeights: [1, 1, 1, 1, 1, 1],
  battleRates: { attackNpUnits: 68, receivedNpUnits: 500, attackNpRatePermille: 1_000, targetNpRatePermille: 1_000, starRatePermille: 49, starWeight: 10, targetStarRatePermille: 0, deathRatePermille: 585 },
  traits: ["サーヴァント", "人型", "女性", "中立", "中庸", "地の力", "バーサーカー", "ヒト科", "対人", "炎"],
  activeSkills: [
    { stableId: "hervor-battle-continuation", name: "戦闘続行", rank: "C", slot: 1, cooldownAtMax: 7, effects: [
      { kind: "effect", stableId: "hervor-battle-continuation-guts", order: 1, description: "自身にガッツ状態(1回・5T)を付与[Lv]：1500", target: SELF, action: { kind: "apply_effects", effects: [{ template: { stableId: "hervor-battle-continuation-guts-state", name: "ガッツ", effectType: COMMON_EFFECT_TYPES.guts, category: "buff", value: 1_500, remainingTurns: 5, remainingUses: 1, durationTick: "opponent_turn_end" } }] } },
    ] },
    { stableId: "hervor-overcomer-of-fate", name: "運命の克服者", rank: "A++", slot: 2, cooldownAtMax: 6, effects: [
      { kind: "effect", stableId: "hervor-overcomer-of-fate-np", order: 1, description: "自身のNPを増やす[Lv]：30%", target: SELF, action: { kind: "change_np", amount: 3_000 } },
      { kind: "effect", stableId: "hervor-overcomer-of-fate-curse-power", order: 2, description: "＆〔呪い〕特攻状態を付与[Lv](3T)：30%", target: SELF, action: { kind: "apply_effects", effects: [{ template: { stableId: "hervor-overcomer-of-fate-curse-power-state", name: "〔呪い〕特攻", effectType: COMMON_EFFECT_TYPES.power, category: "buff", value: 300, remainingTurns: 3, flags: { requiredTargetEffectClassification: "curse" } } }] } },
      { kind: "effect", stableId: "hervor-overcomer-of-fate-cleanse", order: 3, description: "＆弱体状態を解除", target: SELF, action: { kind: "remove_effects", request: { mode: "all", category: "debuff" } } },
      { kind: "effect", stableId: "hervor-overcomer-of-fate-immunity", order: 4, description: "＆弱体無効状態を付与(3回・3T)", target: SELF, action: { kind: "apply_effects", effects: [{ template: { stableId: "hervor-overcomer-of-fate-immunity-state", name: "弱体無効", effectType: COMMON_EFFECT_TYPES.debuffImmunity, category: "buff", remainingTurns: 3, remainingUses: 3, durationTick: "opponent_turn_end" } }] } },
    ] },
    { stableId: "hervor-armor-of-grudge-fire", name: "怨念模りし炎の鎧", rank: "B", slot: 3, cooldownAtMax: 6, effects: [
      { kind: "effect", stableId: "hervor-armor-defense", order: 1, description: "自身の防御力をアップ[Lv](3T)：50%", target: SELF, action: { kind: "apply_effects", effects: [{ template: { stableId: "hervor-armor-defense-state", name: "防御力アップ", effectType: COMMON_EFFECT_TYPES.defense, category: "buff", classifications: ["defense"], value: 500, remainingTurns: 3, durationTick: "opponent_turn_end" } }] } },
      { kind: "effect", stableId: "hervor-armor-np-damage", order: 2, description: "＆宝具威力をアップ(3T)：20%", target: SELF, action: { kind: "apply_effects", effects: [{ template: { stableId: "hervor-armor-np-damage-state", name: "宝具威力アップ", effectType: COMMON_EFFECT_TYPES.noblePhantasmDamage, category: "buff", value: 200, remainingTurns: 3 } }] } },
      { kind: "effect", stableId: "hervor-armor-on-damage-evil-curse", order: 3, description: "＆「被ダメージ時に対象に呪厄状態(5T)を付与する状態」を付与(3T)：100%", target: SELF, action: { kind: "apply_effects", effects: [{ template: { stableId: "hervor-armor-on-damage-evil-curse-state", name: "被ダメージ時呪厄付与", effectType: "trigger", category: "buff", remainingTurns: 3, durationTick: "opponent_turn_end", trigger: { timing: "on_damage_taken", actions: [{ target: ENEMIES, targetAttackEventActor: true, action: { kind: "apply_effects", effects: [evilCurse("hervor-armor-evil-curse-state", 1_000)] } }] } } }] } },
    ] },
  ],
  classSkills: [{ stableId: "hervor-mad-enhancement", name: "狂化", rank: "C", effects: [{ kind: "effect", stableId: "hervor-mad-enhancement-buster", order: 1, description: "自身のBusterカード性能を少しアップ：6%", target: SELF, action: { kind: "apply_effects", effects: [{ template: { stableId: "hervor-mad-enhancement-buster-state", name: "Busterカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 60, flags: { cardType: "buster" }, ...PASSIVE } }] } }] }],
  noblePhantasm: { stableId: "hervor-tyrfing", name: "大呪齎すは我が魔剣", reading: "ティルフィング", rank: "A++", cardType: "buster", effects: [
    { kind: "effect", stableId: "hervor-np-curse", order: 1, description: "敵全体に呪い状態を付与(5T)：1000", target: ENEMIES, action: { kind: "apply_effects", effects: [curse("hervor-np-curse-state")] } },
    { kind: "effect", stableId: "hervor-np-evil-curse", order: 2, description: "＆呪厄状態を付与(5T)<OC:効果UP>：100% / 125% / 150% / 175% / 200%", target: ENEMIES, action: { kind: "apply_effects", effects: [{ template: { stableId: "hervor-np-evil-curse-state", name: "呪厄", effectType: "evil_curse", category: "debuff", classifications: ["evil_curse"], value: { scaling: "overcharge", values: [1_000, 1_250, 1_500, 1_750, 2_000] }, remainingTurns: 5, slipDamageAmplifierKind: "evil_curse" }, baseRatePermille: 1_000 }] } },
    { kind: "attack", stableId: "hervor-np-damage", order: 3, targetScope: "all", hitWeights: [1, 1, 1], damageMultiplierPermilleByLevel: [4_000, 5_000, 5_500, 5_750, 6_000] },
    { kind: "effect", stableId: "hervor-np-attack-down", order: 4, description: "＆攻撃力をダウン(3T)<OC:効果UP>：20% / 25% / 30% / 35% / 40%", target: ENEMIES, action: { kind: "apply_effects", effects: [{ template: { stableId: "hervor-np-attack-down-state", name: "攻撃力ダウン", effectType: COMMON_EFFECT_TYPES.attack, category: "debuff", value: { scaling: "overcharge", values: [-200, -250, -300, -350, -400] }, remainingTurns: 3 }, baseRatePermille: 1_000 }] } },
  ] },
  sources: [{ url: "https://w.atwiki.jp/siroi_human/pages/32.html", checkedAt: "2026-09-09", note: "強化後データのみ。全Lv表、上位3スキル、狂化C、強化後Buster全体宝具の効果順・倍率・Hit数・特性を照合。" }],
};
