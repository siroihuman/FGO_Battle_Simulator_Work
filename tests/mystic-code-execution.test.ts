import { describe, expect, it } from "vitest";
import { createBattleAttackDataRegistry } from "../src/core/battle/actionData";
import { findUnitLocation } from "../src/core/battle/formation";
import { initializeBattleLoadout } from "../src/core/battle/loadout";
import {
  createBattleSession,
  createBattleSuspendSave,
  replayBattleSession,
  resolveBattleSessionMysticCodeSkill,
  restoreBattleSession,
} from "../src/core/battle/session";
import { createBattleState } from "../src/core/battle/state";
import { BattleRng } from "../src/core/rng";
import {
  INITIAL_MYSTIC_CODE_REGISTRY,
  MYSTIC_CODE_DATA_SCHEMA_VERSION,
  createMysticCodeDataRegistry,
  type MysticCodeDefinition,
} from "../src/data/mysticCodes";
import { resolveMysticCodeSkillUse } from "../src/effects/mysticCodeExecution";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import { applyEffect, createEffectRuntimeCounters } from "../src/effects/runtime";
import { unit } from "./helpers/battle";
import { combatantData } from "./helpers/attackData";

type InitialMysticCodeDataId =
  | "atlas-academy-uniform"
  | "normal-chaldea-uniform"
  | "mage-association-uniform";

function selectedState(dataId: InitialMysticCodeDataId) {
  const rng = new BattleRng(`selected-${dataId}`);
  const counters = createEffectRuntimeCounters();
  const result = initializeBattleLoadout({
    state: createBattleState({
      ally: {
        frontline: [
          unit("ally-a", "ally", { hp: 5_000, skillCooldowns: [6, 2, 1] }),
          unit("ally-b", "ally"),
          unit("ally-c", "ally"),
        ],
        reserve: [
          unit("ally-d", "ally", {
            hp: 7_000,
            np: 3_000,
            skillCooldowns: [5, 4, 3],
            traits: ["preserved"],
          }),
        ],
      },
      waves: [{
        enemy: {
          frontline: [unit("enemy-a", "enemy"), null, null],
          reserve: [],
        },
      }],
      enemyFrontlineLimit: 3,
    }),
    rng,
    counters,
    attackRegistry: createBattleAttackDataRegistry([]),
    mysticCodeRegistry: INITIAL_MYSTIC_CODE_REGISTRY,
    selection: {
      mysticCodeDataId: dataId,
      craftEssenceDataIdByInstanceId: {},
    },
  });
  return { state: result.state, counters: result.counters, rng };
}

function execute(
  dataId: InitialMysticCodeDataId,
  skillStableId: string,
  options: {
    selectedTargetInstanceId?: string;
    orderChange?: { frontlineInstanceId: string; reserveInstanceId: string };
  } = {},
) {
  const selected = selectedState(dataId);
  return resolveMysticCodeSkillUse({
    state: selected.state,
    registry: INITIAL_MYSTIC_CODE_REGISTRY,
    skillStableId,
    ...options,
    counters: selected.counters,
    rng: selected.rng.stream("effects"),
  });
}

