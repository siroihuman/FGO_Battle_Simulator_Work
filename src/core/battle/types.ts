import type { AppliedEffect } from "../../effects/types";

export type BattleSide = "ally" | "enemy";

export interface BattleUnitState {
  instanceId: string;
  dataId: string;
  name: string;
  side: BattleSide;
  /** Maximum HP before temporary max-HP states are applied. */
  baseMaxHp: number;
  maxHp: number;
  hp: number;
  np: number;
  /** Base instant-death rate (DR) in permille. Missing enemy data uses 0. */
  deathRatePermille: number;
  alive: boolean;
  traits: string[];
  effects: AppliedEffect[];
  skillCooldowns: number[];
}

export interface SideFormation {
  frontline: Array<BattleUnitState | null>;
  reserve: BattleUnitState[];
}

export interface BattleFormation {
  ally: SideFormation;
  enemy: SideFormation;
}

export type FormationArea = "frontline" | "reserve";

export interface UnitLocation {
  side: BattleSide;
  area: FormationArea;
  index: number;
  unit: BattleUnitState;
}
