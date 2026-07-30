import type { BattleUnitState } from "../core/battle/types";
import { assertSafeInteger } from "../core/numeric";
import type { DeterministicRng } from "../core/rng";
import {
  COMMON_EFFECT_TYPES,
  modifierMatchesClassifications,
  sumEffectModifiers,
} from "./modifiers";
import {
  applyEffect,
  consumeEffectUse,
} from "./runtime";
import type {
  AppliedEffect,
  EffectRuntimeCounters,
  EffectTemplate,
} from "./types";

export interface EffectApplicationSpec {
  template: EffectTemplate;
  baseRatePermille?: number;
  ignoreResistance?: boolean;
  ignoreImmunity?: boolean;
}

export interface EffectApplicationRate {
  baseRatePermille: number;
  sourceModifierPermille: number;
  targetModifierPermille: number;
  resolvedRatePermille: number;
}

export type EffectApplicationOutcome =
  | "applied"
  | "resisted"
  | "immune"
  | "no_target";

export interface EffectApplicationResult {
  specIndex: number;
  stableId: string;
  outcome: EffectApplicationOutcome;
  rate: EffectApplicationRate | null;
  appliedEffect?: AppliedEffect;
  immunityEffectInstanceId?: string;
  consumedImmunityUse?: boolean;
}

export interface EffectApplicationActionResult {
  unit: BattleUnitState | null;
  counters: EffectRuntimeCounters;
  results: EffectApplicationResult[];
}

function assertRate(value: number, name: string): void {
  assertSafeInteger(value, name);
}

function rollResolvedRate(
  resolvedRatePermille: number,
  rng: DeterministicRng,
): boolean {
  if (resolvedRatePermille <= 0) return false;
  if (resolvedRatePermille >= 1000) return true;
  return rng.chance(resolvedRatePermille);
}

export function calculateEffectApplicationRate(
  source: BattleUnitState | null,
  target: BattleUnitState,
  spec: EffectApplicationSpec,
): EffectApplicationRate {
  const baseRatePermille = spec.baseRatePermille ?? 1000;
  assertRate(baseRatePermille, "baseRatePermille");
  const classifications = spec.template.classifications ?? [];
  let sourceModifierPermille = 0;
  let targetModifierPermille = 0;

  if (spec.template.category === "debuff") {
    sourceModifierPermille = sumEffectModifiers(
      source,
      COMMON_EFFECT_TYPES.debuffSuccess,
      classifications,
    );
    if (!spec.ignoreResistance) {
      targetModifierPermille = -sumEffectModifiers(
        target,
        COMMON_EFFECT_TYPES.debuffResistance,
        classifications,
      );
    }
  } else if (spec.template.category === "buff") {
    sourceModifierPermille = sumEffectModifiers(
      source,
      COMMON_EFFECT_TYPES.buffSuccess,
      classifications,
    );
    if (!spec.ignoreResistance) {
      targetModifierPermille = sumEffectModifiers(
        target,
        COMMON_EFFECT_TYPES.receivedBuffSuccess,
        classifications,
      );
    }
  }

  const resolvedRatePermille =
    baseRatePermille + sourceModifierPermille + targetModifierPermille;
  assertRate(resolvedRatePermille, "resolvedRatePermille");
  return {
    baseRatePermille,
    sourceModifierPermille,
    targetModifierPermille,
    resolvedRatePermille,
  };
}

function matchingImmunityType(category: EffectTemplate["category"]): string | null {
  if (category === "buff") return COMMON_EFFECT_TYPES.buffImmunity;
  if (category === "debuff") return COMMON_EFFECT_TYPES.debuffImmunity;
  return null;
}

function immunityMatches(
  immunity: AppliedEffect,
  template: EffectTemplate,
): boolean {
  return modifierMatchesClassifications(
    immunity,
    template.classifications ?? [],
  );
}

function consumeImmunity(
  unit: BattleUnitState,
  immunity: AppliedEffect,
): { unit: BattleUnitState; consumed: boolean } {
  if (immunity.remainingUses === null) return { unit, consumed: false };
  const result = consumeEffectUse(immunity);
  return {
    unit: {
      ...unit,
      effects: result.effect
        ? unit.effects.map((effect) =>
            effect.instanceId === immunity.instanceId ? result.effect! : effect
          )
        : unit.effects.filter(
            (effect) => effect.instanceId !== immunity.instanceId,
          ),
    },
    consumed: true,
  };
}

/**
 * Resolves all child states belonging to one skill/NP/trigger action.
 * Probability and resistance are checked per child state. Once a count-based
 * immunity blocks one matching child, that same immunity blocks every other
 * matching child in this action while consuming only one use.
 */
export function resolveEffectApplication(
  source: BattleUnitState | null,
  target: BattleUnitState | null,
  specs: readonly EffectApplicationSpec[],
  counters: EffectRuntimeCounters,
  rng: DeterministicRng,
): EffectApplicationActionResult {
  if (!target) {
    return {
      unit: null,
      counters,
      results: specs.map((spec, specIndex) => ({
        specIndex,
        stableId: spec.template.stableId,
        outcome: "no_target",
        rate: null,
      })),
    };
  }

  let currentUnit = target;
  let currentCounters = counters;
  const actionImmunities: AppliedEffect[] = [];
  const results: EffectApplicationResult[] = [];

  specs.forEach((spec, specIndex) => {
    const currentSource =
      source?.instanceId === currentUnit.instanceId ? currentUnit : source;
    const rate = calculateEffectApplicationRate(
      currentSource,
      currentUnit,
      spec,
    );
    if (!rollResolvedRate(rate.resolvedRatePermille, rng)) {
      results.push({
        specIndex,
        stableId: spec.template.stableId,
        outcome: "resisted",
        rate,
      });
      return;
    }

    const immunityType = matchingImmunityType(spec.template.category);
    if (immunityType && !spec.ignoreImmunity) {
      let immunity = actionImmunities.find(
        (effect) =>
          effect.effectType === immunityType
          && immunityMatches(effect, spec.template),
      );
      let consumedImmunityUse = false;
      if (!immunity) {
        immunity = currentUnit.effects
          .filter(
            (effect) =>
              effect.effectType === immunityType
              && immunityMatches(effect, spec.template),
          )
          .sort(
            (left, right) =>
              left.registrationOrder - right.registrationOrder,
          )[0];
        if (immunity) {
          actionImmunities.push(immunity);
          const consumed = consumeImmunity(currentUnit, immunity);
          currentUnit = consumed.unit;
          consumedImmunityUse = consumed.consumed;
        }
      }
      if (immunity) {
        results.push({
          specIndex,
          stableId: spec.template.stableId,
          outcome: "immune",
          rate,
          immunityEffectInstanceId: immunity.instanceId,
          consumedImmunityUse,
        });
        return;
      }
    }

    const applied = applyEffect(
      currentUnit,
      spec.template,
      currentSource?.instanceId ?? null,
      currentCounters,
    );
    currentUnit = applied.unit;
    currentCounters = applied.counters;
    results.push({
      specIndex,
      stableId: spec.template.stableId,
      outcome: "applied",
      rate,
      appliedEffect: applied.effect,
    });
  });

  return { unit: currentUnit, counters: currentCounters, results };
}
