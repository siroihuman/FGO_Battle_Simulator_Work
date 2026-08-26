import { COMMON_EFFECT_TYPES } from "../../effects/modifiers";
import { createCraftEssenceDataRegistry } from "./registry";
import {
  CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
  type CraftEssenceDefinition,
} from "./schema";

const OFFICIAL_SOURCE = {
  url: "https://news.fate-go.jp/2022/7th_anniversary/",
  checkedAt: "2026-08-10",
  note: "最大解放時の効果対象・効果量とLv最大時能力値を照合。",
} as const;

const BOND_CRAFT_ESSENCE = {
  rarity: 4 as const,
  limitBreak: "max" as const,
  level: 80,
  attack: 100,
  hp: 100,
};

const SELF_TURN_END_HEAL = (amount: number) => ({
  timing: "turn_end" as const,
  actions: [{
    target: { relation: "self" as const, selection: "single" as const },
    action: { kind: "heal_hp" as const, amount },
    turnEndSettlement: "recurring_hp_recovery" as const,
  }],
});

export const KALEIDOSCOPE: CraftEssenceDefinition = {
  schemaVersion: CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
  dataId: "kaleidoscope",
  name: "カレイドスコープ",
  rarity: 5,
  limitBreak: "max",
  level: 100,
  attack: 2_000,
  hp: 0,
  startEffects: [{
    kind: "effect",
    stableId: "kaleidoscope-start-np",
    order: 1,
    description: "自身のNPを100%チャージした状態でバトルを開始する",
    target: { relation: "self", selection: "single" },
    action: { kind: "change_np", amount: 10_000 },
  }],
  sources: [
    {
      url: "https://appmedia.jp/fategrandorder/90628",
      checkedAt: "2026-08-10",
      note: "正式名称、星5、最大解放時NP100%、Lv100時ATK2000・HP0を照合。",
    },
    OFFICIAL_SOURCE,
  ],
};

export const BLACK_GRAIL: CraftEssenceDefinition = {
  schemaVersion: CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
  dataId: "black-grail",
  name: "黒の聖杯",
  rarity: 5,
  limitBreak: "max",
  level: 100,
  attack: 2_400,
  hp: 0,
  startEffects: [
    {
      kind: "effect",
      stableId: "black-grail-noble-phantasm-damage",
      order: 1,
      description: "自身の宝具威力を80%アップ",
      target: { relation: "self", selection: "single" },
      action: {
        kind: "apply_effects",
        effects: [{
          template: {
            stableId: "black-grail-noble-phantasm-damage-state",
            name: "宝具威力アップ",
            effectType: COMMON_EFFECT_TYPES.noblePhantasmDamage,
            category: "buff",
            value: 800,
            removalPolicy: "unremovable",
          },
        }],
      },
    },
    {
      kind: "effect",
      stableId: "black-grail-recurring-hp-reduction",
      order: 2,
      description: "自身に毎ターンHP500減少状態を付与【デメリット】",
      target: { relation: "self", selection: "single" },
      action: {
        kind: "apply_effects",
        effects: [{
          template: {
            stableId: "black-grail-recurring-hp-reduction-state",
            name: "毎ターンHP減少",
            effectType: "recurring_hp_reduction",
            category: "other",
            removalPolicy: "unremovable",
            trigger: {
              timing: "turn_end",
              actions: [{
                target: { relation: "self", selection: "single" },
                action: { kind: "reduce_hp", amount: 500, canDefeat: true },
              }],
            },
          },
        }],
      },
    },
  ],
  sources: [
    {
      url: "https://appmedia.jp/fategrandorder/103128",
      checkedAt: "2026-08-10",
      note: "正式名称、星5、最大解放時宝具威力80%・毎ターンHP500減少、Lv100時ATK2400・HP0を照合。",
    },
    OFFICIAL_SOURCE,
    {
      url: "https://w.atwiki.jp/f_go/pages/1929.html",
      checkedAt: "2026-08-10",
      note: "黒の聖杯の毎ターンHP減少デメリットでHP0になり得ることを照合。",
    },
  ],
};

