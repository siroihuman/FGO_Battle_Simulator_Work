import type { BattleUnitState } from "../core/battle/types";
import type { AppliedEffect } from "./types";

export const TRAIT_GRANT_EFFECT_TYPE = "trait_grant";

function grantedTraitId(effect: AppliedEffect): string | null {
  if (effect.effectType !== TRAIT_GRANT_EFFECT_TYPE) return null;
  const traitId = effect.flags.traitId;
  if (typeof traitId !== "string" || traitId.trim().length === 0) {
    throw new RangeError(
      `traitId on ${effect.instanceId} must be a non-empty string`,
    );
  }
  return traitId;
}

/**
 * Returns base traits followed by currently applied trait grants. Duplicate
 * grants intentionally collapse to one effective trait while their effect
 * instances and durations remain independent.
 */
export function effectiveBattleTraits(
  unit: Pick<BattleUnitState, "traits" | "effects">,
): string[] {
  const traits: string[] = [];
  const seen = new Set<string>();
  const register = (traitId: string): void => {
    if (seen.has(traitId)) return;
    seen.add(traitId);
    traits.push(traitId);
  };
  unit.traits.forEach(register);
  [...unit.effects]
    .sort(
      (left, right) => left.registrationOrder - right.registrationOrder,
    )
    .forEach((effect) => {
      const traitId = grantedTraitId(effect);
      if (traitId !== null) register(traitId);
    });
  return traits;
}

export function hasBattleTrait(
  unit: Pick<BattleUnitState, "traits" | "effects">,
  traitId: string,
): boolean {
  if (unit.traits.includes(traitId)) return true;
  return unit.effects.some(
    (effect) => grantedTraitId(effect) === traitId,
  );
}

/** Every listed trait is required. An empty requirement is unconditional. */
export function hasAllBattleTraits(
  unit: Pick<BattleUnitState, "traits" | "effects">,
  requiredTraits: readonly string[],
): boolean {
  return requiredTraits.every((traitId) =>
    hasBattleTrait(unit, traitId)
  );
}
