import type { CombatantAttackData } from "../../core/battle/actionData";
import type { BattleWaveInput } from "../../core/battle/state";
import type { BattleUnitState } from "../../core/battle/types";
import type { CombatantActionEffectData } from "../../effects/actionData";
import {
  ENEMY_DATA_SCHEMA_VERSION,
  type EnemyDefinition,
  type EnemyEncounterDefinition,
  type EnemyEncounterPlacement,
} from "./schema";
import {
  assertValidEnemyDefinition,
  assertValidEnemyEncounterDefinition,
  assertValidEnemyEncounterPlacement,
} from "./validation";

export interface EnemyDataRegistry {
  schemaVersion: typeof ENEMY_DATA_SCHEMA_VERSION;
  byDataId: Readonly<Record<string, EnemyDefinition>>;
}

export interface EnemyEncounterRegistry {
  schemaVersion: typeof ENEMY_DATA_SCHEMA_VERSION;
  byDataId: Readonly<Record<string, EnemyEncounterDefinition>>;
}

export interface EnemyBattleInstance {
  placement: EnemyEncounterPlacement;
  unit: BattleUnitState;
  attackData: CombatantAttackData;
  actionEffectData: CombatantActionEffectData;
}

export interface EnemyEncounterBattleData {
  encounter: EnemyEncounterDefinition;
  waves: BattleWaveInput[];
  instances: EnemyBattleInstance[];
  attackData: CombatantAttackData[];
  actionEffectData: CombatantActionEffectData[];
}

export function createEnemyDataRegistry(
  definitions: readonly EnemyDefinition[],
): EnemyDataRegistry {
  const byDataId: Record<string, EnemyDefinition> = {};
  for (const definition of definitions) {
    assertValidEnemyDefinition(definition);
    if (byDataId[definition.dataId]) {
      throw new RangeError(`duplicate enemy dataId: ${definition.dataId}`);
    }
    byDataId[definition.dataId] = definition;
  }
  return { schemaVersion: ENEMY_DATA_SCHEMA_VERSION, byDataId };
}

export function createEnemyEncounterRegistry(
  definitions: readonly EnemyEncounterDefinition[],
): EnemyEncounterRegistry {
  const byDataId: Record<string, EnemyEncounterDefinition> = {};
  for (const definition of definitions) {
    assertValidEnemyEncounterDefinition(definition);
    if (byDataId[definition.dataId]) {
      throw new RangeError(`duplicate enemy encounter dataId: ${definition.dataId}`);
    }
    byDataId[definition.dataId] = definition;
  }
  return { schemaVersion: ENEMY_DATA_SCHEMA_VERSION, byDataId };
}

export function enemyDefinition(
  registry: EnemyDataRegistry,
  dataId: string,
): EnemyDefinition | null {
  return registry.byDataId[dataId] ?? null;
}

export function enemyEncounterDefinition(
  registry: EnemyEncounterRegistry,
  dataId: string,
): EnemyEncounterDefinition | null {
  return registry.byDataId[dataId] ?? null;
}

