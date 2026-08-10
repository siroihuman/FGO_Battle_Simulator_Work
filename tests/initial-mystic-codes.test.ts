import { describe, expect, it } from "vitest";
import {
  ATLAS_ACADEMY_UNIFORM,
  INITIAL_MYSTIC_CODE_REGISTRY,
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
    expect(Object.keys(INITIAL_MYSTIC_CODE_REGISTRY.byDataId).sort()).toEqual([
      "atlas-academy-uniform",
      "normal-chaldea-uniform",
    ]);
  });
});
