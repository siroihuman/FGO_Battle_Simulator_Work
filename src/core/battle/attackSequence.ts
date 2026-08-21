import {
  type AttackRngStreams,
} from "./attack";
import {
  resolveBattleAttack,
  type BattleAttackResolution,
  type ResolveBattleAttackInput,
} from "./battleAttack";
import {
  findUnitLocation,
  orderedLocations,
} from "./formation";
import type { BattleState } from "./state";
import type {
  BattleSide,
} from "./types";
import {
  resolveTriggerEvent,
  type TriggerEventResolutionResult,
} from "../../effects/triggerExecution";
import type {
  EffectRuntimeCounters,
  TriggerAttackCardType,
  TriggerAttackKind,
  TriggerEvent,
} from "../../effects/types";

export interface BattleAttackTriggerContext {
  attackKind: TriggerAttackKind;
  cardType: TriggerAttackCardType;
}

export type PreparedBattleAttackInput = Omit<
  ResolveBattleAttackInput,
  | "sourceInstanceId"
  | "rng"
  | "afterHitBatch"
  | "allowDefeatedTargets"
>;

export interface ResolveBattleAttackSequenceInput {
  sourceInstanceId: string | null;
  targetInstanceIds: readonly string[];
  /** Allows a retained defeated target during a same-owner normal-card run. */
  allowDefeatedTargets?: boolean;
  triggerContext: BattleAttackTriggerContext;
  rng: AttackRngStreams;
  /** Runs after the common before_attack trigger and before Hit calculation. */
  beforeDamage?: BattleAttackSequenceLifecycleHook;
  /** Runs after the common after_attack trigger and before on_death triggers. */
  afterAttackEffects?: BattleAttackSequenceLifecycleHook;
  /**
   * Runs after before-attack effects. This lets the data-input layer rebuild
   * numeric modifiers from the updated source and targets without consuming
   * randomness.
   */
  prepareAttack: (
    state: BattleState,
    activeTargetInstanceIds: readonly string[],
  ) => PreparedBattleAttackInput;
}

export interface BattleAttackSequenceLifecycleHookInput {
  state: BattleState;
  counters: EffectRuntimeCounters;
  sourceInstanceId: string | null;
  targetInstanceIds: readonly string[];
}

export interface BattleAttackSequenceLifecycleHookResult {
  state: BattleState;
  counters: EffectRuntimeCounters;
  /** Used by a successful before-damage instant death, even when Guts revives. */
  stopAttackHits?: boolean;
}

export type BattleAttackSequenceLifecycleHook = (
  input: BattleAttackSequenceLifecycleHookInput,
) => BattleAttackSequenceLifecycleHookResult;

export interface BattleAttackSequenceResolution {
  state: BattleState;
  counters: EffectRuntimeCounters;
  stoppedBeforeHits: boolean;
  beforeAttack: TriggerEventResolutionResult | null;
  attack: BattleAttackResolution | null;
  hitTriggers: TriggerEventResolutionResult[];
  onAttack: TriggerEventResolutionResult | null;
  damageTaken: TriggerEventResolutionResult[];
  afterAttack: TriggerEventResolutionResult | null;
  deaths: TriggerEventResolutionResult[];
}

interface TriggerStageResolution {
  state: BattleState;
  counters: EffectRuntimeCounters;
  trigger: TriggerEventResolutionResult;
}

interface AttackParticipants {
  sourceSide: BattleSide | undefined;
  targetSide: BattleSide;
  orderedTargetInstanceIds: string[];
  initialAliveInstanceIds: Set<string>;
}

function assertAttackPhase(state: BattleState): void {
  if (
    state.outcome !== "ongoing"
    || (
      state.phase !== "ally_action"
      && state.phase !== "enemy_action"
    )
  ) {
    throw new RangeError(
      "attack trigger sequences require an ongoing action phase",
    );
  }
}

