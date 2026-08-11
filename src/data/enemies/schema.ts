import type {
  EnemyAttackTargetPolicy,
} from "../../core/battle/actionData";
import type {
  CommandCardType,
  EnemyMaxActions,
} from "../../core/battle/types";
import type {
  EnemyFrontlineLimit,
  EnemyReplacementMode,
} from "../../core/battle/state";
import type {
  DeclaredActionInteger,
  EnemyNoblePhantasmContext,
} from "../../effects/declarations";

export const ENEMY_DATA_SCHEMA_VERSION = 1 as const;

export interface EnemySourceReference {
  url: string;
  checkedAt: string;
  note?: string;
}

export interface EnemyExternalIds {
  atlasAcademyServantId: number;
  atlasAcademyAiId: number;
}

export interface EnemyAttackDefinition {
  stableId: string;
  name: string;
  targetScope: "single" | "all";
  targetPolicy?: EnemyAttackTargetPolicy;
  cardType: CommandCardType;
  hitWeights: readonly number[];
  cardDamageValuePermille: number;
}

export interface EnemySkillDefinition {
  stableId: string;
  name: string;
}

export interface EnemyChargeAttackDefinition {
  stableId: string;
  name: string;
  targetScope: "single" | "all";
  targetPolicy?: EnemyAttackTargetPolicy;
  cardType: CommandCardType;
  hitWeights: readonly number[];
  damageMultiplierPermille: DeclaredActionInteger;
  chargeMax: number;
  levelScaling: "fixed" | "noble_phantasm_level";
  overchargeScaling: "none" | "overcharge";
}

export interface EnemyDefinition {
  schemaVersion: typeof ENEMY_DATA_SCHEMA_VERSION;
  dataId: string;
  name: string;
  externalIds: EnemyExternalIds;
  category: "normal_enemy";
  classKey: string;
  attributeKey: string;
  classAttackCoefficientPermille: number;
  traits: readonly string[];
  deathRatePermille: number;
  criticalChancePermille: number;
  attackNpRatePermille: number;
  targetNpRatePermille: number;
  targetStarRatePermille: number;
  maxActions: EnemyMaxActions;
  normalAttack: EnemyAttackDefinition | null;
  skills: readonly EnemySkillDefinition[];
  chargeAttack: EnemyChargeAttackDefinition | null;
  sources: readonly EnemySourceReference[];
}

export interface EnemyEncounterPlacement {
  instanceId: string;
  enemyDataId: string;
  encounterLabel: string;
  frontlineSlot: number;
  level: number;
  hp: number;
  attack: number;
  charge: number;
  breakGaugeHp: readonly number[];
  /** Optional explicit stages for this placement's charge attack. */
  noblePhantasmContext?: EnemyNoblePhantasmContext;
}

export interface EnemyEncounterWave {
  frontline: readonly EnemyEncounterPlacement[];
  reserve: readonly EnemyEncounterPlacement[];
}

export interface EnemyEncounterDefinition {
  schemaVersion: typeof ENEMY_DATA_SCHEMA_VERSION;
  dataId: string;
  name: string;
  activeMode: EnemyFrontlineLimit;
  replacementMode: EnemyReplacementMode;
  waves: readonly EnemyEncounterWave[];
  sources: readonly EnemySourceReference[];
}