describe("Mystic Code skill execution", () => {
  it("connects all Atlas Academy Uniform skills to common effects with CT 15", () => {
    const osiris = execute(
      "atlas-academy-uniform",
      "atlas-osiris-dust",
      { selectedTargetInstanceId: "ally-a" },
    );
    expect(osiris.accepted).toBe(true);
    if (!osiris.accepted) return;
    expect(osiris.state.mysticCodeCooldowns).toEqual([15, 0, 0]);
    expect(findUnitLocation(osiris.state.formation, "ally-a")?.unit.effects)
      .toEqual([expect.objectContaining({
        effectType: COMMON_EFFECT_TYPES.invincibility,
        remainingTurns: 1,
        durationTick: "opponent_turn_end",
        sourceInstanceId: null,
      })]);

    const isisSelected = selectedState("atlas-academy-uniform");
    const allyA = findUnitLocation(isisSelected.state.formation, "ally-a")!.unit;
    const debuffed = applyEffect(
      allyA,
      {
        stableId: "test-debuff",
        name: "検査用弱体",
        effectType: "test_debuff",
        category: "debuff",
        remainingTurns: 3,
      },
      "enemy-a",
      isisSelected.counters,
    );
    const stateWithDebuff = {
      ...isisSelected.state,
      formation: {
        ...isisSelected.state.formation,
        ally: {
          ...isisSelected.state.formation.ally,
          frontline: isisSelected.state.formation.ally.frontline.map((current) =>
            current?.instanceId === "ally-a" ? debuffed.unit : current
          ),
        },
      },
    };
    const isis = resolveMysticCodeSkillUse({
      state: stateWithDebuff,
      registry: INITIAL_MYSTIC_CODE_REGISTRY,
      skillStableId: "atlas-isis-rain",
      selectedTargetInstanceId: "ally-a",
      counters: debuffed.counters,
      rng: isisSelected.rng.stream("effects"),
    });
    expect(isis.accepted).toBe(true);
    if (!isis.accepted) return;
    expect(isis.state.mysticCodeCooldowns).toEqual([0, 15, 0]);
    expect(findUnitLocation(isis.state.formation, "ally-a")?.unit.effects)
      .toEqual([]);

    const medjed = execute(
      "atlas-academy-uniform",
      "atlas-medjed-eye",
      { selectedTargetInstanceId: "ally-a" },
    );
    expect(medjed.accepted).toBe(true);
    if (!medjed.accepted) return;
    expect(medjed.state.mysticCodeCooldowns).toEqual([0, 0, 15]);
    expect(findUnitLocation(medjed.state.formation, "ally-a")?.unit.skillCooldowns)
      .toEqual([4, 0, 0]);
  });

  it("executes Normal Chaldea effects in source order and uses maximum CT", () => {
    const support = execute(
      "normal-chaldea-uniform",
      "normal-chaldea-emergency-support",
      { selectedTargetInstanceId: "ally-a" },
    );
    expect(support.accepted).toBe(true);
    if (!support.accepted || support.execution !== "effects") return;
    expect(support.state.mysticCodeCooldowns).toEqual([9, 0, 0]);
    expect(findUnitLocation(support.state.formation, "ally-a")?.unit.hp).toBe(7_000);
    expect(support.state.commandStars).toBe(15);
    expect(support.effects.effects.map(({ effectStableId }) => effectStableId))
      .toEqual([
        "normal-chaldea-emergency-support-heal",
        "normal-chaldea-emergency-support-stars",
      ]);

    const enhancement = execute(
      "normal-chaldea-uniform",
      "normal-chaldea-magic-enhancement",
      { selectedTargetInstanceId: "ally-b" },
    );
    expect(enhancement.accepted).toBe(true);
    if (!enhancement.accepted || enhancement.execution !== "effects") return;
    expect(enhancement.state.mysticCodeCooldowns).toEqual([0, 15, 0]);
    expect(findUnitLocation(enhancement.state.formation, "ally-b")?.unit)
      .toMatchObject({ np: 1_000 });
    expect(findUnitLocation(enhancement.state.formation, "ally-b")?.unit.effects[0])
      .toMatchObject({ effectType: COMMON_EFFECT_TYPES.attack, value: 400, remainingTurns: 1 });
    expect(enhancement.effects.effects.map(({ effectStableId }) => effectStableId))
      .toEqual([
        "normal-chaldea-magic-enhancement-attack",
        "normal-chaldea-magic-enhancement-np",
      ]);
  });

  it("uses common healing and NP actions for Mage Association Uniform with exact targets and CT", () => {
    const recovery = execute(
      "mage-association-uniform",
      "mage-association-full-recovery",
    );
    expect(recovery.accepted).toBe(true);
    if (!recovery.accepted || recovery.execution !== "effects") return;
    expect(recovery.state.mysticCodeCooldowns).toEqual([12, 0, 0]);
    expect(findUnitLocation(recovery.state.formation, "ally-a")?.unit.hp)
      .toBe(7_800);
    expect(findUnitLocation(recovery.state.formation, "ally-b")?.unit.hp)
      .toBe(10_000);
    expect(findUnitLocation(recovery.state.formation, "ally-c")?.unit.hp)
      .toBe(10_000);
    expect(findUnitLocation(recovery.state.formation, "ally-d")?.unit.hp)
      .toBe(7_000);
    expect(recovery.effects.effects).toEqual([
      expect.objectContaining({
        effectStableId: "mage-association-full-recovery-heal",
        targetInstanceIds: ["ally-a", "ally-b", "ally-c"],
      }),
    ]);

    const transfer = execute(
      "mage-association-uniform",
      "mage-association-spiritron-transfer",
      { selectedTargetInstanceId: "ally-b" },
    );
    expect(transfer.accepted).toBe(true);
    if (!transfer.accepted || transfer.execution !== "effects") return;
    expect(transfer.state.mysticCodeCooldowns).toEqual([0, 15, 0]);
    expect(findUnitLocation(transfer.state.formation, "ally-a")?.unit.np).toBe(0);
    expect(findUnitLocation(transfer.state.formation, "ally-b")?.unit.np)
      .toBe(2_000);
    expect(findUnitLocation(transfer.state.formation, "ally-d")?.unit.np)
      .toBe(3_000);
    expect(transfer.effects.effects).toEqual([
      expect.objectContaining({
        effectStableId: "mage-association-spiritron-transfer-np",
        targetInstanceIds: ["ally-b"],
      }),
    ]);

    expect(execute(
      "mage-association-uniform",
      "mage-association-spiritron-transfer",
    )).toMatchObject({
      accepted: false,
      reason: "selected_target_required",
    });
    expect(execute(
      "mage-association-uniform",
      "mage-association-spiritron-transfer",
      { selectedTargetInstanceId: "ally-d" },
    )).toMatchObject({
      accepted: false,
      reason: "selected_target_invalid",
    });
  });

  it("directly exchanges frontline and reserve without resetting unit state or card deck", () => {
    const selected = selectedState("normal-chaldea-uniform");
    const beforeDeck = selected.state.commandDeck;
    const result = resolveMysticCodeSkillUse({
      state: selected.state,
      registry: INITIAL_MYSTIC_CODE_REGISTRY,
      skillStableId: "normal-chaldea-order-change",
      orderChange: {
        frontlineInstanceId: "ally-b",
        reserveInstanceId: "ally-d",
      },
      counters: selected.counters,
      rng: selected.rng.stream("effects"),
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted || result.execution !== "order_change") return;
    expect(result.state.mysticCodeCooldowns).toEqual([0, 0, 15]);
    expect(result.state.commandDeck).toBe(beforeDeck);
    expect(result.state.formation.ally.frontline[1]).toMatchObject({
      instanceId: "ally-d",
      hp: 7_000,
      np: 3_000,
      skillCooldowns: [5, 4, 3],
      traits: ["preserved"],
    });
    expect(result.state.formation.ally.reserve[0]?.instanceId).toBe("ally-b");
    expect(result.exchange.cardDeckRebuildRequired).toBe(false);
  });

  it("rejects unavailable, invalid, cooldown, and unresolved uses before any mutation or RNG draw", () => {
    const selected = selectedState("normal-chaldea-uniform");
    const rng = selected.rng.stream("effects");
    const beforeRng = rng.snapshot();
    const beforeState = selected.state;
    const missingTarget = resolveMysticCodeSkillUse({
      state: beforeState,
      registry: INITIAL_MYSTIC_CODE_REGISTRY,
      skillStableId: "normal-chaldea-emergency-support",
      counters: selected.counters,
      rng,
    });
    expect(missingTarget).toMatchObject({
      accepted: false,
      reason: "selected_target_required",
      state: beforeState,
      counters: selected.counters,
    });
    expect(resolveMysticCodeSkillUse({
      state: beforeState,
      registry: INITIAL_MYSTIC_CODE_REGISTRY,
      skillStableId: "normal-chaldea-emergency-support",
      selectedTargetInstanceId: "enemy-a",
      counters: selected.counters,
      rng,
    })).toMatchObject({ accepted: false, reason: "selected_target_invalid" });
    expect(resolveMysticCodeSkillUse({
      state: { ...beforeState, phase: "enemy_action" },
      registry: INITIAL_MYSTIC_CODE_REGISTRY,
      skillStableId: "normal-chaldea-emergency-support",
      selectedTargetInstanceId: "ally-a",
      counters: selected.counters,
      rng,
    })).toMatchObject({ accepted: false, reason: "invalid_phase" });
    expect(resolveMysticCodeSkillUse({
      state: {
        ...beforeState,
        loadout: { ...beforeState.loadout, mysticCode: null },
      },
      registry: INITIAL_MYSTIC_CODE_REGISTRY,
      skillStableId: "normal-chaldea-emergency-support",
      selectedTargetInstanceId: "ally-a",
      counters: selected.counters,
      rng,
    })).toMatchObject({ accepted: false, reason: "mystic_code_unselected" });
    expect(resolveMysticCodeSkillUse({
      state: beforeState,
      registry: INITIAL_MYSTIC_CODE_REGISTRY,
      skillStableId: "normal-chaldea-order-change",
      orderChange: { frontlineInstanceId: "enemy-a", reserveInstanceId: "ally-d" },
      counters: selected.counters,
      rng,
    })).toMatchObject({ accepted: false, reason: "order_change_targets_invalid" });
    expect(resolveMysticCodeSkillUse({
      state: { ...beforeState, mysticCodeCooldowns: [1, 0, 0] },
      registry: INITIAL_MYSTIC_CODE_REGISTRY,
      skillStableId: "normal-chaldea-emergency-support",
      selectedTargetInstanceId: "ally-a",
      counters: selected.counters,
      rng,
    })).toMatchObject({ accepted: false, reason: "skill_on_cooldown" });

    const unsupported: MysticCodeDefinition = {
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
          effects: [{
            kind: "effect",
            stableId: "unsupported-effect",
            order: 1,
            description: "未対応効果",
            target: { relation: "allies", selection: "single" },
            action: { kind: "unsupported", mechanicId: "future_effect" },
          }],
        },
        {
          stableId: "normal-chaldea-magic-enhancement",
          name: "魔力強化",
          slot: 2,
          cooldownAtMax: 15,
          execution: "effects",
          effects: [{
            kind: "effect", stableId: "placeholder-two", order: 1,
            description: "検査", target: { relation: "allies", selection: "single" },
            action: { kind: "heal_hp", amount: 0 },
          }],
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
      sources: [{ url: "https://example.com", checkedAt: "2026-08-10" }],
    };
    expect(resolveMysticCodeSkillUse({
      state: beforeState,
      registry: createMysticCodeDataRegistry([unsupported]),
      skillStableId: "normal-chaldea-emergency-support",
      selectedTargetInstanceId: "ally-a",
      counters: selected.counters,
      rng,
    })).toMatchObject({ accepted: false, reason: "unresolved_effects" });
    expect(beforeState.mysticCodeCooldowns).toEqual([0, 0, 0]);
    expect(rng.snapshot()).toEqual(beforeRng);
  });

  it("preserves selected data and CT across suspend, resume, and fixed-seed replay", () => {
    const initialized = selectedState("normal-chaldea-uniform");
    let session = createBattleSession({
      state: initialized.state,
      rng: initialized.rng,
      counters: initialized.counters,
      registry: createBattleAttackDataRegistry(
        ["ally-a", "ally-b", "ally-c", "ally-d"].map((instanceId) =>
          combatantData(instanceId, instanceId)
        ),
      ),
      mysticCodeRegistry: INITIAL_MYSTIC_CODE_REGISTRY,
    });
    session = resolveBattleSessionMysticCodeSkill(session, {
      kind: "mystic_code_skill",
      skillStableId: "normal-chaldea-magic-enhancement",
      selectedTargetInstanceId: "ally-a",
    }).session;
    const save = createBattleSuspendSave(session);
    const restored = restoreBattleSession(save);
    const replayed = replayBattleSession(save);

    expect(restored.loop.state.loadout.mysticCode).toEqual(
      session.loop.state.loadout.mysticCode,
    );
    expect(restored.loop.state.mysticCodeCooldowns).toEqual([0, 15, 0]);
    expect(replayed.loop.state).toEqual(session.loop.state);
    expect(replayed.loop.rng.snapshot()).toEqual(session.loop.rng.snapshot());
    expect(replayed.operationHistory).toEqual(session.operationHistory);

    expect(() => restoreBattleSession({
      ...save,
      mysticCodeData: { definitions: [] },
    })).toThrow("selected Mystic Code data is missing or inconsistent");
  });
});
