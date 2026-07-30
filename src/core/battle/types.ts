import type { AppliedEffect } from "../../effects/types";

export type BattleSide = "ally" | "enemy";
export type CommandCardType = "buster" | "arts" | "quick";

export interface BreakGaugeState {
  /** Base maximum HP of the gauge before temporary max-HP effects. */
  maxHp: number;
}

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
  /** One-based number of the currently displayed HP gauge. */
  hpGaugeNumber: number;
  /** Future gauges in activation order. Current plus future gauges max at 10. */
  remainingBreakGauges: BreakGaugeState[];
  /** Intermediate HP 0 waiting for ally-turn-end break settlement. */
  breakPending: boolean;
  /** Battle turn in which the most recent gauge was settled. */
  lastBreakBattleTurn: number | null;
  /** Five intrinsic cards for allies; enemies may leave this empty. */
  commandCards: CommandCardType[];
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