function validateParticipants(
  state: BattleState,
  sourceInstanceId: string | null,
  targetInstanceIds: readonly string[],
  allowDefeatedTargets = false,
): AttackParticipants {
  assertAttackPhase(state);
  if (targetInstanceIds.length === 0) {
    throw new RangeError(
      "attack trigger sequence targets must not be empty",
    );
  }
  if (new Set(targetInstanceIds).size !== targetInstanceIds.length) {
    throw new RangeError(
      "attack trigger sequence targets must be unique",
    );
  }
  const sourceLocation =
    sourceInstanceId === null
      ? undefined
      : findUnitLocation(
          state.formation,
          sourceInstanceId,
        );
  if (sourceInstanceId !== null && !sourceLocation) {
    throw new RangeError(
      `attack source is not in formation: ${sourceInstanceId}`,
    );
  }
  if (sourceLocation && !sourceLocation.unit.alive) {
    throw new RangeError(
      `attack source is defeated: ${sourceInstanceId}`,
    );
  }

  const targets = targetInstanceIds.map((instanceId) => {
    const location = findUnitLocation(
      state.formation,
      instanceId,
    );
    if (!location) {
      throw new RangeError(
        `attack target is not in formation: ${instanceId}`,
      );
    }
    if (!allowDefeatedTargets && !location.unit.alive) {
      throw new RangeError(
        `attack target is defeated: ${instanceId}`,
      );
    }
    return location;
  });
  const targetSide = targets[0].side;
  if (targets.some(({ side }) => side !== targetSide)) {
    throw new RangeError(
      "one attack trigger sequence cannot mix target sides",
    );
  }
  if (sourceLocation?.side === targetSide) {
    throw new RangeError(
      "attack trigger sequences must target the opposing side",
    );
  }
  const requestedIds = new Set(targetInstanceIds);
  const orderedTargetInstanceIds = orderedLocations(
    state.formation,
    targetSide,
    true,
  )
    .map(({ unit }) => unit.instanceId)
    .filter((instanceId) => requestedIds.has(instanceId));
  return {
    sourceSide: sourceLocation?.side,
    targetSide,
    orderedTargetInstanceIds,
    initialAliveInstanceIds: new Set(
      (["ally", "enemy"] as const).flatMap((side) =>
        orderedLocations(state.formation, side, true)
          .filter(({ unit }) => unit.alive)
          .map(({ unit }) => unit.instanceId)
      ),
    ),
  };
}

function eventForAttack(
  timing: TriggerEvent["timing"],
  sourceInstanceId: string | null,
  sourceSide: BattleSide | undefined,
  targetInstanceIds: readonly string[],
  targetSide: BattleSide,
  triggerContext: BattleAttackTriggerContext,
  summary?: {
    hit: boolean;
    damage: number;
  },
): TriggerEvent {
  const targetInstanceId = targetInstanceIds[0];
  return {
    timing,
    ...(sourceInstanceId === null
      ? {}
      : {
          actorInstanceId: sourceInstanceId,
          actorSide: sourceSide,
        }),
    targetInstanceId,
    targetInstanceIds: [...targetInstanceIds],
    targetSide,
    attackKind: triggerContext.attackKind,
    cardType: triggerContext.cardType,
    ...(summary ?? {}),
  };
}

function resolveOwnerTrigger(
  state: BattleState,
  ownerInstanceId: string,
  event: TriggerEvent,
  counters: EffectRuntimeCounters,
  rng: AttackRngStreams["effects"],
): TriggerStageResolution {
  const owner = findUnitLocation(
    state.formation,
    ownerInstanceId,
  );
  const trigger = resolveTriggerEvent(
    state,
    owner ? [owner] : [],
    event,
    counters,
    rng,
  );
  return {
    state: trigger.state,
    counters: trigger.counters,
    trigger,
  };
}

function triggerStopsAttackHits(
  trigger: TriggerEventResolutionResult | null,
): boolean {
  return Boolean(
    trigger?.activations.some(({ actions }) =>
      actions.some(({ batch }) =>
        batch.results.some(
          ({ instantDeathResult }) =>
            instantDeathResult?.skipAttackHits === true,
        )
      )
    ),
  );
}

function assertPreparedTargets(
  input: PreparedBattleAttackInput,
  activeTargetInstanceIds: readonly string[],
): void {
  const preparedIds = input.targets.map(
    ({ targetInstanceId }) => targetInstanceId,
  );
  if (
    preparedIds.length !== activeTargetInstanceIds.length
    || preparedIds.some(
      (instanceId, index) =>
        instanceId !== activeTargetInstanceIds[index],
    )
  ) {
    throw new RangeError(
      "prepared attack targets must match active target IDs",
    );
  }
}

function locationsForDeathOrder(
  state: BattleState,
  sourceInstanceId: string | null,
  targetInstanceIds: readonly string[],
): string[] {
  const ordered = [
    ...targetInstanceIds,
    ...(sourceInstanceId === null
      ? []
      : [sourceInstanceId]),
    ...orderedLocations(state.formation, "ally", true)
      .map(({ unit }) => unit.instanceId),
    ...orderedLocations(state.formation, "enemy", true)
      .map(({ unit }) => unit.instanceId),
  ];
  return [...new Set(ordered)];
}

