import { COMMON_EFFECT_TYPES } from "../../effects/modifiers";
import {
  createNoblePhantasmCardTypeChangeEffect,
} from "../../effects/noblePhantasmCardType";
import { createTraitGrantEffect } from "../../effects/classification";
import {
  SERVANT_DATA_SCHEMA_VERSION,
  type ServantDefinition,
} from "./schema";

const PASSIVE = {
  category: "buff" as const,
  removalPolicy: "unremovable" as const,
  durationTick: "manual" as const,
};

export const LIGHT_KOYANSKAYA: ServantDefinition = {
  schemaVersion: SERVANT_DATA_SCHEMA_VERSION,
  dataId: "koyanskaya-of-light",
  collectionNo: 314,
  name: "光のコヤンスカヤ",
  rarity: 5,
  contentRevision: "current_upgraded_only",
  skillLevelPolicy: "max",
  classKey: "assassin",
  attributeKey: "beast",
  classAttackCoefficientPermille: 900,
  levelStats: [
    { level: 1, hp: 1_918, attack: 1_795 },
    { level: 50, hp: 8_571, attack: 7_648 },
    { level: 60, hp: 10_401, attack: 9_258 },
    { level: 70, hp: 11_864, attack: 10_545 },
    { level: 80, hp: 12_790, attack: 11_360 },
    { level: 90, hp: 13_081, attack: 11_616 },
    { level: 100, hp: 14_331, attack: 12_715 },
    { level: 120, hp: 16_842, attack: 14_925 },
  ],
  commandCards: ["quick", "quick", "arts", "buster", "buster"],
  commandCardHitWeights: [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]],
  extraAttackHitWeights: [1, 1, 1, 1, 1],
  battleRates: {
    attackNpUnits: 76,
    receivedNpUnits: 400,
    attackNpRatePermille: 1_000,
    targetNpRatePermille: 1_000,
    starRatePermille: 255,
    starWeight: 102,
    targetStarRatePermille: 0,
    deathRatePermille: 330,
  },
  traits: ["サーヴァント", "人型", "神性", "騎乗", "魔性", "魔獣型", "霊衣を持つ者", "バニー系", "ケモノ科"],
  activeSkills: [
    {
      stableId: "koyanskaya-light-innovator-bunny",
      name: "イノベイター・バニー",
      rank: "A",
      slot: 1,
      cooldownAtMax: 8,
      effects: [
        { kind: "effect", stableId: "koyanskaya-light-innovator-bunny-np", order: 1, description: "味方単体のNPを50%増やす", target: { relation: "allies", selection: "single" }, action: { kind: "change_np", amount: 5_000 } },
        { kind: "effect", stableId: "koyanskaya-light-innovator-bunny-cooldown", order: 2, description: "味方単体のスキルチャージを2進める", target: { relation: "allies", selection: "single" }, action: { kind: "advance_skill_cooldowns", amount: 2 } },
        { kind: "effect", stableId: "koyanskaya-light-innovator-bunny-hp", order: 3, description: "味方全体のHPを1000減らす【デメリット】", target: { relation: "allies", selection: "all" }, action: { kind: "reduce_hp", amount: 1_000, canDefeat: false } },
      ],
    },
    {
      stableId: "koyanskaya-light-massacring-technique-human",
      name: "殺戮技巧（人）",
      rank: "A",
      slot: 2,
      cooldownAtMax: 6,
      effects: [
        { kind: "effect", stableId: "koyanskaya-light-human-special-attack", order: 1, description: "味方単体に〔人間〕特攻状態を50%付与(3T)", target: { relation: "allies", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "koyanskaya-light-human-special-attack-state", name: "〔人間〕特攻", effectType: COMMON_EFFECT_TYPES.power, category: "buff", value: 500, remainingTurns: 3, flags: { requiredTargetTrait: "人間" } } }] } },
        { kind: "effect", stableId: "koyanskaya-light-human-force-special-attack", order: 2, description: "味方単体に〔人の力を持つ敵〕特攻状態を50%付与(3T)", target: { relation: "allies", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "koyanskaya-light-human-force-special-attack-state", name: "〔人の力を持つ敵〕特攻", effectType: COMMON_EFFECT_TYPES.power, category: "buff", value: 500, remainingTurns: 3, flags: { requiredTargetTrait: "人の力を持つ敵" } } }] } },
        { kind: "effect", stableId: "koyanskaya-light-buster-normal-np", order: 3, description: "味方単体にBuster通常攻撃時に自身のNPを10%増やす状態を付与(3T)", target: { relation: "allies", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "koyanskaya-light-buster-normal-np-state", name: "Buster通常攻撃時NP増加", effectType: "trigger", category: "buff", remainingTurns: 3, trigger: { timing: "on_attack", condition: { attackKinds: ["normal_command"], cardTypes: ["buster"] }, actions: [{ target: { relation: "self", selection: "single" }, action: { kind: "change_np", amount: 1_000 } }] } } }] } },
        { kind: "effect", stableId: "koyanskaya-light-massacring-stars", order: 4, description: "スターを20個獲得", target: { relation: "self", selection: "single" }, action: { kind: "gain_stars", amount: 20, destination: "command" } },
      ],
    },
    {
      stableId: "koyanskaya-light-nff-special",
      name: "ＮＦＦスペシャル",
      rank: "A",
      slot: 3,
      cooldownAtMax: 6,
      effects: [
        { kind: "effect", stableId: "koyanskaya-light-nff-buster", order: 1, description: "味方単体のBusterカード性能を50%アップ(3T)", target: { relation: "allies", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "koyanskaya-light-nff-buster-state", name: "Busterカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, category: "buff", value: 500, remainingTurns: 3, flags: { cardType: "buster" } } }] } },
        { kind: "effect", stableId: "koyanskaya-light-nff-critical", order: 2, description: "味方単体のBusterカードのクリティカル威力を50%アップ(3T)", target: { relation: "allies", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "koyanskaya-light-nff-critical-state", name: "Busterクリティカル威力アップ", effectType: COMMON_EFFECT_TYPES.criticalDamage, category: "buff", value: 500, remainingTurns: 3, flags: { cardType: "buster" } } }] } },
        { kind: "effect", stableId: "koyanskaya-light-nff-star-focus", order: 3, description: "味方単体のBusterカードのスター集中度を5000%アップ(3T)", target: { relation: "allies", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "koyanskaya-light-nff-star-focus-state", name: "Busterスター集中度アップ", effectType: COMMON_EFFECT_TYPES.starFocus, category: "buff", value: 50_000, remainingTurns: 3, flags: { cardType: "buster" } } }] } },
      ],
    },
  ],
  classSkills: [
    { stableId: "koyanskaya-light-riding", name: "騎乗", rank: "B", effects: [{ kind: "effect", stableId: "koyanskaya-light-riding-quick", order: 1, description: "自身のQuickカード性能を8%アップ", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "koyanskaya-light-riding-quick-state", name: "Quickカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 80, flags: { cardType: "quick" }, ...PASSIVE } }] } }] },
    { stableId: "koyanskaya-light-independent-action", name: "単独行動", rank: "EX", effects: [{ kind: "effect", stableId: "koyanskaya-light-independent-action-critical", order: 1, description: "自身のクリティカル威力を12%アップ", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "koyanskaya-light-independent-action-critical-state", name: "クリティカル威力アップ", effectType: COMMON_EFFECT_TYPES.criticalDamage, value: 120, ...PASSIVE } }] } }] },
    { stableId: "koyanskaya-light-independent-manifestation", name: "単独顕現", rank: "C", effects: [
      { kind: "effect", stableId: "koyanskaya-light-independent-manifestation-critical", order: 1, description: "自身のクリティカル威力を6%アップ", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "koyanskaya-light-independent-manifestation-critical-state", name: "クリティカル威力アップ", effectType: COMMON_EFFECT_TYPES.criticalDamage, value: 60, ...PASSIVE } }] } },
      { kind: "effect", stableId: "koyanskaya-light-independent-manifestation-death", order: 2, description: "自身の即死耐性を6%アップ", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "koyanskaya-light-independent-manifestation-death-state", name: "即死耐性アップ", effectType: COMMON_EFFECT_TYPES.instantDeathResistance, value: 60, ...PASSIVE } }] } },
      { kind: "effect", stableId: "koyanskaya-light-independent-manifestation-mental", order: 3, description: "自身の精神異常耐性を6%アップ", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "koyanskaya-light-independent-manifestation-mental-state", name: "精神異常耐性アップ", effectType: COMMON_EFFECT_TYPES.debuffResistance, value: 60, classifications: ["mental"], ...PASSIVE } }] } },
    ] },
    { stableId: "koyanskaya-light-transformation", name: "変化", rank: "A", effects: [
      { kind: "effect", stableId: "koyanskaya-light-transformation-arts", order: 1, description: "自身のArtsカード性能を10%アップ", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "koyanskaya-light-transformation-arts-state", name: "Artsカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 100, flags: { cardType: "arts" }, ...PASSIVE } }] } },
      { kind: "effect", stableId: "koyanskaya-light-transformation-stars", order: 2, description: "自身のスター発生率を10%アップ", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "koyanskaya-light-transformation-stars-state", name: "スター発生率アップ", effectType: COMMON_EFFECT_TYPES.starGeneration, value: 100, ...PASSIVE } }] } },
    ] },
    { stableId: "koyanskaya-light-goddess-metamorphosis-gun", name: "女神変生（銃）", rank: "B", effects: [{ kind: "effect", stableId: "koyanskaya-light-goddess-metamorphosis-gun-np", order: 1, description: "自身の宝具威力を20%アップ", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "koyanskaya-light-goddess-metamorphosis-gun-np-state", name: "宝具威力アップ", effectType: COMMON_EFFECT_TYPES.noblePhantasmDamage, value: 200, ...PASSIVE } }] } }] },
  ],
  noblePhantasm: {
    stableId: "koyanskaya-light-ishturla-seven-drive",
    name: "霊裳重光・79式擲禍大社",
    reading: "イズトゥーラ・セブンドライブ",
    rank: "C",
    cardType: "buster",
    effects: [
      { kind: "effect", stableId: "koyanskaya-light-np-attack", order: 1, description: "自身の攻撃力を20%アップ(1T)", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "koyanskaya-light-np-attack-state", name: "攻撃力アップ", effectType: COMMON_EFFECT_TYPES.attack, category: "buff", value: 200, remainingTurns: 1 } }] } },
      { kind: "attack", stableId: "koyanskaya-light-np-damage", order: 2, targetScope: "all", hitWeights: [1, 1, 1, 1, 1, 1, 1, 1], damageMultiplierPermilleByLevel: [3_000, 4_000, 4_500, 4_750, 5_000] },
      { kind: "effect", stableId: "koyanskaya-light-np-charge", order: 3, description: "敵全体のチャージを1減らす", target: { relation: "enemies", selection: "all" }, action: { kind: "change_enemy_charge", amount: -1 } },
      { kind: "effect", stableId: "koyanskaya-light-np-party-np", order: 4, description: "味方全体のNPを増やす<OC>", target: { relation: "allies", selection: "all" }, action: { kind: "change_np", amount: { scaling: "overcharge", values: [1_000, 1_500, 2_000, 2_500, 3_000] } } },
    ],
  },
  sources: [{ url: "https://w.atwiki.jp/f_go/pages/5141.html", checkedAt: "2026-08-04", note: "強化後データのみ。Lv別ステータスは同ページ参照のレベル別表示で照合。" }],
};

