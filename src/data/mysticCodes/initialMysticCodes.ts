import { COMMON_EFFECT_TYPES } from "../../effects/modifiers";
import { createMysticCodeDataRegistry } from "./registry";
import {
  MYSTIC_CODE_DATA_SCHEMA_VERSION,
  type MysticCodeDefinition,
} from "./schema";

const SOURCE = [{
  url: "https://w.atwiki.jp/f_go/pages/41.html",
  checkedAt: "2026-08-10",
  note: "マスタースキル表の名称、資料順、CT、Lv10効果量を照合。",
}] as const;

export const ATLAS_ACADEMY_UNIFORM: MysticCodeDefinition = {
  schemaVersion: MYSTIC_CODE_DATA_SCHEMA_VERSION,
  dataId: "atlas-academy-uniform",
  name: "アトラス院制服",
  levelPolicy: "max",
  skills: [
    {
      stableId: "atlas-osiris-dust",
      name: "オシリスの塵",
      slot: 1,
      cooldownAtMax: 15,
      execution: "effects",
      effects: [{
        kind: "effect",
        stableId: "atlas-osiris-dust-invincibility",
        order: 1,
        description: "味方単体に無敵状態を付与(1T)",
        target: { relation: "allies", selection: "single" },
        action: {
          kind: "apply_effects",
          effects: [{
            template: {
              stableId: "atlas-osiris-dust-invincibility-state",
              name: "無敵",
              effectType: COMMON_EFFECT_TYPES.invincibility,
              category: "buff",
              remainingTurns: 1,
            },
          }],
        },
      }],
    },
    {
      stableId: "atlas-isis-rain",
      name: "イシスの雨",
      slot: 2,
      cooldownAtMax: 15,
      execution: "effects",
      effects: [{
        kind: "effect",
        stableId: "atlas-isis-rain-debuff-removal",
        order: 1,
        description: "味方単体の弱体状態を解除",
        target: { relation: "allies", selection: "single" },
        action: {
          kind: "remove_effects",
          request: { mode: "all", category: "debuff" },
          baseRatePermille: 1_000,
        },
      }],
    },
    {
      stableId: "atlas-medjed-eye",
      name: "メジェドの眼",
      slot: 3,
      cooldownAtMax: 15,
      execution: "effects",
      effects: [{
        kind: "effect",
        stableId: "atlas-medjed-eye-cooldown",
        order: 1,
        description: "味方単体のスキルチャージを2進める",
        target: { relation: "allies", selection: "single" },
        action: { kind: "advance_skill_cooldowns", amount: 2 },
      }],
    },
  ],
  sources: SOURCE,
};

export const NORMAL_CHALDEA_UNIFORM: MysticCodeDefinition = {
  schemaVersion: MYSTIC_CODE_DATA_SCHEMA_VERSION,
  dataId: "normal-chaldea-uniform",
  name: "ノーマルカルデア制服",
  levelPolicy: "max",
  skills: [
    {
      stableId: "normal-chaldea-emergency-support",
      name: "応急支援",
      slot: 1,
      cooldownAtMax: 9,
      execution: "effects",
      effects: [
        {
          kind: "effect",
          stableId: "normal-chaldea-emergency-support-heal",
          order: 1,
          description: "味方単体のHPを2000回復",
          target: { relation: "allies", selection: "single" },
          action: { kind: "heal_hp", amount: 2_000 },
        },
        {
          kind: "effect",
          stableId: "normal-chaldea-emergency-support-stars",
          order: 2,
          description: "スターを15個獲得",
          target: { relation: "self", selection: "single" },
          action: { kind: "gain_stars", amount: 15, destination: "command" },
        },
      ],
    },
    {
      stableId: "normal-chaldea-magic-enhancement",
      name: "魔力強化",
      slot: 2,
      cooldownAtMax: 15,
      execution: "effects",
      effects: [
        {
          kind: "effect",
          stableId: "normal-chaldea-magic-enhancement-attack",
          order: 1,
          description: "味方単体の攻撃力を40%アップ(1T)",
          target: { relation: "allies", selection: "single" },
          action: {
            kind: "apply_effects",
            effects: [{
              template: {
                stableId: "normal-chaldea-magic-enhancement-attack-state",
                name: "攻撃力アップ",
                effectType: COMMON_EFFECT_TYPES.attack,
                category: "buff",
                value: 400,
                remainingTurns: 1,
              },
            }],
          },
        },
        {
          kind: "effect",
          stableId: "normal-chaldea-magic-enhancement-np",
          order: 2,
          description: "味方単体のNPを10%増やす",
          target: { relation: "allies", selection: "single" },
          action: { kind: "change_np", amount: 1_000 },
        },
      ],
    },
    {
      stableId: "normal-chaldea-order-change",
      name: "オーダーチェンジ",
      slot: 3,
      cooldownAtMax: 15,
      execution: "order_change",
      effects: [],
    },
  ],
  sources: SOURCE,
};

export const INITIAL_MYSTIC_CODE_DEFINITIONS = [
  ATLAS_ACADEMY_UNIFORM,
  NORMAL_CHALDEA_UNIFORM,
] as const;

export const INITIAL_MYSTIC_CODE_REGISTRY = createMysticCodeDataRegistry(
  INITIAL_MYSTIC_CODE_DEFINITIONS,
);
