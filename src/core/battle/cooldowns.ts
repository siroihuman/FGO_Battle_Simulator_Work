import { assertSafeInteger } from "../numeric";
import { orderedLocations, replaceUnit } from "./formation";
import {
  setBattleFormation,
  type BattleState,
} from "./state";
import type { BattleSide } from "./types";

export interface UnitCooldownTick {
  instanceId: string;
  before: number[];
  after: number[];
}

export interface SideCooldownResult {
  state: BattleState;
  side: BattleSide;
  units: UnitCooldownTick[];
  mysticCodeBefore?: number[];
  mysticCodeAfter?: number[];
}

function tickValues(
  values: readonly number[],
  label: string,
): number[] {
  return values.map((value, index) => {
    assertSafeInteger(value, `${label}[${index}]`);
    if (value < 0) {
      throw new RangeError(`${label}[${index}] must not be negative`);
    }
    return Math.max(0, value - 1);
  });
}

function tickFrontlineUnits(
  state: BattleState,
  side: BattleSide,
): {
  state: BattleState;
  ticks: UnitCooldownTick[];
} {
  let formation = state.formation;
  const ticks: UnitCooldownTick[] = [];
  for (const { unit } of orderedLocations(formation, side, false)) {
    if (!unit.alive) continue;
    const before = [...unit.skillCooldowns];
    const after = tickValues(
      before,
      `${unit.instanceId} skillCooldowns`,
    );
    formation = replaceUnit(formation, {
      ...unit,
      skillCooldowns: after,
    });
    ticks.push({
      instanceId: unit.instanceId,
      before,
      after,
    });
  }
  return {
    state:
      ticks.length === 0
        ? state
        : setBattleFormation(state, formation),
    ticks,
  };
}

export function advanceAllyCooldowns(
  state: BattleState,
): SideCooldownResult {
  const unitResult = tickFrontlineUnits(state, "ally");
  const mysticCodeBefore = [...unitResult.state.mysticCodeCooldowns];
  const mysticCodeAfter = tickValues(
    mysticCodeBefore,
    "mysticCodeCooldowns",
  );
  return {
    state: {
      ...unitResult.state,
      mysticCodeCooldowns: mysticCodeAfter,
    },
    side: "ally",
    units: unitResult.ticks,
    mysticCodeBefore,
    mysticCodeAfter,
  };
}

export function advanceEnemyCooldowns(
  state: BattleState,
): SideCooldownResult {
  const unitResult = tickFrontlineUnits(state, "enemy");
  return {
    state: unitResult.state,
    side: "enemy",
    units: unitResult.ticks,
  };
}
