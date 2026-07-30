import { describe, expect, it } from "vitest";
import {
  beginEnemyActionExecution,
  effectiveEnemyCharge,
  planEnemyNormalActions,
  planEnemyPrioritySkills,
} from "../src/ai/enemyTurn";
import {
  findUnitLocation,
  replaceUnit,
} from "../src/core/battle/formation";
import {
  beginAllyTurnEnd,
  completeAllyTurnEnd,
} from "../src/core/battle/progression";
import {
  createBattleState,
  setBattleFormation,
  type BattleState,
  type EnemyFrontlineLimit,
} from "../src/core/battle/state";
import type {
  EnemyActionDefinition,
  EnemyActionState,
  SideFormation,
} from "../src/core/battle/types";
import {
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import { unit } from "./helpers/battle";

// Canonical behavior:
// docs/specs/BATTLE_SYSTEM.md and docs/PROJECT_RULES.md (checked 2026-07-30).

function action(stableId: string): EnemyActionDefinition {
  return { stableId, name: stableId };
}

function enemyAction(
  options: Partial<EnemyActionState> = {},
): EnemyActionState {
  return {
    maxActions: options.maxActions ?? "auto",
    normalAttack: options.normalAttack ?? action("normal"),
    skills: options.skills ?? [action("skill-1")],
    noblePhantasm:
      options.noblePhantasm === undefined
        ? action("enemy-np")
        : options.noblePhantasm,
    charge: options.charge ?? 0,
    chargeMax: options.chargeMax ?? 3,
  };
}

function allyFormation(): SideFormation {
  return {
    frontline: [
      unit("ally-a", "ally"),
      unit("ally-b", "ally"),
      unit("ally-c", "ally"),
    ],
    reserve: [],
  };
}

function enemy(
  instanceId: string,
  profile: EnemyActionState | null = null,
) {
  return unit(instanceId, "enemy", { enemyAction: profile });
}

function battle(
  frontline: SideFormation["frontline"],
  reserve: SideFormation["reserve"] = [],
  enemyFrontlineLimit: EnemyFrontlineLimit =
    frontline.length === 6 ? 6 : 3,
): BattleState {
  const state = createBattleState({
    ally: allyFormation(),
    waves: [{ enemy: { frontline, reserve } }],
    enemyFrontlineLimit,
  });
  return completeAllyTurnEnd(beginAllyTurnEnd(state));
}

function setUnit(
  state: BattleState,
  instanceId: string,
  update: (
    current: NonNullable<
      ReturnType<typeof findUnitLocation>
    >["unit"],
  ) => NonNullable<
    ReturnType<typeof findUnitLocation>
  >["unit"],
): BattleState {
  const location = findUnitLocation(state.formation, instanceId);
  if (!location) throw new Error(`missing unit: ${instanceId}`);
  return setBattleFormation(
    state,
    replaceUnit(state.formation, update(location.unit)),
  );
}

describe("enemy normal action planning", () => {
  it("assigns all three automatic slots to one living frontliner", () => {
    const plan = planEnemyNormalActions(
      battle([enemy("enemy-a"), null, null]),
    );

    expect(plan.livingFrontlineCount).toBe(1);
    expect(plan.limits).toEqual([
      {
        actorInstanceId: "enemy-a",
        frontlineIndex: 0,
        configured: "auto",
        resolved: 3,
      },
    ]);
    expect(plan.slots.map(({ actorInstanceId }) => actorInstanceId)).toEqual([
      "enemy-a",
      "enemy-a",
      "enemy-a",
    ]);
    expect(plan.slots.map(({ actorActionNumber }) => actorActionNumber)).toEqual([
      1,
      2,
      3,
    ]);
  });

  it("cycles two automatic enemies as front, back, front", () => {
    const plan = planEnemyNormalActions(
      battle([enemy("enemy-a"), enemy("enemy-b"), null]),
    );

    expect(plan.limits.map(({ resolved }) => resolved)).toEqual([2, 2]);
    expect(plan.slots.map(({ actorInstanceId }) => actorInstanceId)).toEqual([
      "enemy-a",
      "enemy-b",
      "enemy-a",
    ]);
  });

  it("assigns one slot each to the first three of three or more enemies", () => {
    const three = planEnemyNormalActions(
      battle([
        enemy("enemy-a"),
        enemy("enemy-b"),
        enemy("enemy-c"),
      ]),
    );
    const six = planEnemyNormalActions(
      battle(
        [
          enemy("enemy-a"),
          enemy("enemy-b"),
          enemy("enemy-c"),
          enemy("enemy-d"),
          enemy("enemy-e"),
          enemy("enemy-f"),
        ],
        [],
        6,
      ),
    );

    expect(three.limits.map(({ resolved }) => resolved)).toEqual([1, 1, 1]);
    expect(three.slots.map(({ actorInstanceId }) => actorInstanceId)).toEqual([
      "enemy-a",
      "enemy-b",
      "enemy-c",
    ]);
    expect(six.limits.map(({ resolved }) => resolved)).toEqual([
      1,
      1,
      1,
      1,
      1,
      1,
    ]);
    expect(six.slots.map(({ actorInstanceId }) => actorInstanceId)).toEqual([
      "enemy-a",
      "enemy-b",
      "enemy-c",
    ]);
  });

  it("respects individual manual limits within the global budget", () => {
    const plan = planEnemyNormalActions(
      battle([
        enemy("enemy-a", enemyAction({ maxActions: 1 })),
        enemy("enemy-b", enemyAction({ maxActions: 3 })),
        null,
      ]),
    );

    expect(
      plan.limits.map(({ configured, resolved }) => ({
        configured,
        resolved,
      })),
    ).toEqual([
      { configured: 1, resolved: 1 },
      { configured: 3, resolved: 3 },
    ]);
    expect(plan.slots.map(({ actorInstanceId }) => actorInstanceId)).toEqual([
      "enemy-a",
      "enemy-b",
      "enemy-b",
    ]);
  });

  it("skips empty and defeated slots while preserving frontline indexes", () => {
    let state = battle([
      enemy("enemy-a"),
      null,
      enemy("enemy-c"),
      enemy("enemy-d"),
      null,
      enemy("enemy-f"),
    ], [], 6);
    state = setUnit(state, "enemy-c", (current) => ({
      ...current,
      hp: 0,
      alive: false,
    }));

    const plan = planEnemyNormalActions(state);
    expect(
      plan.limits.map(({ actorInstanceId, frontlineIndex }) => ({
        actorInstanceId,
        frontlineIndex,
      })),
    ).toEqual([
      { actorInstanceId: "enemy-a", frontlineIndex: 0 },
      { actorInstanceId: "enemy-d", frontlineIndex: 3 },
      { actorInstanceId: "enemy-f", frontlineIndex: 5 },
    ]);
    expect(plan.slots.map(({ actorInstanceId }) => actorInstanceId)).toEqual([
      "enemy-a",
      "enemy-d",
      "enemy-f",
    ]);
  });

  it("returns zero normal slots when no living frontliner remains", () => {
    let state = battle(
      [enemy("enemy-a"), null, null],
      [enemy("enemy-reserve")],
    );
    state = setUnit(state, "enemy-a", (current) => ({
      ...current,
      hp: 0,
      alive: false,
    }));

    expect(planEnemyNormalActions(state)).toMatchObject({
      livingFrontlineCount: 0,
      normalActionBudget: 3,
      limits: [],
      slots: [],
    });
  });

  it("does not mutate battle state or consume any RNG", () => {
    const state = battle([
      enemy("enemy-a"),
      enemy("enemy-b"),
      null,
    ]);
    const before = structuredClone(state);

    planEnemyNormalActions(state);

    expect(state).toEqual(before);
  });
});

describe("priority skill planning", () => {
  it("keeps quest-AI setting order and never consumes normal actions", () => {
    const state = battle([
      enemy("enemy-a", enemyAction()),
      enemy("enemy-b", enemyAction()),
      null,
    ]);
    const steps = planEnemyPrioritySkills(state, [
      { actorInstanceId: "enemy-b", skillStableId: "skill-1" },
      { actorInstanceId: "enemy-a", skillStableId: "skill-1" },
    ]);

    expect(steps).toEqual([
      {
        sequence: 1,
        source: "priority",
        actorInstanceId: "enemy-b",
        frontlineIndex: 1,
        request: {
          kind: "skill",
          skillStableId: "skill-1",
        },
        consumesNormalAction: false,
      },
      {
        sequence: 2,
        source: "priority",
        actorInstanceId: "enemy-a",
        frontlineIndex: 0,
        request: {
          kind: "skill",
          skillStableId: "skill-1",
        },
        consumesNormalAction: false,
      },
    ]);
  });

  it("retains an invalidated priority request for a safe execution-time skip", () => {
    const state = battle([enemy("enemy-a"), null, null]);

    expect(
      planEnemyPrioritySkills(state, [
        {
          actorInstanceId: "departed-enemy",
          skillStableId: "quest-skill",
        },
      ]),
    ).toMatchObject([
      {
        actorInstanceId: "departed-enemy",
        frontlineIndex: null,
        consumesNormalAction: false,
      },
    ]);
  });
});

describe("enemy action execution preflight", () => {
  it("safely skips every action kind when all enemy action data is absent", () => {
    const state = battle([enemy("enemy-a"), null, null]);
    const plan = planEnemyNormalActions(state);

    expect(plan.slots).toHaveLength(3);
    expect(
      beginEnemyActionExecution(
        state,
        "enemy-a",
        { kind: "normal_attack" },
        "normal",
      ),
    ).toMatchObject({
      outcome: "skipped",
      reason: "normal_attack_not_configured",
      normalActionConsumed: true,
      chargeBefore: 0,
      chargeConsumed: 0,
    });
    expect(
      beginEnemyActionExecution(
        state,
        "enemy-a",
        { kind: "skill", skillStableId: "missing" },
        "normal",
      ),
    ).toMatchObject({
      outcome: "skipped",
      reason: "skill_not_configured",
      normalActionConsumed: true,
    });
    expect(
      beginEnemyActionExecution(
        state,
        "enemy-a",
        { kind: "noble_phantasm" },
        "normal",
      ),
    ).toMatchObject({
      outcome: "skipped",
      reason: "noble_phantasm_not_configured",
      normalActionConsumed: true,
      chargeBefore: 0,
    });
  });

  it("prepares configured normal attacks and skills without changing state", () => {
    const state = battle([
      enemy("enemy-a", enemyAction()),
      null,
      null,
    ]);

    expect(
      beginEnemyActionExecution(
        state,
        "enemy-a",
        { kind: "normal_attack" },
        "normal",
      ),
    ).toMatchObject({
      outcome: "ready",
      state,
      action: { stableId: "normal" },
      normalActionConsumed: true,
    });
    expect(
      beginEnemyActionExecution(
        state,
        "enemy-a",
        { kind: "skill", skillStableId: "skill-1" },
        "priority",
      ),
    ).toMatchObject({
      outcome: "ready",
      state,
      action: { stableId: "skill-1" },
      normalActionConsumed: false,
    });
  });

  it("skips an unconfigured requested skill without consuming a priority slot", () => {
    const state = battle([
      enemy("enemy-a", enemyAction({ skills: [] })),
      null,
      null,
    ]);

    expect(
      beginEnemyActionExecution(
        state,
        "enemy-a",
        { kind: "skill", skillStableId: "missing" },
        "priority",
      ),
    ).toMatchObject({
      outcome: "skipped",
      reason: "skill_not_configured",
      normalActionConsumed: false,
    });
  });

  it("skips an unfilled NP and resets a ready NP charge before effects", () => {
    const unfilled = battle([
      enemy("enemy-a", enemyAction({ charge: 1, chargeMax: 2 })),
      null,
      null,
    ]);
    expect(
      beginEnemyActionExecution(
        unfilled,
        "enemy-a",
        { kind: "noble_phantasm" },
        "normal",
      ),
    ).toMatchObject({
      outcome: "skipped",
      reason: "noble_phantasm_charge_not_full",
      chargeBefore: 1,
      chargeConsumed: 0,
    });

    const ready = battle([
      enemy("enemy-a", enemyAction({ charge: 2, chargeMax: 2 })),
      null,
      null,
    ]);
    const result = beginEnemyActionExecution(
      ready,
      "enemy-a",
      { kind: "noble_phantasm" },
      "normal",
    );
    expect(result).toMatchObject({
      outcome: "ready",
      action: { stableId: "enemy-np" },
      chargeBefore: 2,
      chargeConsumed: 2,
      normalActionConsumed: true,
    });
    expect(
      findUnitLocation(
        result.state.formation,
        "enemy-a",
      )?.unit.enemyAction?.charge,
    ).toBe(0);
    expect(
      findUnitLocation(
        ready.formation,
        "enemy-a",
      )?.unit.enemyAction?.charge,
    ).toBe(2);
  });

  it("normally skips unavailable, defeated, reserve, ally, and disabled actors", () => {
    let state = battle(
      [enemy("enemy-a", enemyAction()), null, null],
      [enemy("enemy-reserve", enemyAction())],
    );
    state = setUnit(state, "enemy-a", (current) => {
      const applied = applyEffect(
        current,
        {
          stableId: "stun",
          name: "スタン",
          effectType: "stun",
          category: "debuff",
          classifications: ["immobilize"],
          remainingTurns: 1,
        },
        null,
        createEffectRuntimeCounters(),
      );
      return applied.unit;
    });

    expect(
      beginEnemyActionExecution(
        state,
        "missing",
        { kind: "normal_attack" },
        "normal",
      ),
    ).toMatchObject({ outcome: "skipped", reason: "actor_missing" });
    expect(
      beginEnemyActionExecution(
        state,
        "ally-a",
        { kind: "normal_attack" },
        "normal",
      ),
    ).toMatchObject({ outcome: "skipped", reason: "actor_not_enemy" });
    expect(
      beginEnemyActionExecution(
        state,
        "enemy-reserve",
        { kind: "normal_attack" },
        "normal",
      ),
    ).toMatchObject({ outcome: "skipped", reason: "actor_not_frontline" });
    expect(
      beginEnemyActionExecution(
        state,
        "enemy-a",
        { kind: "normal_attack" },
        "normal",
      ),
    ).toMatchObject({ outcome: "skipped", reason: "actor_action_disabled" });

    const defeated = setUnit(state, "enemy-a", (current) => ({
      ...current,
      effects: [],
      hp: 0,
      alive: false,
    }));
    expect(
      beginEnemyActionExecution(
        defeated,
        "enemy-a",
        { kind: "normal_attack" },
        "normal",
      ),
    ).toMatchObject({ outcome: "skipped", reason: "actor_defeated" });
  });
});

describe("enemy action state and charge invariants", () => {
  it("forces charge to zero when the NP definition is absent", () => {
    const state = battle([
      enemy(
        "enemy-a",
        enemyAction({
          noblePhantasm: null,
          charge: 2,
          chargeMax: 3,
        }),
      ),
      null,
      null,
    ]);
    const stored = findUnitLocation(
      state.formation,
      "enemy-a",
    )?.unit;
    if (!stored) throw new Error("missing enemy-a");

    expect(stored.enemyAction).toMatchObject({
      noblePhantasm: null,
      charge: 0,
      chargeMax: 0,
    });
    expect(effectiveEnemyCharge(stored)).toEqual({
      charge: 0,
      chargeMax: 0,
    });

    const renormalized = setUnit(state, "enemy-a", (current) => ({
      ...current,
      enemyAction: {
        ...current.enemyAction!,
        charge: 3,
        chargeMax: 3,
      },
    }));
    expect(
      findUnitLocation(
        renormalized.formation,
        "enemy-a",
      )?.unit.enemyAction,
    ).toMatchObject({ charge: 0, chargeMax: 0 });
  });

  it("validates manual limits, definitions, and configured NP charge", () => {
    const createWith = (profile: EnemyActionState) =>
      createBattleState({
        ally: allyFormation(),
        waves: [
          {
            enemy: {
              frontline: [enemy("enemy-a", profile), null, null],
              reserve: [],
            },
          },
        ],
        enemyFrontlineLimit: 3,
      });

    expect(() =>
      createWith(
        enemyAction({ maxActions: 4 as never }),
      ),
    ).toThrow(/maxActions/);
    expect(() =>
      createWith(
        enemyAction({
          normalAttack: { stableId: "", name: "invalid" },
        }),
      ),
    ).toThrow(/stableId and name/);
    expect(() =>
      createWith(
        enemyAction({ charge: 3, chargeMax: 2 }),
      ),
    ).toThrow(/must not exceed/);
    expect(() =>
      createWith(
        enemyAction({ charge: 0, chargeMax: 0 }),
      ),
    ).toThrow(/positive chargeMax/);
  });

  it("rejects enemy action data on allies", () => {
    const ally = allyFormation();
    ally.frontline[0] = unit("ally-a", "ally", {
      enemyAction: enemyAction(),
    });

    expect(() =>
      createBattleState({
        ally,
        waves: [
          {
            enemy: {
              frontline: [enemy("enemy-a"), null, null],
              reserve: [],
            },
          },
        ],
        enemyFrontlineLimit: 3,
      }),
    ).toThrow(/ally cannot have enemyAction/);
  });

  it("rejects planning and execution outside the enemy action phase", () => {
    const allyPhase = createBattleState({
      ally: allyFormation(),
      waves: [
        {
          enemy: {
            frontline: [enemy("enemy-a"), null, null],
            reserve: [],
          },
        },
      ],
      enemyFrontlineLimit: 3,
    });

    expect(() => planEnemyNormalActions(allyPhase)).toThrow(
      /enemy action phase/,
    );
    expect(() => planEnemyPrioritySkills(allyPhase, [])).toThrow(
      /enemy action phase/,
    );
    expect(() =>
      beginEnemyActionExecution(
        allyPhase,
        "enemy-a",
        { kind: "normal_attack" },
        "normal",
      ),
    ).toThrow(/enemy action phase/);
  });
});
