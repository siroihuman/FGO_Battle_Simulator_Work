import type { BattleUnitState } from "../core/battle/types";
import type { EffectCategory, EffectTemplate } from "./types";

export const ROMA_TRAIT_ID = "roma";
export const ACTION_DISABLED_CLASSIFICATION = "immobilize";

export function isActionDisabled(unit: BattleUnitState): boolean {
  return unit.effects.some(
    (effect) =>
      effect.classifications.includes(ACTION_DISABLED_CLASSIFICATION)
      || effect.flags.preventsAction === true
      || effect.flags.preventsCommandCardAction === true,
  );
}

export function categoryForGrantedTrait(traitId: string): EffectCategory {
  return traitId === ROMA_TRAIT_ID ? "debuff" : "other";
}

export function createTraitGrantEffect(
  traitId: string,
  name: string,
  options: Omit<
    EffectTemplate,
    "stableId" | "name" | "effectType" | "category" | "flags"
  > & { stableId?: string; flags?: EffectTemplate["flags"] } = {},
): EffectTemplate {
  return {
    ...options,
    stableId: options.stableId ?? `trait-grant:${traitId}`,
    name,
    effectType: "trait_grant",
    category: categoryForGrantedTrait(traitId),
    flags: { ...(options.flags ?? {}), traitId },
    removalPolicy:
      options.removalPolicy
      ?? (traitId === ROMA_TRAIT_ID ? "removable" : "id_only"),
  };
}