export function createEnemyBattleInstance(
  definition: EnemyDefinition,
  placement: EnemyEncounterPlacement,
): EnemyBattleInstance {
  assertValidEnemyDefinition(definition);
  assertValidEnemyEncounterPlacement(
    placement,
    `${definition.dataId}.placement`,
  );
  if (placement.enemyDataId !== definition.dataId) {
    throw new RangeError(
      `enemy placement dataId mismatch: ${placement.enemyDataId} != ${definition.dataId}`,
    );
  }
  const chargeAttack = definition.chargeAttack;
  if (placement.charge > (chargeAttack?.chargeMax ?? 0)) {
    throw new RangeError(
      `${placement.instanceId}.charge exceeds the configured charge maximum`,
    );
  }
  if (!chargeAttack && placement.charge !== 0) {
    throw new RangeError(
      `${placement.instanceId} without a charge attack must start at zero charge`,
    );
  }
  const actionEffectData: CombatantActionEffectData = {
    instanceId: placement.instanceId,
    dataId: definition.dataId,
    passives: [],
    actions: chargeAttack
      ? [{
          stableId: chargeAttack.stableId,
          name: chargeAttack.name,
          kind: "noble_phantasm",
          attackOrder: 1,
          effects: [],
        }]
      : [],
  };
  return {
    placement,
    unit: {
      instanceId: placement.instanceId,
      dataId: definition.dataId,
      name: definition.name,
      side: "enemy",
      baseMaxHp: placement.hp,
      maxHp: placement.hp,
      hp: placement.hp,
      np: 0,
      deathRatePermille: definition.deathRatePermille,
      alive: true,
      hpGaugeNumber: 1,
      remainingBreakGauges: placement.breakGaugeHp.map((maxHp) => ({ maxHp })),
      breakPending: false,
      lastBreakBattleTurn: null,
      commandCards: [],
      noblePhantasm: null,
      enemyAction: {
        maxActions: definition.maxActions,
        normalAttack: definition.normalAttack
          ? {
              stableId: definition.normalAttack.stableId,
              name: definition.normalAttack.name,
            }
          : null,
        skills: definition.skills.map(({ stableId, name }) => ({ stableId, name })),
        noblePhantasm: chargeAttack
          ? { stableId: chargeAttack.stableId, name: chargeAttack.name }
          : null,
        charge: chargeAttack ? placement.charge : 0,
        chargeMax: chargeAttack?.chargeMax ?? 0,
      },
      traits: [...definition.traits],
      effects: [],
      skillCooldowns: definition.skills.map(() => 0),
    },
    attackData: {
      instanceId: placement.instanceId,
      dataId: definition.dataId,
      attack: placement.attack,
      classKey: definition.classKey,
      attributeKey: definition.attributeKey,
      classAttackCoefficientPermille:
        definition.classAttackCoefficientPermille,
      attackNpUnits: 0,
      receivedNpUnits: 0,
      attackNpRatePermille: definition.attackNpRatePermille,
      targetNpRatePermille: definition.targetNpRatePermille,
      starRatePermille: 0,
      starWeight: 0,
      targetStarRatePermille: definition.targetStarRatePermille,
      commandCardHitWeights: null,
      extraAttackHitWeights: null,
      noblePhantasms: [],
      enemyAttacks: [
        ...(definition.normalAttack
          ? [{
              actionStableId: definition.normalAttack.stableId,
              kind: "normal_attack" as const,
              targetScope: definition.normalAttack.targetScope,
              targetPolicy: definition.normalAttack.targetPolicy,
              cardType: definition.normalAttack.cardType,
              hitWeights: definition.normalAttack.hitWeights,
              cardDamageValuePermille:
                definition.normalAttack.cardDamageValuePermille,
              criticalChancePermille:
                definition.criticalChancePermille,
            }]
          : []),
        ...(chargeAttack
          ? [{
              actionStableId: chargeAttack.stableId,
              kind: "noble_phantasm" as const,
              targetScope: chargeAttack.targetScope,
              targetPolicy: chargeAttack.targetPolicy,
              cardType: chargeAttack.cardType,
              hitWeights: chargeAttack.hitWeights,
              cardDamageValuePermille: 1_000,
              criticalChancePermille: 0,
              npDamageMultiplierPermille:
                chargeAttack.damageMultiplierPermille,
            }]
          : []),
      ],
    },
    actionEffectData,
  };
}

/** Builds all Wave states and instance-keyed action data before battle start. */
export function createEnemyEncounterBattleData(
  registry: EnemyDataRegistry,
  encounter: EnemyEncounterDefinition,
): EnemyEncounterBattleData {
  assertValidEnemyEncounterDefinition(encounter);
  const instances: EnemyBattleInstance[] = [];
  const waves: BattleWaveInput[] = encounter.waves.map((wave) => {
    const frontline: Array<BattleUnitState | null> = Array.from(
      { length: encounter.activeMode },
      () => null,
    );
    wave.frontline.forEach((placement) => {
      const definition = enemyDefinition(registry, placement.enemyDataId);
      if (!definition) {
        throw new RangeError(
          `enemy definition is missing: ${placement.enemyDataId}`,
        );
      }
      const instance = createEnemyBattleInstance(definition, placement);
      instances.push(instance);
      frontline[placement.frontlineSlot - 1] = instance.unit;
    });
    const reserve = wave.reserve.map((placement) => {
      const definition = enemyDefinition(registry, placement.enemyDataId);
      if (!definition) {
        throw new RangeError(
          `enemy definition is missing: ${placement.enemyDataId}`,
        );
      }
      const instance = createEnemyBattleInstance(definition, placement);
      instances.push(instance);
      return instance.unit;
    });
    return { enemy: { frontline, reserve } };
  });
  return {
    encounter,
    waves,
    instances,
    attackData: instances.map(({ attackData }) => attackData),
    actionEffectData: instances.map(({ actionEffectData }) => actionEffectData),
  };
}
