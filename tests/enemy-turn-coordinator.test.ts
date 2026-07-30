import { describe, expect, it } from "vitest";
import {
  defaultEnemyNormalActionRequest,
  resolveEnemyTurnSequence,
  type EnemyActionResolver,
} from "../src/ai/enemyTurnCoordinator";
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
  type EnemyReplacementMode,
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
    normalAttack:
      options.normalAttack === undefined
        ? action("normal")
        : options.normalAttack,
    skills: options.skills ?? [action("skill-1")],
    noblePhantasm:
      options.noblePhantasm === undefined
        ? action("enemy-np")
        : options.noblePhantasm,
    charge: options.charge ?? 0,
    chargeMax: options.chargeMax ?? 3,
  };
}

function enemy(
  instanceId: string,
  profile: EnemyActionState | null = enemyAction(),
) {
  return unit(instanceId, "enemy", {
    enemyAction: profile,
  });
}

function battle(
  enemyFormation: SideFormation = {
    frontline: [
      enemy("enemy-a"),
      enemy("enemy-b"),
      null,
    ],
    reserve: [
      enemy("enemy-d"),
      enemy("enemy-e"),
    ],
  },
  mode: EnemyReplacementMode = "standard",
): BattleState {
  const state = createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally"),
        unit("ally-b", "ally"),
        unit("ally-c", "ally"),
      ],
      reserve: [
        unit("ally-d", "ally"),
        unit("ally-e", "ally"),
        unit("ally-f", "ally"),
      ],
    },
    waves: [{ enemy: enemyFormation }],
    enemyFrontlineLimit:
      enemyFormation.frontline.length === 6 ? 6 : 3,
    enemyReplacementMode: mode,
  });
  return completeAllyTurnEnd(beginAllyTurnEnd(state));
}

