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
  startEffects: [{
    kind: "effect",
    stableId: "honda-tadakatsu-bond-quick-critical",
    order: 1,
    description: "本多忠勝装備時のみ、自身のQuickカード性能を10%アップ＆クリティカル威力を30%アップ",
    target: { relation: "self", selection: "single" },
    action: {
      kind: "apply_effects",
      effects: [
        { template: { stableId: "honda-tadakatsu-bond-quick-state", name: "Quickカード性能アップ", effectType: COMMON_EFFECT_TYPES.cardPerformance, category: "buff", value: 100, removalPolicy: "unremovable", flags: { cardType: "quick" } } },
        { template: { stableId: "honda-tadakatsu-bond-critical-state", name: "クリティカル威力アップ", effectType: COMMON_EFFECT_TYPES.criticalDamage, category: "buff", value: 300, removalPolicy: "unremovable" } },
      ],
    },
  }],
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
    description: "支配のフォーリナー装備時のみ、自身の宝具威力を30%アップ",
    target: { relation: "self", selection: "single" },
    action: { kind: "apply_effects", effects: [{ template: { stableId: "domination-foreigner-bond-np-damage-state", name: "宝具威力アップ", effectType: COMMON_EFFECT_TYPES.noblePhantasmDamage, category: "buff", value: 300, removalPolicy: "unremovable" } }] },
  }],
  fieldEffects: [{
    kind: "effect",
    stableId: "domination-foreigner-bond-human-allies",
    order: 1,
    description: "＋自身を除く〔人の力を持つ味方〕全体の攻撃力を10%アップ＆NP獲得量を10%アップ（支配のフォーリナーがフィールドにいる間のみ）",
    target: { relation: "allies", selection: "all", includeReserve: true, excludeSource: true, requiredTraits: ["人の力"] },
    action: {
      kind: "apply_effects",
      effects: [
        { template: { stableId: "domination-foreigner-bond-human-allies-attack-state", name: "攻撃力アップ", effectType: COMMON_EFFECT_TYPES.attack, category: "buff", value: 100, removalPolicy: "unremovable" } },
        { template: { stableId: "domination-foreigner-bond-human-allies-np-gain-state", name: "NP獲得量アップ", effectType: COMMON_EFFECT_TYPES.npGain, category: "buff", value: 100, removalPolicy: "unremovable" } },
      ],
    },
  }],
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
    description: "阿遅鉏高日子根神装備時のみ、自身がフィールドにいる間、味方全体の攻撃力を15%アップ",
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
  startEffects: [{
    kind: "effect",
    stableId: "fenrir-bond-critical",
    order: 1,
    description: "フェンリル装備時のみ、自身のクリティカル威力を30%アップ＆Buster通常攻撃時確率30%でNPを10%増やす状態を付与",
    target: { relation: "self", selection: "single" },
    action: {
      kind: "apply_effects",
      effects: [
        { template: { stableId: "fenrir-bond-critical-state", name: "クリティカル威力アップ", effectType: COMMON_EFFECT_TYPES.criticalDamage, category: "buff", value: 300, removalPolicy: "unremovable" } },
        { template: { stableId: "fenrir-bond-buster-np-state", name: "Buster通常攻撃時NP増加", effectType: "trigger", category: "buff", removalPolicy: "unremovable", trigger: { timing: "on_attack", activationRatePermille: 300, condition: { attackKinds: ["normal_command"], cardTypes: ["buster"] }, actions: [{ target: { relation: "self", selection: "single" }, action: { kind: "change_np", amount: 1_000 } }] } } },
      ],
    },
  }],
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
    description: "ルシフェラ装備時のみ、自身の宝具威力を30%アップ",
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
    description: "＋自身を除く〔悪〕特性の味方全体のBusterカード性能を15%アップ（ルシフェラがフィールドにいる間のみ）",
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
  fieldEffects: [{
    kind: "effect",
    stableId: "mother-mary-bond-outside-domain-recovery",
    order: 1,
    description: "聖母マリア装備時のみ、自身がフィールドにいる間、〔領域外の生命〕特性の味方全体のHP回復量を30%アップ＆毎ターンHP回復状態を500付与",
    target: { relation: "allies", selection: "all", includeReserve: true, requiredTraits: ["領域外の生命"] },
    action: {
      kind: "apply_effects",
      effects: [
        { template: { stableId: "mother-mary-bond-outside-domain-recovery-state", name: "HP回復量アップ", effectType: COMMON_EFFECT_TYPES.receivedHpRecovery, category: "buff", value: 300, removalPolicy: "unremovable" } },
        { template: { stableId: "mother-mary-bond-outside-domain-recurring-heal-state", name: "毎ターンHP回復", effectType: COMMON_EFFECT_TYPES.recurringHpRecovery, category: "buff", value: 500, removalPolicy: "unremovable", trigger: SELF_TURN_END_HEAL(500) } },
      ],
    },
  }],
  sources: [{ url: "https://w.atwiki.jp/siroi_human/pages/781.html", checkedAt: "2026-08-24", note: "絆礼装「聖母の揺籃」の名称、星4Lv80・ATK100・HP100、〔領域外の生命〕味方へのHP回復量30%と毎ターンHP500回復を照合。" }],
};

