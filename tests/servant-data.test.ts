import { describe, expect, it } from "vitest";
import { createBattleAttackDataRegistry } from "../src/core/battle/actionData";
import { createBattleState } from "../src/core/battle/state";
import {
  SERVANT_DATA_SCHEMA_VERSION,
  SERVANT_LEVELS_BY_RARITY,
  assertValidServantDefinition,
  createServantBattleInstance,
  createServantDataRegistry,
  servantDefinition,
  type ServantDefinition,
} from "../src/data/servants";
import { unit } from "./helpers/battle";

const TEST_SERVANT = {
  schemaVersion: SERVANT_DATA_SCHEMA_VERSION,
  dataId: "test-servant",
  collectionNo: 999,
  name: "検査用サーヴァント",
  rarity: 5,
  contentRevision: "current_upgraded_only",
  skillLevelPolicy: "max",
  classKey: "caster",
  attributeKey: "star",
  classAttackCoefficientPermille: 900,
  levelStats: [
    { level: 1, hp: 2_000, attack: 1_500 },
    { level: 50, hp: 8_000, attack: 6_000 },
    { level: 60, hp: 9_000, attack: 7_000 },
    { level: 70, hp: 10_000, attack: 8_000 },
    { level: 80, hp: 11_000, attack: 9_000 },
    { level: 90, hp: 12_000, attack: 10_000 },
    { level: 100, hp: 13_000, attack: 11_000 },
    { level: 120, hp: 15_000, attack: 13_000 },
  ],
  commandCards: ["quick", "arts", "arts", "buster", "buster"],
  commandCardHitWeights: [[1, 1], [1, 2], [1, 2], [1], [1]],
  extraAttackHitWeights: [1, 1, 1, 1],
  battleRates: {
    attackNpUnits: 75,
    receivedNpUnits: 300,
    attackNpRatePermille: 1_000,
    targetNpRatePermille: 1_000,
    starRatePermille: 100,
    starWeight: 50,
    targetStarRatePermille: 0,
    deathRatePermille: 300,
  },
  traits: ["servant", "humanoid"],
  activeSkills: [
    {
      stableId: "test-skill-one",
      name: "第一スキル",
      rank: "A",
      slot: 1,
      cooldownAtMax: 6,
      effects: [
        {
          kind: "effect",
          stableId: "test-skill-one-np",
          order: 1,
          mechanicId: "add_np",
          description: "味方単体のNPを増やす",
          target: { relation: "allies", selection: "single" },
          parameters: { amountUnits: 5_000 },
        },
      ],
    },
    {
      stableId: "test-skill-two",
      name: "第二スキル",
      rank: "B",
      slot: 2,
      cooldownAtMax: 5,
      effects: [
        {
          kind: "effect",
          stableId: "test-skill-two-buff",
          order: 1,
          mechanicId: "apply_effect",
          description: "控えを含む味方全体に状態を付与する",
          target: {
            relation: "allies",
            selection: "all",
            includeReserve: true,
          },
          parameters: {
            effectType: "attack_up",
            valuePermille: 200,
            turns: 3,
          },
        },
      ],
    },
    {
      stableId: "test-skill-three",
      name: "第三スキル",
      rank: "C",
      slot: 3,
      cooldownAtMax: 4,
      effects: [
        {
          kind: "effect",
          stableId: "test-skill-three-frontmost",
          order: 1,
          mechanicId: "apply_effect",
          description: "自身を除く先頭の味方に状態を付与する",
          target: {
            relation: "allies",
            selection: "frontmost",
            excludeSource: true,
          },
          parameters: { effectType: "card_up", cardType: "buster" },
        },
      ],
    },
  ],
  classSkills: [
    {
      stableId: "test-class-skill-one",
      name: "検査用クラススキル",
      rank: "EX",
      effects: [
        {
          kind: "effect",
          stableId: "test-class-skill-one-effect",
          order: 1,
          mechanicId: "apply_effect",
          description: "自身の性能を上げる",
          target: { relation: "self", selection: "single" },
          parameters: { effectType: "card_up", valuePermille: 100 },
        },
      ],
    },
  ],
  noblePhantasm: {
    stableId: "test-noble-phantasm",
    name: "検査用宝具",
    reading: "テスト・ノーブル・ファンタズム",
    rank: "A+",
    cardType: "buster",
    effects: [
      {
        kind: "effect",
        stableId: "test-np-pre-buff",
        order: 1,
        mechanicId: "apply_effect",
        description: "攻撃前に自身へ状態を付与する",
        target: { relation: "self", selection: "single" },
        parameters: { effectType: "attack_up", valuePermille: 200, turns: 1 },
      },
      {
        kind: "attack",
        stableId: "test-np-damage",
        order: 2,
        targetScope: "all",
        hitWeights: [1, 1, 1],
        damageMultiplierPermilleByLevel: [
          3_000,
          4_000,
          4_500,
          4_750,
          5_000,
        ],
        specialAttack: {
          stableId: "test-np-special",
          requiredTargetTraits: ["evil"],
          multiplierPermilleByOvercharge: [
            1_500,
            1_625,
            1_750,
            1_875,
            2_000,
          ],
        },
      },
      {
        kind: "effect",
        stableId: "test-np-party-np",
        order: 3,
        mechanicId: "add_np",
        description: "攻撃後に味方全体のNPを増やす",
        target: { relation: "allies", selection: "all" },
        parameters: { amountUnitsByOvercharge: [1_000, 1_500, 2_000, 2_500, 3_000] },
      },
    ],
  },
  sources: [
    {
      url: "https://example.com/servants/test-servant",
      checkedAt: "2026-08-03",
      note: "検査用の架空データ",
    },
  ],
} as const satisfies ServantDefinition;

