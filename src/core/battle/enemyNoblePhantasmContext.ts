import type {
  EnemyAttackActionData,
} from "./actionData";
import type {
  BattleActionEffectSequence,
} from "../../effects/actionData";
import {
  assertValidDeclaredActionEffect,
  assertValidDeclaredActionInteger,
  declaredActionIntegerScaling,
  declaredActionScalingRequirements,
  isOverchargeStage,
  type DeclaredActionInteger,
  type EnemyNoblePhantasmContext,
} from "../../effects/declarations";

export type EnemyNoblePhantasmPreflightIssue =
  | "enemy_noble_phantasm_context_missing"
  | "enemy_noble_phantasm_context_invalid"
  | "enemy_noble_phantasm_data_invalid";

export interface EnemyNoblePhantasmPreflightSnapshot {
  readonly actionStableId: string;
  readonly action: EnemyAttackActionData;
  readonly effectSequence: BattleActionEffectSequence | null;
  readonly context: Readonly<EnemyNoblePhantasmContext> | null;
  readonly npDamageMultiplierPermille: number;
}

export type EnemyNoblePhantasmPreflightResult =
  | {
      outcome: "ready";
      snapshot: EnemyNoblePhantasmPreflightSnapshot;
    }
  | {
      outcome: "skipped";
      reason: EnemyNoblePhantasmPreflightIssue;
    };

function cloneJson<T>(value: T): T {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error();
    return JSON.parse(encoded) as T;
  } catch {
    throw new RangeError("enemy noble phantasm data is not JSON serializable");
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach((nested) => deepFreeze(nested));
    Object.freeze(value);
  }
  return value;
}

function frozenJsonClone<T>(value: T): T {
  return deepFreeze(cloneJson(value));
}

function validDeclaredAttackMultiplier(
  value: DeclaredActionInteger,
): boolean {
  try {
    assertValidDeclaredActionInteger(value, "enemy NP damage multiplier");
  } catch {
    return false;
  }
  const values = typeof value === "number" ? [value] : value.values;
  return values.every((item) => Number.isSafeInteger(item) && item >= 0);
}

function validDeclaredEffects(
  sequence: BattleActionEffectSequence | null,
): boolean {
  if (!sequence) return true;
  try {
    sequence.effects.forEach((effect, index) =>
      assertValidDeclaredActionEffect(effect, `enemy NP effect[${index}]`)
    );
    return true;
  } catch {
    return false;
  }
}

function contextDataIssue(
  context: EnemyNoblePhantasmContext,
  actionStableId: string,
): EnemyNoblePhantasmPreflightIssue | null {
  if (
    typeof context.actionStableId !== "string"
    || context.actionStableId !== actionStableId
  ) {
    return "enemy_noble_phantasm_data_invalid";
  }
  if (
    context.noblePhantasmLevel !== undefined
    && !isOverchargeStage(context.noblePhantasmLevel)
  ) {
    return "enemy_noble_phantasm_context_invalid";
  }
  if (
    context.overchargeStage !== undefined
    && !isOverchargeStage(context.overchargeStage)
  ) {
    return "enemy_noble_phantasm_context_invalid";
  }
  return null;
}

function sameContext(
  left: EnemyNoblePhantasmContext,
  right: EnemyNoblePhantasmContext,
): boolean {
  return left.actionStableId === right.actionStableId
    && left.noblePhantasmLevel === right.noblePhantasmLevel
    && left.overchargeStage === right.overchargeStage;
}

function resolveInteger(
  value: DeclaredActionInteger,
  context: EnemyNoblePhantasmContext | null,
): number {
  if (typeof value === "number") return value;
  const stage = value.scaling === "noble_phantasm_level"
    ? context?.noblePhantasmLevel
    : context?.overchargeStage;
  return value.values[(stage ?? 1) - 1];
}

/**
 * Atomically validates and snapshots every input used by one enemy NP before
 * target selection, charge consumption, state/counter mutation, or RNG work.
 */
export function prepareEnemyNoblePhantasmContext(
  action: EnemyAttackActionData,
  effectSequence: BattleActionEffectSequence | null,
): EnemyNoblePhantasmPreflightResult {
  const multiplier = action.npDamageMultiplierPermille;
  if (
    action.kind !== "noble_phantasm"
    || multiplier === undefined
    || !validDeclaredAttackMultiplier(multiplier)
    || !validDeclaredEffects(effectSequence)
    || (
      effectSequence !== null
      && (
        effectSequence.kind !== "noble_phantasm"
        || effectSequence.stableId !== action.actionStableId
      )
    )
  ) {
    return {
      outcome: "skipped",
      reason: "enemy_noble_phantasm_data_invalid",
    };
  }

  const attackContext = action.noblePhantasmContext;
  const effectContext = effectSequence?.noblePhantasmContext;
  for (const context of [attackContext, effectContext]) {
    if (!context) continue;
    const issue = contextDataIssue(context, action.actionStableId);
    if (issue) return { outcome: "skipped", reason: issue };
  }
  if (
    effectSequence
    && ((attackContext === undefined) !== (effectContext === undefined))
  ) {
    return {
      outcome: "skipped",
      reason: "enemy_noble_phantasm_data_invalid",
    };
  }
  if (
    attackContext
    && effectContext
    && !sameContext(attackContext, effectContext)
  ) {
    return {
      outcome: "skipped",
      reason: "enemy_noble_phantasm_data_invalid",
    };
  }

  const damageScaling = declaredActionIntegerScaling(multiplier);
  const effectRequirements = declaredActionScalingRequirements(
    effectSequence?.effects ?? [],
  );
  const needsNoblePhantasmLevel =
    damageScaling === "noble_phantasm_level"
    || effectRequirements.noblePhantasmLevel;
  const needsOverchargeStage =
    damageScaling === "overcharge"
    || effectRequirements.overchargeStage;
  const context = attackContext ?? effectContext ?? null;
  if ((needsNoblePhantasmLevel || needsOverchargeStage) && !context) {
    return {
      outcome: "skipped",
      reason: "enemy_noble_phantasm_context_missing",
    };
  }
  if (
    (needsNoblePhantasmLevel && context?.noblePhantasmLevel === undefined)
    || (needsOverchargeStage && context?.overchargeStage === undefined)
  ) {
    return {
      outcome: "skipped",
      reason: "enemy_noble_phantasm_context_missing",
    };
  }
  if (
    (!needsNoblePhantasmLevel && !needsOverchargeStage && context !== null)
    || (!needsNoblePhantasmLevel
      && context?.noblePhantasmLevel !== undefined)
    || (!needsOverchargeStage
      && context?.overchargeStage !== undefined)
  ) {
    return {
      outcome: "skipped",
      reason: "enemy_noble_phantasm_context_invalid",
    };
  }

  try {
    const snapshotContext = context
      ? frozenJsonClone(context)
      : null;
    const snapshot = Object.freeze({
      actionStableId: action.actionStableId,
      action: frozenJsonClone(action),
      effectSequence: effectSequence
        ? frozenJsonClone(effectSequence)
        : null,
      context: snapshotContext,
      npDamageMultiplierPermille: resolveInteger(multiplier, context),
    });
    return { outcome: "ready", snapshot };
  } catch {
    return {
      outcome: "skipped",
      reason: "enemy_noble_phantasm_data_invalid",
    };
  }
}
