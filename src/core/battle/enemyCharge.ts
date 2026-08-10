import { setBattleFormation, type BattleState } from "./state";

export interface EnemyChargeProgressionChange {
  instanceId: string;
  before: number;
  after: number;
}

export interface EnemyChargeProgressionResult {
  state: BattleState;
  changes: EnemyChargeProgressionChange[];
}

/**
 * Advances only living enemies in the current frontline that have a charge
 * attack. This deterministic turn-end step never reads an RNG stream.
 */
export function advanceEnemyTurnEndCharge(
  state: BattleState,
): EnemyChargeProgressionResult {
  if (state.outcome !== "ongoing" || state.phase !== "enemy_turn_end") {
    throw new RangeError(
      "enemy charge progression requires enemy_turn_end",
    );
  }
  const changes: EnemyChargeProgressionChange[] = [];
  let changed = false;
  const frontline = state.formation.enemy.frontline.map((unit) => {
    const action = unit?.enemyAction;
    if (
      !unit
      || !unit.alive
      || unit.hp <= 0
      || !action?.noblePhantasm
    ) {
      return unit;
    }
    const before = action.charge;
    const after = Math.min(action.chargeMax, before + 1);
    changes.push({ instanceId: unit.instanceId, before, after });
    if (after === before) return unit;
    changed = true;
    return {
      ...unit,
      enemyAction: {
        ...action,
        charge: after,
      },
    };
  });
  if (!changed) return { state, changes };
  return {
    state: setBattleFormation(state, {
      ...state.formation,
      enemy: {
        ...state.formation.enemy,
        frontline,
      },
    }),
    changes,
  };
}
