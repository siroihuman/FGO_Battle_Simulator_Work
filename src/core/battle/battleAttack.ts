import {
  resolveAttack,
  type AttackHitBatchContext,
  type AttackResolution,
  type AttackTargetInput,
  type ResolveAttackInput,
} from "./attack";
import {
  findUnitLocation,
  orderedLocations,
  replaceUnit,
} from "./formation";
import {
  setBattleFormation,
  type BattleState,
} from "./state";
import {
  addNextCommandStars,
  type BattleStarAddition,
} from "./starState";

export interface BattleAttackTargetInput
  extends Omit<AttackTargetInput, "target"> {
  targetInstanceId: string;
}

export interface ResolveBattleAttackInput
  extends Omit<
    ResolveAttackInput,
    "source" | "targets" | "afterHitBatch"
  > {
  sourceInstanceId: string | null;
  targets: readonly BattleAttackTargetInput[];
  /** Allows an explicitly retained defeated target for command-card overkill. */
  allowDefeatedTargets?: boolean;
  afterHitBatch?: BattleAttackHitBatchHook;
}

export interface BattleAttackHitBatchContext
  extends AttackHitBatchContext {
  state: BattleState;
}

export interface BattleAttackHitBatchHookResult {
  state: BattleState;
  detail?: unknown;
}

export type BattleAttackHitBatchHook = (
  context: BattleAttackHitBatchContext,
) => BattleAttackHitBatchHookResult;

export interface BattleAttackResolution {
  state: BattleState;
  attack: AttackResolution;
  updatedInstanceIds: string[];
  starAddition: BattleStarAddition;
  hitBatchDetails: unknown[];
}

function assertActionPhase(state: BattleState): void {
  if (
    state.outcome !== "ongoing"
    || (
      state.phase !== "ally_action"
      && state.phase !== "enemy_action"
    )
  ) {
    throw new RangeError(
      "battle attacks require an ongoing action phase",
    );
  }
}

function currentSource(
  state: BattleState,
  instanceId: string | null,
) {
  if (instanceId === null) return null;
  const location = findUnitLocation(state.formation, instanceId);
  if (!location) {
    throw new RangeError(
      `attack source is not in formation: ${instanceId}`,
    );
  }
  return location.unit;
}

function orderedTargetInputs(
  state: BattleState,
  inputs: readonly BattleAttackTargetInput[],
  allowDefeatedTargets = false,
): AttackTargetInput[] {
  if (inputs.length === 0) {
    throw new RangeError("battle attack targets must not be empty");
  }
  const indexed = inputs.map((input) => {
    const location = findUnitLocation(
      state.formation,
      input.targetInstanceId,
    );
    if (!location) {
      throw new RangeError(
        `attack target is not in formation: ${input.targetInstanceId}`,
      );
    }
    if (!allowDefeatedTargets && !location.unit.alive) {
      throw new RangeError(
        `attack target is defeated: ${input.targetInstanceId}`,
      );
    }
    return { input, location };
  });
  const targetSide = indexed[0].location.side;
  if (indexed.some(({ location }) => location.side !== targetSide)) {
    throw new RangeError(
      "one battle attack cannot mix ally and enemy targets",
    );
  }
  const order = new Map(
    orderedLocations(state.formation, targetSide, true)
      .map(({ unit }, index) => [unit.instanceId, index]),
  );
  return indexed
    .sort(
      (left, right) =>
        (order.get(left.location.unit.instanceId) ?? 0)
        - (order.get(right.location.unit.instanceId) ?? 0),
    )
    .map(({ input, location }) => {
      const {
        targetInstanceId: _targetInstanceId,
        ...calculation
      } = input;
      return {
        ...calculation,
        target: location.unit,
      };
    });
}

/**
 * Applies a resolved attack atomically to the formation and pending star
 * inventory. setBattleFormation also synchronizes newly pending break gauges.
 */
