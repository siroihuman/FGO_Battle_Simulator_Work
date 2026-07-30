import {
  findUnitLocation,
  oppositeSide,
  orderedLocations,
} from "../core/battle/formation";
import type {
  BattleFormation,
  BattleSide,
  BattleUnitState,
  UnitLocation,
} from "../core/battle/types";

export type TargetRelation = "self" | "allies" | "enemies";
export type TargetSelection = "single" | "all" | "frontmost" | "rearmost";
export type TargetLifeFilter = "alive" | "dead" | "any";

export interface TargetSelector {
  relation: TargetRelation;
  selection: TargetSelection;
  selectedInstanceId?: string;
  includeReserve?: boolean;
  excludeSource?: boolean;
  life?: TargetLifeFilter;
  requiredTraits?: readonly string[];
}

function relationSide(sourceSide: BattleSide, relation: TargetRelation): BattleSide {
  return relation === "enemies" ? oppositeSide(sourceSide) : sourceSide;
}

function matchesLife(unit: BattleUnitState, life: TargetLifeFilter): boolean {
  if (life === "any") return true;
  return life === "alive" ? unit.alive : !unit.alive;
}

function matchesTraits(unit: BattleUnitState, traits: readonly string[]): boolean {
  return traits.every((trait) => unit.traits.includes(trait));
}

export function resolveTargetLocations(
  formation: BattleFormation,
  sourceInstanceId: string,
  selector: TargetSelector,
): UnitLocation[] {
  const source = findUnitLocation(formation, sourceInstanceId);
  if (!source) return [];

  if (selector.relation === "self") {
    if (selector.excludeSource) return [];
    if (!matchesLife(source.unit, selector.life ?? "alive")) return [];
    if (!matchesTraits(source.unit, selector.requiredTraits ?? [])) return [];
    return [source];
  }

  const side = relationSide(source.side, selector.relation);
  let candidates = orderedLocations(
    formation,
    side,
    selector.includeReserve ?? false,
  ).filter(({ unit }) => {
    if (selector.excludeSource && unit.instanceId === sourceInstanceId) return false;
    if (!matchesLife(unit, selector.life ?? "alive")) return false;
    return matchesTraits(unit, selector.requiredTraits ?? []);
  });

  if (selector.selection === "single") {
    if (!selector.selectedInstanceId) return [];
    candidates = candidates.filter(
      ({ unit }) => unit.instanceId === selector.selectedInstanceId,
    );
    return candidates.slice(0, 1);
  }
  if (selector.selection === "frontmost") return candidates.slice(0, 1);
  if (selector.selection === "rearmost") return candidates.slice(-1);
  return candidates;
}

export function resolveTargets(
  formation: BattleFormation,
  sourceInstanceId: string,
  selector: TargetSelector,
): BattleUnitState[] {
  return resolveTargetLocations(formation, sourceInstanceId, selector).map(
    ({ unit }) => unit,
  );
}
