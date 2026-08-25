import type {
  AttackTargetScope,
} from "../../core/battle/actionData";
import type {
  BattleSide,
  CommandCardType,
} from "../../core/battle/types";
import type {
  DeclaredActionEffect,
  DeclaredActionTarget,
} from "../../effects/declarations";
import type {
  NoblePhantasmLevel,
} from "../../formulas/np";

export const SERVANT_DATA_SCHEMA_VERSION = 1 as const;

/** Default 500% base rate for a skill/NP demerit with no source-listed rate. */
export const SERVANT_DEFAULT_DEMERIT_APPLICATION_RATE_PERMILLE = 5_000;

export type ServantRarity = 0 | 1 | 2 | 3 | 4 | 5;

export type ServantLevel =
  | 1
  | 20
  | 25
  | 30
  | 35
  | 40
  | 45
  | 50
  | 55
  | 60
  | 65
  | 70
  | 80
  | 90
  | 100
  | 120;

export const SERVANT_LEVELS_BY_RARITY: Readonly<
  Record<ServantRarity, readonly ServantLevel[]>
> = {
  0: [1, 25, 35, 45, 55, 65, 100, 120],
  1: [1, 20, 30, 40, 50, 60, 100, 120],
  2: [1, 25, 35, 45, 55, 65, 100, 120],
  3: [1, 30, 40, 50, 60, 70, 100, 120],
  4: [1, 40, 50, 60, 70, 80, 100, 120],
  5: [1, 50, 60, 70, 80, 90, 100, 120],
};

export interface ServantLevelStat {
  level: ServantLevel;
  hp: number;
  attack: number;
}

export interface ServantSourceReference {
  url: string;
  checkedAt: string;
  note?: string;
}

/**
 * A target policy stored in content data. A `single` target is selected by the
 * player or AI at execution time; therefore no battle instance ID is stored in
 * reusable servant data.
 */
export type ServantEffectTarget = DeclaredActionTarget;

export type ServantEffectDefinition = DeclaredActionEffect;

export interface ServantNoblePhantasmSpecialAttack {
  stableId: string;
  requiredTargetTraits?: readonly string[];
  /** Requires at least one ordinary, removable debuff on each target. */
  requiresRemovableTargetDebuff?: boolean;
  multiplierPermille?: number;
  multiplierPermilleByOvercharge?: readonly [
    number,
    number,
    number,
    number,
    number,
  ];
}

/**
 * A distinct damage packet emitted after the main NP attack. It is still part
 * of the same NP action, but runs all listed Hits even when the retained target
 * has already reached 0 HP during the main packet.
 */
export interface ServantNoblePhantasmAdditionalAttack {
  stableId: string;
  hitWeights: readonly number[];
  damageMultiplierPermilleByOvercharge: readonly [
    number,
    number,
    number,
    number,
    number,
  ];
}

export interface ServantNoblePhantasmAttackEffect {
  kind: "attack";
  stableId: string;
  order: number;
  targetScope: AttackTargetScope;
  hitWeights: readonly number[];
  damageMultiplierPermilleByLevel: readonly [
    number,
    number,
    number,
    number,
    number,
  ];
  specialAttack?: ServantNoblePhantasmSpecialAttack;
  additionalAttack?: ServantNoblePhantasmAdditionalAttack;
}

export type ServantNoblePhantasmEffect =
  | ServantEffectDefinition
  | ServantNoblePhantasmAttackEffect;

export interface ServantActiveSkillDefinition {
  stableId: string;
  name: string;
  /** Omitted when the source lists no rank for this skill. */
  rank?: string;
  slot: 1 | 2 | 3;
  /** Remaining cooldown immediately after use at skill level 10. */
  cooldownAtMax: number;
  effects: readonly ServantEffectDefinition[];
}

export interface ServantClassSkillDefinition {
  stableId: string;
  name: string;
  rank: string;
  effects: readonly ServantEffectDefinition[];
}

export interface ServantNoblePhantasmDefinition {
  stableId: string;
  name: string;
  reading?: string;
  rank: string;
  cardType: CommandCardType;
  effects: readonly ServantNoblePhantasmEffect[];
}

export interface ServantBattleRates {
  /** N/A in internal 0.01%-gauge units. */
  attackNpUnits: number;
  /** N/D in internal 0.01%-gauge units. */
  receivedNpUnits: number;
  attackNpRatePermille: number;
  targetNpRatePermille: number;
  starRatePermille: number;
  starWeight: number;
  targetStarRatePermille: number;
  deathRatePermille: number;
}

export interface ServantDefinition {
  schemaVersion: typeof SERVANT_DATA_SCHEMA_VERSION;
  /** Stable project ID. It must not be a wiki page number. */
  dataId: string;
  /** Optional in-game collection number, retained only as external metadata. */
  collectionNo?: number;
  /** Exact source label when the collection number carries a suffix. */
  collectionLabel?: string;
  name: string;
  rarity: ServantRarity;
  classDisplayName?: string;
  growthTendency?: string;
  attackType?: string;
  contentRevision: "current_upgraded_only";
  /** Active-skill values and cooldowns are always stored at level 10. */
  skillLevelPolicy: "max";
  classKey: string;
  attributeKey: string;
  classAttackCoefficientPermille: number;
  levelStats: readonly [
    ServantLevelStat,
    ServantLevelStat,
    ServantLevelStat,
    ServantLevelStat,
    ServantLevelStat,
    ServantLevelStat,
    ServantLevelStat,
    ServantLevelStat,
  ];
  commandCards: readonly [
    CommandCardType,
    CommandCardType,
    CommandCardType,
    CommandCardType,
    CommandCardType,
  ];
  commandCardHitWeights: readonly [
    readonly number[],
    readonly number[],
    readonly number[],
    readonly number[],
    readonly number[],
  ];
  extraAttackHitWeights: readonly number[];
  battleRates: ServantBattleRates;
  traits: readonly string[];
  activeSkills: readonly [
    ServantActiveSkillDefinition,
    ServantActiveSkillDefinition,
    ServantActiveSkillDefinition,
  ];
  classSkills: readonly ServantClassSkillDefinition[];
  noblePhantasm: ServantNoblePhantasmDefinition;
  sources: readonly ServantSourceReference[];
}

export interface CreateServantBattleInstanceInput {
  instanceId: string;
  side?: BattleSide;
  level: ServantLevel;
  noblePhantasmLevel: NoblePhantasmLevel;
  initialNp?: number;
  attackAdjustment?: number;
  maxHpAdjustment?: number;
}
