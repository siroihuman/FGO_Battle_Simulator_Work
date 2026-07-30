import type { DeterministicRng } from "../rng";
import { rebuildCommandCardDeck } from "../cards/deck";
import {
  advanceSideTurnEndDurations,
  createSideTurnEndSnapshot,
  resolveSideTurnEnd,
  type SideTurnEndDurationResult,
  type SideTurnEndResult,
} from "../../effects/turnEnd";
import {
  resolveTriggerEvent,
  type TriggerEventResolutionResult,
} from "../../effects/triggerExecution";
import type { EffectRuntimeCounters } from "../../effects/types";
import {
  resolvePendingEnemyBreaks,
  type PendingBreakResolutionResult,
} from "./break";
import {
  advanceAllyCooldowns,
  advanceEnemyCooldowns,
  type SideCooldownResult,
} from "./cooldowns";
import { findUnitLocation } from "./formation";
import {
  completeAllyTurnEnd,
  completeEnemyTurnEnd,
} from "./progression";
import {
  resolveAllyDefeatReplacement,
  resolveEnemyReplacement,
  type AllyDefeatReplacementResult,
  type EnemyReplacementResult,
} from "./replacement";
import {
  setBattleFormation,
  type BattleState,
} from "./state";

export interface AllyTurnEndResolution {
  state: BattleState;
  counters: EffectRuntimeCounters;
  breaks: PendingBreakResolutionResult;
  breakTriggers: TriggerEventResolutionResult[];
  breakEnemyReplacements: EnemyReplacementResult[];
  recurring: SideTurnEndResult;
  recurringEnemyReplacement: EnemyReplacementResult;
  allyReplacement: AllyDefeatReplacementResult;
  durations: SideTurnEndDurationResult;
  cooldowns: SideCooldownResult;
}

export interface EnemyTurnEndResolution {
  state: BattleState;
  counters: EffectRuntimeCounters;
  recurring: SideTurnEndResult;
  allyReplacement: AllyDefeatReplacementResult;
  defeatedEnemyDeparture: EnemyReplacementResult;
  durations: SideTurnEndDurationResult;
  cooldowns: SideCooldownResult;
  standardReplacement: EnemyReplacementResult;
}

function applyFormation(
  state: BattleState,
  formation: BattleState["formation"],
): BattleState {
  return formation === state.formation
    ? state
    : setBattleFormation(state, formation);
}

function applyAllyDepartureDeckRebuild(
  state: BattleState,
  replacement: AllyDefeatReplacementResult,
): BattleState {
  if (!replacement.cardDeckRebuildRequired) return state;
  return {
    ...state,
    commandDeck: rebuildCommandCardDeck(
      state.commandDeck,
      state.formation.ally,
      "ally_departure",
    ),
  };
}

function assertCoordinatorPhase(
  state: BattleState,
  expected: "ally_turn_end" | "enemy_turn_end",
): void {
  if (state.outcome !== "ongoing" || state.phase === "finished") {
    throw new RangeError("finished battles cannot resolve turn end");
  }
  if (state.phase !== expected) {
    throw new RangeError(
      `turn-end coordinator requires ${expected}, received ${state.phase}`,
    );
  }
}

/**
 * Resolves the ordered ally-turn-end stages that already have common engines:
 * break settlement and on-break actions, ally recurring effects, enemy safe
 * departure/immediate replacement, ally auto replacement, duration ticks,
 * frontline/Mystic Code cooldowns, then the Wave/result checkpoint.
 */
export function resolveAllyTurnEnd(
  state: BattleState,
  counters: EffectRuntimeCounters,
  rng: DeterministicRng,
): AllyTurnEndResolution {
  assertCoordinatorPhase(state, "ally_turn_end");
  const snapshot = createSideTurnEndSnapshot(
    state.formation,
    "ally",
  );
  const breaks = resolvePendingEnemyBreaks(state);
  let currentState = breaks.state;
  let currentCounters = counters;
  const breakTriggers: TriggerEventResolutionResult[] = [];
  const breakEnemyReplacements: EnemyReplacementResult[] = [];

  for (const event of breaks.events) {
    const owner = findUnitLocation(
      currentState.formation,
      event.instanceId,
    );
    const trigger = resolveTriggerEvent(
      currentState.formation,
      owner ? [owner] : [],
      event.triggerEvent,
      currentCounters,
      rng,
    );
    currentCounters = trigger.counters;
    currentState = applyFormation(currentState, trigger.formation);
    breakTriggers.push(trigger);

    const replacement = resolveEnemyReplacement(
      currentState,
      "after_action",
    );
    currentState = replacement.state;
    breakEnemyReplacements.push(replacement);
  }

  const recurring = resolveSideTurnEnd(
    currentState.formation,
    "ally",
    currentCounters,
    rng,
    {
      snapshot,
      advanceDurations: false,
    },
  );
  currentCounters = recurring.counters;
  currentState = applyFormation(currentState, recurring.formation);

  const recurringEnemyReplacement = resolveEnemyReplacement(
    currentState,
    "after_action",
  );
  currentState = recurringEnemyReplacement.state;

  const allyReplacement = resolveAllyDefeatReplacement(currentState);
  currentState = allyReplacement.state;
  currentState = applyAllyDepartureDeckRebuild(
    currentState,
    allyReplacement,
  );

  const durations = advanceSideTurnEndDurations(
    currentState.formation,
    "ally",
    snapshot,
  );
  currentState = applyFormation(currentState, durations.formation);

  const cooldowns = advanceAllyCooldowns(currentState);
  currentState = completeAllyTurnEnd(cooldowns.state);

  return {
    state: currentState,
    counters: currentCounters,
    breaks,
    breakTriggers,
    breakEnemyReplacements,
    recurring,
    recurringEnemyReplacement,
    allyReplacement,
    durations,
    cooldowns,
  };
}

/**
 * Resolves enemy recurring effects, ally auto replacement, defeated enemy
 * departure, duration/cooldown ticks, standard replacement, then the
 * Wave/result checkpoint.
 */
export function resolveEnemyTurnEnd(
  state: BattleState,
  counters: EffectRuntimeCounters,
  rng: DeterministicRng,
): EnemyTurnEndResolution {
  assertCoordinatorPhase(state, "enemy_turn_end");
  const snapshot = createSideTurnEndSnapshot(
    state.formation,
    "enemy",
  );
  const recurring = resolveSideTurnEnd(
    state.formation,
    "enemy",
    counters,
    rng,
    {
      snapshot,
      advanceDurations: false,
    },
  );
  let currentState = applyFormation(state, recurring.formation);

  const allyReplacement = resolveAllyDefeatReplacement(currentState);
  currentState = allyReplacement.state;
  currentState = applyAllyDepartureDeckRebuild(
    currentState,
    allyReplacement,
  );

  const defeatedEnemyDeparture = resolveEnemyReplacement(
    currentState,
    "after_action",
  );
  currentState = defeatedEnemyDeparture.state;

  const durations = advanceSideTurnEndDurations(
    currentState.formation,
    "enemy",
    snapshot,
  );
  currentState = applyFormation(currentState, durations.formation);

  const cooldowns = advanceEnemyCooldowns(currentState);
  currentState = cooldowns.state;

  const standardReplacement = resolveEnemyReplacement(
    currentState,
    "enemy_turn_end",
  );
  currentState = completeEnemyTurnEnd(standardReplacement.state);

  return {
    state: currentState,
    counters: recurring.counters,
    recurring,
    allyReplacement,
    defeatedEnemyDeparture,
    durations,
    cooldowns,
    standardReplacement,
  };
}
