import type { BattleUnitState } from "../core/battle/types";
import type {
  AppliedEffect,
  EffectCategory,
  EffectRemovalReason,
  RemovedEffect,
} from "./types";

export type EffectRemovalRequest =
  | { mode: "one"; category: EffectCategory; force?: boolean }
  | { mode: "all"; category: EffectCategory; force?: boolean }
  | { mode: "by_id"; stableId: string; force?: boolean };

function canRemove(effect: AppliedEffect, request: EffectRemovalRequest): boolean {
  if (request.force) return true;
  if (effect.removalPolicy === "unremovable") return false;
  if (request.mode === "by_id") return true;
  return effect.removalPolicy === "removable";
}

function matchesRequest(
  effect: AppliedEffect,
  request: EffectRemovalRequest,
): boolean {
  return request.mode === "by_id"
    ? effect.stableId === request.stableId
    : effect.category === request.category;
}

export function removeEffects(
  unit: BattleUnitState,
  request: EffectRemovalRequest,
): { unit: BattleUnitState; removed: RemovedEffect[] } {
  const candidates = unit.effects
    .filter((effect) => matchesRequest(effect, request) && canRemove(effect, request))
    .sort((left, right) => right.registrationOrder - left.registrationOrder);
  const selected =
    request.mode === "one" ? candidates.slice(0, 1) : candidates;
  const selectedIds = new Set(selected.map(({ instanceId }) => instanceId));
  const reason: EffectRemovalReason = request.force ? "forced" : "dispel";
  return {
    unit: {
      ...unit,
      effects: unit.effects.filter(
        ({ instanceId }) => !selectedIds.has(instanceId),
      ),
    },
    removed: selected.map((effect) => ({ effect, reason })),
  };
}