function updateUnit(
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

function defeat(
  state: BattleState,
  ...instanceIds: string[]
): BattleState {
  let current = state;
  for (const instanceId of instanceIds) {
    current = updateUnit(current, instanceId, (unitState) => ({
      ...unitState,
      hp: 0,
      alive: false,
    }));
  }
  return current;
}

function noOpResolver(
  calls: Array<{
    stage: string;
    actor: string;
    kind: string;
  }> = [],
): EnemyActionResolver {
  return (input) => {
    calls.push({
      stage: input.stage,
      actor: input.actorInstanceId,
      kind: input.request.kind,
    });
    return { state: input.state };
  };
}

function ids(
  units: Array<{ instanceId: string } | null>,
): Array<string | null> {
  return units.map((current) => current?.instanceId ?? null);
}

describe("enemy turn sequence coordinator", () => {
  it("resolves priority skills in configured order before a fresh three-slot normal plan", () => {
    const calls: Array<{
      stage: string;
      actor: string;
      kind: string;
    }> = [];
    const result = resolveEnemyTurnSequence(
      battle(),
      [
        {
          actorInstanceId: "enemy-b",
          skillStableId: "skill-1",
        },
        {
          actorInstanceId: "enemy-a",
          skillStableId: "skill-1",
        },
      ],
      noOpResolver(calls),
    );

    expect(calls).toEqual([
      { stage: "priority", actor: "enemy-b", kind: "skill" },
      { stage: "priority", actor: "enemy-a", kind: "skill" },
      { stage: "normal", actor: "enemy-a", kind: "normal_attack" },
      { stage: "normal", actor: "enemy-b", kind: "normal_attack" },
      { stage: "normal", actor: "enemy-a", kind: "normal_attack" },
    ]);
    expect(
      result.normalPlan?.slots.map(({ actorInstanceId }) => actorInstanceId),
    ).toEqual(["enemy-a", "enemy-b", "enemy-a"]);
    expect(result.actions.map(({ actionNumber }) => actionNumber)).toEqual([
      1,
      2,
      3,
      4,
      5,
    ]);
    expect(result.state.phase).toBe("enemy_turn_end");
    expect(result.stopReason).toBe("sequence_complete");
  });

  it("keeps an invalid priority request as a non-consuming skip before normal actions", () => {
    const calls: string[] = [];
    const result = resolveEnemyTurnSequence(
      battle(),
      [
        {
          actorInstanceId: "missing-enemy",
          skillStableId: "missing-skill",
        },
      ],
      (input) => {
        calls.push(input.actorInstanceId);
        return { state: input.state };
      },
    );

    expect(result.actions[0]).toMatchObject({
      stage: "priority",
      actorInstanceId: "missing-enemy",
      resolverCalled: false,
      preflight: {
        outcome: "skipped",
        reason: "actor_missing",
        normalActionConsumed: false,
      },
    });
    expect(result.normalPlan?.slots).toHaveLength(3);
    expect(calls).toEqual(["enemy-a", "enemy-b", "enemy-a"]);
  });

  it("includes an immediate replacement in the normal plan after a priority self-defeat", () => {
    const state = battle(undefined, "immediate");
    const result = resolveEnemyTurnSequence(
      state,
      [
        {
          actorInstanceId: "enemy-a",
          skillStableId: "skill-1",
        },
      ],
      (input) => ({
        state:
          input.stage === "priority"
            ? defeat(input.state, "enemy-a")
            : input.state,
      }),
    );

    expect(
      result.actions[0]?.boundary.enemyReplacement.arrivals[0],
    ).toMatchObject({
      frontlineIndex: 0,
      instanceId: "enemy-d",
    });
    expect(
      result.normalPlan?.slots.map(({ actorInstanceId }) => actorInstanceId),
    ).toEqual(["enemy-d", "enemy-b", "enemy-e"]);
  });

  it("defers a standard replacement and plans only the surviving priority result", () => {
    const result = resolveEnemyTurnSequence(
      battle(),
      [
        {
          actorInstanceId: "enemy-a",
          skillStableId: "skill-1",
        },
      ],
      (input) => ({
        state:
          input.stage === "priority"
            ? defeat(input.state, "enemy-a")
            : input.state,
      }),
    );

    expect(
      result.actions[0]?.boundary.enemyReplacement.replacementDeferred,
    ).toBe(true);
    expect(
      result.normalPlan?.slots.map(({ actorInstanceId }) => actorInstanceId),
    ).toEqual(["enemy-b", "enemy-b", "enemy-b"]);
    expect(ids(result.state.formation.enemy.frontline)).toEqual([
      null,
      "enemy-b",
      null,
    ]);
  });

  it("uses a full configured NP first, resets charge before effects, then falls back to normal attacks", () => {
    const state = battle({
      frontline: [
        enemy(
          "enemy-a",
          enemyAction({ charge: 2, chargeMax: 2 }),
        ),
        null,
        null,
      ],
      reserve: [],
    });
    const requests: string[] = [];
    const chargeSeen: number[] = [];
    const result = resolveEnemyTurnSequence(
      state,
      [],
      (input) => {
        requests.push(input.request.kind);
        chargeSeen.push(
          findUnitLocation(
            input.state.formation,
            input.actorInstanceId,
          )?.unit.enemyAction?.charge ?? -1,
        );
        return { state: input.state };
      },
    );

    expect(requests).toEqual([
      "noble_phantasm",
      "normal_attack",
      "normal_attack",
    ]);
    expect(chargeSeen).toEqual([0, 0, 0]);
    expect(result.actions[0]?.preflight).toMatchObject({
      outcome: "ready",
      chargeBefore: 2,
      chargeConsumed: 2,
    });
  });

  it("selects the deterministic NP-or-normal fallback without changing state", () => {
    const normal = battle({
      frontline: [enemy("enemy-a"), null, null],
      reserve: [],
    });
    const readyNp = updateUnit(normal, "enemy-a", (current) => ({
      ...current,
      enemyAction: {
        ...current.enemyAction!,
        charge: 3,
      },
    }));

    expect(
      defaultEnemyNormalActionRequest(normal, "enemy-a"),
    ).toEqual({ kind: "normal_attack" });
    expect(
      defaultEnemyNormalActionRequest(readyNp, "enemy-a"),
    ).toEqual({ kind: "noble_phantasm" });
    expect(
      defaultEnemyNormalActionRequest(normal, "missing"),
    ).toEqual({ kind: "normal_attack" });
  });

  it("safely consumes all three slots when every enemy action is unconfigured", () => {
    const result = resolveEnemyTurnSequence(
      battle({
        frontline: [enemy("enemy-a", null), null, null],
        reserve: [],
      }),
      [],
      () => {
        throw new Error("resolver must not be called");
      },
    );

    expect(result.actions).toHaveLength(3);
    expect(result.actions.every(
      ({ preflight, resolverCalled }) =>
        preflight.outcome === "skipped"
        && preflight.reason === "normal_attack_not_configured"
        && preflight.normalActionConsumed
        && !resolverCalled,
    )).toBe(true);
  });

  it("uses a supplied selector for each actionable normal slot", () => {
    let selectorCalls = 0;
    const resolverCalls: string[] = [];
    const result = resolveEnemyTurnSequence(
      battle({
        frontline: [enemy("enemy-a"), null, null],
        reserve: [],
      }),
      [],
      (input) => {
        resolverCalls.push(input.request.kind);
        return {
          state: input.state,
          detail: `enemy-action-${input.actionNumber}`,
        };
      },
      () => {
        selectorCalls += 1;
        return {
          kind: "skill",
          skillStableId: "skill-1",
        };
      },
    );

    expect(selectorCalls).toBe(3);
    expect(resolverCalls).toEqual(["skill", "skill", "skill"]);
    expect(result.actions.map(({ selectorCalled }) => selectorCalled)).toEqual([
      true,
      true,
      true,
    ]);
    expect(result.actions.map(({ resolverDetail }) => resolverDetail)).toEqual([
      "enemy-action-1",
      "enemy-action-2",
      "enemy-action-3",
    ]);
  });

  it("does not call the selector or resolver for an action-disabled actor", () => {
    let state = battle({
      frontline: [enemy("enemy-a"), null, null],
      reserve: [],
    });
    state = updateUnit(state, "enemy-a", (current) =>
      applyEffect(
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
      ).unit,
    );
    let selectorCalls = 0;
    let resolverCalls = 0;
    const result = resolveEnemyTurnSequence(
      state,
      [],
      (input) => {
        resolverCalls += 1;
        return { state: input.state };
      },
      () => {
        selectorCalls += 1;
        return { kind: "normal_attack" };
      },
    );

    expect(selectorCalls).toBe(0);
    expect(resolverCalls).toBe(0);
    expect(result.actions).toHaveLength(3);
    expect(result.actions.every(
      ({ selectorCalled, preflight }) =>
        !selectorCalled
        && preflight.outcome === "skipped"
        && preflight.reason === "actor_action_disabled",
    )).toBe(true);
  });

  it("does not reselect actions for later planned slots after their actor departs", () => {
    const state = battle({
      frontline: [enemy("enemy-a"), null, null],
      reserve: [enemy("enemy-d")],
    });
    let selectorCalls = 0;
    let resolverCalls = 0;
    const result = resolveEnemyTurnSequence(
      state,
      [],
      (input) => {
        resolverCalls += 1;
        return {
          state: defeat(input.state, input.actorInstanceId),
        };
      },
      () => {
        selectorCalls += 1;
        return { kind: "normal_attack" };
      },
    );

    expect(selectorCalls).toBe(1);
    expect(resolverCalls).toBe(1);
    expect(result.normalPlan?.slots).toHaveLength(3);
    expect(result.actions.map(({ preflight }) => preflight.outcome)).toEqual([
      "ready",
      "skipped",
      "skipped",
    ]);
    expect(result.actions.slice(1).every(
      ({ selectorCalled, preflight }) =>
        !selectorCalled
        && preflight.outcome === "skipped"
        && preflight.reason === "actor_missing",
    )).toBe(true);
  });

  it("does not give an immediate replacement the departed actor's remaining planned slots", () => {
    const state = battle({
      frontline: [enemy("enemy-a"), null, null],
      reserve: [enemy("enemy-d")],
    }, "immediate");
    const result = resolveEnemyTurnSequence(
      state,
      [],
      (input) => ({
        state: defeat(input.state, input.actorInstanceId),
      }),
    );

    expect(ids(result.state.formation.enemy.frontline)).toEqual([
      "enemy-d",
      null,
      null,
    ]);
    expect(result.actions[0]?.boundary.enemyReplacement.arrivals[0]).toMatchObject({
      instanceId: "enemy-d",
    });
    expect(result.actions.slice(1).every(
      ({ actorInstanceId, resolverCalled }) =>
        actorInstanceId === "enemy-a" && !resolverCalled,
    )).toBe(true);
  });

  it("auto-replaces a defeated ally before the next enemy action", () => {
    const frontlineSeen: Array<Array<string | null>> = [];
    const result = resolveEnemyTurnSequence(
      battle({
        frontline: [enemy("enemy-a"), null, null],
        reserve: [],
      }),
      [],
      (input) => {
        frontlineSeen.push(
          ids(input.state.formation.ally.frontline),
        );
        return {
          state:
            input.actionNumber === 1
              ? defeat(input.state, "ally-b")
              : input.state,
        };
      },
    );

    expect(frontlineSeen).toEqual([
      ["ally-a", "ally-b", "ally-c"],
      ["ally-a", "ally-d", "ally-c"],
      ["ally-a", "ally-d", "ally-c"],
    ]);
    expect(
      result.actions[0]?.boundary.allyReplacement.events[0],
    ).toMatchObject({
      frontlineIndex: 1,
      defeatedInstanceId: "ally-b",
      replacementInstanceId: "ally-d",
    });
  });

  it("stops remaining actions and AI selection immediately after ally annihilation", () => {
    let selectorCalls = 0;
    let resolverCalls = 0;
    const result = resolveEnemyTurnSequence(
      battle({
        frontline: [enemy("enemy-a"), null, null],
        reserve: [],
      }),
      [],
      (input) => {
        resolverCalls += 1;
        return {
          state: defeat(
            input.state,
            "ally-a",
            "ally-b",
            "ally-c",
            "ally-d",
            "ally-e",
            "ally-f",
          ),
        };
      },
      () => {
        selectorCalls += 1;
        return { kind: "normal_attack" };
      },
    );

    expect(selectorCalls).toBe(1);
    expect(resolverCalls).toBe(1);
    expect(result.normalPlan?.slots).toHaveLength(3);
    expect(result.actions).toHaveLength(1);
    expect(result.stopReason).toBe("ally_annihilated");
    expect(result.state.phase).toBe("enemy_turn_end");
    expect(result.state.outcome).toBe("ongoing");
  });

  it("does not begin priority or normal actions when allies are already annihilated", () => {
    let state = battle();
    state = defeat(
      state,
      "ally-a",
      "ally-b",
      "ally-c",
      "ally-d",
      "ally-e",
      "ally-f",
    );
    const result = resolveEnemyTurnSequence(
      state,
      [
        {
          actorInstanceId: "enemy-a",
          skillStableId: "skill-1",
        },
      ],
      () => {
        throw new Error("resolver must not be called");
      },
    );

    expect(result.priorityPlan).toHaveLength(1);
    expect(result.normalPlan).toBeNull();
    expect(result.actions).toEqual([]);
    expect(result.stopReason).toBe("ally_annihilated");
    expect(result.state.phase).toBe("enemy_turn_end");
  });

  it("stops remaining priority requests and skips normal planning after priority annihilation", () => {
    const calls: string[] = [];
    const result = resolveEnemyTurnSequence(
      battle(),
      [
        {
          actorInstanceId: "enemy-a",
          skillStableId: "skill-1",
        },
        {
          actorInstanceId: "enemy-b",
          skillStableId: "skill-1",
        },
      ],
      (input) => {
        calls.push(input.actorInstanceId);
        return {
          state: defeat(
            input.state,
            "ally-a",
            "ally-b",
            "ally-c",
            "ally-d",
            "ally-e",
            "ally-f",
          ),
        };
      },
    );

    expect(calls).toEqual(["enemy-a"]);
    expect(result.priorityPlan).toHaveLength(2);
    expect(result.actions).toHaveLength(1);
    expect(result.normalPlan).toBeNull();
    expect(result.stopReason).toBe("ally_annihilated");
  });

  it("lets a selector request an unfilled NP and records a safe skip for every slot", () => {
    let selectorCalls = 0;
    const result = resolveEnemyTurnSequence(
      battle({
        frontline: [enemy("enemy-a"), null, null],
        reserve: [],
      }),
      [],
      () => {
        throw new Error("resolver must not be called");
      },
      () => {
        selectorCalls += 1;
        return { kind: "noble_phantasm" };
      },
    );

    expect(selectorCalls).toBe(3);
    expect(result.actions.every(
      ({ preflight }) =>
        preflight.outcome === "skipped"
        && preflight.reason === "noble_phantasm_charge_not_full",
    )).toBe(true);
  });

  it("builds a zero-slot normal plan when priority standard departure leaves no frontliner", () => {
    const state = battle({
      frontline: [enemy("enemy-a"), null, null],
      reserve: [enemy("enemy-d")],
    });
    const result = resolveEnemyTurnSequence(
      state,
      [
        {
          actorInstanceId: "enemy-a",
          skillStableId: "skill-1",
        },
      ],
      (input) => ({
        state: defeat(input.state, "enemy-a"),
      }),
    );

    expect(result.normalPlan).toMatchObject({
      livingFrontlineCount: 0,
      slots: [],
    });
    expect(ids(result.state.formation.enemy.frontline)).toEqual([
      null,
      null,
      null,
    ]);
    expect(ids(result.state.formation.enemy.reserve)).toEqual([
      "enemy-d",
    ]);
    expect(result.state.phase).toBe("enemy_turn_end");
  });

  it("rejects an action resolver that changes phase or outcome", () => {
    expect(() =>
      resolveEnemyTurnSequence(
        battle({
          frontline: [enemy("enemy-a"), null, null],
          reserve: [],
        }),
        [],
        (input) => ({
          state: beginAllyTurnEnd({
            ...input.state,
            phase: "ally_action",
          }),
        }),
      ),
    ).toThrow(/must return an ongoing enemy action phase/);
  });

  it("rejects planning outside the enemy action phase", () => {
    const enemyFormation: SideFormation = {
      frontline: [enemy("enemy-a"), null, null],
      reserve: [],
    };
    const allyPhase = createBattleState({
      ally: {
        frontline: [
          unit("ally-a", "ally"),
          unit("ally-b", "ally"),
          unit("ally-c", "ally"),
        ],
        reserve: [],
      },
      waves: [{ enemy: enemyFormation }],
      enemyFrontlineLimit: 3,
    });

    expect(() =>
      resolveEnemyTurnSequence(
        allyPhase,
        [],
        noOpResolver(),
      ),
    ).toThrow(/enemy action phase/);
  });
});
