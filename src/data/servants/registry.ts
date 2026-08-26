import type { CombatantAttackData } from "../../core/battle/actionData";
import type { BattleUnitState } from "../../core/battle/types";
import type {
  CombatantActionEffectData,
} from "../../effects/actionData";
import {
  unresolvedActionEffectStableIds,
} from "../../effects/actionData";
import { npCap } from "../../formulas/np";
import {
  SERVANT_DATA_SCHEMA_VERSION,
  SERVANT_LEVELS_BY_RARITY,
  type CreateServantBattleInstanceInput,
  type ServantDefinition,
  type ServantEffectDefinition,
  type ServantLevel,
  type ServantNoblePhantasmAttackEffect,
} from "./schema";
import { assertValidServantDefinition } from "./validation";

export interface ServantDataRegistry {
  schemaVersion: typeof SERVANT_DATA_SCHEMA_VERSION;
  byDataId: Readonly<Record<string, ServantDefinition>>;
}

export interface ServantBattleInstance {
  unit: BattleUnitState;
  attackData: CombatantAttackData;
  actionEffectData: CombatantActionEffectData;
  /**
   * Effects retained in source order but not yet converted to runtime effects.
   * Consumers must not present the instance as fully implemented while this is
   * non-empty.
   */
  unresolvedEffectStableIds: readonly string[];
}

export function createServantDataRegistry(
  definitions: readonly ServantDefinition[],
): ServantDataRegistry {
  const byDataId: Record<string, ServantDefinition> = {};
  for (const definition of definitions) {
    assertValidServantDefinition(definition);
    if (byDataId[definition.dataId]) {
      throw new RangeError(`duplicate servant dataId: ${definition.dataId}`);
    }
    byDataId[definition.dataId] = definition;
  }
  return {
    schemaVersion: SERVANT_DATA_SCHEMA_VERSION,
    byDataId,
  };
}

export function servantDefinition(
  registry: ServantDataRegistry,
  dataId: string,
): ServantDefinition | null {
  return registry.byDataId[dataId] ?? null;
}

function assertInstanceId(instanceId: string): void {
  if (instanceId.trim().length === 0) {
    throw new RangeError("instanceId must not be empty");
  }
}

