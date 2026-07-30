import type { BattleUnitState } from "../core/battle/types";
import { assertSafeInteger, clampInteger } from "../core/numeric";
import type { DeterministicRng } from "../core/rng";
import { addNp, npCap } from "../formulas/np";
import type { NoblePhantasmLevel } from "../formulas/np";
import {
  resolveInstantDeath,
} from "./instantDeath";
import type {
  InstantDeathOptions,
  InstantDeathResult,
} from "./instantDeath";
import {
  resolveEffectApplication,
} from "./application";
import type {
  EffectApplicationResult,
  EffectApplicationSpec,
} from "./application";
import {
  attemptRemoveEffects,
} from "./removal";
import type {
  EffectRemovalAttempt,
  EffectRemovalRequest,
} from "./removal";
import {
  resolveLethalHp,
} from "./survival";
import type {
  LethalHpResolution,
} from "./survival";
import type { EffectRuntimeCounters } from "./types";

export type CommonAction =
  | { kind: "heal_hp"; amount: number }
  | {
      kind: "reduce_hp";
      amount: number;
      canDefeat: boolean;
      intermediateBreak?: boolean;
      ignoreGuts?: boolean;
      percentageGutsRecoveryModifierPermille?: number;
    }
  | {
      kind: "instant_death";
      options: InstantDeathOptions;
    }
  | {
      kind: "change_np";
      amount: number;
      npLevel: NoblePhantasmLevel;
    }
  | {
      kind: "apply_effects";
      effects: readonly EffectApplicationSpec[];
    }
  | {
      kind: "remove_effects";
      request: EffectRemovalRequest;
      baseRatePermille?: number;
    };

export type CommonActionOutcome = "changed" | "unchanged" | "no_target";

export interface CommonActionResult {
  action: CommonAction;
  outcome: CommonActionOutcome;
  target: BattleUnitState | null;
  counters: EffectRuntimeCounters;
  hpChange?: number;
  npChange?: number;
  applicationResults?: EffectApplicationResult[];
  removalAttempts?: EffectRemovalAttempt[];
  survivalResult?: LethalHpResolution;
  instantDeathResult?: InstantDeathResult;
}

function assertNonNegativeAmount(amount: number, name: string): void {
  assertSafeInteger(amount, name);
  if (amount < 0) throw new RangeError(`${name} must not be negative`);
}

export function executeCommonAction(
  source: BattleUnitState | null,
  target: BattleUnitState | null,
  action: CommonAction,
  counters: EffectRuntimeCounters,
  rng: DeterministicRng,
): CommonActionResult {
  if (action.kind === "apply_effects") {
    const result = resolveEffectApplication(
      source,
      target,
      action.effects,
      counters,
      rng,
    );
    return {
      action,
      outcome: !target
        ? "no_target"
        : result.unit !== target ? "changed" : "unchanged",
      target: result.unit,
      counters: result.counters,
      applicationResults: result.results,
    };
  }
  if (action.kind === "instant_death") {
    const result = resolveInstantDeath(
      source,
      target,
      action.options,
      rng,
    );
    return {
      action,
      outcome:
        result.outcome === "no_target"
          ? "no_target"
          : result.target !== target ? "changed" : "unchanged",
      target: result.target,
      counters,
      instantDeathResult: result,
      survivalResult: result.survival,
    };
  }
  if (!target) {
    return { action, outcome: "no_target", target, counters };
  }

  if (action.kind === "heal_hp") {
    assertNonNegativeAmount(action.amount, "heal amount");
    if (!target.alive) {
      return { action, outcome: "unchanged", target, counters, hpChange: 0 };
    }
    const missingHp = Math.max(0, target.maxHp - target.hp);
    const hp = target.hp + Math.min(action.amount, missingHp);
    return {
      action,
      outcome: hp === target.hp ? "unchanged" : "changed",
      target: hp === target.hp ? target : { ...target, hp },
      counters,
      hpChange: hp - target.hp,
    };
  }

  if (action.kind === "reduce_hp") {
    assertNonNegativeAmount(action.amount, "HP reduction amount");
    if (!target.alive) {
      return { action, outcome: "unchanged", target, counters, hpChange: 0 };
    }
    const minimum = action.canDefeat ? 0 : 1;
    const reducibleHp = Math.max(0, target.hp - minimum);
    const hp = target.hp - Math.min(action.amount, reducibleHp);
    const reducedTarget =
      hp === target.hp
        ? target
        : { ...target, hp, alive: hp > 0 };
    const survivalResult =
      action.canDefeat && hp === 0
        ? resolveLethalHp(reducedTarget, {
            intermediateBreak: action.intermediateBreak,
            ignoreGuts: action.ignoreGuts,
            percentageRecoveryModifierPermille:
              action.percentageGutsRecoveryModifierPermille,
          })
        : undefined;
    return {
      action,
      outcome: hp === target.hp ? "unchanged" : "changed",
      target: survivalResult?.unit ?? reducedTarget,
      counters,
      hpChange: hp - target.hp,
      survivalResult,
    };
  }

  if (action.kind === "change_np") {
    assertSafeInteger(action.amount, "NP change amount");
    const cap = npCap(action.npLevel);
    const cappedCurrent = clampInteger(target.np, 0, cap);
    const safeAmount =
      action.amount >= 0
        ? Math.min(action.amount, cap - cappedCurrent)
        : Math.max(action.amount, -cappedCurrent);
    const np = addNp(cappedCurrent, safeAmount, action.npLevel);
    return {
      action,
      outcome: np === target.np ? "unchanged" : "changed",
      target: np === target.np ? target : { ...target, np },
      counters,
      npChange: np - target.np,
    };
  }

  const removal = attemptRemoveEffects(
    target,
    action.request,
    action.baseRatePermille ?? 1000,
    rng,
  );
  return {
    action,
    outcome: removal.removed.length > 0 ? "changed" : "unchanged",
    target: removal.unit,
    counters,
    removalAttempts: removal.attempts,
  };
}

export function executeCommonActions(
  source: BattleUnitState | null,
  target: BattleUnitState | null,
  actions: readonly CommonAction[],
  counters: EffectRuntimeCounters,
  rng: DeterministicRng,
): {
  target: BattleUnitState | null;
  counters: EffectRuntimeCounters;
  results: CommonActionResult[];
} {
  let currentTarget = target;
  let currentCounters = counters;
  const results: CommonActionResult[] = [];
  for (const action of actions) {
    const currentSource =
      source?.instanceId === currentTarget?.instanceId
        ? currentTarget
        : source;
    const result = executeCommonAction(
      currentSource,
      currentTarget,
      action,
      currentCounters,
      rng,
    );
    currentTarget = result.target;
    currentCounters = result.counters;
    results.push(result);
  }
  return { target: currentTarget, counters: currentCounters, results };
}
