import {
  findUnitLocation,
  replaceUnit,
} from "../core/battle/formation";
import {
  setBattleFormation,
  type BattleState,
} from "../core/battle/state";
import type {
  BattleUnitState,
  EnemyActionDefinition,
} from "../core/battle/types";
import { isActionDisabled } from "../effects/classification";

export const ENEMY_NORMAL_ACTION_BUDGET = 3 as const;

export interface EnemyPrioritySkillRequest {
  actorInstanceId: string;
  skillStableId: string;
  selectedTargetInstanceId?: string;
}

export interface EnemyPrioritySkillStep {
  sequence: number;
  source: "priority";
  actorInstanceId: string;
  frontlineIndex: number | null;
  request: {
    kind: "skill";
    skillStableId: string;
    selectedTargetInstanceId?: string;
  };
  consumesNormalAction: false;
}

export interface EnemyNormalActionSlot {
  sequence: number;
  source: "normal";
  actorInstanceId: string;
  frontlineIndex: number;
  normalBudgetNumber: number;
  actorActionNumber: number;
  consumesNormalAction: true;
}

export interface EnemyResolvedActionLimit {
  actorInstanceId: string;
  frontlineIndex: number;
  configured: "auto" | 1 | 2 | 3;
  resolved: 1 | 2 | 3;
}

export interface EnemyNormalActionPlan {
  livingFrontlineCount: number;
  normalActionBudget: typeof ENEMY_NORMAL_ACTION_BUDGET;
  limits: EnemyResolvedActionLimit[];
  slots: EnemyNormalActionSlot[];
}

export type EnemyActionRequest =
  | {
      kind: "normal_attack";
    }
  | {
      kind: "skill";
      skillStableId: string;
      selectedTargetInstanceId?: string;
    }
  | {
      kind: "noble_phantasm";
    };

export type EnemyActionSource = "priority" | "normal";

export type EnemyActionSkipReason =
  | "actor_missing"
  | "actor_not_enemy"
  | "actor_not_frontline"
  | "actor_defeated"
  | "actor_action_disabled"
  | "normal_attack_not_configured"
  | "skill_not_configured"
  | "noble_phantasm_not_configured"
  | "noble_phantasm_charge_not_full"
  | "source_attack_data_missing"
  | "action_attack_data_missing"
  | "action_effects_unresolved"
  | "action_effect_target_required"
  | "action_effect_target_invalid";

export type EnemyActorExecutionSkipReason = Extract<
  EnemyActionSkipReason,
  | "actor_missing"
  | "actor_not_enemy"
  | "actor_not_frontline"
  | "actor_defeated"
  | "actor_action_disabled"
>;

interface EnemyActionExecutionBase {
  state: BattleState;
  source: EnemyActionSource;
  actorInstanceId: string;
  request: EnemyActionRequest;
  normalActionConsumed: boolean;
  chargeBefore: number;
  chargeConsumed: number;
}

export type EnemyActionExecutionResult =
  | (EnemyActionExecutionBase & {
      outcome: "ready";
      action: EnemyActionDefinition;
    })
  | (EnemyActionExecutionBase & {
      outcome: "skipped";
      action: null;
      reason: EnemyActionSkipReason;
      chargeConsumed: 0;
    });

function assertEnemyActionPhase(state: BattleState): void {
  if (state.outcome !== "ongoing" || state.phase !== "enemy_action") {
    throw new RangeError(
      "enemy actions require an ongoing enemy action phase",
    );
  }
}

function activeEnemyFrontline(
  state: BattleState,
): Array<{
  unit: BattleUnitState;
  frontlineIndex: number;
}> {
  return state.formation.enemy.frontline.flatMap(
    (unit, frontlineIndex) =>
      unit && unit.alive && unit.hp > 0
        ? [{ unit, frontlineIndex }]
        : [],
  );
}

function autoActionLimit(livingFrontlineCount: number): 1 | 2 | 3 {
  if (livingFrontlineCount <= 1) return 3;
  if (livingFrontlineCount === 2) return 2;
  return 1;
}

/**
 * Converts quest-specific priority-skill requests to non-consuming steps.
 * Input order is authoritative. Resolve these steps before building the
 * normal plan so their effects and any immediate replacement are reflected.
 */
export function planEnemyPrioritySkills(
  state: BattleState,
  requests: readonly EnemyPrioritySkillRequest[],
): EnemyPrioritySkillStep[] {
  assertEnemyActionPhase(state);
  return requests.map((request, index) => {
    const location = findUnitLocation(
      state.formation,
      request.actorInstanceId,
    );
    return {
      sequence: index + 1,
      source: "priority",
      actorInstanceId: request.actorInstanceId,
      frontlineIndex:
        location?.side === "enemy" && location.area === "frontline"
          ? location.index
          : null,
      request: {
        kind: "skill",
        skillStableId: request.skillStableId,
        ...(request.selectedTargetInstanceId === undefined
          ? {}
          : {
              selectedTargetInstanceId:
                request.selectedTargetInstanceId,
            }),
      },
      consumesNormalAction: false,
    };
  });
}

/**
 * Allocates at most three normal action slots by cycling over the current
 * living frontline from its frontmost slot and skipping actors at their
 * individual limit.
 */
