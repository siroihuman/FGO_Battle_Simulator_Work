import type { BattleUnitState } from "../core/battle/types";
import {
  assertSafeInteger,
  toSafeNumber,
} from "../core/numeric";
import { COMMON_EFFECT_TYPES } from "./modifiers";
import type { AppliedEffect } from "./types";

function calculatedMaxHp(
  unit: BattleUnitState,
  effects: readonly AppliedEffect[],
): number {
  assertSafeInteger(unit.baseMaxHp, "baseMaxHp");
  if (unit.baseMaxHp <= 0) {
    throw new RangeError("baseMaxHp must be positive");
  }
  const total = effects
    .filter(
      (effect) => effect.effectType === COMMON_EFFECT_TYPES.maxHpChange,
    )
    .reduce((sum, effect) => {
      assertSafeInteger(effect.value, "max HP effect value");
      return sum + BigInt(effect.value);
    }, BigInt(unit.baseMaxHp));
  return toSafeNumber(total < 1n ? 1n : total, "maximum HP");
}

/**
 * Recalculates temporary maximum HP from the base value and all active states.
 *
 * Applying a positive max-HP state also raises current HP by the actual maximum
 * increase. Removing any max-HP state never restores current HP; it only
 * clamps current HP when the new maximum is lower.
 */
export function reconcileMaxHp(
  unit: BattleUnitState,
  effects: readonly AppliedEffect[],
  increaseCurrentHpWithMaximum = false,
): BattleUnitState {
  const maxHp = calculatedMaxHp(unit, effects);
  let hp = Math.min(unit.hp, maxHp);
  if (
    increaseCurrentHpWithMaximum
    && unit.alive
    && maxHp > unit.maxHp
  ) {
    const raisedHp = toSafeNumber(
      BigInt(unit.hp) + BigInt(maxHp - unit.maxHp),
      "current HP after maximum HP increase",
    );
    hp = Math.min(maxHp, raisedHp);
  }
  return { ...unit, maxHp, hp, effects: [...effects] };
}

export function applyMaxHpState(
  unit: BattleUnitState,
  effect: AppliedEffect,
): BattleUnitState {
  return reconcileMaxHp(
    unit,
    unit.effects,
    effect.effectType === COMMON_EFFECT_TYPES.maxHpChange
      && effect.value > 0,
  );
}
