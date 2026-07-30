import type { AppliedEffect } from "../../effects/types";
import type { NoblePhantasmLevel } from "../../formulas/np";

export type BattleSide = "ally" | "enemy";
export type CommandCardType = "buster" | "arts" | "quick";

export interface NoblePhantasmState {
  stableId: string;
  name: string;
  cardType: CommandCardType;
  level: NoblePhantasmLevel;
}

export type EnemyMaxActions = "auto" | 1 | 2 | 3;

export interface EnemyActionDefinition {
  stableId: string;
  name: string;
}

/**
 * Optional enemy behavior data. A null value is the valid minimal enemy:
 * every requested action skips and its effective charge is always zero.
 */
export interface EnemyActionState {
  maxActions: EnemyMaxActions;
  normalAttack: EnemyActionDefinition | null;
  skills: EnemyActionDefinition[];
  noblePhantasm: EnemyActionDefinition | null;
  charge: number;
  chargeMax: number;
}

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
  /** The upgraded NP used by this battle unit; missing data is represented by null. */
  noblePhantasm: NoblePhantasmState | null;
  /** Enemy-only optional action and charge data. Allies always use null. */
  enemyAction: EnemyActionState | null;
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