export const HONDA_TADAKATSU_BOND: CraftEssenceDefinition = {
  schemaVersion: CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
  dataId: "honda-tadakatsu-bond",
  name: "傷ひとつなき具足",
  ...BOND_CRAFT_ESSENCE,
  eligibleServantDataIds: ["honda-tadakatsu"],
  startEffects: [
    {
      kind: "effect",
      stableId: "honda-tadakatsu-bond-quick",
      order: 1,
      description: "自身のQuickカード性能をアップ",
      target: { relation: "self", selection: "single" },
      action: { kind: "apply_effects", effects: [{ template: { stableId: "honda-tadakatsu-bond-quick-state", name: "Quickカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, category: "buff", value: 100, removalPolicy: "unremovable", flags: { cardType: "quick" } } }] },
    },
    {
      kind: "effect",
      stableId: "honda-tadakatsu-bond-critical",
      order: 2,
      description: "＆クリティカル威力をアップ",
      target: { relation: "self", selection: "single" },
      action: { kind: "apply_effects", effects: [{ template: { stableId: "honda-tadakatsu-bond-critical-state", name: "クリティカル威力アップ", effectType: COMMON_EFFECT_TYPES.criticalDamage, category: "buff", value: 300, removalPolicy: "unremovable" } }] },
    },
  ],
  sources: [{ url: "https://w.atwiki.jp/siroi_human/pages/274.html", checkedAt: "2026-08-24", note: "絆礼装「傷ひとつなき具足」の名称、星4Lv80・ATK100・HP100、Quick性能10%・クリティカル威力30%を照合。" }],
};

export const DOMINATION_FOREIGNER_BOND: CraftEssenceDefinition = {
  schemaVersion: CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
  dataId: "domination-foreigner-bond",
  name: "一九二八年二月号",
  ...BOND_CRAFT_ESSENCE,
  eligibleServantDataIds: ["domination-foreigner"],
  startEffects: [{
    kind: "effect",
    stableId: "domination-foreigner-bond-np-damage",
    order: 1,
    description: "自身の宝具威力をアップ",
    target: { relation: "self", selection: "single" },
    action: { kind: "apply_effects", effects: [{ template: { stableId: "domination-foreigner-bond-np-damage-state", name: "宝具威力アップ", effectType: COMMON_EFFECT_TYPES.noblePhantasmDamage, category: "buff", value: 300, removalPolicy: "unremovable" } }] },
  }],
  fieldEffects: [
    {
      kind: "effect",
      stableId: "domination-foreigner-bond-human-allies-attack",
      order: 1,
      description: "＋自身を除く味方全体の〔人の力を持つ味方〕の攻撃力をアップ",
      target: { relation: "allies", selection: "all", includeReserve: true, excludeSource: true, requiredTraits: ["人の力"] },
      action: { kind: "apply_effects", effects: [{ template: { stableId: "domination-foreigner-bond-human-allies-attack-state", name: "攻撃力アップ", effectType: COMMON_EFFECT_TYPES.attack, category: "buff", value: 100, removalPolicy: "unremovable" } }] },
    },
    {
      kind: "effect",
      stableId: "domination-foreigner-bond-human-allies-np-gain",
      order: 2,
      description: "＆NP獲得量をアップ",
      target: { relation: "allies", selection: "all", includeReserve: true, excludeSource: true, requiredTraits: ["人の力"] },
      action: { kind: "apply_effects", effects: [{ template: { stableId: "domination-foreigner-bond-human-allies-np-gain-state", name: "NP獲得量アップ", effectType: COMMON_EFFECT_TYPES.npGain, category: "buff", value: 100, removalPolicy: "unremovable" } }] },
    },
  ],
  sources: [{ url: "https://w.atwiki.jp/siroi_human/pages/766.html", checkedAt: "2026-08-24", note: "絆礼装「一九二八年二月号」の名称、星4Lv80・ATK100・HP100、装備者・〔人の力〕味方対象の効果を照合。" }],
};

export const AJISUKITAKAHIKONE_NO_KAMI_BOND: CraftEssenceDefinition = {
  schemaVersion: CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
  dataId: "ajisukitakahikone-no-kami-bond",
  name: "二谷を渡る玉",
  ...BOND_CRAFT_ESSENCE,
  eligibleServantDataIds: ["ajisukitakahikone-no-kami"],
  startEffects: [],
  fieldEffects: [{
    kind: "effect",
    stableId: "ajisukitakahikone-bond-party-attack",
    order: 1,
    description: "味方全体の攻撃力をアップ",
    target: { relation: "allies", selection: "all", includeReserve: true },
    action: { kind: "apply_effects", effects: [{ template: { stableId: "ajisukitakahikone-bond-party-attack-state", name: "攻撃力アップ", effectType: COMMON_EFFECT_TYPES.attack, category: "buff", value: 150, removalPolicy: "unremovable" } }] },
  }],
  sources: [{ url: "https://w.atwiki.jp/siroi_human/pages/50.html", checkedAt: "2026-08-24", note: "絆礼装「二谷を渡る玉」の名称、星4Lv80・ATK100・HP100、前衛中の味方全体攻撃力15%を照合。" }],
};

export const FENRIR_BOND: CraftEssenceDefinition = {
  schemaVersion: CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
  dataId: "fenrir-bond",
  name: "六つのありえざるもの",
  ...BOND_CRAFT_ESSENCE,
  eligibleServantDataIds: ["fenrir"],
  startEffects: [
    {
      kind: "effect",
      stableId: "fenrir-bond-critical",
      order: 1,
      description: "自身のクリティカル威力をアップ",
      target: { relation: "self", selection: "single" },
      action: { kind: "apply_effects", effects: [{ template: { stableId: "fenrir-bond-critical-state", name: "クリティカル威力アップ", effectType: COMMON_EFFECT_TYPES.criticalDamage, category: "buff", value: 300, removalPolicy: "unremovable" } }] },
    },
    {
      kind: "effect",
      stableId: "fenrir-bond-buster-np",
      order: 2,
      description: "＆「Buster通常攻撃時確率(30％)でNPを増やす状態」を付与",
      target: { relation: "self", selection: "single" },
      action: { kind: "apply_effects", effects: [{ template: { stableId: "fenrir-bond-buster-np-state", name: "Buster通常攻撃時NP増加", effectType: "trigger", category: "buff", removalPolicy: "unremovable", trigger: { timing: "on_attack", activationRatePermille: 300, condition: { attackKinds: ["normal_command"], cardTypes: ["buster"] }, actions: [{ target: { relation: "self", selection: "single" }, action: { kind: "change_np", amount: 1_000 } }] } } }] },
    },
  ],
  sources: [{ url: "https://w.atwiki.jp/siroi_human/pages/329.html", checkedAt: "2026-08-24", note: "絆礼装「六つのありえざるもの」の名称、星4Lv80・ATK100・HP100、クリティカル威力30%とBuster通常攻撃時確率30%のNP10%増加を照合。" }],
};

export const LUCIFERA_BOND: CraftEssenceDefinition = {
  schemaVersion: CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
  dataId: "lucifera-bond",
  name: "六罪牽く黄金車",
  ...BOND_CRAFT_ESSENCE,
  eligibleServantDataIds: ["lucifera"],
  startEffects: [{
    kind: "effect",
    stableId: "lucifera-bond-self-effects",
    order: 1,
    description: "自身の宝具威力をアップ",
    target: { relation: "self", selection: "single" },
    action: {
      kind: "apply_effects",
      effects: [{ template: { stableId: "lucifera-bond-np-damage-state", name: "宝具威力アップ", effectType: COMMON_EFFECT_TYPES.noblePhantasmDamage, category: "buff", value: 300, removalPolicy: "unremovable" } }],
    },
  }],
  fieldEffects: [{
    kind: "effect",
    stableId: "lucifera-bond-evil-allies-buster",
    order: 1,
    description: "＋自身を除く〔悪〕特性の味方全体のBuster性能をアップ",
    target: { relation: "allies", selection: "all", includeReserve: true, excludeSource: true, requiredTraits: ["悪"] },
    action: { kind: "apply_effects", effects: [{ template: { stableId: "lucifera-bond-evil-allies-buster-state", name: "Busterカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, category: "buff", value: 150, removalPolicy: "unremovable", flags: { cardType: "buster" } } }] },
  }],
  sources: [{ url: "https://w.atwiki.jp/siroi_human/pages/795.html", checkedAt: "2026-08-24", note: "絆礼装「六罪牽く黄金車」の名称、星4Lv80・ATK100・HP100、装備者・〔悪〕味方対象の効果を照合。" }],
};

export const MOTHER_MARY_BOND: CraftEssenceDefinition = {
  schemaVersion: CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
  dataId: "mother-mary-bond",
  name: "聖母の揺籃",
  ...BOND_CRAFT_ESSENCE,
  eligibleServantDataIds: ["mother-mary"],
  startEffects: [],
  fieldEffects: [
    {
      kind: "effect",
      stableId: "mother-mary-bond-outside-domain-recovery",
      order: 1,
      description: "〔領域外の生命〕特性の味方全体のHP回復量をアップ",
      target: { relation: "allies", selection: "all", includeReserve: true, requiredTraits: ["領域外の生命"] },
      action: { kind: "apply_effects", effects: [{ template: { stableId: "mother-mary-bond-outside-domain-recovery-state", name: "HP回復量アップ", effectType: COMMON_EFFECT_TYPES.receivedHpRecovery, category: "buff", value: 300, removalPolicy: "unremovable" } }] },
    },
    {
      kind: "effect",
      stableId: "mother-mary-bond-outside-domain-recurring-heal",
      order: 2,
      description: "＆毎ターンHP回復状態を付与",
      target: { relation: "allies", selection: "all", includeReserve: true, requiredTraits: ["領域外の生命"] },
      action: { kind: "apply_effects", effects: [{ template: { stableId: "mother-mary-bond-outside-domain-recurring-heal-state", name: "毎ターンHP回復", effectType: COMMON_EFFECT_TYPES.recurringHpRecovery, category: "buff", value: 500, removalPolicy: "unremovable", trigger: SELF_TURN_END_HEAL(500) } }] },
    },
  ],
  sources: [{ url: "https://w.atwiki.jp/siroi_human/pages/781.html", checkedAt: "2026-08-24", note: "絆礼装「聖母の揺籃」の名称、星4Lv80・ATK100・HP100、〔領域外の生命〕味方へのHP回復量30%と毎ターンHP500回復を照合。" }],
};

export const SANADA_YUKIMURA_BOND: CraftEssenceDefinition = {
  schemaVersion: CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
  dataId: "sanada-yukimura-bond",
  name: "六文の渡し賃",
  ...BOND_CRAFT_ESSENCE,
  eligibleServantDataIds: ["sanada-yukimura"],
  startEffects: [],
  fieldEffects: [
    {
      kind: "effect",
      stableId: "sanada-yukimura-bond-party-critical",
      order: 1,
      description: "自身がフィールドにいる間、味方全体のクリティカル威力をアップ",
      target: { relation: "allies", selection: "all", includeReserve: true },
      action: { kind: "apply_effects", effects: [{ template: { stableId: "sanada-yukimura-bond-party-critical-state", name: "クリティカル威力アップ", effectType: COMMON_EFFECT_TYPES.criticalDamage, category: "buff", value: 100, removalPolicy: "unremovable" } }] },
    },
    {
      kind: "effect",
      stableId: "sanada-yukimura-bond-party-defense",
      order: 2,
      description: "＆防御力をアップ",
      target: { relation: "allies", selection: "all", includeReserve: true },
      action: { kind: "apply_effects", effects: [{ template: { stableId: "sanada-yukimura-bond-party-defense-state", name: "防御力アップ", effectType: COMMON_EFFECT_TYPES.defense, category: "buff", classifications: ["defense"], value: 100, removalPolicy: "unremovable" } }] },
    },
    {
      kind: "effect",
      stableId: "sanada-yukimura-bond-party-received-np",
      order: 3,
      description: "＆被ダメージ時のNP獲得量をアップ",
      target: { relation: "allies", selection: "all", includeReserve: true },
      action: { kind: "apply_effects", effects: [{ template: { stableId: "sanada-yukimura-bond-party-received-np-state", name: "被ダメージ時のNP獲得量アップ", effectType: COMMON_EFFECT_TYPES.receivedNpGain, category: "buff", value: 100, removalPolicy: "unremovable" } }] },
    },
  ],
  sources: [{ url: "https://w.atwiki.jp/siroi_human/pages/813.html", checkedAt: "2026-08-24", note: "絆礼装「六文の渡し賃」の名称、星4Lv80・ATK100・HP100、前衛中の味方全体へのクリティカル威力・防御力・被ダメージ時NP獲得量各10%を照合。" }],
};

export const LIGHT_KOYANSKAYA_BOND: CraftEssenceDefinition = {
  schemaVersion: CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
  dataId: "koyanskaya-of-light-bond",
  name: "コヤンスカヤの野望～東海岸版～",
  ...BOND_CRAFT_ESSENCE,
  eligibleServantDataIds: ["koyanskaya-of-light"],
  startEffects: [],
  fieldEffects: [
    {
      kind: "effect",
      stableId: "koyanskaya-light-bond-human-special-attack",
      order: 1,
      description: "自身がフィールドにいる間、味方全体に〔人間〕特攻状態を付与",
      target: { relation: "allies", selection: "all", includeReserve: true },
      action: { kind: "apply_effects", effects: [{ template: { stableId: "koyanskaya-light-bond-human-special-attack-state", name: "〔人間〕特攻", effectType: COMMON_EFFECT_TYPES.power, category: "buff", value: 150, removalPolicy: "unremovable", flags: { requiredTargetTrait: "人間" } } }] },
    },
    {
      kind: "effect",
      stableId: "koyanskaya-light-bond-human-force-special-attack",
      order: 2,
      description: "＆〔人の力を持つ敵〕特攻状態を付与",
      target: { relation: "allies", selection: "all", includeReserve: true },
      action: { kind: "apply_effects", effects: [{ template: { stableId: "koyanskaya-light-bond-human-force-special-attack-state", name: "〔人の力を持つ敵〕特攻", effectType: COMMON_EFFECT_TYPES.power, category: "buff", value: 150, removalPolicy: "unremovable", flags: { requiredTargetTrait: "人の力を持つ敵" } } }] },
    },
  ],
  sources: [{ url: "https://w.atwiki.jp/f_go/pages/5141.html", checkedAt: "2026-08-24", note: "絆礼装「コヤンスカヤの野望～東海岸版～」の名称、星4Lv80・ATK100・HP100、前衛中の味方全体への2種15%特攻を照合。" }],
};

export const SEN_NO_RIKYU_BOND: CraftEssenceDefinition = {
  schemaVersion: CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
  dataId: "sen-no-rikyu-bond",
  name: "水の如く花の如く",
  ...BOND_CRAFT_ESSENCE,
  eligibleServantDataIds: ["sen-no-rikyu"],
  startEffects: [],
  fieldEffects: [{
    kind: "effect",
    stableId: "sen-no-rikyu-bond-party-human-force-special-attack",
    order: 1,
    description: "自身がフィールドにいる間、味方全体に〔人の力を持つ敵〕特攻状態を付与",
    target: { relation: "allies", selection: "all", includeReserve: true },
    action: { kind: "apply_effects", effects: [{ template: { stableId: "sen-no-rikyu-bond-human-force-special-attack-state", name: "〔人の力を持つ敵〕特攻", effectType: COMMON_EFFECT_TYPES.power, category: "buff", value: 200, removalPolicy: "unremovable", flags: { requiredTargetTrait: "人の力を持つ敵" } } }] },
  }],
  sources: [{ url: "https://w.atwiki.jp/f_go/pages/5723.html", checkedAt: "2026-08-24", note: "絆礼装「水の如く花の如く」の名称、星4Lv80・ATK100・HP100、前衛中の味方全体への〔人の力を持つ敵〕特攻20%を照合。" }],
};

export const LI_GUANG_BOND: CraftEssenceDefinition = {
  schemaVersion: CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
  dataId: "li-guang-bond",
  name: "桃李の下の蹊",
  ...BOND_CRAFT_ESSENCE,
  eligibleServantDataIds: ["li-guang"],
  startEffects: [],
  fieldEffects: [
    {
      kind: "effect",
      stableId: "li-guang-bond-party-attack",
      order: 1,
      description: "自身がフィールドにいる間、味方全体の攻撃力をアップ",
      target: { relation: "allies", selection: "all", includeReserve: true },
      action: { kind: "apply_effects", effects: [{ template: { stableId: "li-guang-bond-party-attack-state", name: "攻撃力アップ", effectType: COMMON_EFFECT_TYPES.attack, category: "buff", value: 100, removalPolicy: "unremovable" } }] },
    },
    {
      kind: "effect",
      stableId: "li-guang-bond-party-np-gain",
      order: 2,
      description: "＆NP獲得量をアップ",
      target: { relation: "allies", selection: "all", includeReserve: true },
      action: { kind: "apply_effects", effects: [{ template: { stableId: "li-guang-bond-party-np-gain-state", name: "NP獲得量アップ", effectType: COMMON_EFFECT_TYPES.npGain, category: "buff", value: 150, removalPolicy: "unremovable" } }] },
    },
  ],
  sources: [{ url: "https://w.atwiki.jp/siroi_human/pages/915.html", checkedAt: "2026-08-25", note: "効果、星4Lv80・ATK100・HP100を照合。絆礼装名「桃李の下の蹊」はユーザー指定。" }],
};

export const SALVADOR_DALI_BOND: CraftEssenceDefinition = {
  schemaVersion: CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
  dataId: "salvador-dali-bond",
  name: "死してなお",
  ...BOND_CRAFT_ESSENCE,
  eligibleServantDataIds: ["salvador-dali"],
  startEffects: [
    {
      kind: "effect",
      stableId: "salvador-dali-bond-np-damage",
      order: 1,
      description: "自身の宝具威力をアップ",
      target: { relation: "self", selection: "single" },
      action: { kind: "apply_effects", effects: [{ template: { stableId: "salvador-dali-bond-np-damage-state", name: "宝具威力アップ", effectType: COMMON_EFFECT_TYPES.noblePhantasmDamage, category: "buff", value: 300, removalPolicy: "unremovable" } }] },
    },
    {
      kind: "effect",
      stableId: "salvador-dali-bond-instant-death-success",
      order: 2,
      description: "＆即死付与成功率をアップ",
      target: { relation: "self", selection: "single" },
      action: { kind: "apply_effects", effects: [{ template: { stableId: "salvador-dali-bond-instant-death-success-state", name: "即死付与成功率アップ", effectType: COMMON_EFFECT_TYPES.instantDeathSuccess, category: "buff", value: 1_000, removalPolicy: "unremovable" } }] },
    },
  ],
  sources: [{ url: "https://w.atwiki.jp/siroi_human/pages/922.html", checkedAt: "2026-08-25", note: "絆礼装「死してなお」の名称はユーザー指定。星4Lv80・ATK100・HP100、宝具威力30%・即死付与成功率100%を照合。" }],
};

export const AGRIPPA_BOND: CraftEssenceDefinition = {
  schemaVersion: CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
  dataId: "agrippa-bond",
  name: "船嘴の黄金冠",
  ...BOND_CRAFT_ESSENCE,
  eligibleServantDataIds: ["agrippa"],
  startEffects: [],
  fieldEffects: [
    {
      kind: "effect",
      stableId: "agrippa-bond-party-arts",
      order: 1,
      description: "自身がフィールドにいる間、味方全体のArtsカード性能をアップ",
      target: { relation: "allies", selection: "all", includeReserve: true },
      action: { kind: "apply_effects", effects: [{ template: { stableId: "agrippa-bond-party-arts-state", name: "Artsカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, category: "buff", value: 100, removalPolicy: "unremovable", flags: { cardType: "arts" } } }] },
    },
    {
      kind: "effect",
      stableId: "agrippa-bond-first-emperor-defense",
      order: 2,
      description: "＋味方全体の〔初代ローマ皇帝〕の防御力をアップ",
      target: { relation: "allies", selection: "all", includeReserve: true, requiredTraits: ["初代ローマ皇帝"] },
      action: { kind: "apply_effects", effects: [{ template: { stableId: "agrippa-bond-first-emperor-defense-state", name: "防御力アップ", effectType: COMMON_EFFECT_TYPES.defense, category: "buff", classifications: ["defense"], value: 150, removalPolicy: "unremovable" } }] },
    },
  ],
  sources: [{ url: "https://w.atwiki.jp/siroi_human/pages/300.html", checkedAt: "2026-08-25", note: "絆礼装「船嘴の黄金冠」の名称と、装備者が前衛にいる間のArts性能10%・〔初代ローマ皇帝〕防御力15%をユーザー指定で照合。星4Lv80・ATK100・HP100は既存の絆礼装共通仕様を使用。" }],
};

export const DUZYARYA_RIDER_BOND: CraftEssenceDefinition = {
  schemaVersion: CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
  dataId: "duzyarya-rider-bond",
  name: "雨なき年の星",
  ...BOND_CRAFT_ESSENCE,
  eligibleServantDataIds: ["duzyarya-rider"],
  startEffects: [
    {
      kind: "effect",
      stableId: "duzyarya-rider-bond-self-removable-debuff-power",
      order: 1,
      description: "＋自身に〔弱体状態(解除不能な状態は除く)〕特攻状態を付与：15%",
      target: { relation: "self", selection: "single" },
      action: { kind: "apply_effects", effects: [{ template: { stableId: "duzyarya-rider-bond-self-removable-debuff-power-state", name: "〔弱体状態(解除不能な状態は除く)〕特攻", effectType: COMMON_EFFECT_TYPES.power, category: "buff", value: 150, removalPolicy: "unremovable", flags: { requiresRemovableTargetDebuff: true } } }] },
    },
  ],
  fieldEffects: [
    {
      kind: "effect",
      stableId: "duzyarya-rider-bond-party-removable-debuff-power",
      order: 1,
      description: "自身がフィールドにいる間、味方全体に〔弱体状態(解除不能な状態は除く)〕特攻状態を付与：15%",
      target: { relation: "allies", selection: "all", includeReserve: true },
      action: { kind: "apply_effects", effects: [{ template: { stableId: "duzyarya-rider-bond-party-removable-debuff-power-state", name: "〔弱体状態(解除不能な状態は除く)〕特攻", effectType: COMMON_EFFECT_TYPES.power, category: "buff", value: 150, removalPolicy: "unremovable", flags: { requiresRemovableTargetDebuff: true } } }] },
    },
  ],
  sources: [{ url: "https://w.atwiki.jp/siroi_human/pages/33.html", checkedAt: "2026-08-26", note: "絆礼装「雨なき年の星」の名称と、前衛中の味方全体15%・装備者自身15%の〔弱体状態(解除不能な状態は除く)〕特攻をユーザー指定で照合。星4Lv80・ATK100・HP100は既存の絆礼装共通仕様を使用。" }],
};

export const INITIAL_CRAFT_ESSENCE_DEFINITIONS = [
  KALEIDOSCOPE,
  BLACK_GRAIL,
  HONDA_TADAKATSU_BOND,
  DOMINATION_FOREIGNER_BOND,
  AJISUKITAKAHIKONE_NO_KAMI_BOND,
  FENRIR_BOND,
  LUCIFERA_BOND,
  MOTHER_MARY_BOND,
  SANADA_YUKIMURA_BOND,
  LIGHT_KOYANSKAYA_BOND,
  SEN_NO_RIKYU_BOND,
  LI_GUANG_BOND,
  SALVADOR_DALI_BOND,
  AGRIPPA_BOND,
  DUZYARYA_RIDER_BOND,
] as const;

export const INITIAL_CRAFT_ESSENCE_REGISTRY = createCraftEssenceDataRegistry(
  INITIAL_CRAFT_ESSENCE_DEFINITIONS,
);
