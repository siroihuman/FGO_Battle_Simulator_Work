import {
  findUnitLocation,
  orderedLocations,
  replaceUnit,
} from "../core/battle/formation";
import {
  setBattleFormation,
  type BattleState,
} from "../core/battle/state";
import type {
  BattleFormation,
  BattleUnitState,
} from "../core/battle/types";
import type { DeterministicRng } from "../core/rng";
import type { NoblePhantasmLevel } from "../formulas/np";
import {
  executeCommonActionForTargets,
  type CommonAction,
  type CommonActionBatchResult,
} from "./actions";
import type {
  BattleActionEffectDataRegistry,
  BattlePassiveEffectGroup,
} from "./actionData";
import {
  combatantActionEffectData,
} from "./actionData";
import type {
  DeclaredActionEffect,
  DeclaredActionInteger,
} from "./declarations";
import {
  resolveTargetLocations,
  type TargetSelector,
} from "./targeting";
import type { EffectRuntimeCounters } from "./types";

export interface DeclaredActionExecutionContext {
  noblePhantasmLevel?: NoblePhantasmLevel;
  overchargeStage?: 1 | 2 | 3 | 4 | 5;
  selectedTargetInstanceId?: string;
}

export type DeclaredActionEffectOutcome =
  | "resolved"
  | "no_target"
  | "unsupported";

export interface DeclaredActionEffectResult {
  effectStableId: string;
  order: number;
  outcome: DeclaredActionEffectOutcome;
  targetInstanceIds: string[];
  resolvedAmount?: number;
  batch?: CommonActionBatchResult;
  unsupportedMechanicId?: string;
}

export interface DeclaredActionEffectsResult {
  state: BattleState;
  counters: EffectRuntimeCounters;
  sourceInstanceId: string;
  effects: DeclaredActionEffectResult[];
  unresolvedEffectStableIds: string[];
}

export interface PassiveEffectGroupResult {
  sourceInstanceId: string;
  groupStableId: string;
  result: DeclaredActionEffectsResult;
}

export interface BattlePassiveInitializationResult {
  state: BattleState;
  counters: EffectRuntimeCounters;
  groups: PassiveEffectGroupResult[];
  unresolvedEffectStableIds: string[];
}

export function resolveDeclaredActionInteger(
  value: DeclaredActionInteger,
  context: DeclaredActionExecutionContext,
): number {
  if (typeof value === "number") return value;
  const stage = value.scaling === "noble_phantasm_level"
    ? context.noblePhantasmLevel
    : context.overchargeStage;
  if (stage === undefined) {
    throw new RangeError(
      `${value.scaling} value requires an execution stage`,
    );
  }
  return value.values[stage - 1];
}

function replaceIfPresent(
  formation: BattleFormation,
  unit: BattleUnitState | null,
): BattleFormation {
  const location = unit
    ? findUnitLocation(formation, unit.instanceId)
    : undefined;
  if (!unit || !location || location.unit === unit) {
    return formation;
  }
  return replaceUnit(formation, unit);
}

function applyBatch(
  state: BattleState,
  batch: CommonActionBatchResult,
): BattleState {
  let formation = state.formation;
  for (const target of batch.targets) {
    formation = replaceIfPresent(formation, target);
  }
  formation = replaceIfPresent(formation, batch.source);
  return formation === state.formation
    ? state
    : setBattleFormation(state, formation);
}

function runtimeSelector(
  effect: DeclaredActionEffect,
  context: DeclaredActionExecutionContext,
): TargetSelector {
  return {
    ...effect.target,
    ...(effect.target.selection === "single"
      && effect.target.relation !== "self"
      && context.selectedTargetInstanceId !== undefined
      ? { selectedInstanceId: context.selectedTargetInstanceId }
      : {}),
  };
}

function commonAction(
  effect: DeclaredActionEffect,
  context: DeclaredActionExecutionContext,
): { action: CommonAction; resolvedAmount?: number } | null {
  if (effect.action.kind === "unsupported") return null;
  if (effect.action.kind === "change_np") {
    const amount = resolveDeclaredActionInteger(
      effect.action.amount,
      context,
    );
    return {
      action: { kind: "change_np", amount },
      resolvedAmount: amount,
    };
  }
  return { action: effect.action };
}

