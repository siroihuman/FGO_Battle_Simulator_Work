import {
  setBattleFormation,
  type BattleState,
} from "./state";
import { rebuildCommandCardDeck } from "../cards/deck";
import type {
  BattleFormation,
  BattleUnitState,
  SideFormation,
} from "./types";

export interface AllyDefeatReplacementEvent {
  frontlineIndex: number;
  defeatedInstanceId: string;
  replacementInstanceId: string | null;
  replacementReserveIndex: number | null;
}

export interface AllyDefeatReplacementResult {
  state: BattleState;
  events: AllyDefeatReplacementEvent[];
  /**
   * Ally departure rebuilds the next command-card distribution.
   */
  cardDeckRebuildRequired: boolean;
}

/**
 * Rebuilds only the next command-card distribution after an ally departure.
 * The five cards currently being resolved remain unchanged.
 */
export function applyAllyDepartureDeckRebuild(
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

export type EnemyReplacementBoundary =
  | "after_action"
  | "enemy_turn_end";

export interface EnemyDepartureEvent {
  area: "frontline" | "reserve";
  index: number;
  instanceId: string;
}

export interface EnemyArrivalEvent {
  frontlineIndex: number;
  reserveIndexBefore: number;
  instanceId: string;
}

export interface EnemyReplacementResult {
  state: BattleState;
  departures: EnemyDepartureEvent[];
  arrivals: EnemyArrivalEvent[];
  /**
   * Standard replacement keeps living reserves queued until enemy turn end.
   */
  replacementDeferred: boolean;
}

interface AllyFormationReplacementResult {
  ally: SideFormation;
  events: AllyDefeatReplacementEvent[];
}

function resolveAllyFormation(
  ally: SideFormation,
): AllyFormationReplacementResult {
  const frontline = [...ally.frontline];
  const reserve = [...ally.reserve];
  const events: AllyDefeatReplacementEvent[] = [];

  for (let frontlineIndex = 0; frontlineIndex < frontline.length; frontlineIndex += 1) {
    const defeated = frontline[frontlineIndex];
    if (!defeated || defeated.alive) continue;

    const replacementReserveIndex = reserve.findIndex(
      (candidate) => candidate.alive,
    );
    const replacement: BattleUnitState | null =
      replacementReserveIndex >= 0
        ? reserve.splice(replacementReserveIndex, 1)[0]
        : null;
    frontline[frontlineIndex] = replacement;
    reserve.push(defeated);
    events.push({
      frontlineIndex,
      defeatedInstanceId: defeated.instanceId,
      replacementInstanceId: replacement?.instanceId ?? null,
      replacementReserveIndex:
        replacementReserveIndex >= 0 ? replacementReserveIndex : null,
    });
  }

  return {
    ally: {
      frontline,
      reserve,
    },
    events,
  };
}

/**
 * Moves defeated frontline allies to the reserve tail in frontline-slot
 * order. Each vacated slot receives the first living reserve ally, while dead
 * reserves keep their relative order and are skipped.
 */
export function resolveAllyDefeatReplacement(
  state: BattleState,
): AllyDefeatReplacementResult {
  const resolved = resolveAllyFormation(state.formation.ally);
  if (resolved.events.length === 0) {
    return {
      state,
      events: [],
      cardDeckRebuildRequired: false,
    };
  }

  const formation: BattleFormation = {
    ...state.formation,
    ally: resolved.ally,
  };
  return {
    state: setBattleFormation(state, formation),
    events: resolved.events,
    cardDeckRebuildRequired: true,
  };
}

/**
 * Removes defeated enemies at a safe action boundary, then fills empty slots
 * when the configured replacement mode permits it. Standard replacement fills
 * only at enemy turn end; immediate replacement also fills after each action.
 */
export function resolveEnemyReplacement(
  state: BattleState,
  boundary: EnemyReplacementBoundary,
): EnemyReplacementResult {
  const frontline = [...state.formation.enemy.frontline];
  const reserve = state.formation.enemy.reserve.map((candidate, index) => ({
    candidate,
    originalIndex: index,
  }));
  const departures: EnemyDepartureEvent[] = [];

  for (let index = 0; index < frontline.length; index += 1) {
    const current = frontline[index];
    if (!current || current.alive) continue;
    departures.push({
      area: "frontline",
      index,
      instanceId: current.instanceId,
    });
    frontline[index] = null;
  }

  const livingReserve = reserve.filter(({ candidate, originalIndex }) => {
    if (candidate.alive) return true;
    departures.push({
      area: "reserve",
      index: originalIndex,
      instanceId: candidate.instanceId,
    });
    return false;
  });
  const mayFill =
    state.enemyReplacementMode === "immediate"
    || boundary === "enemy_turn_end";
  const arrivals: EnemyArrivalEvent[] = [];

  if (mayFill) {
    for (
      let frontlineIndex = 0;
      frontlineIndex < frontline.length && livingReserve.length > 0;
      frontlineIndex += 1
    ) {
      if (frontline[frontlineIndex] !== null) continue;
      const arrival = livingReserve.shift();
      if (!arrival) break;
      frontline[frontlineIndex] = arrival.candidate;
      arrivals.push({
        frontlineIndex,
        reserveIndexBefore: arrival.originalIndex,
        instanceId: arrival.candidate.instanceId,
      });
    }
  }

  const replacementDeferred =
    !mayFill
    && livingReserve.length > 0
    && frontline.some((current) => current === null);
  if (departures.length === 0 && arrivals.length === 0) {
    return {
      state,
      departures,
      arrivals,
      replacementDeferred,
    };
  }

  const formation: BattleFormation = {
    ...state.formation,
    enemy: {
      frontline,
      reserve: livingReserve.map(({ candidate }) => candidate),
    },
  };
  return {
    state: setBattleFormation(state, formation),
    departures,
    arrivals,
    replacementDeferred,
  };
}
