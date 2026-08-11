import { describe, expect, it } from "vitest";
import {
  createBattleActionEffectDataRegistry,
  combatantActionEffectData,
  type CombatantActionEffectData,
} from "../src/effects/actionData";
import {
  executeDeclaredActionEffects,
  initializeBattlePassives,
  resolveDeclaredActionInteger,
} from "../src/effects/actionExecution";
import { resolveAllySkillUse } from "../src/effects/skillExecution";
import { createEffectRuntimeCounters } from "../src/effects/runtime";
import type { DeclaredActionEffect } from "../src/effects/declarations";
import { createBattleState } from "../src/core/battle/state";
import { BattleRng } from "../src/core/rng";
import { findUnitLocation } from "../src/core/battle/formation";
import { unit } from "./helpers/battle";

function battle() {
  return createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally", {
          dataId: "test-servant",
          noblePhantasm: {
            stableId: "test-np",
            name: "検査宝具",
            cardType: "buster",
            level: 1,
          },
        }),
        unit("ally-b", "ally", {
          dataId: "test-servant",
          np: 29_500,
          noblePhantasm: {
            stableId: "test-np",
            name: "検査宝具",
            cardType: "buster",
            level: 5,
          },
        }),
        unit("ally-c", "ally"),
      ],
      reserve: [unit("ally-d", "ally", { dataId: "test-servant" })],
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
}

const selfAttackUp: DeclaredActionEffect = {
  kind: "effect",
  stableId: "passive-attack-up",
  order: 1,
  description: "自身の攻撃力を上げる",
  target: { relation: "self", selection: "single" },
  action: {
    kind: "apply_effects",
    effects: [
      {
        template: {
          stableId: "passive-attack-up-state",
          name: "攻撃力アップ",
          effectType: "attack",
          category: "buff",
          value: 100,
          removalPolicy: "unremovable",
          durationTick: "manual",
        },
      },
    ],
  },
};