/** Executes source-ordered declarative effects against the current formation. */
export function executeDeclaredActionEffects(
  state: BattleState,
  sourceInstanceId: string,
  effects: readonly DeclaredActionEffect[],
  context: DeclaredActionExecutionContext,
  counters: EffectRuntimeCounters,
  rng: DeterministicRng,
): DeclaredActionEffectsResult {
  if (!findUnitLocation(state.formation, sourceInstanceId)) {
    throw new RangeError(
      `declared action source is missing: ${sourceInstanceId}`,
    );
  }
  let currentState = state;
  let currentCounters = counters;
  const results: DeclaredActionEffectResult[] = [];
  const unresolvedEffectStableIds: string[] = [];

  for (const effect of [...effects].sort((left, right) => left.order - right.order)) {
    const prepared = commonAction(effect, context);
    if (!prepared) {
      unresolvedEffectStableIds.push(effect.stableId);
      results.push({
        effectStableId: effect.stableId,
        order: effect.order,
        outcome: "unsupported",
        targetInstanceIds: [],
        unsupportedMechanicId:
          effect.action.kind === "unsupported"
            ? effect.action.mechanicId
            : undefined,
      });
      continue;
    }
    const targetLocations = resolveTargetLocations(
      currentState.formation,
      sourceInstanceId,
      runtimeSelector(effect, context),
    );
    const targets = targetLocations.length > 0
      ? targetLocations.map(({ unit }) => unit)
      : [null];
    const source = findUnitLocation(
      currentState.formation,
      sourceInstanceId,
    )?.unit ?? null;
    const batch = executeCommonActionForTargets(
      source,
      targets,
      prepared.action,
      currentCounters,
      rng,
    );
    currentCounters = batch.counters;
    currentState = applyBatch(currentState, batch);
    results.push({
      effectStableId: effect.stableId,
      order: effect.order,
      outcome:
        targetLocations.length === 0
          ? "no_target"
          : "resolved",
      targetInstanceIds: targetLocations.map(
        ({ unit }) => unit.instanceId,
      ),
      ...(prepared.resolvedAmount === undefined
        ? {}
        : { resolvedAmount: prepared.resolvedAmount }),
      batch,
    });
  }

  return {
    state: currentState,
    counters: currentCounters,
    sourceInstanceId,
    effects: results,
    unresolvedEffectStableIds,
  };
}

function combatantOrder(state: BattleState): BattleUnitState[] {
  return (["ally", "enemy"] as const).flatMap((side) =>
    orderedLocations(state.formation, side, true).map(({ unit }) => unit)
  );
}

function passiveGroups(
  registry: BattleActionEffectDataRegistry,
  unit: BattleUnitState,
): readonly BattlePassiveEffectGroup[] {
  return combatantActionEffectData(registry, unit)?.passives ?? [];
}

/** Applies all class/passive groups once in formation order before battle use. */
export function initializeBattlePassives(
  state: BattleState,
  registry: BattleActionEffectDataRegistry,
  counters: EffectRuntimeCounters,
  rng: DeterministicRng,
): BattlePassiveInitializationResult {
  let currentState = state;
  let currentCounters = counters;
  const groups: PassiveEffectGroupResult[] = [];
  const unresolvedEffectStableIds: string[] = [];
  for (const listedUnit of combatantOrder(state)) {
    for (const group of passiveGroups(registry, listedUnit)) {
      const result = executeDeclaredActionEffects(
        currentState,
        listedUnit.instanceId,
        group.effects,
        {},
        currentCounters,
        rng,
      );
      currentState = result.state;
      currentCounters = result.counters;
      unresolvedEffectStableIds.push(
        ...result.unresolvedEffectStableIds,
      );
      groups.push({
        sourceInstanceId: listedUnit.instanceId,
        groupStableId: group.stableId,
        result,
      });
    }
  }
  return {
    state: currentState,
    counters: currentCounters,
    groups,
    unresolvedEffectStableIds,
  };
}
