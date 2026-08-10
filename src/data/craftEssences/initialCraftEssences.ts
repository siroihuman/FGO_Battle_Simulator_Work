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

export const INITIAL_CRAFT_ESSENCE_DEFINITIONS = [
  KALEIDOSCOPE,
  BLACK_GRAIL,
] as const;

export const INITIAL_CRAFT_ESSENCE_REGISTRY = createCraftEssenceDataRegistry(
  INITIAL_CRAFT_ESSENCE_DEFINITIONS,
);