function assertAdjustment(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function selectedStat(
  definition: ServantDefinition,
  level: ServantLevel,
): ServantDefinition["levelStats"][number] {
  if (!SERVANT_LEVELS_BY_RARITY[definition.rarity].includes(level)) {
    throw new RangeError(
      `level ${level} is not selectable for rarity ${definition.rarity}`,
    );
  }
  const stat = definition.levelStats.find((entry) => entry.level === level);
  if (!stat) {
    throw new RangeError(`level ${level} is missing from ${definition.dataId}`);
  }
  return stat;
}

function noblePhantasmAttack(
  definition: ServantDefinition,
): ServantNoblePhantasmAttackEffect | null {
  const attack = definition.noblePhantasm.effects.find(
    (effect): effect is ServantNoblePhantasmAttackEffect =>
      effect.kind === "attack",
  );
  return attack ?? null;
}

function actionEffectData(
  definition: ServantDefinition,
  instanceId: string,
  attack: ServantNoblePhantasmAttackEffect | null,
): CombatantActionEffectData {
  return {
    instanceId,
    dataId: definition.dataId,
    passives: definition.classSkills.map((skill) => ({
      stableId: skill.stableId,
      name: skill.name,
      effects: skill.effects,
    })),
    actions: [
      ...definition.activeSkills.map((skill) => ({
        stableId: skill.stableId,
        name: skill.name,
        kind: "skill" as const,
        skillSlot: skill.slot,
        cooldownAtMax: skill.cooldownAtMax,
        attackOrder: null,
        effects: skill.effects,
      })),
      {
        stableId: definition.noblePhantasm.stableId,
        name: definition.noblePhantasm.name,
        kind: "noble_phantasm" as const,
        attackOrder: attack?.order ?? null,
        effects: definition.noblePhantasm.effects.filter(
          (effect): effect is ServantEffectDefinition => effect.kind === "effect",
        ),
      },
    ],
  };
}

/**
 * Creates battle-instance state from one validated reusable servant record.
 * Repeated calls with different instance IDs intentionally support duplicate
 * servants with independent selected levels and NP levels.
 */
export function createServantBattleInstance(
  definition: ServantDefinition,
  input: CreateServantBattleInstanceInput,
): ServantBattleInstance {
  assertValidServantDefinition(definition);
  assertInstanceId(input.instanceId);
  const side = input.side ?? "ally";
  if (side !== "ally") {
    throw new RangeError(
      "servant battle instances currently support the ally side only",
    );
  }
  if (![1, 2, 3, 4, 5].includes(input.noblePhantasmLevel)) {
    throw new RangeError("noblePhantasmLevel must be from 1 to 5");
  }
  const initialNp = input.initialNp ?? 0;
  if (!Number.isSafeInteger(initialNp) || initialNp < 0) {
    throw new RangeError("initialNp must be a non-negative safe integer");
  }
  if (initialNp > npCap(input.noblePhantasmLevel)) {
    throw new RangeError("initialNp exceeds the selected NP-level cap");
  }
  const attackAdjustment = input.attackAdjustment ?? 0;
  const maxHpAdjustment = input.maxHpAdjustment ?? 0;
  assertAdjustment(attackAdjustment, "attackAdjustment");
  assertAdjustment(maxHpAdjustment, "maxHpAdjustment");

  const stat = selectedStat(definition, input.level);
  const maxHp = stat.hp + maxHpAdjustment;
  const attackValue = stat.attack + attackAdjustment;
  if (!Number.isSafeInteger(maxHp) || !Number.isSafeInteger(attackValue)) {
    throw new RangeError("adjusted servant stats exceed safe integer range");
  }
  const npAttack = noblePhantasmAttack(definition);
  const specialAttack = npAttack?.specialAttack;
  const combatantEffects = actionEffectData(
    definition,
    input.instanceId,
    npAttack,
  );

  return {
    unit: {
      instanceId: input.instanceId,
      dataId: definition.dataId,
      name: definition.name,
      side,
      baseMaxHp: maxHp,
      maxHp,
      hp: maxHp,
      np: initialNp,
      deathRatePermille: definition.battleRates.deathRatePermille,
      alive: true,
      hpGaugeNumber: 1,
      remainingBreakGauges: [],
      breakPending: false,
      lastBreakBattleTurn: null,
      commandCards: [...definition.commandCards],
      noblePhantasm: {
        stableId: definition.noblePhantasm.stableId,
        name: definition.noblePhantasm.name,
        cardType: definition.noblePhantasm.cardType,
        level: input.noblePhantasmLevel,
      },
      enemyAction: null,
      traits: [...definition.traits],
      effects: [],
      skillCooldowns: [0, 0, 0],
    },
    attackData: {
      instanceId: input.instanceId,
      dataId: definition.dataId,
      attack: attackValue,
      classKey: definition.classKey,
      attributeKey: definition.attributeKey,
      classAttackCoefficientPermille:
        definition.classAttackCoefficientPermille,
      attackNpUnits: definition.battleRates.attackNpUnits,
      receivedNpUnits: definition.battleRates.receivedNpUnits,
      attackNpRatePermille:
        definition.battleRates.attackNpRatePermille,
      targetNpRatePermille:
        definition.battleRates.targetNpRatePermille,
      starRatePermille: definition.battleRates.starRatePermille,
      ...(definition.battleRates.starRateBasisPoints === undefined
        ? {}
        : { starRateBasisPoints: definition.battleRates.starRateBasisPoints }),
      starWeight: definition.battleRates.starWeight,
      targetStarRatePermille:
        definition.battleRates.targetStarRatePermille,
      commandCardHitWeights: definition.commandCardHitWeights,
      extraAttackHitWeights: definition.extraAttackHitWeights,
      noblePhantasms: npAttack ? [
        {
          stableId: definition.noblePhantasm.stableId,
          targetScope: npAttack.targetScope,
          hitWeights: npAttack.hitWeights,
          damageMultiplierPermilleByLevel:
            npAttack.damageMultiplierPermilleByLevel,
          ...(specialAttack
            ? {
                ...(specialAttack.multiplierPermille !== undefined
                  ? {
                      specialAttackPermille:
                        specialAttack.multiplierPermille,
                    }
                  : {
                      specialAttackPermilleByOvercharge:
                        specialAttack.multiplierPermilleByOvercharge,
                    }),
                ...(specialAttack.requiredTargetTraits
                  ? {
                      specialAttackRequiredTargetTraits:
                        specialAttack.requiredTargetTraits,
                    }
                  : {}),
                ...(specialAttack.requiresRemovableTargetDebuff
                  ? { specialAttackRequiresRemovableTargetDebuff: true }
                  : {}),
              }
            : {}),
          ...(npAttack.additionalAttack
            ? {
                additionalAttack: {
                  stableId: npAttack.additionalAttack.stableId,
                  hitWeights: npAttack.additionalAttack.hitWeights,
                  damageMultiplierPermilleByOvercharge:
                    npAttack.additionalAttack
                      .damageMultiplierPermilleByOvercharge,
                },
              }
            : {}),
        },
      ] : [],
      enemyAttacks: [],
    },
    actionEffectData: combatantEffects,
    unresolvedEffectStableIds: [
      ...unresolvedActionEffectStableIds(combatantEffects),
    ],
  };
}
