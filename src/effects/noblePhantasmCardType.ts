import type {
  BattleUnitState,
  CommandCardType,
} from "../core/battle/types";
import { COMMON_EFFECT_TYPES } from "./modifiers";
import type {
  AppliedEffect,
  EffectTemplate,
} from "./types";

const COMMAND_CARD_TYPES: readonly CommandCardType[] = [
  "quick",
  "arts",
  "buster",
];

function cardTypeFlag(
  effect: Pick<AppliedEffect, "instanceId" | "category" | "flags">,
): CommandCardType {
  if (effect.category !== "buff") {
    throw new RangeError(
      `noble phantasm card-type change ${effect.instanceId} must be a buff`,
    );
  }
  const cardType = effect.flags.cardType;
  if (
    typeof cardType !== "string"
    || !COMMAND_CARD_TYPES.includes(cardType as CommandCardType)
  ) {
    throw new RangeError(
      `cardType on ${effect.instanceId} must be quick, arts, or buster`,
    );
  }
  return cardType as CommandCardType;
}

export function assertValidNoblePhantasmCardTypeChangeTemplate(
  template: Pick<EffectTemplate, "effectType" | "category" | "flags">,
  name = "effect template",
): void {
  if (
    template.effectType
    !== COMMON_EFFECT_TYPES.noblePhantasmCardTypeChange
  ) {
    return;
  }
  if (template.category !== "buff") {
    throw new RangeError(`${name} card-type change must be a buff`);
  }
  const cardType = template.flags?.cardType;
  if (
    typeof cardType !== "string"
    || !COMMAND_CARD_TYPES.includes(cardType as CommandCardType)
  ) {
    throw new RangeError(
      `${name}.flags.cardType must be quick, arts, or buster`,
    );
  }
}

export function createNoblePhantasmCardTypeChangeEffect(
  cardType: CommandCardType,
  name: string,
  options: Omit<
    EffectTemplate,
    "stableId" | "name" | "effectType" | "category" | "flags"
  > & {
    stableId?: string;
    flags?: EffectTemplate["flags"];
  } = {},
): EffectTemplate {
  return {
    ...options,
    stableId:
      options.stableId
      ?? `noble-phantasm-card-type-change:${cardType}`,
    name,
    effectType:
      COMMON_EFFECT_TYPES.noblePhantasmCardTypeChange,
    category: "buff",
    flags: { ...(options.flags ?? {}), cardType },
    removalPolicy: options.removalPolicy ?? "removable",
  };
}

export interface NoblePhantasmCardTypeResolution {
  baseCardType: CommandCardType;
  cardType: CommandCardType;
  /** The newest active change wins. Null means the intrinsic type is active. */
  changeEffect: AppliedEffect | null;
}

/**
 * Resolves the currently displayed and calculated NP card type without
 * mutating the intrinsic NP definition. Multiple changes remain independent;
 * the newest registration wins until it is removed or expires.
 */
export function resolveNoblePhantasmCardType(
  unit: Pick<BattleUnitState, "noblePhantasm" | "effects">,
): NoblePhantasmCardTypeResolution | null {
  const noblePhantasm = unit.noblePhantasm;
  if (!noblePhantasm) return null;
  const changes = unit.effects
    .filter(
      ({ effectType }) =>
        effectType
        === COMMON_EFFECT_TYPES.noblePhantasmCardTypeChange,
    )
    .sort(
      (left, right) =>
        left.registrationOrder - right.registrationOrder,
    );
  const changeEffect = changes.at(-1) ?? null;
  return {
    baseCardType: noblePhantasm.cardType,
    cardType:
      changeEffect
        ? cardTypeFlag(changeEffect)
        : noblePhantasm.cardType,
    changeEffect,
  };
}
