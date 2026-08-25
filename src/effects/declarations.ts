import type { CommonAction } from "./actions";
import type { NoblePhantasmLevel } from "../formulas/np";
import {
  assertValidNoblePhantasmCardTypeChangeTemplate,
} from "./noblePhantasmCardType";
import { assertValidEffectTrigger } from "./runtime";
import type { EffectTemplate } from "./types";
import type {
  TargetLifeFilter,
  TargetRelation,
  TargetSelection,
} from "./targeting";

export type FiveStageInteger = readonly [
  number,
  number,
  number,
  number,
  number,
];

export type DeclaredActionInteger =
  | number
  | {
      scaling: "noble_phantasm_level";
      values: FiveStageInteger;
    }
  | {
      scaling: "overcharge";
      values: FiveStageInteger;
    };

export type OverchargeStage = 1 | 2 | 3 | 4 | 5;

/**
 * Explicit enemy-NP stages selected for one battle instance and one action.
 * Only stages actually used by that action are present.
 */
export interface EnemyNoblePhantasmContext {
  actionStableId: string;
  noblePhantasmLevel?: NoblePhantasmLevel;
  overchargeStage?: OverchargeStage;
}

export interface DeclaredActionScalingRequirements {
  noblePhantasmLevel: boolean;
  overchargeStage: boolean;
}

export type UnsupportedActionParameter =
  | string
  | number
  | boolean
  | null
  | readonly UnsupportedActionParameter[]
  | { readonly [key: string]: UnsupportedActionParameter };

export interface DeclaredActionTarget {
  relation: TargetRelation;
  selection: TargetSelection;
  includeReserve?: boolean;
  excludeSource?: boolean;
  life?: TargetLifeFilter;
  requiredTraits?: readonly string[];
}

export type DeclaredEffectAction =
  | Exclude<
      CommonAction,
      | { kind: "change_np" }
      | { kind: "heal_hp" }
      | { kind: "reduce_hp" }
      | { kind: "instant_death" }
      | { kind: "apply_effects" }
    >
  | {
      kind: "heal_hp";
      amount: DeclaredActionInteger;
      ignoreRecoveryModifiers?: boolean;
      ignoreHealingBlock?: boolean;
    }
  | {
      kind: "change_np";
      amount: DeclaredActionInteger;
    }
  | (Omit<Extract<CommonAction, { kind: "reduce_hp" }>, "amount"> & {
      amount: DeclaredActionInteger;
    })
  | (Omit<Extract<CommonAction, { kind: "instant_death" }>, "options"> & {
      options: Omit<Extract<CommonAction, { kind: "instant_death" }> ["options"], "effectRatePermille"> & {
        effectRatePermille: DeclaredActionInteger;
      };
    })
  | {
      /** Stars gained before selection use command; attack-time gains use next_command. */
      kind: "gain_stars";
      amount: DeclaredActionInteger;
      destination: "command" | "next_command";
    }
  | {
      /** Resets and redraws the current normal-command-card cycle. */
      kind: "redistribute_command_cards";
    }
  | {
      kind: "apply_effects";
      effects: readonly {
        template: Omit<EffectTemplate, "value"> & {
          value?: DeclaredActionInteger;
        };
        baseRatePermille?: number;
        ignoreResistance?: boolean;
        ignoreImmunity?: boolean;
      }[];
    }
  | {
      /** Explicit marker for a known content effect not supported by the engine. */
      kind: "unsupported";
      mechanicId: string;
      parameters?: Readonly<Record<string, UnsupportedActionParameter>>;
    };

export interface DeclaredActionEffect {
  kind: "effect";
  stableId: string;
  order: number;
  description: string;
  target: DeclaredActionTarget;
  action: DeclaredEffectAction;
}