export function applyAttackResolutionToBattleState(
  state: BattleState,
  attack: AttackResolution,
  hitBatchDetails: readonly unknown[] = [],
): BattleAttackResolution {
  assertActionPhase(state);
  if (
    attack.generatedStars > 0
    && attack.source?.side !== "ally"
  ) {
    throw new RangeError(
      "only an ally attack can generate command stars",
    );
  }

  let formation = state.formation;
  const updatedInstanceIds: string[] = [];
  const applyUnit = (
    unit: NonNullable<AttackResolution["source"]>,
  ): void => {
    const location = findUnitLocation(formation, unit.instanceId);
    if (!location) {
      throw new RangeError(
        `resolved attack unit is not in formation: ${unit.instanceId}`,
      );
    }
    if (location.side !== unit.side) {
      throw new RangeError(
        `resolved attack unit changed side: ${unit.instanceId}`,
      );
    }
    formation = replaceUnit(formation, unit);
    updatedInstanceIds.push(unit.instanceId);
  };

  if (attack.source) applyUnit(attack.source);
  for (const target of attack.targets) {
    if (target.target.instanceId !== target.targetInstanceId) {
      throw new RangeError(
        `resolved attack target ID mismatch: ${target.targetInstanceId}`,
      );
    }
    applyUnit(target.target);
  }

  const withFormation = setBattleFormation(state, formation);
  const starAddition = addNextCommandStars(
    withFormation,
    attack.generatedStars,
  );
  return {
    state: starAddition.state,
    attack,
    updatedInstanceIds,
    starAddition,
    hitBatchDetails: [...hitBatchDetails],
  };
}

function applyTransientAttackUnits(
  state: BattleState,
  source: AttackHitBatchContext["source"],
  targets: AttackHitBatchContext["targets"],
): BattleState {
  let formation = state.formation;
  if (source) formation = replaceUnit(formation, source);
  for (const target of targets) {
    formation = replaceUnit(formation, target);
  }
  return setBattleFormation(state, formation);
}

function refreshedHitBatchUpdate(
  state: BattleState,
  context: AttackHitBatchContext,
) {
  const source =
    context.source === null
      ? null
      : findUnitLocation(
          state.formation,
          context.source.instanceId,
        )?.unit;
  if (context.source !== null && !source) {
    throw new RangeError(
      `after-Hit state removed attack source: ${context.source.instanceId}`,
    );
  }
  const targets = context.targets.map((target) => {
    const current = findUnitLocation(
      state.formation,
      target.instanceId,
    )?.unit;
    if (!current) {
      throw new RangeError(
        `after-Hit state removed attack target: ${target.instanceId}`,
      );
    }
    return current;
  });
  return {
    source: source ?? null,
    targets,
  };
}

/**
 * Resolves an attack from the current BattleState units and immediately
 * applies every updated unit plus generated stars back to the same state.
 */
export function resolveBattleAttack(
  state: BattleState,
  input: ResolveBattleAttackInput,
): BattleAttackResolution {
  assertActionPhase(state);
  const {
    sourceInstanceId,
    targets: targetInputs,
    allowDefeatedTargets = false,
    afterHitBatch,
    ...attackInput
  } = input;
  const source = currentSource(state, sourceInstanceId);
  const targets = orderedTargetInputs(
    state,
    targetInputs,
    allowDefeatedTargets,
  );
  if (
    source
    && targets.some(({ target }) => target.side === source.side)
  ) {
    throw new RangeError(
      "battle attacks must target the opposing side",
    );
  }
  if (
    targets.some(({ stars }) => stars !== undefined)
    && source?.side !== "ally"
  ) {
    throw new RangeError(
      "only an ally attack can request star generation",
    );
  }
  let currentState = state;
  const hitBatchDetails: unknown[] = [];
  const attack = resolveAttack({
    ...attackInput,
    source,
    targets,
    ...(afterHitBatch
      ? {
          afterHitBatch: (context: AttackHitBatchContext) => {
            currentState = applyTransientAttackUnits(
              currentState,
              context.source,
              context.targets,
            );
            const resolved = afterHitBatch({
              ...context,
              state: currentState,
            });
            assertActionPhase(resolved.state);
            currentState = resolved.state;
            hitBatchDetails.push(resolved.detail);
            return refreshedHitBatchUpdate(
              currentState,
              context,
            );
          },
        }
      : {}),
  });
  return applyAttackResolutionToBattleState(
    currentState,
    attack,
    hitBatchDetails,
  );
}