export const SANADA_YUKIMURA_BOND: CraftEssenceDefinition = {
  schemaVersion: CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
  dataId: "sanada-yukimura-bond",
  name: "六文の渡し賃",
  ...BOND_CRAFT_ESSENCE,
  eligibleServantDataIds: ["sanada-yukimura"],
  startEffects: [],
  fieldEffects: [{
    kind: "effect",
    stableId: "sanada-yukimura-bond-party-effects",
    order: 1,
    description: "真田信繁装備時のみ、自身がフィールドにいる間、味方全体のクリティカル威力・防御力・被ダメージ時のNP獲得量を各10%アップ",
    target: { relation: "allies", selection: "all", includeReserve: true },
    action: {
      kind: "apply_effects",
      effects: [
        { template: { stableId: "sanada-yukimura-bond-party-critical-state", name: "クリティカル威力アップ", effectType: COMMON_EFFECT_TYPES.criticalDamage, category: "buff", value: 100, removalPolicy: "unremovable" } },
        { template: { stableId: "sanada-yukimura-bond-party-defense-state", name: "防御力アップ", effectType: COMMON_EFFECT_TYPES.defense, category: "buff", classifications: ["defense"], value: 100, removalPolicy: "unremovable" } },
        { template: { stableId: "sanada-yukimura-bond-party-received-np-state", name: "被ダメージ時のNP獲得量アップ", effectType: COMMON_EFFECT_TYPES.receivedNpGain, category: "buff", value: 100, removalPolicy: "unremovable" } },
      ],
    },
  }],
  sources: [{ url: "https://w.atwiki.jp/siroi_human/pages/813.html", checkedAt: "2026-08-24", note: "絆礼装「六文の渡し賃」の名称、星4Lv80・ATK100・HP100、前衛中の味方全体へのクリティカル威力・防御力・被ダメージ時NP獲得量各10%を照合。" }],
};

export const LIGHT_KOYANSKAYA_BOND: CraftEssenceDefinition = {
  schemaVersion: CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
  dataId: "koyanskaya-of-light-bond",
  name: "コヤンスカヤの野望～東海岸版～",
  ...BOND_CRAFT_ESSENCE,
  eligibleServantDataIds: ["koyanskaya-of-light"],
  startEffects: [],
  fieldEffects: [{
    kind: "effect",
    stableId: "koyanskaya-light-bond-party-special-attack",
    order: 1,
    description: "光のコヤンスカヤ（アサシン）装備時のみ、自身がフィールドにいる間、味方全体に〔人間〕特攻状態を15%付与＆〔人の力を持つ敵〕特攻状態を15%付与",
    target: { relation: "allies", selection: "all", includeReserve: true },
    action: {
      kind: "apply_effects",
      effects: [
        { template: { stableId: "koyanskaya-light-bond-human-special-attack-state", name: "〔人間〕特攻", effectType: COMMON_EFFECT_TYPES.power, category: "buff", value: 150, removalPolicy: "unremovable", flags: { requiredTargetTrait: "人間" } } },
        { template: { stableId: "koyanskaya-light-bond-human-force-special-attack-state", name: "〔人の力を持つ敵〕特攻", effectType: COMMON_EFFECT_TYPES.power, category: "buff", value: 150, removalPolicy: "unremovable", flags: { requiredTargetTrait: "人の力を持つ敵" } } },
      ],
    },
  }],
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
    description: "千利休（バーサーカー）装備時のみ、自身がフィールドにいる間、味方全体に〔人の力を持つ敵〕特攻状態を20%付与",
    target: { relation: "allies", selection: "all", includeReserve: true },
    action: { kind: "apply_effects", effects: [{ template: { stableId: "sen-no-rikyu-bond-human-force-special-attack-state", name: "〔人の力を持つ敵〕特攻", effectType: COMMON_EFFECT_TYPES.power, category: "buff", value: 200, removalPolicy: "unremovable", flags: { requiredTargetTrait: "人の力を持つ敵" } } }] },
  }],
  sources: [{ url: "https://w.atwiki.jp/f_go/pages/5723.html", checkedAt: "2026-08-24", note: "絆礼装「水の如く花の如く」の名称、星4Lv80・ATK100・HP100、前衛中の味方全体への〔人の力を持つ敵〕特攻20%を照合。" }],
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
] as const;

export const INITIAL_CRAFT_ESSENCE_REGISTRY = createCraftEssenceDataRegistry(
  INITIAL_CRAFT_ESSENCE_DEFINITIONS,
);
