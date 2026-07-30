import type { BattleUnitState } from "../core/battle/types";
import {
  assertSafeInteger,
  clampInteger,
  multiplyThenFloor,
} from "../core/numeric";
import { COMMON_EFFECT_TYPES } from "./modifiers";
import { consumeUnitEffectUse } from "./runtime";
import type { AppliedEffect } from "./types";

export type LethalHpOutcome =
  | "not_lethal"
  | "break_pending"
  | "guts"
  | "defeated";

export interface LethalHpOptions {
  /**
   * Intermediate break gauges do not activate guts. The break transition is
   * finalized by the battle turn-end coordinator.
   */
  intermediateBreak?: boolean;
  /** Used by instant-death demerits explicitly carrying guts-ignore. */
  ignoreGuts?: boolean;
  /**
   * Only percentage-of-max-HP guts uses this modifier. 1000 means unchanged.
   * Fixed-value guts deliberately ignores healing modifiers and healing block.
   */
  percentageRecoveryModifierPermille?: number;
}

export interface LethalHpResolution {
  unit: BattleUnitState;
  outcome: LethalHpOutcome;
  gutsEffect?: AppliedEffect;
  consumedGutsUse: boolean;
  recoveryHp: number;
  /** Death effects may run only when no break or guts prevented defeat. */
  deathTriggerAllowed: boolean;
}

function booleanFlag(effect: AppliedEffect, name: string): boolean {
  return effect.flags[name] === true;
}

function numericFlag(
  effect: AppliedEffect,
  name: string,
  fallback: number,
): number {
  const value = effect.flags[name];
  if (value === undefined) return fallback;
  if (typeof value !== "number") {
    throw new RangeError(`${name} must be a number`);
  }
  assertSafeInteger(value, name);
  return value;
}

function orderedGuts(unit: BattleUnitState): AppliedEffect[] {
  return unit.effects
    .filter((effect) => effect.effectType === COMMON_EFFECT_TYPES.guts)
    .sort((left, right) => {
      const stackableOrder =
        Number(booleanFlag(right, "stackable"))
        - Number(booleanFlag(left, "stackable"));
      if (stackableOrder !== 0) return stackableOrder;
      const priorityOrder =
        numericFlag(left, "gutsPriority", 0)
        - numericFlag(right, "gutsPriority", 0);
      if (priorityOrder !== 0) return priorityOrder;
      return left.registrationOrder - right.registrationOrder;
    });
}

function gutsRecoveryHp(
  unit: BattleUnitState,
  guts: AppliedEffect,
  percentageRecoveryModifierPermille: number,
): number {
  assertSafeInteger(guts.value, "guts recovery value");
  if (guts.value < 0) {
    throw new RangeError("guts recovery value must not be negative");
  }
  const mode = guts.flags.recoveryMode ?? "fixed";
  let recoveryHp: number;
  if (mode === "fixed") {
    recoveryHp = guts.value;
  } else if (mode === "max_hp_permille") {
    const modifier = Math.max(0, percentageRecoveryModifierPermille);
    recoveryHp = multiplyThenFloor(
      [unit.maxHp, guts.value, modifier],
      1_000_000,
    );
  } else {
    throw new RangeError(`unsupported guts recoveryMode: ${String(mode)}`);
  }
  return clampInteger(Math.max(1, recoveryHp), 1, unit.maxHp);
}

/**
 * Finalizes a unit at 0 HP. Intermediate break gauges are separated from
 * final defeat, and guts is selected before death triggers become eligible.
 */
export function resolveLethalHp(
  unit: BattleUnitState,
  options: LethalHpOptions = {},
): LethalHpResolution {
  if (unit.hp > 0) {
    return {
      unit,
      outcome: "not_lethal",
      consumedGutsUse: false,
      recoveryHp: 0,
      deathTriggerAllowed: false,
    };
  }

  if (options.intermediateBreak) {
    return {
      unit: { ...unit, hp: 0, alive: true },
      outcome: "break_pending",
      consumedGutsUse: false,
      recoveryHp: 0,
      deathTriggerAllowed: false,
    };
  }

  if (!options.ignoreGuts) {
    const guts = orderedGuts(unit)[0];
    if (guts) {
      const modifier = options.percentageRecoveryModifierPermille ?? 1000;
      assertSafeInteger(modifier, "percentageRecoveryModifierPermille");
      const recoveryHp = gutsRecoveryHp(unit, guts, modifier);
      const consumed = consumeUnitEffectUse(unit, guts.instanceId);
      return {
        unit: {
          ...consumed.unit,
          hp: recoveryHp,
          alive: true,
        },
        outcome: "guts",
        gutsEffect: guts,
        consumedGutsUse: consumed.consumed,
        recoveryHp,
        deathTriggerAllowed: false,
      };
    }
  }

  return {
    unit: { ...unit, hp: 0, alive: false },
    outcome: "defeated",
    consumedGutsUse: false,
    recoveryHp: 0,
    deathTriggerAllowed: true,
  };
}