const TARGET_RELATIONS: readonly string[] = [
  "self",
  "allies",
  "enemies",
];
const TARGET_SELECTIONS: readonly string[] = [
  "single",
  "all",
  "frontmost",
  "rearmost",
];
const TARGET_LIFE_FILTERS: readonly string[] = [
  "alive",
  "dead",
  "any",
];
const DECLARED_ACTION_KINDS: readonly string[] = [
  "heal_hp",
  "reduce_hp",
  "absorb_hp",
  "instant_death",
  "change_np",
  "advance_skill_cooldowns",
  "increase_np_by_current_rate",
  "change_enemy_charge",
  "gain_stars",
  "redistribute_command_cards",
  "apply_effects",
  "remove_effects",
  "unsupported",
];

function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer`);
  }
}

function assertNonNegative(value: number, name: string): void {
  assertSafeInteger(value, name);
  if (value < 0) {
    throw new RangeError(`${name} must not be negative`);
  }
}

function assertFiveStageInteger(
  values: readonly number[],
  name: string,
): void {
  if (values.length !== 5) {
    throw new RangeError(`${name} must contain levels 1 through 5`);
  }
  values.forEach((value, index) =>
    assertSafeInteger(value, `${name}[${index}]`)
  );
}

export function assertValidDeclaredActionInteger(
  value: DeclaredActionInteger,
  name: string,
): void {
  if (typeof value === "number") {
    assertSafeInteger(value, name);
    return;
  }
  if (
    value.scaling !== "noble_phantasm_level"
    && value.scaling !== "overcharge"
  ) {
    throw new RangeError(`${name}.scaling is invalid`);
  }
  assertFiveStageInteger(value.values, `${name}.values`);
}

export function declaredActionIntegerScaling(
  value: DeclaredActionInteger,
): "noble_phantasm_level" | "overcharge" | null {
  return typeof value === "number" ? null : value.scaling;
}

/** Returns every staged integer axis used by one ordered effect list. */
export function declaredActionScalingRequirements(
  effects: readonly DeclaredActionEffect[],
): DeclaredActionScalingRequirements {
  let noblePhantasmLevel = false;
  let overchargeStage = false;
  for (const effect of effects) {
    const action = effect.action;
    const values: DeclaredActionInteger[] = [];
    if (
      action.kind === "change_np"
      || action.kind === "heal_hp"
      || action.kind === "reduce_hp"
      || action.kind === "instant_death"
      || action.kind === "gain_stars"
    ) {
      values.push(action.kind === "instant_death"
        ? action.options.effectRatePermille
        : action.amount);
    } else if (action.kind === "apply_effects") {
      for (const spec of action.effects) {
        if (spec.template.value !== undefined) {
          values.push(spec.template.value);
        }
      }
    }
    for (const value of values) {
      if (typeof value === "number") continue;
      if (value.scaling === "noble_phantasm_level") {
        noblePhantasmLevel = true;
      } else if (value.scaling === "overcharge") {
        overchargeStage = true;
      }
    }
  }
  return { noblePhantasmLevel, overchargeStage };
}

export function isOverchargeStage(
  value: unknown,
): value is OverchargeStage {
  return Number.isSafeInteger(value)
    && typeof value === "number"
    && value >= 1
    && value <= 5;
}

export function assertValidEnemyNoblePhantasmContext(
  context: EnemyNoblePhantasmContext,
  name: string,
): void {
  if (
    typeof context.actionStableId !== "string"
    || context.actionStableId.trim().length === 0
  ) {
    throw new RangeError(`${name}.actionStableId must not be empty`);
  }
  if (
    context.noblePhantasmLevel !== undefined
    && !isOverchargeStage(context.noblePhantasmLevel)
  ) {
    throw new RangeError(`${name}.noblePhantasmLevel must be from 1 to 5`);
  }
  if (
    context.overchargeStage !== undefined
    && !isOverchargeStage(context.overchargeStage)
  ) {
    throw new RangeError(`${name}.overchargeStage must be from 1 to 5`);
  }
}

function assertUniqueStrings(values: readonly string[], name: string): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (value.trim().length === 0) {
      throw new RangeError(`${name}[${index}] must not be empty`);
    }
    if (seen.has(value)) {
      throw new RangeError(`${name} contains duplicate value: ${value}`);
    }
    seen.add(value);
  });
}

export function assertValidDeclaredActionTarget(
  target: DeclaredActionTarget,
  name: string,
): void {
  if (!TARGET_RELATIONS.includes(target.relation)) {
    throw new RangeError(`${name}.relation is invalid`);
  }
  if (!TARGET_SELECTIONS.includes(target.selection)) {
    throw new RangeError(`${name}.selection is invalid`);
  }
  if (
    target.life !== undefined
    && !TARGET_LIFE_FILTERS.includes(target.life)
  ) {
    throw new RangeError(`${name}.life is invalid`);
  }
  if (target.relation === "self") {
    if (target.selection !== "single") {
      throw new RangeError(`${name} self target must use single selection`);
    }
    if (target.excludeSource) {
      throw new RangeError(`${name} self target cannot exclude its source`);
    }
    if (target.includeReserve) {
      throw new RangeError(`${name} self target does not use includeReserve`);
    }
  }
  if (target.requiredTraits) {
    assertUniqueStrings(target.requiredTraits, `${name}.requiredTraits`);
  }
}

function assertUnsupportedParameter(
  value: UnsupportedActionParameter,
  name: string,
): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    assertSafeInteger(value, name);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertUnsupportedParameter(entry, `${name}[${index}]`)
    );
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key.trim().length === 0) {
      throw new RangeError(`${name} key must not be empty`);
    }
    assertUnsupportedParameter(entry, `${name}.${key}`);
  }
}

function assertAction(action: DeclaredEffectAction, name: string): void {
  if (!DECLARED_ACTION_KINDS.includes(action.kind)) {
    throw new RangeError(`${name}.kind is invalid`);
  }
  if (action.kind === "change_np") {
    assertValidDeclaredActionInteger(action.amount, `${name}.amount`);
    return;
  }
  if (action.kind === "heal_hp") {
    assertValidDeclaredActionInteger(action.amount, `${name}.amount`);
    const values = typeof action.amount === "number"
      ? [action.amount]
      : action.amount.values;
    values.forEach((value, index) =>
      assertNonNegative(value, `${name}.amount.values[${index}]`)
    );
    return;
  }
  if (action.kind === "reduce_hp") {
    assertValidDeclaredActionInteger(action.amount, `${name}.amount`);
    const values = typeof action.amount === "number"
      ? [action.amount]
      : action.amount.values;
    values.forEach((value, index) =>
      assertNonNegative(value, `${name}.amount.values[${index}]`)
    );
    if (typeof action.canDefeat !== "boolean") {
      throw new RangeError(`${name}.canDefeat must be boolean`);
    }
    return;
  }
  if (action.kind === "gain_stars") {
    assertValidDeclaredActionInteger(action.amount, `${name}.amount`);
    const values = typeof action.amount === "number"
      ? [action.amount]
      : action.amount.values;
    values.forEach((value, index) =>
      assertNonNegative(value, `${name}.amount.values[${index}]`)
    );
    if (
      action.destination !== "command"
      && action.destination !== "next_command"
    ) {
      throw new RangeError(`${name}.destination is invalid`);
    }
    return;
  }
  if (action.kind === "redistribute_command_cards") return;
  if (action.kind === "unsupported") {
    if (!/^[a-z][a-z0-9_]*$/.test(action.mechanicId)) {
      throw new RangeError(`${name}.mechanicId must be lower_snake_case`);
    }
    for (const [key, value] of Object.entries(action.parameters ?? {})) {
      if (key.trim().length === 0) {
        throw new RangeError(`${name}.parameters key must not be empty`);
      }
      assertUnsupportedParameter(value, `${name}.parameters.${key}`);
    }
    return;
  }

  if (action.kind === "advance_skill_cooldowns") {
    assertNonNegative(action.amount, `${name}.amount`);
  } else if (action.kind === "increase_np_by_current_rate") {
    assertNonNegative(action.ratePermille, `${name}.ratePermille`);
  } else if (action.kind === "change_enemy_charge") {
    assertSafeInteger(action.amount, `${name}.amount`);
  } else if (action.kind === "absorb_hp") {
    assertNonNegative(action.amount, `${name}.amount`);
    if (action.recoveryRatePermille !== undefined) {
      assertNonNegative(
        action.recoveryRatePermille,
        `${name}.recoveryRatePermille`,
      );
    }
  } else if (action.kind === "instant_death") {
    assertValidDeclaredActionInteger(
      action.options.effectRatePermille,
      `${name}.options.effectRatePermille`,
    );
    const values = typeof action.options.effectRatePermille === "number"
      ? [action.options.effectRatePermille]
      : action.options.effectRatePermille.values;
    values.forEach((value, index) =>
      assertNonNegative(value, `${name}.options.effectRatePermille.values[${index}]`)
    );
  } else if (action.kind === "apply_effects") {
    if (action.effects.length === 0) {
      throw new RangeError(`${name}.effects must not be empty`);
    }
    action.effects.forEach((spec, index) => {
      const template = spec.template;
      if (
        !template.stableId
        || !template.name
        || !template.effectType
      ) {
        throw new RangeError(
          `${name}.effects[${index}] template identity is required`,
        );
      }
      assertValidDeclaredActionInteger(
        template.value ?? 0,
        `${name}.effects[${index}].template.value`,
      );
      assertValidEffectTrigger(
        template.trigger,
        `${name}.effects[${index}].template.trigger`,
      );
      assertValidNoblePhantasmCardTypeChangeTemplate(
        template,
        `${name}.effects[${index}].template`,
      );
      if (template.remainingTurns !== undefined && template.remainingTurns !== null) {
        assertNonNegative(
          template.remainingTurns,
          `${name}.effects[${index}].template.remainingTurns`,
        );
        if (template.remainingTurns === 0) {
          throw new RangeError(
            `${name}.effects[${index}].template.remainingTurns must be positive`,
          );
        }
      }
      if (template.remainingUses !== undefined && template.remainingUses !== null) {
        assertNonNegative(
          template.remainingUses,
          `${name}.effects[${index}].template.remainingUses`,
        );
        if (template.remainingUses === 0) {
          throw new RangeError(
            `${name}.effects[${index}].template.remainingUses must be positive`,
          );
        }
      }
      if (spec.baseRatePermille !== undefined) {
        assertSafeInteger(
          spec.baseRatePermille,
          `${name}.effects[${index}].baseRatePermille`,
        );
      }
    });
  } else if (action.kind === "remove_effects") {
    if (action.baseRatePermille !== undefined) {
      assertSafeInteger(action.baseRatePermille, `${name}.baseRatePermille`);
    }
  }
}

export function assertValidDeclaredActionEffect(
  effect: DeclaredActionEffect,
  name: string,
): void {
  if (effect.kind !== "effect") {
    throw new RangeError(`${name}.kind must be effect`);
  }
  if (!Number.isSafeInteger(effect.order) || effect.order <= 0) {
    throw new RangeError(`${name}.order must be a positive safe integer`);
  }
  if (effect.description.trim().length === 0) {
    throw new RangeError(`${name}.description must not be empty`);
  }
  assertValidDeclaredActionTarget(effect.target, `${name}.target`);
  assertAction(effect.action, `${name}.action`);
  if (
    effect.action.kind === "gain_stars"
    && (
      effect.target.relation !== "self"
      || effect.target.selection !== "single"
    )
  ) {
    throw new RangeError(
      `${name}.action gain_stars must use a self target`,
    );
  }
  if (
    effect.action.kind === "redistribute_command_cards"
    && (
      effect.target.relation !== "self"
      || effect.target.selection !== "single"
    )
  ) {
    throw new RangeError(
      `${name}.action redistribute_command_cards must use a self target`,
    );
  }
}