function actionData(
  instanceId = "ally-a",
  overrides: Partial<CombatantActionEffectData> = {},
): CombatantActionEffectData {
  return {
    instanceId,
    dataId: instanceId === "ally-d" ? "test-servant" : "test-servant",
    passives: [],
    actions: [
      {
        stableId: "skill-one",
        name: "第一スキル",
        kind: "skill",
        skillSlot: 1,
        cooldownAtMax: 6,
        attackOrder: null,
        effects: [
          {
            kind: "effect",
            stableId: "skill-one-np",
            order: 1,
            description: "味方単体のNPを増やす",
            target: { relation: "allies", selection: "single" },
            action: { kind: "change_np", amount: 1_000 },
          },
        ],
      },
      {
        stableId: "test-np",
        name: "検査宝具",
        kind: "noble_phantasm",
        attackOrder: 2,
        effects: [
          {
            kind: "effect",
            stableId: "test-np-before",
            order: 1,
            description: "攻撃前効果",
            target: { relation: "self", selection: "single" },
            action: { kind: "heal_hp", amount: 1_000 },
          },
          {
            kind: "effect",
            stableId: "test-np-after",
            order: 3,
            description: "攻撃後効果",
            target: { relation: "allies", selection: "all" },
            action: {
              kind: "change_np",
              amount: {
                scaling: "overcharge",
                values: [1_000, 1_500, 2_000, 2_500, 3_000],
              },
            },
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("battle action-effect data registry", () => {
  it("accepts skill order and NP effects split by one attack marker", () => {
    const data = actionData();
    const registry = createBattleActionEffectDataRegistry([data]);
    expect(combatantActionEffectData(registry, battle().formation.ally.frontline[0]!))
      .toBe(data);
  });

  it("rejects broken source order, duplicate stable IDs, and stale identity", () => {
    const brokenOrder = actionData();
    brokenOrder.actions[1].effects[1].order = 4;
    expect(() => createBattleActionEffectDataRegistry([brokenOrder])).toThrow(
      /contiguous from 1/,
    );

    const duplicate = actionData();
    duplicate.actions[1].effects[1].stableId = "skill-one-np";
    expect(() => createBattleActionEffectDataRegistry([duplicate])).toThrow(
      /duplicate action-effect stable ID/,
    );

    const duplicateSlot = actionData();
    duplicateSlot.actions = [
      ...duplicateSlot.actions,
      {
        stableId: "skill-duplicate-slot",
        name: "重複スロット",
        kind: "skill",
        skillSlot: 1,
        cooldownAtMax: 5,
        attackOrder: null,
        effects: [{
          ...selfAttackUp,
          stableId: "skill-duplicate-slot-effect",
        }],
      },
    ];
    expect(() => createBattleActionEffectDataRegistry([duplicateSlot])).toThrow(
      /duplicate action-effect skill slot/,
    );

    const registry = createBattleActionEffectDataRegistry([actionData()]);
    expect(() => combatantActionEffectData(registry, {
      instanceId: "ally-a",
      dataId: "another-servant",
    })).toThrow(/stale action-effect data/);
  });

  it("keeps enemy NP context action-scoped and rejects it on skills or another action ID", () => {
    const enemyNp = actionData("ally-a", {
      actions: [{
        ...actionData().actions[1],
        noblePhantasmContext: {
          actionStableId: "test-np",
          noblePhantasmLevel: 2,
          overchargeStage: 4,
        },
      }],
    });
    expect(createBattleActionEffectDataRegistry([enemyNp])
      .byInstanceId["ally-a"]?.actions[0]?.noblePhantasmContext)
      .toEqual({
        actionStableId: "test-np",
        noblePhantasmLevel: 2,
        overchargeStage: 4,
      });

    const mismatched = actionData("ally-a", {
      actions: [{
        ...actionData().actions[1],
        noblePhantasmContext: {
          actionStableId: "another-np",
          noblePhantasmLevel: 2,
        },
      }],
    });
    expect(() => createBattleActionEffectDataRegistry([mismatched]))
      .toThrow(/context action ID is inconsistent/);

    const skillContext = actionData();
    skillContext.actions[0].noblePhantasmContext = {
      actionStableId: "skill-one",
      overchargeStage: 1,
    };
    expect(() => createBattleActionEffectDataRegistry([skillContext]))
      .toThrow(/skill metadata is incomplete/);
  });
});

describe("declared action-effect execution", () => {
  it("resolves fixed, NP-level, and overcharge integer tables exactly", () => {
    expect(resolveDeclaredActionInteger(250, {})).toBe(250);
    expect(resolveDeclaredActionInteger({
      scaling: "noble_phantasm_level",
      values: [100, 200, 300, 400, 500],
    }, { noblePhantasmLevel: 4 })).toBe(400);
    expect(resolveDeclaredActionInteger({
      scaling: "overcharge",
      values: [1_000, 1_500, 2_000, 2_500, 3_000],
    }, { overchargeStage: 3 })).toBe(2_000);
    expect(() => resolveDeclaredActionInteger({
      scaling: "overcharge",
      values: [1, 2, 3, 4, 5],
    }, {})).toThrow(/requires an execution stage/);
  });

  it("uses the selected target's NP level and resolves all/reserve targets in order", () => {
    const effects: DeclaredActionEffect[] = [
      {
        kind: "effect",
        stableId: "selected-np",
        order: 1,
        description: "選択した味方のNPを増やす",
        target: { relation: "allies", selection: "single" },
        action: {
          kind: "change_np",
          amount: {
            scaling: "overcharge",
            values: [500, 1_000, 1_500, 2_000, 2_500],
          },
        },
      },
      {
        ...selfAttackUp,
        stableId: "party-attack-up",
        order: 2,
        description: "控えを含む味方全体の攻撃力を上げる",
        target: {
          relation: "allies",
          selection: "all",
          includeReserve: true,
        },
      },
    ];
    const rng = new BattleRng("declared-effects").stream("effects");
    const result = executeDeclaredActionEffects(
      battle(),
      "ally-a",
      effects,
      { selectedTargetInstanceId: "ally-b", overchargeStage: 2 },
      createEffectRuntimeCounters(),
      rng,
    );

    expect(findUnitLocation(result.state.formation, "ally-b")?.unit.np)
      .toBe(30_000);
    expect(result.effects[0]).toMatchObject({
      outcome: "resolved",
      targetInstanceIds: ["ally-b"],
      resolvedAmount: 1_000,
    });
    expect(result.effects[1].targetInstanceIds).toEqual([
      "ally-a",
      "ally-b",
      "ally-c",
      "ally-d",
    ]);
    for (const instanceId of ["ally-a", "ally-b", "ally-c", "ally-d"]) {
      expect(findUnitLocation(result.state.formation, instanceId)?.unit.effects)
        .toHaveLength(1);
    }
    expect(rng.snapshot().drawCount).toBe(0);
  });

  it("records no target and explicit unsupported mechanics without RNG or state changes", () => {
    const rng = new BattleRng("declared-noop").stream("effects");
    const state = battle();
    const result = executeDeclaredActionEffects(
      state,
      "ally-a",
      [
        {
          kind: "effect",
          stableId: "missing-selected-target",
          order: 1,
          description: "選択対象なし",
          target: { relation: "allies", selection: "single" },
          action: { kind: "change_np", amount: 1_000 },
        },
        {
          kind: "effect",
          stableId: "future-mechanic",
          order: 2,
          description: "将来実装する効果",
          target: { relation: "self", selection: "single" },
          action: {
            kind: "unsupported",
            mechanicId: "change_noble_phantasm_type",
          },
        },
      ],
      {},
      createEffectRuntimeCounters(),
      rng,
    );
    expect(result.effects.map(({ outcome }) => outcome)).toEqual([
      "no_target",
      "unsupported",
    ]);
    expect(result.unresolvedEffectStableIds).toEqual(["future-mechanic"]);
    expect(result.state).toBe(state);
    expect(rng.snapshot().drawCount).toBe(0);
  });

  it("adds declared stars to the explicit 99-cap command buckets without RNG", () => {
    const rng = new BattleRng("declared-star-gain").stream("effects");
    const state = {
      ...battle(),
      commandStars: 90,
      nextCommandStars: 95,
    };
    const result = executeDeclaredActionEffects(
      state,
      "ally-a",
      [
        {
          kind: "effect",
          stableId: "gain-command-stars",
          order: 1,
          description: "スターを獲得する",
          target: { relation: "self", selection: "single" },
          action: {
            kind: "gain_stars",
            amount: 20,
            destination: "command",
          },
        },
        {
          kind: "effect",
          stableId: "gain-next-command-stars",
          order: 2,
          description: "次回用スターを獲得する",
          target: { relation: "self", selection: "single" },
          action: {
            kind: "gain_stars",
            amount: 10,
            destination: "next_command",
          },
        },
      ],
      {},
      createEffectRuntimeCounters(),
      rng,
    );
    expect(result.state).toMatchObject({
      commandStars: 99,
      nextCommandStars: 99,
    });
    expect(result.effects.map(({ starAddition }) => starAddition)).toMatchObject([
      {
        bucket: "command",
        requested: 20,
        before: 90,
        added: 9,
        after: 99,
      },
      {
        bucket: "next_command",
        requested: 10,
        before: 95,
        added: 4,
        after: 99,
      },
    ]);
    expect(rng.snapshot().drawCount).toBe(0);
  });

  it("rejects negative or unit-targeted declared star gains", () => {
    const invalidTarget = actionData();
    invalidTarget.actions[0].effects = [{
      kind: "effect",
      stableId: "invalid-star-target",
      order: 1,
      description: "不正な対象のスター獲得",
      target: { relation: "allies", selection: "all" },
      action: {
        kind: "gain_stars",
        amount: 10,
        destination: "command",
      },
    }];
    expect(() => createBattleActionEffectDataRegistry([invalidTarget]))
      .toThrow(/gain_stars must use a self target/);

    const negative = actionData();
    negative.actions[0].effects = [{
      kind: "effect",
      stableId: "negative-star-gain",
      order: 1,
      description: "不正な負数のスター獲得",
      target: { relation: "self", selection: "single" },
      action: {
        kind: "gain_stars",
        amount: -1,
        destination: "command",
      },
    }];
    expect(() => createBattleActionEffectDataRegistry([negative]))
      .toThrow(/must not be negative/);
  });

  it("initializes passive groups once for frontline and reserve instances with global counters", () => {
    const registry = createBattleActionEffectDataRegistry([
      actionData("ally-a", {
        passives: [{
          stableId: "class-skill-a",
          name: "クラススキルA",
          effects: [selfAttackUp],
        }],
        actions: [],
      }),
      actionData("ally-d", {
        passives: [{
          stableId: "class-skill-d",
          name: "クラススキルD",
          effects: [{
            ...selfAttackUp,
            stableId: "reserve-passive-attack-up",
          }],
        }],
        actions: [],
      }),
    ]);
    const result = initializeBattlePassives(
      battle(),
      registry,
      createEffectRuntimeCounters(),
      new BattleRng("passives").stream("effects"),
    );
    expect(result.groups.map(({ sourceInstanceId }) => sourceInstanceId))
      .toEqual(["ally-a", "ally-d"]);
    expect(findUnitLocation(result.state.formation, "ally-a")?.unit.effects[0].instanceId)
      .toBe("effect-1");
    expect(findUnitLocation(result.state.formation, "ally-d")?.unit.effects[0].instanceId)
      .toBe("effect-2");
    expect(result.unresolvedEffectStableIds).toEqual([]);
  });
});

describe("ally declared skill use", () => {
  it("sets cooldown before effects and changes the selected target without consuming a command action", () => {
    const registry = createBattleActionEffectDataRegistry([actionData()]);
    const result = resolveAllySkillUse({
      state: battle(),
      registry,
      sourceInstanceId: "ally-a",
      skillStableId: "skill-one",
      selectedTargetInstanceId: "ally-b",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("ally-skill").stream("effects"),
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.state.phase).toBe("ally_action");
    expect(findUnitLocation(result.state.formation, "ally-a")?.unit.skillCooldowns)
      .toEqual([6, 0, 0]);
    expect(findUnitLocation(result.state.formation, "ally-b")?.unit.np)
      .toBe(30_000);
    expect(result.boundary.allyReplacement.events).toEqual([]);
  });

  it("lets a just-used skill advance its own cooldown after setting the maximum", () => {
    const data = actionData("ally-a", {
      actions: [{
        stableId: "cooldown-skill",
        name: "CT短縮スキル",
        kind: "skill",
        skillSlot: 1,
        cooldownAtMax: 8,
        attackOrder: null,
        effects: [{
          kind: "effect",
          stableId: "cooldown-skill-advance",
          order: 1,
          description: "味方単体のスキルCTを2進める",
          target: { relation: "allies", selection: "single" },
          action: { kind: "advance_skill_cooldowns", amount: 2 },
        }],
      }],
    });
    const result = resolveAllySkillUse({
      state: battle(),
      registry: createBattleActionEffectDataRegistry([data]),
      sourceInstanceId: "ally-a",
      skillStableId: "cooldown-skill",
      selectedTargetInstanceId: "ally-a",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("self-cooldown-advance").stream("effects"),
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(findUnitLocation(result.state.formation, "ally-a")?.unit.skillCooldowns)
      .toEqual([6, 0, 0]);
    expect(result.effects.effects[0]?.batch?.results[0]).toMatchObject({
      skillCooldownsBefore: [8, 0, 0],
      skillCooldownsAfter: [6, 0, 0],
    });
  });

  it("rejects missing targets, cooldowns, and unsupported effects without changing state or RNG", () => {
    const registry = createBattleActionEffectDataRegistry([actionData()]);
    const state = battle();
    const rng = new BattleRng("skill-rejections").stream("effects");
    expect(resolveAllySkillUse({
      state,
      registry,
      sourceInstanceId: "ally-a",
      skillStableId: "skill-one",
      counters: createEffectRuntimeCounters(),
      rng,
    })).toMatchObject({ accepted: false, reason: "selected_target_required", state });

    const cooldownState = {
      ...state,
      formation: {
        ...state.formation,
        ally: {
          ...state.formation.ally,
          frontline: state.formation.ally.frontline.map((target, index) =>
            index === 0 && target
              ? { ...target, skillCooldowns: [1, 0, 0] }
              : target,
          ),
        },
      },
    };
    expect(resolveAllySkillUse({
      state: cooldownState,
      registry,
      sourceInstanceId: "ally-a",
      skillStableId: "skill-one",
      selectedTargetInstanceId: "ally-b",
      counters: createEffectRuntimeCounters(),
      rng,
    })).toMatchObject({ accepted: false, reason: "skill_on_cooldown" });

    const unsupportedRegistry = createBattleActionEffectDataRegistry([
      actionData("ally-a", {
        actions: [{
          stableId: "unsupported-skill",
          name: "未対応スキル",
          kind: "skill",
          skillSlot: 1,
          cooldownAtMax: 6,
          attackOrder: null,
          effects: [{
            kind: "effect",
            stableId: "unsupported-skill-effect",
            order: 1,
            description: "未対応",
            target: { relation: "self", selection: "single" },
            action: { kind: "unsupported", mechanicId: "future_effect" },
          }],
        }],
      }),
    ]);
    expect(resolveAllySkillUse({
      state,
      registry: unsupportedRegistry,
      sourceInstanceId: "ally-a",
      skillStableId: "unsupported-skill",
      counters: createEffectRuntimeCounters(),
      rng,
    })).toMatchObject({ accepted: false, reason: "unresolved_effects", state });
    expect(rng.snapshot().drawCount).toBe(0);
  });

  it("runs the completed-action boundary after a lethal skill demerit", () => {
    const lethal = actionData("ally-a", {
      actions: [{
        stableId: "self-destruct",
        name: "自滅スキル",
        kind: "skill",
        skillSlot: 1,
        cooldownAtMax: 6,
        attackOrder: null,
        effects: [{
          kind: "effect",
          stableId: "self-destruct-demerit",
          order: 1,
          description: "自身のHPを減らす",
          target: { relation: "self", selection: "single" },
          action: { kind: "reduce_hp", amount: 20_000, canDefeat: true },
        }],
      }],
    });
    const result = resolveAllySkillUse({
      state: battle(),
      registry: createBattleActionEffectDataRegistry([lethal]),
      sourceInstanceId: "ally-a",
      skillStableId: "self-destruct",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("skill-demerit").stream("effects"),
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.state.formation.ally.frontline[0]?.instanceId).toBe("ally-d");
    expect(result.state.formation.ally.reserve.at(-1)).toMatchObject({
      instanceId: "ally-a",
      alive: false,
      skillCooldowns: [6, 0, 0],
    });
  });
});