function resolveNewDeaths(
  state: BattleState,
  counters: EffectRuntimeCounters,
  rng: AttackRngStreams["effects"],
  sourceInstanceId: string | null,
  targetInstanceIds: readonly string[],
  initiallyAliveInstanceIds: ReadonlySet<string>,
  triggerContext: BattleAttackTriggerContext,
): {
  state: BattleState;
  counters: EffectRuntimeCounters;
  deaths: TriggerEventResolutionResult[];
} {
  let currentState = state;
  let currentCounters = counters;
  const deaths: TriggerEventResolutionResult[] = [];
  const processed = new Set<string>();

  while (true) {
    const nextInstanceId = locationsForDeathOrder(
      currentState,
      sourceInstanceId,
      targetInstanceIds,
    ).find((instanceId) => {
      if (
        processed.has(instanceId)
        || !initiallyAliveInstanceIds.has(instanceId)
      ) {
        return false;
      }
      const location = findUnitLocation(
        currentState.formation,
        instanceId,
      );
      return location?.unit.alive === false;
    });
    if (!nextInstanceId) break;
    processed.add(nextInstanceId);
    const owner = findUnitLocation(
      currentState.formation,
      nextInstanceId,
    );
    if (!owner) continue;
    const resolved = resolveOwnerTrigger(
      currentState,
      nextInstanceId,
      {
        timing: "on_death",
        actorInstanceId: nextInstanceId,
        actorSide: owner.side,
        targetInstanceId: nextInstanceId,
        targetSide: owner.side,
        attackKind: triggerContext.attackKind,
        cardType: triggerContext.cardType,
      },
      currentCounters,
      rng,
    );
    currentState = resolved.state;
    currentCounters = resolved.counters;
    deaths.push(resolved.trigger);
  }
  return {
    state: currentState,
    counters: currentCounters,
    deaths,
  };
}

function activeTargets(
  state: BattleState,
  targetInstanceIds: readonly string[],
  allowDefeatedTargets = false,
): string[] {
  return targetInstanceIds.filter(
    (instanceId) => {
      const location = findUnitLocation(
        state.formation,
        instanceId,
      );
      return Boolean(
        location
        && (location.unit.alive || allowDefeatedTargets),
      );
    },
  );
}

/**
 * Resolves one damaging action from pre-attack triggers through Hit-scoped
 * source triggers, post-damage source/target triggers, after-attack triggers,
 * and cascading on-death triggers. Formation departure and replacement remain
 * at the completed-action boundary owned by the turn coordinators.
 */
