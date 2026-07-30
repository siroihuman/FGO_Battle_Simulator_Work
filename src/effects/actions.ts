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
  resolveHpAbsorption,
  resolveHpRecovery,
  resolveHpReduction,
} from "./hp";
import type {
  HpAbsorptionResult,
  HpRecoveryResult,
  HpReductionResult,
} from "./hp";
import type { LethalHpResolution } from "./survival";
import type { EffectRuntimeCounters } from "./types";

export type CommonAction =
  | {
      kind: "heal_hp";
      amount: number;
      ignoreRecoveryModifiers?: boolean;
      ignoreHealingBlock?: boolean;
    }
  | {
      kind: "reduce_hp";
      amount: number;
      canDefeat: boolean;
      intermediateBreak?: boolean;
      ignoreGuts?: boolean;
      percentageGutsRecoveryModifierPermille?: number;
    }
  | {
      kind: "absorb_hp";
      amount: number;
      canDefeat: boolean;
      recoveryRatePermille?: number;
      ignoreRecoveryModifiers?: boolean;
      ignoreHealingBlock?: boolean;
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
  source?: BattleUnitState | null;
  target: BattleUnitState | null;
  counters: EffectRuntimeCounters;
  hpChange?: number;
  npChange?: number;
  applicationResults?: EffectApplicationResult[];
  removalAttempts?: EffectRemovalAttempt[];
  survivalResult?: LethalHpResolution;
  instantDeathResult?: InstantDeathResult;
  recoveryResult?: HpRecoveryResult;
  hpReductionResult?: HpReductionResult;
  absorptionResult?: HpAbsorptionResult;
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
      source:
        result.source?.instanceId === result.target?.instanceId
          ? result.target
          : result.source,
      counters,
      instantDeathResult: result,
      survivalResult: result.survival,
    };
  }
  if (action.kind === "heal_hp") {
    const result = resolveHpRecovery(
      source,
      target,
      action.amount,
      action,
    );
    return {
      action,
      outcome:
        result.outcome === "no_target"
          ? "no_target"
          : result.source !== source || result.target !== target
            ? "changed"
            : "unchanged",
      source: result.source,
      target: result.target,
      counters,
      hpChange: result.actualRecovered,
      recoveryResult: result,
    };
  }
  if (action.kind === "absorb_hp") {
    const result = resolveHpAbsorption(
      source,
      [target],
      {
        amountPerTarget: action.amount,
        canDefeat: action.canDefeat,
        recoveryRatePermille: action.recoveryRatePermille,
        ignoreRecoveryModifiers: action.ignoreRecoveryModifiers,
        ignoreHealingBlock: action.ignoreHealingBlock,
        intermediateBreak: action.intermediateBreak,
        ignoreGuts: action.ignoreGuts,
        percentageGutsRecoveryModifierPermille:
          action.percentageGutsRecoveryModifierPermille,
      },
    );
    const targetResult = result.targetResults[0];
    return {
      action,
      outcome:
        !target
          ? "no_target"
          : result.outcome === "absorbed" ? "changed" : "unchanged",
      source: result.source,
      target: result.targets[0],
      counters,
      hpChange: -(targetResult?.actualReduction ?? 0),
      survivalResult: targetResult?.survival,
      hpReductionResult: targetResult,
      recoveryResult: result.recovery,
      absorptionResult: result,
    };
  }
  if (!target) {
    return { action, outcome: "no_target", target, counters };
  }

  if (action.kind === "reduce_hp") {
    const result = resolveHpReduction(target, action.amount, action);
    return {
      action,
      outcome:
        result.outcome === "unchanged" || result.outcome === "no_target"
          ? "unchanged"
          : "changed",
      target: result.target,
      counters,
      hpChange: -result.actualReduction,
      survivalResult: result.survival,
      hpReductionResult: result,
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
  source: BattleUnitState | null;
  target: BattleUnitState | null;
  counters: EffectRuntimeCounters;
  results: CommonActionResult[];
} {
  let currentTarget = target;
  let currentSource = source;
  let currentCounters = counters;
  const results: CommonActionResult[] = [];
  for (const action of actions) {
    const actionSource =
      currentSource?.instanceId === currentTarget?.instanceId
        ? currentTarget
        : currentSource;
    const result = executeCommonAction(
      actionSource,
      currentTarget,
      action,
      currentCounters,
      rng,
    );
    currentTarget = result.target;
    currentSource = result.source ?? actionSource;
    if (currentSource?.instanceId === currentTarget?.instanceId) {
      currentSource = currentTarget;
    }
    currentCounters = result.counters;
    results.push(result);
  }
  return {
    source: currentSource,
    target: currentTarget,
    counters: currentCounters,
    results,
  };
}
