import type {
  BattleUnitState,
  CommandCardType,
} from "./types";
import type {
  NoblePhantasmLevel,
} from "../../formulas/np";

export type AttackTargetScope = "single" | "all";
export type EnemyAttackTargetPolicy =
  | "frontmost_living_ally"
  | "random_living_ally_frontline";
export type EnemyDamagingActionKind =
  | "normal_attack"
  | "noble_phantasm";

export interface NoblePhantasmAttackData {
  stableId: string;
  targetScope: AttackTargetScope;
  hitWeights: readonly number[];
  /** NP1 through NP5, in permille. */
  damageMultiplierPermilleByLevel: readonly [
    number,
    number,
    number,
    number,
    number,
  ];
  /** Optional OC1 through OC5 special-attack multiplier. */
  specialAttackPermilleByOvercharge?: readonly [
    number,
    number,
    number,
    number,
    number,
  ];
  /** Every listed trait must be effective on the target at damage setup. */
  specialAttackRequiredTargetTraits?: readonly string[];
}

export interface EnemyAttackActionData {
  actionStableId: string;
  kind: EnemyDamagingActionKind;
  targetScope: AttackTargetScope;
  /** JSON-safe single-target selection. Omitted data keeps the legacy frontmost policy. */
  targetPolicy?: EnemyAttackTargetPolicy;
  cardType: CommandCardType;
  hitWeights: readonly number[];
  cardDamageValuePermille: number;
  /** Enemy normal-attack critical rate. Enemy NPs must use zero. */
  criticalChancePermille?: number;
  npDamageMultiplierPermille?: number;
  npSpecialAttackPermille?: number;
}

/**
 * Immutable numeric data selected for one battle participant. It is keyed by
 * instanceId, rather than dataId, so duplicate servants may use different
 * levels, Fous, or equipment in the same party.
 */
export interface CombatantAttackData {
  instanceId: string;
  dataId: string;
  attack: number;
  classKey: string;
  attributeKey: string;
  classAttackCoefficientPermille: number;
  /** Servant N/A in internal 0.01%-gauge units. */
  attackNpUnits: number;
  /** Servant N/D in internal 0.01%-gauge units. */
  receivedNpUnits: number;
  /** Source ATDR used when an enemy attack grants received NP. */
  attackNpRatePermille: number;
  /** Target DTDR used for attack-side NP gain. */
  targetNpRatePermille: number;
  /** Source SR used for command-star generation. */
  starRatePermille: number;
  /** Base command-card star concentration (SW/CriticalWeight). */
  starWeight: number;
  /** Target DSR added to command-star generation. */
  targetStarRatePermille: number;
  /** Five card-specific Hit distributions, or null for a non-servant. */
  commandCardHitWeights:
    | readonly [
        readonly number[],
        readonly number[],
        readonly number[],
        readonly number[],
        readonly number[],
      ]
    | null;
  extraAttackHitWeights: readonly number[] | null;
  noblePhantasms: readonly NoblePhantasmAttackData[];
  enemyAttacks: readonly EnemyAttackActionData[];
}

export interface AttackAffinityTables {
  class: Readonly<Record<string, Readonly<Record<string, number>>>>;
  attribute: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export interface BattleAttackDataRegistry {
  byInstanceId: Readonly<Record<string, CombatantAttackData>>;
  affinities: AttackAffinityTables;
}

const EMPTY_AFFINITIES: AttackAffinityTables = {
  class: {},
  attribute: {},
};

function assertNonNegativeInteger(
  value: number,
  name: string,
): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `${name} must be a non-negative safe integer`,
    );
  }
}

function assertNonEmptyKey(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new RangeError(`${name} must not be empty`);
  }
}

function validateHitWeights(
  weights: readonly number[],
  name: string,
): void {
  if (weights.length === 0) {
    throw new RangeError(`${name} must not be empty`);
  }
  let total = 0;
  weights.forEach((weight, index) => {
    if (!Number.isSafeInteger(weight) || weight < 0) {
      throw new RangeError(
        `${name}[${index}] must be a non-negative safe integer`,
      );
    }
    total += weight;
  });
  if (!Number.isSafeInteger(total) || total <= 0) {
    throw new RangeError(`${name} total must be positive`);
  }
}

function validateMultiplierTuple(
  values: readonly number[],
  name: string,
): void {
  if (values.length !== 5) {
    throw new RangeError(`${name} must contain NP/OC levels 1 through 5`);
  }
  values.forEach((value, index) =>
    assertNonNegativeInteger(value, `${name}[${index}]`)
  );
}

function validateTraitIds(
  values: readonly string[],
  name: string,
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    assertNonEmptyKey(value, `${name}[${index}]`);
    if (seen.has(value)) {
      throw new RangeError(`${name} contains duplicate value: ${value}`);
    }
    seen.add(value);
  });
}

