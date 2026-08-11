import {
  findUnitLocation,
  orderedLocations,
  replaceUnit,
} from "../core/battle/formation";
import {
  setBattleFormation,
  type BattleState,
} from "../core/battle/state";
import {
  addCommandStars,
  addNextCommandStars,
  type BattleStarAddition,
  type BattleStarBucket,
} from "../core/battle/starState";
import type {
  BattleFormation,
  BattleSide,
  BattleUnitState,
} from "../core/battle/types";
import type { DeterministicRng } from "../core/rng";
import type {
  CommandCardRedistributionResult,
} from "../core/cards/deck";
import type {
  ResolvedCommandStarDistribution,
} from "../core/cards/critical";
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
  EnemyNoblePhantasmContext,
} from "./declarations";
import {
  resolveTargetLocations,
  resolveTargetLocationsFromSide,
  type TargetSelector,
} from "./targeting";
import type { EffectRuntimeCounters } from "./types";

export interface DeclaredActionExecutionContext {
  noblePhantasmLevel?: EnemyNoblePhantasmContext["noblePhantasmLevel"];
  overchargeStage?: EnemyNoblePhantasmContext["overchargeStage"];
  selectedTargetInstanceId?: string;
  preparedCommandCardRedistributions?: readonly CommandCardRedistributionResult[];
}

export type DeclaredActionEffectOutcome =
  | "resolved"
  | "no_target"
  | "unsupported";

export interface DeclaredCommandCardRedistributionResult
  extends CommandCardRedistributionResult {
  commandStarsBefore: number;
  commandStarsAfter: number;
  nextCommandStarsBefore: number;
  nextCommandStarsAfter: number;
  starDistribution: ResolvedCommandStarDistribution | null;
}

export interface DeclaredActionEffectResult {
  effectStableId: string;
  order: number;
  outcome: DeclaredActionEffectOutcome;
  targetInstanceIds: string[];
  resolvedAmount?: number;
  batch?: CommonActionBatchResult;
  starAddition?: BattleStarAddition;
  commandCardRedistribution?: DeclaredCommandCardRedistributionResult;
  unsupportedMechanicId?: string;
}

export interface DeclaredActionEffectsResult {
  state: BattleState;
  counters: EffectRuntimeCounters;
  sourceInstanceId: string;
  effects: DeclaredActionEffectResult[];
  unresolvedEffectStableIds: string[];
}

export type DeclaredActionEffectPhase =
  | "before_attack"
  | "after_attack"
  | "non_damaging";

export interface DeclaredActionEffectGroupResult {
  phase: DeclaredActionEffectPhase;
  result: DeclaredActionEffectsResult;
}

export type DeclaredActionTargetSelectionIssue =
  | "selected_target_required"
  | "selected_target_invalid";

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

/**
 * Validates the one runtime-selected target shared by a declared action.
 * The check is performed before cooldown, NP/charge, state, or RNG changes.
 */
export function declaredActionTargetSelectionIssue(
  state: BattleState,
  sourceInstanceId: string,
  effects: readonly DeclaredActionEffect[],
  selectedTargetInstanceId?: string,
): DeclaredActionTargetSelectionIssue | null {
  const selectedEffects = effects.filter(
    ({ target }) =>
      target.relation !== "self"
      && target.selection === "single",
  );
  if (selectedEffects.length === 0) return null;
  if (!selectedTargetInstanceId) {
    return "selected_target_required";
  }
  const everyTargetIsValid = selectedEffects.every((effect) =>
    resolveTargetLocations(
      state.formation,
      sourceInstanceId,
      {
        ...effect.target,
        selectedInstanceId: selectedTargetInstanceId,
      },
    ).length === 1
  );
  return everyTargetIsValid ? null : "selected_target_invalid";
}

