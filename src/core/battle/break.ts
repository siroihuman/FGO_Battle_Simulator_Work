import { reconcileMaxHp } from "../../effects/maxHp";
import type { TriggerEvent } from "../../effects/types";
import {
  findUnitLocation,
  orderedLocations,
  replaceUnit,
} from "./formation";
import {
  setBattleFormation,
  type BattleState,
} from "./state";
import type { FormationArea } from "./types";

export interface BreakResolutionEvent {
  instanceId: string;
  area: FormationArea;
  index: number;
  brokenGaugeNumber: number;
  activatedGaugeNumber: number;
  baseMaxHp: number;
  maxHp: number;
  remainingGaugeCount: number;
  triggerEvent: TriggerEvent;
}

export interface PendingBreakResolutionResult {
  state: BattleState;
  events: BreakResolutionEvent[];
  /** Normally empty; protects the one-break-per-enemy-per-ally-turn rule. */
  deferredInstanceIds: string[];
}

function assertAllyTurnEnd(state: BattleState): void {
  if (state.outcome !== "ongoing" || state.phase === "finished") {
    throw new RangeError("finished battles cannot resolve breaks");
  }
  if (state.phase !== "ally_turn_end") {
    throw new RangeError(
      `breaks must resolve during ally_turn_end, received ${state.phase}`,
    );
  }
}

/**
 * Resolves the break-pending snapshot in formation order. Frontline slots are
 * processed from front to back, followed by reserve order for effects that can
 * explicitly reach reserves.
 *
 * This transition does not execute on-break actions. It returns a trigger
 * event for the subsequent turn-end coordinator so action execution, logs,
 * and RNG remain in one ordered pipeline.
 */
export function resolvePendingEnemyBreaks(
  state: BattleState,
): PendingBreakResolutionResult {
  assertAllyTurnEnd(state);
  const pendingAtStart = orderedLocations(
    state.formation,
    "enemy",
    true,
  ).filter(({ unit }) => unit.breakPending);
  if (pendingAtStart.length === 0) {
    return {
      state,
      events: [],
      deferredInstanceIds: [],
    };
  }

  let formation = state.formation;
  const events: BreakResolutionEvent[] = [];
  const deferredInstanceIds: string[] = [];

  for (const pending of pendingAtStart) {
    const current = findUnitLocation(
      formation,
      pending.unit.instanceId,
    );
    if (!current || !current.unit.breakPending) continue;
    if (current.unit.lastBreakBattleTurn === state.battleTurn) {
      deferredInstanceIds.push(current.unit.instanceId);
      continue;
    }
    const [nextGauge, ...remainingBreakGauges] =
      current.unit.remainingBreakGauges;
    if (!nextGauge) {
      throw new RangeError(
        `pending break has no next gauge: ${current.unit.instanceId}`,
      );
    }
    const activatedGaugeNumber = current.unit.hpGaugeNumber + 1;
    const nextUnit = reconcileMaxHp(
      {
        ...current.unit,
        baseMaxHp: nextGauge.maxHp,
        maxHp: nextGauge.maxHp,
        hp: nextGauge.maxHp,
        alive: true,
        hpGaugeNumber: activatedGaugeNumber,
        remainingBreakGauges,
        breakPending: false,
        lastBreakBattleTurn: state.battleTurn,
      },
      current.unit.effects,
      true,
    );
    formation = replaceUnit(formation, nextUnit);
    events.push({
      instanceId: nextUnit.instanceId,
      area: current.area,
      index: current.index,
      brokenGaugeNumber: current.unit.hpGaugeNumber,
      activatedGaugeNumber,
      baseMaxHp: nextUnit.baseMaxHp,
      maxHp: nextUnit.maxHp,
      remainingGaugeCount: remainingBreakGauges.length,
      triggerEvent: {
        timing: "on_break",
        actorInstanceId: nextUnit.instanceId,
        actorSide: "enemy",
        targetInstanceId: nextUnit.instanceId,
        targetSide: "enemy",
      },
    });
  }

  return {
    state:
      events.length === 0
        ? state
        : setBattleFormation(state, formation),
    events,
    deferredInstanceIds,
  };
}