function validateCombatant(data: CombatantAttackData): void {
  assertNonEmptyKey(data.instanceId, "instanceId");
  assertNonEmptyKey(data.dataId, `${data.instanceId}.dataId`);
  assertNonEmptyKey(data.classKey, `${data.instanceId}.classKey`);
  assertNonEmptyKey(data.attributeKey, `${data.instanceId}.attributeKey`);
  for (const [name, value] of [
    ["attack", data.attack],
    ["classAttackCoefficientPermille", data.classAttackCoefficientPermille],
    ["attackNpUnits", data.attackNpUnits],
    ["receivedNpUnits", data.receivedNpUnits],
    ["attackNpRatePermille", data.attackNpRatePermille],
    ["targetNpRatePermille", data.targetNpRatePermille],
    ["starRatePermille", data.starRatePermille],
    ["starWeight", data.starWeight],
  ] as const) {
    assertNonNegativeInteger(value, `${data.instanceId}.${name}`);
  }
  if (!Number.isSafeInteger(data.targetStarRatePermille)) {
    throw new RangeError(
      `${data.instanceId}.targetStarRatePermille must be a safe integer`,
    );
  }

  if (data.commandCardHitWeights) {
    if (data.commandCardHitWeights.length !== 5) {
      throw new RangeError(
        `${data.instanceId}.commandCardHitWeights must contain five cards`,
      );
    }
    data.commandCardHitWeights.forEach((weights, index) =>
      validateHitWeights(
        weights,
        `${data.instanceId}.commandCardHitWeights[${index}]`,
      )
    );
  }
  if (data.extraAttackHitWeights) {
    validateHitWeights(
      data.extraAttackHitWeights,
      `${data.instanceId}.extraAttackHitWeights`,
    );
  }

  const noblePhantasmIds = new Set<string>();
  for (const noblePhantasm of data.noblePhantasms) {
    assertNonEmptyKey(
      noblePhantasm.stableId,
      `${data.instanceId}.noblePhantasm.stableId`,
    );
    if (noblePhantasmIds.has(noblePhantasm.stableId)) {
      throw new RangeError(
        `duplicate noble phantasm attack data: ${data.instanceId}/${noblePhantasm.stableId}`,
      );
    }
    noblePhantasmIds.add(noblePhantasm.stableId);
    validateHitWeights(
      noblePhantasm.hitWeights,
      `${data.instanceId}.${noblePhantasm.stableId}.hitWeights`,
    );
    validateMultiplierTuple(
      noblePhantasm.damageMultiplierPermilleByLevel,
      `${data.instanceId}.${noblePhantasm.stableId}.damageMultiplierPermilleByLevel`,
    );
    if (noblePhantasm.specialAttackPermilleByOvercharge) {
      validateMultiplierTuple(
        noblePhantasm.specialAttackPermilleByOvercharge,
        `${data.instanceId}.${noblePhantasm.stableId}.specialAttackPermilleByOvercharge`,
      );
    }
    if (noblePhantasm.specialAttackRequiredTargetTraits) {
      if (!noblePhantasm.specialAttackPermilleByOvercharge) {
        throw new RangeError(
          `${data.instanceId}.${noblePhantasm.stableId}.specialAttackRequiredTargetTraits requires special-attack multipliers`,
        );
      }
      validateTraitIds(
        noblePhantasm.specialAttackRequiredTargetTraits,
        `${data.instanceId}.${noblePhantasm.stableId}.specialAttackRequiredTargetTraits`,
      );
    }
  }

  const enemyActionIds = new Set<string>();
  for (const action of data.enemyAttacks) {
    assertNonEmptyKey(
      action.actionStableId,
      `${data.instanceId}.enemyAttack.actionStableId`,
    );
    if (enemyActionIds.has(action.actionStableId)) {
      throw new RangeError(
        `duplicate enemy attack data: ${data.instanceId}/${action.actionStableId}`,
      );
    }
    enemyActionIds.add(action.actionStableId);
    if (
      action.kind !== "normal_attack"
      && action.kind !== "noble_phantasm"
    ) {
      throw new RangeError(
        `${data.instanceId}.${action.actionStableId}.kind is invalid`,
      );
    }
    if (action.targetScope !== "single" && action.targetScope !== "all") {
      throw new RangeError(
        `${data.instanceId}.${action.actionStableId}.targetScope is invalid`,
      );
    }
    const targetPolicy = action.targetPolicy ?? "frontmost_living_ally";
    if (
      targetPolicy !== "frontmost_living_ally"
      && targetPolicy !== "random_living_ally_frontline"
    ) {
      throw new RangeError(
        `${data.instanceId}.${action.actionStableId}.targetPolicy is invalid`,
      );
    }
    if (action.targetScope === "all" && action.targetPolicy !== undefined) {
      throw new RangeError(
        `${data.instanceId}.${action.actionStableId}.targetPolicy requires single targetScope`,
      );
    }
    if (
      action.cardType !== "buster"
      && action.cardType !== "arts"
      && action.cardType !== "quick"
    ) {
      throw new RangeError(
        `${data.instanceId}.${action.actionStableId}.cardType is invalid`,
      );
    }
    validateHitWeights(
      action.hitWeights,
      `${data.instanceId}.${action.actionStableId}.hitWeights`,
    );
    assertNonNegativeInteger(
      action.cardDamageValuePermille,
      `${data.instanceId}.${action.actionStableId}.cardDamageValuePermille`,
    );
    const criticalChancePermille = action.criticalChancePermille ?? 0;
    assertNonNegativeInteger(
      criticalChancePermille,
      `${data.instanceId}.${action.actionStableId}.criticalChancePermille`,
    );
    if (criticalChancePermille > 1_000) {
      throw new RangeError(
        `${data.instanceId}.${action.actionStableId}.criticalChancePermille must not exceed 1000`,
      );
    }
    if (action.kind === "noble_phantasm" && criticalChancePermille !== 0) {
      throw new RangeError(
        `${data.instanceId}.${action.actionStableId} noble phantasm cannot critically hit`,
      );
    }
    if (
      action.kind === "normal_attack"
      && (
        action.npDamageMultiplierPermille !== undefined
        || action.npSpecialAttackPermille !== undefined
      )
    ) {
      throw new RangeError(
        `${data.instanceId}.${action.actionStableId} normal attack cannot use NP multipliers`,
      );
    }
    if (
      action.kind === "noble_phantasm"
      && action.npDamageMultiplierPermille === undefined
    ) {
      throw new RangeError(
        `${data.instanceId}.${action.actionStableId} noble phantasm requires npDamageMultiplierPermille`,
      );
    }
    if (action.npDamageMultiplierPermille !== undefined) {
      assertNonNegativeInteger(
        action.npDamageMultiplierPermille,
        `${data.instanceId}.${action.actionStableId}.npDamageMultiplierPermille`,
      );
    }
    if (action.npSpecialAttackPermille !== undefined) {
      assertNonNegativeInteger(
        action.npSpecialAttackPermille,
        `${data.instanceId}.${action.actionStableId}.npSpecialAttackPermille`,
      );
    }
  }
}