export function resolveBattleAttackSequence(
  state: BattleState,
  input: ResolveBattleAttackSequenceInput,
  counters: EffectRuntimeCounters,
): BattleAttackSequenceResolution {
  const participants = validateParticipants(
    state,
    input.sourceInstanceId,
    input.targetInstanceIds,
    input.allowDefeatedTargets,
  );
  const targetInstanceIds =
    participants.orderedTargetInstanceIds;
  let currentState = state;
  let currentCounters = counters;
  let beforeAttack: TriggerEventResolutionResult | null = null;

  if (input.sourceInstanceId !== null) {
    const before = resolveOwnerTrigger(
      currentState,
      input.sourceInstanceId,
      eventForAttack(
        "before_attack",
        input.sourceInstanceId,
        participants.sourceSide,
        targetInstanceIds,
        participants.targetSide,
        input.triggerContext,
      ),
      currentCounters,
      input.rng.effects,
    );
    currentState = before.state;
    currentCounters = before.counters;
    beforeAttack = before.trigger;
  }

  let lifecycleStoppedHits = false;
  if (input.beforeDamage) {
    const resolved = input.beforeDamage({
      state: currentState,
      counters: currentCounters,
      sourceInstanceId: input.sourceInstanceId,
      targetInstanceIds,
    });
    assertAttackPhase(resolved.state);
    currentState = resolved.state;
    currentCounters = resolved.counters;
    lifecycleStoppedHits = resolved.stopAttackHits === true;
  }

  const activeTargetInstanceIds = activeTargets(
    currentState,
    targetInstanceIds,
    input.allowDefeatedTargets,
  );
  const sourceCanContinue =
    input.sourceInstanceId === null
    || findUnitLocation(
      currentState.formation,
      input.sourceInstanceId,
    )?.unit.alive === true;
  const stoppedBeforeHits =
    triggerStopsAttackHits(beforeAttack)
    || lifecycleStoppedHits
    || !sourceCanContinue
    || activeTargetInstanceIds.length === 0;
  const hitTriggers: TriggerEventResolutionResult[] = [];
  let attack: BattleAttackResolution | null = null;
  let onAttack: TriggerEventResolutionResult | null = null;
  const damageTaken: TriggerEventResolutionResult[] = [];

  if (!stoppedBeforeHits) {
    const prepared = input.prepareAttack(
      currentState,
      activeTargetInstanceIds,
    );
    assertPreparedTargets(
      prepared,
      activeTargetInstanceIds,
    );
    attack = resolveBattleAttack(currentState, {
      ...prepared,
      sourceInstanceId: input.sourceInstanceId,
      allowDefeatedTargets: input.allowDefeatedTargets,
      rng: input.rng,
      afterHitBatch: ({
        state: hitState,
        hitNumber,
        hits,
      }) => {
        if (input.sourceInstanceId === null) {
          return { state: hitState };
        }
        const summary = {
          hit: hits.some(
            ({ countsAsSuccessfulHit }) =>
              countsAsSuccessfulHit,
          ),
          damage: hits.reduce(
            (total, hit) =>
              total + hit.actualHpLoss,
            0,
          ),
        };
        const resolved = resolveOwnerTrigger(
          hitState,
          input.sourceInstanceId,
          eventForAttack(
            "on_hit",
            input.sourceInstanceId,
            participants.sourceSide,
            activeTargetInstanceIds,
            participants.targetSide,
            input.triggerContext,
            summary,
          ),
          currentCounters,
          input.rng.effects,
        );
        currentCounters = resolved.counters;
        hitTriggers.push(resolved.trigger);
        return {
          state: resolved.state,
          detail: {
            hitNumber,
            trigger: resolved.trigger,
          },
        };
      },
    });
    currentState = attack.state;

    if (input.sourceInstanceId !== null) {
      const summary = {
        hit: attack.attack.hits.some(
          ({ countsAsSuccessfulHit }) =>
            countsAsSuccessfulHit,
        ),
        damage: attack.attack.hits.reduce(
          (total, hit) =>
            total + hit.actualHpLoss,
          0,
        ),
      };
      const resolved = resolveOwnerTrigger(
        currentState,
        input.sourceInstanceId,
        eventForAttack(
          "on_attack",
          input.sourceInstanceId,
          participants.sourceSide,
          activeTargetInstanceIds,
          participants.targetSide,
          input.triggerContext,
          summary,
        ),
        currentCounters,
        input.rng.effects,
      );
      currentState = resolved.state;
      currentCounters = resolved.counters;
      onAttack = resolved.trigger;
    }

    for (const target of attack.attack.targets) {
      const hits = attack.attack.hits.filter(
        ({ targetInstanceId }) =>
          targetInstanceId
          === target.targetInstanceId,
      );
      const resolved = resolveOwnerTrigger(
        currentState,
        target.targetInstanceId,
        eventForAttack(
          "on_damage_taken",
          input.sourceInstanceId,
          participants.sourceSide,
          [target.targetInstanceId],
          participants.targetSide,
          input.triggerContext,
          {
            hit: hits.some(
              ({ countsAsSuccessfulHit }) =>
                countsAsSuccessfulHit,
            ),
            damage: hits.reduce(
              (total, hit) =>
                total + hit.actualHpLoss,
              0,
            ),
          },
        ),
        currentCounters,
        input.rng.effects,
      );
      currentState = resolved.state;
      currentCounters = resolved.counters;
      damageTaken.push(resolved.trigger);
    }
  }

  let afterAttack: TriggerEventResolutionResult | null = null;
  if (input.sourceInstanceId !== null) {
    const resolved = resolveOwnerTrigger(
      currentState,
      input.sourceInstanceId,
      eventForAttack(
        "after_attack",
        input.sourceInstanceId,
        participants.sourceSide,
        targetInstanceIds,
        participants.targetSide,
        input.triggerContext,
      ),
      currentCounters,
      input.rng.effects,
    );
    currentState = resolved.state;
    currentCounters = resolved.counters;
    afterAttack = resolved.trigger;
  }

  if (input.afterAttackEffects) {
    const resolved = input.afterAttackEffects({
      state: currentState,
      counters: currentCounters,
      sourceInstanceId: input.sourceInstanceId,
      targetInstanceIds,
    });
    assertAttackPhase(resolved.state);
    currentState = resolved.state;
    currentCounters = resolved.counters;
  }

  const deathResolution = resolveNewDeaths(
    currentState,
    currentCounters,
    input.rng.effects,
    input.sourceInstanceId,
    targetInstanceIds,
    participants.initialAliveInstanceIds,
    input.triggerContext,
  );

  return {
    state: deathResolution.state,
    counters: deathResolution.counters,
    stoppedBeforeHits,
    beforeAttack,
    attack,
    hitTriggers,
    onAttack,
    damageTaken,
    afterAttack,
    deaths: deathResolution.deaths,
  };
}
