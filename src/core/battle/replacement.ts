import {
  setBattleFormation,
  type BattleState,
} from "./state";
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
   * Ally departure rebuilds the command-card deck. The card subsystem will
   * consume this signal when it is added.
   */
  cardDeckRebuildRequired: boolean;
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