function validateAffinityTable(
  table: AttackAffinityTables["class"],
  name: string,
): void {
  for (const [sourceKey, targets] of Object.entries(table)) {
    assertNonEmptyKey(sourceKey, `${name} source key`);
    for (const [targetKey, value] of Object.entries(targets)) {
      assertNonEmptyKey(targetKey, `${name} target key`);
      assertNonNegativeInteger(
        value,
        `${name}.${sourceKey}.${targetKey}`,
      );
    }
  }
}

/**
 * Validates and indexes battle-specific attack data before any action or RNG
 * work begins.
 */
export function createBattleAttackDataRegistry(
  combatants: readonly CombatantAttackData[],
  affinities: AttackAffinityTables = EMPTY_AFFINITIES,
): BattleAttackDataRegistry {
  validateAffinityTable(affinities.class, "class affinity");
  validateAffinityTable(affinities.attribute, "attribute affinity");
  const byInstanceId: Record<string, CombatantAttackData> = {};
  for (const combatant of combatants) {
    validateCombatant(combatant);
    if (byInstanceId[combatant.instanceId]) {
      throw new RangeError(
        `duplicate attack-data instanceId: ${combatant.instanceId}`,
      );
    }
    byInstanceId[combatant.instanceId] = combatant;
  }
  return { byInstanceId, affinities };
}

export function combatantAttackData(
  registry: BattleAttackDataRegistry,
  unit: Pick<BattleUnitState, "instanceId" | "dataId">,
): CombatantAttackData | null {
  const data = registry.byInstanceId[unit.instanceId] ?? null;
  if (data && data.dataId !== unit.dataId) {
    throw new RangeError(
      `stale attack data for ${unit.instanceId}: ${data.dataId} != ${unit.dataId}`,
    );
  }
  return data;
}

export function noblePhantasmAttackData(
  combatant: CombatantAttackData,
  stableId: string,
): NoblePhantasmAttackData | null {
  return combatant.noblePhantasms.find(
    (profile) => profile.stableId === stableId,
  ) ?? null;
}

export function enemyAttackActionData(
  combatant: CombatantAttackData,
  actionStableId: string,
  kind: EnemyDamagingActionKind,
): EnemyAttackActionData | null {
  return combatant.enemyAttacks.find(
    (profile) =>
      profile.actionStableId === actionStableId
      && profile.kind === kind,
  ) ?? null;
}

export function noblePhantasmDamageMultiplier(
  data: NoblePhantasmAttackData,
  level: NoblePhantasmLevel,
): number {
  return data.damageMultiplierPermilleByLevel[level - 1];
}

export function affinityPermille(
  table: Readonly<Record<string, Readonly<Record<string, number>>>>,
  sourceKey: string,
  targetKey: string,
): number {
  return table[sourceKey]?.[targetKey] ?? 1_000;
}