export const LUCIFERA: ServantDefinition = {
  schemaVersion: SERVANT_DATA_SCHEMA_VERSION,
  dataId: "lucifera",
  collectionNo: 62,
  name: "ルシフェラ",
  rarity: 5,
  contentRevision: "current_upgraded_only",
  skillLevelPolicy: "max",
  classKey: "rider",
  attributeKey: "earth",
  classAttackCoefficientPermille: 1_000,
  levelStats: [
    { level: 1, hp: 1_946, attack: 1_679 }, { level: 50, hp: 8_359, attack: 6_846 },
    { level: 60, hp: 9_819, attack: 8_041 }, { level: 70, hp: 11_278, attack: 9_236 },
    { level: 80, hp: 12_340, attack: 10_106 }, { level: 90, hp: 13_269, attack: 10_867 },
    { level: 100, hp: 14_537, attack: 11_896 }, { level: 120, hp: 17_084, attack: 13_963 },
  ],
  commandCards: ["quick", "arts", "arts", "buster", "buster"],
  commandCardHitWeights: [[1, 1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]],
  extraAttackHitWeights: [1, 1, 1, 1, 1, 1],
  battleRates: { attackNpUnits: 59, receivedNpUnits: 300, attackNpRatePermille: 1_000, targetNpRatePermille: 1_000, starRatePermille: 88, starWeight: 200, targetStarRatePermille: 0, deathRatePermille: 300 },
  traits: ["サーヴァント", "人型", "女性", "秩序", "悪", "地の力", "ライダー", "騎乗", "神性", "ヒト科", "猛獣", "イギリスゆかりの者"],
  activeSkills: [
    {
      stableId: "lucifera-familiar-six-sins", name: "使い魔（六罪）", rank: "A++", slot: 1, cooldownAtMax: 7,
      effects: [
        { kind: "effect", stableId: "lucifera-familiar-buster", order: 1, description: "味方全体のBusterカード性能を30%アップ(3T)", target: { relation: "allies", selection: "all" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "lucifera-familiar-buster-state", name: "Busterカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, category: "buff", value: 300, remainingTurns: 3, flags: { cardType: "buster" } } }] } },
        { kind: "effect", stableId: "lucifera-familiar-attack", order: 2, description: "味方全体の攻撃力を20%アップ(3T)", target: { relation: "allies", selection: "all" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "lucifera-familiar-attack-state", name: "攻撃力アップ", effectType: COMMON_EFFECT_TYPES.attack, category: "buff", value: 200, remainingTurns: 3 } }] } },
        { kind: "effect", stableId: "lucifera-familiar-np-card", order: 3, description: "味方単体の宝具カードのタイプをBusterに切り替える(1T)", target: { relation: "allies", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: createNoblePhantasmCardTypeChangeEffect("buster", "宝具カードBuster化", { stableId: "lucifera-familiar-np-card-state", remainingTurns: 1 }) }] } },
        { kind: "effect", stableId: "lucifera-familiar-np-trigger", order: 4, description: "味方単体に宝具使用時にスキルチャージを1進め、クリティカル威力を30%アップし、スターを15個獲得する状態を付与(1回・1T)", target: { relation: "allies", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "lucifera-familiar-np-trigger-state", name: "宝具使用時追加効果", effectType: "trigger", category: "buff", remainingTurns: 1, remainingUses: 1, trigger: { timing: "after_attack", condition: { attackKinds: ["noble_phantasm"] }, consumeUseOnActivation: true, actions: [
          { target: { relation: "self", selection: "single" }, action: { kind: "advance_skill_cooldowns", amount: 1 } },
          { target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "lucifera-familiar-np-trigger-critical-state", name: "クリティカル威力アップ", effectType: COMMON_EFFECT_TYPES.criticalDamage, category: "buff", value: 300, remainingTurns: 3 } }] } },
          { target: { relation: "self", selection: "single" }, action: { kind: "gain_stars", amount: 15, destination: "next_command" } },
        ] } } }] } },
      ],
    },
    {
      stableId: "lucifera-sin-source-chariot", name: "罪源業車", rank: "A++", slot: 2, cooldownAtMax: 7,
      effects: [
        { kind: "effect", stableId: "lucifera-sin-source-party-np", order: 1, description: "味方全体のNPを30%増やす", target: { relation: "allies", selection: "all" }, action: { kind: "change_np", amount: 3_000 } },
        { kind: "effect", stableId: "lucifera-sin-source-target-np", order: 2, description: "味方単体のNPを20%増やす", target: { relation: "allies", selection: "single" }, action: { kind: "change_np", amount: 2_000 } },
        { kind: "effect", stableId: "lucifera-sin-source-self-np", order: 3, description: "自身のNPを10%増やす", target: { relation: "self", selection: "single" }, action: { kind: "change_np", amount: 1_000 } },
      ],
    },
    {
      stableId: "lucifera-queen-of-vanity", name: "虚栄の女王", rank: "A+", slot: 3, cooldownAtMax: 8,
      effects: [
        { kind: "effect", stableId: "lucifera-queen-evil-cooldown", order: 1, description: "〔悪〕特性の味方全体のスキルチャージを1進める", target: { relation: "allies", selection: "all", requiredTraits: ["悪"] }, action: { kind: "advance_skill_cooldowns", amount: 1 } },
        { kind: "effect", stableId: "lucifera-queen-np-double", order: 2, description: "味方単体のNPを100%分増やす", target: { relation: "allies", selection: "single" }, action: { kind: "increase_np_by_current_rate", ratePermille: 1_000 } },
        { kind: "effect", stableId: "lucifera-queen-buff-clear", order: 3, description: "味方単体にターン終了時に自身の強化状態を解除する状態を付与【デメリット】", target: { relation: "allies", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "lucifera-queen-buff-clear-state", name: "ターン終了時強化解除", effectType: "trigger", category: "debuff", remainingTurns: 1, trigger: { timing: "turn_end", actions: [{ target: { relation: "self", selection: "single" }, action: { kind: "remove_effects", request: { mode: "all", category: "buff" }, baseRatePermille: 1_000 } }] } } }] } },
      ],
    },
  ],
  classSkills: [
    { stableId: "lucifera-magic-resistance", name: "対魔力", rank: "B", effects: [{ kind: "effect", stableId: "lucifera-magic-resistance-debuff", order: 1, description: "自身の弱体耐性を17.5%アップ", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "lucifera-magic-resistance-debuff-state", name: "弱体耐性アップ", effectType: COMMON_EFFECT_TYPES.debuffResistance, value: 175, ...PASSIVE } }] } }] },
    { stableId: "lucifera-dragon-riding", name: "竜種騎乗", rank: "A", effects: [
      { kind: "effect", stableId: "lucifera-dragon-riding-quick", order: 1, description: "自身のQuickカード性能を10%アップ", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "lucifera-dragon-riding-quick-state", name: "Quickカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 100, flags: { cardType: "quick" }, ...PASSIVE } }] } },
      { kind: "effect", stableId: "lucifera-dragon-riding-critical", order: 2, description: "自身のクリティカル威力を10%アップ", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "lucifera-dragon-riding-critical-state", name: "クリティカル威力アップ", effectType: COMMON_EFFECT_TYPES.criticalDamage, value: 100, ...PASSIVE } }] } },
    ] },
    { stableId: "lucifera-divinity", name: "神性", rank: "B", effects: [{ kind: "effect", stableId: "lucifera-divinity-fixed-damage", order: 1, description: "自身に与ダメージプラス状態を175付与", target: { relation: "self", selection: "single" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "lucifera-divinity-fixed-damage-state", name: "与ダメージプラス", effectType: COMMON_EFFECT_TYPES.fixedDamage, value: 175, ...PASSIVE } }] } }] },
  ],
  noblePhantasm: {
    stableId: "lucifera-septem-peccata-mortalia", name: "高き館の女皇", reading: "セプテム・ペッカータ・モルターリア", rank: "A++", cardType: "buster",
    effects: [
      { kind: "effect", stableId: "lucifera-np-evil-trait", order: 1, description: "敵全体に〔悪〕特性を付与(3T)", target: { relation: "enemies", selection: "all" }, action: { kind: "apply_effects", effects: [{ template: createTraitGrantEffect("悪", "〔悪〕特性", { stableId: "lucifera-np-evil-trait-state", remainingTurns: 3 }) }] } },
      { kind: "attack", stableId: "lucifera-np-damage", order: 2, targetScope: "all", hitWeights: [1, 1, 1, 1, 1], damageMultiplierPermilleByLevel: [3_000, 4_000, 4_500, 4_750, 5_000], specialAttack: { stableId: "lucifera-np-evil-special-attack", requiredTargetTraits: ["悪"], multiplierPermilleByOvercharge: [1_500, 1_625, 1_750, 1_875, 2_000] } },
      { kind: "effect", stableId: "lucifera-np-party-evil-trait", order: 3, description: "自身を除く味方全体に〔悪〕特性を付与(3T)", target: { relation: "allies", selection: "all", excludeSource: true }, action: { kind: "apply_effects", effects: [{ template: createTraitGrantEffect("悪", "〔悪〕特性", { stableId: "lucifera-np-party-evil-trait-state", remainingTurns: 3 }) }] } },
      { kind: "effect", stableId: "lucifera-np-buff-removal-resistance", order: 4, description: "味方全体の強化解除耐性を100%アップ(1回・3T)", target: { relation: "allies", selection: "all" }, action: { kind: "apply_effects", effects: [{ template: { stableId: "lucifera-np-buff-removal-resistance-state", name: "強化解除耐性アップ", effectType: COMMON_EFFECT_TYPES.buffRemovalResistance, category: "buff", value: 1_000, remainingTurns: 3, remainingUses: 1 } }] } },
    ],
  },
  sources: [{ url: "https://w.atwiki.jp/siroi_human/pages/795.html", checkedAt: "2026-08-04", note: "強化後データのみ。" }],
};

export const INITIAL_SERVANT_DEFINITIONS: readonly ServantDefinition[] = [
  LIGHT_KOYANSKAYA,
  LUCIFERA,
];
