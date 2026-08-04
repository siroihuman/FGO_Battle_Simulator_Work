import type { DeterministicRng } from "../core/rng";
import type { BattleUnitState } from "../core/battle/types";
import type { UnitLocation } from "../core/battle/types";
import { consumeEffectUse } from "./runtime";
import type {
  AppliedEffect,
  TriggerActivation,
  TriggerCondition,
  TriggerEvent,
  TriggerRelation,
} from "./types";

function relationMatches(
  relation: TriggerRelation | undefined,
  owner: BattleUnitState,
  instanceId: string | undefined,
  side: BattleUnitState["side"] | undefined,
): boolean {
  if (!relation || relation === "any") return true;
  if (!instanceId || !side) return false;
  if (relation === "owner") return instanceId === owner.instanceId;
  return relation === "ally" ? side === owner.side : side !== owner.side;
}

function conditionMatches(
  condition: TriggerCondition | undefined,
  owner: BattleUnitState,
  event: TriggerEvent,
): boolean {
  if (!condition) return true;
  if (
    !relationMatches(
      condition.actor,
      owner,
      event.actorInstanceId,
      event.actorSide,
    )
  ) {
    return false;
  }
  if (
    !relationMatches(
      condition.target,
      owner,
      event.targetInstanceId,
      event.targetSide,
    )
  ) {
    return false;
  }
  if (condition.requiresHit && event.hit !== true) return false;
  if (condition.requiresDamage && !(event.damage && event.damage > 0)) return false;
  if (
    condition.attackKinds
    && (
      event.attackKind === undefined
      || !condition.attackKinds.includes(event.attackKind)
    )
  ) {
    return false;
  }
  if (
    condition.cardTypes
    && (
      event.cardType === undefined
      || !condition.cardTypes.includes(event.cardType)
    )
  ) {
    return false;
  }
  return true;
}

export function collectTriggerActivations(
  locationsInResolutionOrder: readonly UnitLocation[],
  event: TriggerEvent,
): TriggerActivation[] {
  return locationsInResolutionOrder.flatMap((location) => {
    const owner = location.unit;
    const ownerIsAvailable =
      event.timing === "on_death"
        ? !owner.alive
        : owner.alive;
    if (!ownerIsAvailable) return [];
    return owner.effects
      .filter(
        (effect) =>
          (location.area === "frontline" || effect.flags.activeWhileReserve === true)
          &&
          effect.trigger?.timing === event.timing
          && conditionMatches(effect.trigger.condition, owner, event),
      )
      .sort((left, right) => {
        const priority =
          (left.trigger?.priority ?? 0) - (right.trigger?.priority ?? 0);
        return priority || left.registrationOrder - right.registrationOrder;
      })
      .map((effect) => ({ ownerInstanceId: owner.instanceId, effect }));
  });
}

export interface TriggerAttemptResult {
  activated: boolean;
  consumedUse: boolean;
  effect: AppliedEffect | null;
}

/**
 * Resolves only the parent trigger's probability and use count.
 * Child-effect resistance/immunity is intentionally resolved afterwards.
 */
export function attemptTriggerActivation(
  effect: AppliedEffect,
  rng: DeterministicRng,
): TriggerAttemptResult {
  if (!effect.trigger) return { activated: false, consumedUse: false, effect };
  const rate = effect.trigger.activationRatePermille ?? 1000;
  const activated = rng.chance(rate);
  if (!activated) return { activated: false, consumedUse: false, effect };
  if (!effect.trigger.consumeUseOnActivation) {
    return { activated: true, consumedUse: false, effect };
  }
  if (effect.remainingUses === null) {
    return { activated: true, consumedUse: false, effect };
  }
  const consumed = consumeEffectUse(effect);
  return { activated: true, consumedUse: true, effect: consumed.effect };
}
