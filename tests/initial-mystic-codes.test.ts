import { describe, expect, it } from "vitest";
import {
  ATLAS_ACADEMY_UNIFORM,
  INITIAL_MYSTIC_CODE_REGISTRY,
  MAGE_ASSOCIATION_UNIFORM,
  NORMAL_CHALDEA_UNIFORM,
} from "../src/data/mysticCodes";

describe("initial Mystic Code data", () => {
  it("registers Atlas Academy Uniform at maximum level in source order", () => {
    expect(ATLAS_ACADEMY_UNIFORM).toMatchObject({
      dataId: "atlas-academy-uniform",
      name: "アトラス院制服",
      levelPolicy: "max",
    });
    expect(ATLAS_ACADEMY_UNIFORM.skills.map((skill) => ({
      name: skill.name,
      slot: skill.slot,
      cooldownAtMax: skill.cooldownAtMax,
      effectOrders: skill.effects.map(({ order }) => order),
    }))).toEqual([
      { name: "オシリスの塵", slot: 1, cooldownAtMax: 15, effectOrders: [1] },
      { name: "イシスの雨", slot: 2, cooldownAtMax: 15, effectOrders: [1] },
      { name: "メジェドの眼", slot: 3, cooldownAtMax: 15, effectOrders: [1] },
    ]);
  });

  it("registers Normal Chaldea Uniform separately from Mystic Code Chaldea", () => {
    expect(NORMAL_CHALDEA_UNIFORM).toMatchObject({
      dataId: "normal-chaldea-uniform",
      name: "ノーマルカルデア制服",
      levelPolicy: "max",
    });
    expect(NORMAL_CHALDEA_UNIFORM.name).not.toBe("魔術礼装・カルデア");
    expect(NORMAL_CHALDEA_UNIFORM.skills.map((skill) => ({
      name: skill.name,
      slot: skill.slot,
      cooldownAtMax: skill.cooldownAtMax,
      execution: skill.execution,
      effectOrders: skill.effects.map(({ order }) => order),
    }))).toEqual([
      { name: "応急支援", slot: 1, cooldownAtMax: 9, execution: "effects", effectOrders: [1, 2] },
      { name: "魔力強化", slot: 2, cooldownAtMax: 15, execution: "effects", effectOrders: [1, 2] },
      { name: "オーダーチェンジ", slot: 3, cooldownAtMax: 15, execution: "order_change", effectOrders: [] },
    ]);
  });

  it("registers Mage Association Uniform as a separate maximum-level format 2 definition", () => {
    expect(MAGE_ASSOCIATION_UNIFORM).toMatchObject({
      schemaVersion: 2,
      dataId: "mage-association-uniform",
      name: "魔術協会制服",
      levelPolicy: "max",
      sources: [
        {
          url: "https://w.atwiki.jp/f_go/pages/41.html",
          checkedAt: "2026-08-11",
        },
        {
          url: "https://w.atwiki.jp/f_go/pages/4673.html",
          checkedAt: "2026-08-11",
        },
      ],
    });
    expect(MAGE_ASSOCIATION_UNIFORM.name).not.toBe(ATLAS_ACADEMY_UNIFORM.name);
    expect(MAGE_ASSOCIATION_UNIFORM.name).not.toBe(NORMAL_CHALDEA_UNIFORM.name);
    expect(MAGE_ASSOCIATION_UNIFORM.name).not.toBe("魔術礼装・カルデア");
    expect(MAGE_ASSOCIATION_UNIFORM.skills.map((skill) => ({
      stableId: skill.stableId,
      name: skill.name,
      slot: skill.slot,
      cooldownAtMax: skill.cooldownAtMax,
      execution: skill.execution,
      effectOrders: skill.effects.map(({ order }) => order),
      targets: skill.effects.map(({ target }) => target),
      actions: skill.effects.map(({ action }) => action),
    }))).toEqual([
      {
        stableId: "mage-association-full-recovery",
        name: "全体回復",
        slot: 1,
        cooldownAtMax: 12,
        execution: "effects",
        effectOrders: [1],
        targets: [{ relation: "allies", selection: "all", life: "alive" }],
        actions: [{ kind: "heal_hp", amount: 2_800 }],
      },
      {
        stableId: "mage-association-spiritron-transfer",
        name: "霊子譲渡",
        slot: 2,
        cooldownAtMax: 15,
        execution: "effects",
        effectOrders: [1],
        targets: [{ relation: "allies", selection: "single", life: "alive" }],
        actions: [{ kind: "change_np", amount: 2_000 }],
      },
      {
        stableId: "mage-association-command-shuffle",
        name: "コマンドシャッフル",
        slot: 3,
        cooldownAtMax: 15,
        execution: "effects",
        effectOrders: [1],
        targets: [{ relation: "self", selection: "single", life: "alive" }],
        actions: [{ kind: "redistribute_command_cards" }],
      },
    ]);
    expect(Object.keys(INITIAL_MYSTIC_CODE_REGISTRY.byDataId).sort()).toEqual([
      "atlas-academy-uniform",
      "mage-association-uniform",
      "normal-chaldea-uniform",
    ]);
  });
});
