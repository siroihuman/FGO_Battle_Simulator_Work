import type {
  BattleFormation,
  BattleSide,
  BattleUnitState,
  SideFormation,
  UnitLocation,
} from "./types";

export function oppositeSide(side: BattleSide): BattleSide {
  return side === "ally" ? "enemy" : "ally";
}

export function orderedLocations(
  formation: BattleFormation,
  side: BattleSide,
  includeReserve = false,
): UnitLocation[] {
  const sideFormation = formation[side];
  const frontline: UnitLocation[] = sideFormation.frontline.flatMap((unit, index) =>
    unit ? [{ side, area: "frontline" as const, index, unit }] : [],
  );
  if (!includeReserve) return frontline;
  const reserve: UnitLocation[] =
    sideFormation.reserve.map((unit, index) => ({
      side,
      area: "reserve" as const,
      index,
      unit,
    }));
  return [...frontline, ...reserve];
}

export function orderedUnits(
  formation: BattleFormation,
  side: BattleSide,
  includeReserve = false,
): BattleUnitState[] {
  return orderedLocations(formation, side, includeReserve).map(({ unit }) => unit);
}

export function findUnitLocation(
  formation: BattleFormation,
  instanceId: string,
): UnitLocation | undefined {
  for (const side of ["ally", "enemy"] as const) {
    const found = orderedLocations(formation, side, true).find(
      ({ unit }) => unit.instanceId === instanceId,
    );
    if (found) return found;
  }
  return undefined;
}

export function assertValidFormation(formation: BattleFormation): void {
  const seen = new Set<string>();
  for (const side of ["ally", "enemy"] as const) {
    for (const location of orderedLocations(formation, side, true)) {
      if (location.unit.side !== side) {
        throw new RangeError(
          `${location.unit.instanceId} is stored on the wrong battle side`,
        );
      }
      if (seen.has(location.unit.instanceId)) {
        throw new RangeError(`duplicate instanceId: ${location.unit.instanceId}`);
      }
      seen.add(location.unit.instanceId);
    }
  }
}

export function replaceUnit(
  formation: BattleFormation,
  unit: BattleUnitState,
): BattleFormation {
  const location = findUnitLocation(formation, unit.instanceId);
  if (!location) throw new RangeError(`unit is not in formation: ${unit.instanceId}`);
  const sideFormation: SideFormation = formation[location.side];
  const nextSide: SideFormation =
    location.area === "frontline"
      ? {
          ...sideFormation,
          frontline: sideFormation.frontline.map((current, index) =>
            index === location.index ? unit : current,
          ),
        }
      : {
          ...sideFormation,
          reserve: sideFormation.reserve.map((current, index) =>
            index === location.index ? unit : current,
          ),
        };
  return { ...formation, [location.side]: nextSide };
}
