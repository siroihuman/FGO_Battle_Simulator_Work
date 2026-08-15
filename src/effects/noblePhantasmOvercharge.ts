import type { BattleUnitState } from "../core/battle/types";
import { assertSafeInteger } from "../core/numeric";
import { COMMON_EFFECT_TYPES } from "./modifiers";
import { consumeUnitEffectUse } from "./runtime";

export interface NoblePhantasmOverchargeConsumption {
  unit: BattleUnitState;
  additionalStages: number;
  consumedEffectInstanceIds: string[];
}

/**
 * Resolves every active OC-stage-up state at the point an NP use begins.
 * Matching states stack additively and each count-based state consumes one use.
 */
export function consumeNoblePhantasmOverchargeStageEffects(
  unit: BattleUnitState,
): NoblePhantasmOverchargeConsumption {
  const effects = unit.effects
    .filter(({ effectType }) =>
      effectType === COMMON_EFFECT_TYPES.noblePhantasmOverchargeStage
    )
    .sort(
      (left, right) => left.registrationOrder - right.registrationOrder,
    );
  let currentUnit = unit;
  let additionalStages = 0;
  const consumedEffectInstanceIds: string[] = [];

  for (const effect of effects) {
    assertSafeInteger(effect.value, `${effect.stableId} OC stage value`);
    if (effect.value <= 0) {
      throw new RangeError(
        `${effect.stableId} OC stage value must be positive`,
      );
    }
    additionalStages += effect.value;
    assertSafeInteger(additionalStages, "additional OC stages");
    const consumed = consumeUnitEffectUse(
      currentUnit,
      effect.instanceId,
    );
    currentUnit = consumed.unit;
    if (consumed.consumed) {
      consumedEffectInstanceIds.push(effect.instanceId);
    }
  }

  return {
    unit: currentUnit,
    additionalStages,
    consumedEffectInstanceIds,
  };
}