/** Validates a selected target for an external source on one battle side. */
export function externalDeclaredActionTargetSelectionIssue(
  state: BattleState,
  sourceSide: BattleSide,
  effects: readonly DeclaredActionEffect[],
  selectedTargetInstanceId?: string,
): DeclaredActionTargetSelectionIssue | null {
  const selectedEffects = effects.filter(
    ({ target }) =>
      target.relation !== "self"
      && target.selection === "single",
  );
  if (selectedEffects.length === 0) return null;
  if (!selectedTargetInstanceId) return "selected_target_required";
  const everyTargetIsValid = selectedEffects.every((effect) =>
    resolveTargetLocationsFromSide(
      state.formation,
      sourceSide,
      {
        ...effect.target,
        selectedInstanceId: selectedTargetInstanceId,
      },
    ).length === 1
  );
  return everyTargetIsValid ? null : "selected_target_invalid";
}

export function declaredActionEffectsStopAttackHits(
  result: DeclaredActionEffectsResult,
): boolean {
  return result.effects.some(({ batch }) =>
    batch?.results.some(
      ({ instantDeathResult }) =>
        instantDeathResult?.skipAttackHits === true,
    ) === true
  );
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

type PreparedDeclaredAction =
  | {
      kind: "common";
      action: CommonAction;
      resolvedAmount?: number;
    }
  | {
      kind: "gain_stars";
      amount: number;
      destination: BattleStarBucket;
      resolvedAmount: number;
    }
  | {
      kind: "redistribute_command_cards";
    };

function preparedAction(
  effect: DeclaredActionEffect,
  context: DeclaredActionExecutionContext,
): PreparedDeclaredAction | null {
  if (effect.action.kind === "unsupported") return null;
  if (effect.action.kind === "change_np") {
    const amount = resolveDeclaredActionInteger(
      effect.action.amount,
      context,
    );
    return {
      kind: "common",
      action: { kind: "change_np", amount },
      resolvedAmount: amount,
    };
  }
  if (effect.action.kind === "gain_stars") {
    const amount = resolveDeclaredActionInteger(
      effect.action.amount,
      context,
    );
    return {
      kind: "gain_stars",
      amount,
      destination: effect.action.destination,
      resolvedAmount: amount,
    };
  }
  if (effect.action.kind === "redistribute_command_cards") {
    return { kind: "redistribute_command_cards" };
  }
  return { kind: "common", action: effect.action };
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
  let redistributionIndex = 0;

  for (const effect of [...effects].sort((left, right) => left.order - right.order)) {
    const prepared = preparedAction(effect, context);
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
    if (prepared.kind === "redistribute_command_cards") {
      const redistribution =
        context.preparedCommandCardRedistributions?.[redistributionIndex];
      redistributionIndex += 1;
      if (!redistribution) {
        throw new RangeError(
          "prepared command-card redistribution is missing",
        );
      }
      currentState = {
        ...currentState,
        commandDeck: redistribution.deck,
        commandStarDistributionMode: "input_boundary_persisted",
        commandStarDistribution: null,
      };
      results.push({
        effectStableId: effect.stableId,
        order: effect.order,
        outcome: "resolved",
        targetInstanceIds: [],
        commandCardRedistribution: {
          ...redistribution,
          commandStarsBefore: currentState.commandStars,
          commandStarsAfter: currentState.commandStars,
          nextCommandStarsBefore: currentState.nextCommandStars,
          nextCommandStarsAfter: currentState.nextCommandStars,
          starDistribution: null,
        },
      });
      continue;
    }
    const targetLocations = resolveTargetLocations(
      currentState.formation,
      sourceInstanceId,
      runtimeSelector(effect, context),
    );
    if (prepared.kind === "gain_stars") {
      if (targetLocations.length === 0) {
        results.push({
          effectStableId: effect.stableId,
          order: effect.order,
          outcome: "no_target",
          targetInstanceIds: [],
          resolvedAmount: prepared.resolvedAmount,
        });
        continue;
      }
      const addition =
        prepared.destination === "command"
          ? addCommandStars(currentState, prepared.amount)
          : addNextCommandStars(currentState, prepared.amount);
      currentState = addition.state;
      results.push({
        effectStableId: effect.stableId,
        order: effect.order,
        outcome: "resolved",
        targetInstanceIds: targetLocations.map(
          ({ unit }) => unit.instanceId,
        ),
        resolvedAmount: prepared.resolvedAmount,
        starAddition: addition,
      });
      continue;
    }
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

/**
 * Executes source-ordered declarative effects from a non-unit source. Mystic
 * Codes use the ally side for target relations and do not inherit a Servant's
 * outgoing recovery or application modifiers.
 */
export function executeExternalDeclaredActionEffects(
  state: BattleState,
  sourceSide: BattleSide,
  sourceStableId: string,
  effects: readonly DeclaredActionEffect[],
  context: DeclaredActionExecutionContext,
  counters: EffectRuntimeCounters,
  rng: DeterministicRng,
): DeclaredActionEffectsResult {
  let currentState = state;
  let currentCounters = counters;
  const results: DeclaredActionEffectResult[] = [];
  const unresolvedEffectStableIds: string[] = [];
  let redistributionIndex = 0;

  for (const effect of [...effects].sort((left, right) => left.order - right.order)) {
    const prepared = preparedAction(effect, context);
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
    if (prepared.kind === "redistribute_command_cards") {
      const redistribution =
        context.preparedCommandCardRedistributions?.[redistributionIndex];
      redistributionIndex += 1;
      if (!redistribution) {
        throw new RangeError(
          "prepared command-card redistribution is missing",
        );
      }
      currentState = {
        ...currentState,
        commandDeck: redistribution.deck,
        commandStarDistributionMode: "input_boundary_persisted",
        commandStarDistribution: null,
      };
      results.push({
        effectStableId: effect.stableId,
        order: effect.order,
        outcome: "resolved",
        targetInstanceIds: [],
        commandCardRedistribution: {
          ...redistribution,
          commandStarsBefore: currentState.commandStars,
          commandStarsAfter: currentState.commandStars,
          nextCommandStarsBefore: currentState.nextCommandStars,
          nextCommandStarsAfter: currentState.nextCommandStars,
          starDistribution: null,
        },
      });
      continue;
    }
    const selector = runtimeSelector(effect, context);
    const targetLocations = resolveTargetLocationsFromSide(
      currentState.formation,
      sourceSide,
      selector,
    );
    if (prepared.kind === "gain_stars") {
      const targetExists = effect.target.relation === "self"
        || targetLocations.length > 0;
      if (!targetExists) {
        results.push({
          effectStableId: effect.stableId,
          order: effect.order,
          outcome: "no_target",
          targetInstanceIds: [],
          resolvedAmount: prepared.resolvedAmount,
        });
        continue;
      }
      const addition = prepared.destination === "command"
        ? addCommandStars(currentState, prepared.amount)
        : addNextCommandStars(currentState, prepared.amount);
      currentState = addition.state;
      results.push({
        effectStableId: effect.stableId,
        order: effect.order,
        outcome: "resolved",
        targetInstanceIds: targetLocations.map(({ unit }) => unit.instanceId),
        resolvedAmount: prepared.resolvedAmount,
        starAddition: addition,
      });
      continue;
    }
    const targets = targetLocations.length > 0
      ? targetLocations.map(({ unit }) => unit)
      : [null];
    const batch = executeCommonActionForTargets(
      null,
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
      outcome: targetLocations.length === 0 ? "no_target" : "resolved",
      targetInstanceIds: targetLocations.map(({ unit }) => unit.instanceId),
      ...(prepared.resolvedAmount === undefined
        ? {}
        : { resolvedAmount: prepared.resolvedAmount }),
      batch,
    });
  }
  return {
    state: currentState,
    counters: currentCounters,
    sourceInstanceId: sourceStableId,
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