export function planEnemyNormalActions(
  state: BattleState,
): EnemyNormalActionPlan {
  assertEnemyActionPhase(state);
  const actors = activeEnemyFrontline(state);
  const autoLimit = autoActionLimit(actors.length);
  const limits: EnemyResolvedActionLimit[] = actors.map(
    ({ unit, frontlineIndex }) => {
      const configured = unit.enemyAction?.maxActions ?? "auto";
      return {
        actorInstanceId: unit.instanceId,
        frontlineIndex,
        configured,
        resolved:
          configured === "auto" ? autoLimit : configured,
      };
    },
  );
  const used = new Map<string, number>();
  const slots: EnemyNormalActionSlot[] = [];

  while (slots.length < ENEMY_NORMAL_ACTION_BUDGET) {
    let allocatedInCycle = false;
    for (const limit of limits) {
      const actorUsed = used.get(limit.actorInstanceId) ?? 0;
      if (actorUsed >= limit.resolved) continue;
      const actorActionNumber = actorUsed + 1;
      used.set(limit.actorInstanceId, actorActionNumber);
      slots.push({
        sequence: slots.length + 1,
        source: "normal",
        actorInstanceId: limit.actorInstanceId,
        frontlineIndex: limit.frontlineIndex,
        normalBudgetNumber: slots.length + 1,
        actorActionNumber,
        consumesNormalAction: true,
      });
      allocatedInCycle = true;
      if (slots.length === ENEMY_NORMAL_ACTION_BUDGET) break;
    }
    if (!allocatedInCycle) break;
  }

  return {
    livingFrontlineCount: actors.length,
    normalActionBudget: ENEMY_NORMAL_ACTION_BUDGET,
    limits,
    slots,
  };
}

export function effectiveEnemyCharge(
  unit: BattleUnitState,
): {
  charge: number;
  chargeMax: number;
} {
  const action = unit.enemyAction;
  if (!action?.noblePhantasm) {
    return { charge: 0, chargeMax: 0 };
  }
  return {
    charge: action.charge,
    chargeMax: action.chargeMax,
  };
}

function requestedAction(
  unit: BattleUnitState,
  request: EnemyActionRequest,
): {
  action: EnemyActionDefinition | null;
  reason?: EnemyActionSkipReason;
} {
  const profile = unit.enemyAction;
  if (request.kind === "normal_attack") {
    return profile?.normalAttack
      ? { action: profile.normalAttack }
      : {
          action: null,
          reason: "normal_attack_not_configured",
        };
  }
  if (request.kind === "skill") {
    const skill = profile?.skills.find(
      ({ stableId }) => stableId === request.skillStableId,
    );
    return skill
      ? { action: skill }
      : {
          action: null,
          reason: "skill_not_configured",
        };
  }
  if (!profile?.noblePhantasm) {
    return {
      action: null,
      reason: "noble_phantasm_not_configured",
    };
  }
  if (profile.charge < profile.chargeMax) {
    return {
      action: null,
      reason: "noble_phantasm_charge_not_full",
    };
  }
  return { action: profile.noblePhantasm };
}

/**
 * Checks only whether an enemy actor can begin any action. AI callers use
 * this before spending randomness to select a concrete normal action.
 */
export function enemyActorExecutionSkipReason(
  state: BattleState,
  actorInstanceId: string,
): EnemyActorExecutionSkipReason | null {
  assertEnemyActionPhase(state);
  const location = findUnitLocation(
    state.formation,
    actorInstanceId,
  );
  if (!location) return "actor_missing";
  if (location.side !== "enemy") return "actor_not_enemy";
  if (location.area !== "frontline") {
    return "actor_not_frontline";
  }
  if (!location.unit.alive || location.unit.hp <= 0) {
    return "actor_defeated";
  }
  return isActionDisabled(location.unit)
    ? "actor_action_disabled"
    : null;
}

/**
 * Rechecks one AI-requested action immediately before execution.
 *
 * Missing normal attacks, skills, or NPs are ordinary skips. A normal slot is
 * consumed even when skipped; a quest priority step never consumes one. A
 * ready NP resets charge to zero before its effects are resolved.
 */
export function beginEnemyActionExecution(
  state: BattleState,
  actorInstanceId: string,
  request: EnemyActionRequest,
  source: EnemyActionSource,
  additionalSkipReason: EnemyActionSkipReason | null = null,
): EnemyActionExecutionResult {
  assertEnemyActionPhase(state);
  const normalActionConsumed = source === "normal";
  const location = findUnitLocation(
    state.formation,
    actorInstanceId,
  );
  const chargeBefore =
    location?.side === "enemy"
      ? effectiveEnemyCharge(location.unit).charge
      : 0;
  const skipped = (
    reason: EnemyActionSkipReason,
  ): EnemyActionExecutionResult => ({
    outcome: "skipped",
    state,
    source,
    actorInstanceId,
    request,
    action: null,
    reason,
    normalActionConsumed,
    chargeBefore,
    chargeConsumed: 0,
  });

  if (!location) return skipped("actor_missing");
  const actorSkipReason = enemyActorExecutionSkipReason(
    state,
    actorInstanceId,
  );
  if (actorSkipReason) return skipped(actorSkipReason);

  const resolved = requestedAction(location.unit, request);
  if (!resolved.action) {
    if (!resolved.reason) {
      throw new RangeError("missing enemy action skip reason");
    }
    return skipped(resolved.reason);
  }
  if (additionalSkipReason) return skipped(additionalSkipReason);

  if (request.kind !== "noble_phantasm") {
    return {
      outcome: "ready",
      state,
      source,
      actorInstanceId,
      request,
      action: resolved.action,
      normalActionConsumed,
      chargeBefore,
      chargeConsumed: 0,
    };
  }
  const profile = location.unit.enemyAction;
  if (!profile) {
    throw new RangeError("validated enemy NP profile is missing");
  }
  const formation = replaceUnit(
    state.formation,
    {
      ...location.unit,
      enemyAction: {
        ...profile,
        charge: 0,
      },
    },
  );
  return {
    outcome: "ready",
    state: setBattleFormation(state, formation),
    source,
    actorInstanceId,
    request,
    action: resolved.action,
    normalActionConsumed,
    chargeBefore,
    chargeConsumed: chargeBefore,
  };
}
