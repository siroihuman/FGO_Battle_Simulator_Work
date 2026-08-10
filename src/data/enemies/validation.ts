import {
  MAX_ENEMY_HP_GAUGES,
  MAX_WAVE_COUNT,
  MIN_WAVE_COUNT,
} from "../../core/battle/state";
import {
  ENEMY_DATA_SCHEMA_VERSION,
  type EnemyAttackDefinition,
  type EnemyChargeAttackDefinition,
  type EnemyDefinition,
  type EnemyEncounterDefinition,
  type EnemyEncounterPlacement,
  type EnemySourceReference,
} from "./schema";

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new RangeError(`${name} must not be empty`);
  }
}

function assertStableId(value: string, name: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(value)) {
    throw new RangeError(`${name} must be a lowercase stable ID`);
  }
}

function assertInteger(
  value: number,
  name: string,
  minimum = 0,
): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be a safe integer >= ${minimum}`);
  }
}

function assertPermille(value: number, name: string): void {
  assertInteger(value, name);
  if (value > 1_000) {
    throw new RangeError(`${name} must not exceed 1000`);
  }
}

function assertSource(source: EnemySourceReference, name: string): void {
  try {
    const url = new URL(source.url);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error();
    }
  } catch {
    throw new RangeError(`${name}.url must be an HTTP URL`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source.checkedAt)) {
    throw new RangeError(`${name}.checkedAt must use YYYY-MM-DD`);
  }
}

function assertSources(
  sources: readonly EnemySourceReference[],
  name: string,
): void {
  if (sources.length === 0) {
    throw new RangeError(`${name} must not be empty`);
  }
  sources.forEach((source, index) =>
    assertSource(source, `${name}[${index}]`)
  );
}

function assertHitWeights(weights: readonly number[], name: string): void {
  if (weights.length === 0) {
    throw new RangeError(`${name} must not be empty`);
  }
  let total = 0;
  weights.forEach((weight, index) => {
    assertInteger(weight, `${name}[${index}]`);
    total += weight;
  });
  if (!Number.isSafeInteger(total) || total <= 0) {
    throw new RangeError(`${name} total must be positive`);
  }
}

function assertAttackShape(
  attack: EnemyAttackDefinition | EnemyChargeAttackDefinition,
  name: string,
): void {
  assertStableId(attack.stableId, `${name}.stableId`);
  assertNonEmpty(attack.name, `${name}.name`);
  if (attack.targetScope !== "single" && attack.targetScope !== "all") {
    throw new RangeError(`${name}.targetScope is invalid`);
  }
  if (attack.targetScope === "single") {
    if (
      attack.targetPolicy !== "frontmost_living_ally"
      && attack.targetPolicy !== "random_living_ally_frontline"
    ) {
      throw new RangeError(`${name}.targetPolicy is invalid`);
    }
  } else if (attack.targetPolicy !== undefined) {
    throw new RangeError(`${name}.targetPolicy requires single targetScope`);
  }
  if (
    attack.cardType !== "buster"
    && attack.cardType !== "arts"
    && attack.cardType !== "quick"
  ) {
    throw new RangeError(`${name}.cardType is invalid`);
  }
  assertHitWeights(attack.hitWeights, `${name}.hitWeights`);
}

export function assertValidEnemyDefinition(
  definition: EnemyDefinition,
): void {
  if (definition.schemaVersion !== ENEMY_DATA_SCHEMA_VERSION) {
    throw new RangeError("unsupported enemy data schema version");
  }
  assertStableId(definition.dataId, "enemy dataId");
  assertNonEmpty(definition.name, `${definition.dataId}.name`);
  if (definition.category !== "normal_enemy") {
    throw new RangeError(`${definition.dataId}.category is unsupported`);
  }
  assertInteger(
    definition.externalIds.atlasAcademyServantId,
    `${definition.dataId}.externalIds.atlasAcademyServantId`,
    1,
  );
  assertInteger(
    definition.externalIds.atlasAcademyAiId,
    `${definition.dataId}.externalIds.atlasAcademyAiId`,
    1,
  );
  assertNonEmpty(definition.classKey, `${definition.dataId}.classKey`);
  assertNonEmpty(definition.attributeKey, `${definition.dataId}.attributeKey`);
  assertInteger(
    definition.classAttackCoefficientPermille,
    `${definition.dataId}.classAttackCoefficientPermille`,
  );
  const traits = new Set<string>();
  definition.traits.forEach((trait, index) => {
    assertNonEmpty(trait, `${definition.dataId}.traits[${index}]`);
    if (traits.has(trait)) {
      throw new RangeError(`${definition.dataId}.traits contains ${trait} twice`);
    }
    traits.add(trait);
  });
  assertPermille(
    definition.deathRatePermille,
    `${definition.dataId}.deathRatePermille`,
  );
  assertPermille(
    definition.criticalChancePermille,
    `${definition.dataId}.criticalChancePermille`,
  );
  assertInteger(
    definition.attackNpRatePermille,
    `${definition.dataId}.attackNpRatePermille`,
  );
  assertInteger(
    definition.targetNpRatePermille,
    `${definition.dataId}.targetNpRatePermille`,
  );
  if (!Number.isSafeInteger(definition.targetStarRatePermille)) {
    throw new RangeError(
      `${definition.dataId}.targetStarRatePermille must be a safe integer`,
    );
  }
  if (
    definition.maxActions !== "auto"
    && definition.maxActions !== 1
    && definition.maxActions !== 2
    && definition.maxActions !== 3
  ) {
    throw new RangeError(`${definition.dataId}.maxActions is invalid`);
  }
  const actionIds = new Set<string>();
  if (definition.normalAttack) {
    assertAttackShape(
      definition.normalAttack,
      `${definition.dataId}.normalAttack`,
    );
    assertInteger(
      definition.normalAttack.cardDamageValuePermille,
      `${definition.dataId}.normalAttack.cardDamageValuePermille`,
    );
    actionIds.add(definition.normalAttack.stableId);
  }
  definition.skills.forEach((skill, index) => {
    assertStableId(skill.stableId, `${definition.dataId}.skills[${index}].stableId`);
    assertNonEmpty(skill.name, `${definition.dataId}.skills[${index}].name`);
    if (actionIds.has(skill.stableId)) {
      throw new RangeError(`duplicate enemy action ID: ${skill.stableId}`);
    }
    actionIds.add(skill.stableId);
  });
  if (definition.chargeAttack) {
    const charge = definition.chargeAttack;
    assertAttackShape(charge, `${definition.dataId}.chargeAttack`);
    assertInteger(
      charge.damageMultiplierPermille,
      `${definition.dataId}.chargeAttack.damageMultiplierPermille`,
    );
    assertInteger(charge.chargeMax, `${definition.dataId}.chargeAttack.chargeMax`, 1);
    if (charge.levelScaling !== "fixed" || charge.overchargeScaling !== "none") {
      throw new RangeError(
        `${definition.dataId}.chargeAttack scaling is unsupported`,
      );
    }
    if (actionIds.has(charge.stableId)) {
      throw new RangeError(`duplicate enemy action ID: ${charge.stableId}`);
    }
  }
  assertSources(definition.sources, `${definition.dataId}.sources`);
}

export function assertValidEnemyEncounterPlacement(
  placement: EnemyEncounterPlacement,
  name: string,
  activeMode: number = 6,
): void {
  assertStableId(placement.instanceId, `${name}.instanceId`);
  assertStableId(placement.enemyDataId, `${name}.enemyDataId`);
  assertNonEmpty(placement.encounterLabel, `${name}.encounterLabel`);
  assertInteger(placement.frontlineSlot, `${name}.frontlineSlot`, 1);
  if (placement.frontlineSlot > activeMode) {
    throw new RangeError(`${name}.frontlineSlot exceeds activeMode`);
  }
  assertInteger(placement.level, `${name}.level`, 1);
  assertInteger(placement.hp, `${name}.hp`, 1);
  assertInteger(placement.attack, `${name}.attack`);
  assertInteger(placement.charge, `${name}.charge`);
  if (placement.breakGaugeHp.length >= MAX_ENEMY_HP_GAUGES) {
    throw new RangeError(`${name}.breakGaugeHp exceeds the gauge limit`);
  }
  placement.breakGaugeHp.forEach((hp, index) =>
    assertInteger(hp, `${name}.breakGaugeHp[${index}]`, 1)
  );
}

export function assertValidEnemyEncounterDefinition(
  encounter: EnemyEncounterDefinition,
): void {
  if (encounter.schemaVersion !== ENEMY_DATA_SCHEMA_VERSION) {
    throw new RangeError("unsupported enemy encounter schema version");
  }
  assertStableId(encounter.dataId, "enemy encounter dataId");
  assertNonEmpty(encounter.name, `${encounter.dataId}.name`);
  if (encounter.activeMode !== 3 && encounter.activeMode !== 6) {
    throw new RangeError(`${encounter.dataId}.activeMode is invalid`);
  }
  if (
    encounter.replacementMode !== "standard"
    && encounter.replacementMode !== "immediate"
  ) {
    throw new RangeError(`${encounter.dataId}.replacementMode is invalid`);
  }
  if (
    encounter.waves.length < MIN_WAVE_COUNT
    || encounter.waves.length > MAX_WAVE_COUNT
  ) {
    throw new RangeError(`${encounter.dataId}.waves count is invalid`);
  }
  const instanceIds = new Set<string>();
  encounter.waves.forEach((wave, waveIndex) => {
    if (wave.frontline.length === 0) {
      throw new RangeError(`${encounter.dataId}.waves[${waveIndex}] has no frontline`);
    }
    const slots = new Set<number>();
    for (const [area, placements] of [
      ["frontline", wave.frontline],
      ["reserve", wave.reserve],
    ] as const) {
      placements.forEach((placement, index) => {
        const name = `${encounter.dataId}.waves[${waveIndex}].${area}[${index}]`;
        assertValidEnemyEncounterPlacement(
          placement,
          name,
          encounter.activeMode,
        );
        if (instanceIds.has(placement.instanceId)) {
          throw new RangeError(`duplicate enemy instanceId: ${placement.instanceId}`);
        }
        instanceIds.add(placement.instanceId);
        if (area === "frontline") {
          if (slots.has(placement.frontlineSlot)) {
            throw new RangeError(`${name}.frontlineSlot is duplicated`);
          }
          slots.add(placement.frontlineSlot);
        }
      });
    }
  });
  assertSources(encounter.sources, `${encounter.dataId}.sources`);
}