function copyDefinition(): ServantDefinition {
  return structuredClone(TEST_SERVANT);
}

describe("declarative servant data", () => {
  it("fixes the selectable level stages for every rarity and Angra Mainyu", () => {
    expect(SERVANT_LEVELS_BY_RARITY).toEqual({
      0: [1, 25, 35, 45, 55, 65, 100, 120],
      1: [1, 20, 30, 40, 50, 60, 100, 120],
      2: [1, 25, 35, 45, 55, 65, 100, 120],
      3: [1, 30, 40, 50, 60, 70, 100, 120],
      4: [1, 40, 50, 60, 70, 80, 100, 120],
      5: [1, 50, 60, 70, 80, 90, 100, 120],
    });
  });

  it("accepts current upgraded data with three skills, all class skills, and ordered NP effects", () => {
    expect(() => assertValidServantDefinition(TEST_SERVANT)).not.toThrow();
  });

  it("indexes definitions by stable project ID and rejects duplicate IDs", () => {
    const registry = createServantDataRegistry([TEST_SERVANT]);
    expect(registry.schemaVersion).toBe(1);
    expect(servantDefinition(registry, "test-servant")).toBe(TEST_SERVANT);
    expect(servantDefinition(registry, "missing")).toBeNull();
    expect(() => createServantDataRegistry([TEST_SERVANT, TEST_SERVANT]))
      .toThrow(/duplicate servant dataId/);
  });

  it("rejects source-page IDs and an invalid source date", () => {
    const pageId = copyDefinition();
    pageId.dataId = "page-5141";
    expect(() => assertValidServantDefinition(pageId)).toThrow(
      /must not use a source page number/,
    );

    const invalidDate = copyDefinition();
    invalidDate.sources[0].checkedAt = "2026-02-30";
    expect(() => assertValidServantDefinition(invalidDate)).toThrow(
      /not a valid date/,
    );
  });

  it("rejects a wrong rarity level stage and any pre-upgrade revision", () => {
    const wrongLevel = copyDefinition();
    wrongLevel.levelStats[1].level = 40;
    expect(() => assertValidServantDefinition(wrongLevel)).toThrow(
      /level must be 50/,
    );

    const oldRevision = copyDefinition();
    (oldRevision as { contentRevision: string }).contentRevision = "pre_upgrade";
    expect(() => assertValidServantDefinition(oldRevision)).toThrow(
      /only current upgraded/,
    );

    const nonMaxSkill = copyDefinition();
    (nonMaxSkill as { skillLevelPolicy: string }).skillLevelPolicy = "selectable";
    expect(() => assertValidServantDefinition(nonMaxSkill)).toThrow(
      /maximum level values/,
    );
  });

  it("rejects non-contiguous effect order and duplicate nested stable IDs", () => {
    const wrongOrder = copyDefinition();
    wrongOrder.noblePhantasm.effects[2].order = 4;
    expect(() => assertValidServantDefinition(wrongOrder)).toThrow(
      /effect order must be contiguous/,
    );

    const duplicate = copyDefinition();
    duplicate.activeSkills[1].effects[0].stableId =
      duplicate.activeSkills[0].effects[0].stableId;
    expect(() => assertValidServantDefinition(duplicate)).toThrow(
      /duplicate servant stable ID/,
    );
  });

  it("rejects ambiguous self targeting and fractional executable parameters", () => {
    const selfAll = copyDefinition();
    selfAll.classSkills[0].effects[0].target.selection = "all";
    expect(() => assertValidServantDefinition(selfAll)).toThrow(
      /self target must use single/,
    );

    const fractional = copyDefinition();
    fractional.activeSkills[0].effects[0].parameters = { amountUnits: 12.5 };
    expect(() => assertValidServantDefinition(fractional)).toThrow(
      /number must be a safe integer/,
    );
  });

  it("creates duplicate servant instances with independent level and NP selections", () => {
    const low = createServantBattleInstance(TEST_SERVANT, {
      instanceId: "test-a",
      level: 1,
      noblePhantasmLevel: 1,
      initialNp: 10_000,
    });
    const high = createServantBattleInstance(TEST_SERVANT, {
      instanceId: "test-b",
      level: 120,
      noblePhantasmLevel: 5,
      initialNp: 30_000,
      attackAdjustment: 2_000,
      maxHpAdjustment: 3_000,
    });

    expect(low.unit.dataId).toBe(high.unit.dataId);
    expect(low.unit.instanceId).not.toBe(high.unit.instanceId);
    expect(low.unit.maxHp).toBe(2_000);
    expect(low.attackData.attack).toBe(1_500);
    expect(low.unit.noblePhantasm?.level).toBe(1);
    expect(high.unit.maxHp).toBe(18_000);
    expect(high.attackData.attack).toBe(15_000);
    expect(high.unit.noblePhantasm?.level).toBe(5);
  });

  it("adapts base NP attack data but marks conditional and non-attack effects unresolved", () => {
    const instance = createServantBattleInstance(TEST_SERVANT, {
      instanceId: "test-a",
      level: 90,
      noblePhantasmLevel: 2,
    });
    expect(instance.attackData.noblePhantasms).toEqual([
      {
        stableId: "test-noble-phantasm",
        targetScope: "all",
        hitWeights: [1, 1, 1],
        damageMultiplierPermilleByLevel: [
          3_000,
          4_000,
          4_500,
          4_750,
          5_000,
        ],
      },
    ]);
    expect(instance.unresolvedEffectStableIds).toContain("test-np-special");
    expect(instance.unresolvedEffectStableIds).toContain("test-np-pre-buff");
    expect(instance.unresolvedEffectStableIds).toContain(
      "test-class-skill-one-effect",
    );
  });

  it("produces state and numeric records accepted by battle registries", () => {
    const instances = ["test-a", "test-b", "test-c"].map((instanceId) =>
      createServantBattleInstance(TEST_SERVANT, {
        instanceId,
        level: 90,
        noblePhantasmLevel: 1,
      })
    );
    const state = createBattleState({
      ally: {
        frontline: instances.map(({ unit: servant }) => servant),
        reserve: [],
      },
      waves: [
        {
          enemy: {
            frontline: [unit("enemy-a", "enemy"), null, null],
            reserve: [],
          },
        },
      ],
      enemyFrontlineLimit: 3,
    });
    const attacks = createBattleAttackDataRegistry(
      instances.map(({ attackData }) => attackData),
    );

    expect(state.formation.ally.frontline.map((servant) => servant?.dataId))
      .toEqual(["test-servant", "test-servant", "test-servant"]);
    expect(Object.keys(attacks.byInstanceId)).toEqual([
      "test-a",
      "test-b",
      "test-c",
    ]);
  });

  it("rejects unavailable levels and NP values above the selected level cap", () => {
    expect(() =>
      createServantBattleInstance(TEST_SERVANT, {
        instanceId: "test-a",
        level: 40,
        noblePhantasmLevel: 1,
      })
    ).toThrow(/not selectable/);
    expect(() =>
      createServantBattleInstance(TEST_SERVANT, {
        instanceId: "test-a",
        level: 90,
        noblePhantasmLevel: 1,
        initialNp: 20_000,
      })
    ).toThrow(/exceeds the selected NP-level cap/);
    expect(() =>
      createServantBattleInstance(TEST_SERVANT, {
        instanceId: "test-a",
        level: 90,
        noblePhantasmLevel: 6 as never,
      })
    ).toThrow(/must be from 1 to 5/);
  });
});
