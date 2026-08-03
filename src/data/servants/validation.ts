import {
  SERVANT_DATA_SCHEMA_VERSION,
  SERVANT_LEVELS_BY_RARITY,
  type ServantDefinition,
  type ServantEffectDefinition,
  type ServantEffectParameter,
  type ServantEffectTarget,
  type ServantNoblePhantasmAttackEffect,
  type ServantNoblePhantasmEffect,
} from "./schema";

const STABLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MECHANIC_ID = /^[a-z][a-z0-9_]*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new RangeError(`${name} must not be empty`);
  }
}

function assertStableId(value: string, name: string): void {
  if (!STABLE_ID.test(value)) {
    throw new RangeError(`${name} must be a lowercase stable ID`);
  }
  if (/^(?:page|pages)-\d+$/.test(value) || /^\d+$/.test(value)) {
    throw new RangeError(`${name} must not use a source page number`);
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function assertUniqueStrings(values: readonly string[], name: string): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    assertNonEmpty(value, `${name}[${index}]`);
    if (seen.has(value)) {
      throw new RangeError(`${name} contains duplicate value: ${value}`);
    }
    seen.add(value);
  });
}

function assertHitWeights(weights: readonly number[], name: string): void {
  if (weights.length === 0) {
    throw new RangeError(`${name} must not be empty`);
  }
  let total = 0;
  weights.forEach((weight, index) => {
    assertNonNegativeInteger(weight, `${name}[${index}]`);
    total += weight;
  });
  if (!Number.isSafeInteger(total) || total <= 0) {
    throw new RangeError(`${name} total must be positive`);
  }
}

function assertFiveMultipliers(
  values: readonly number[],
  name: string,
): void {
  if (values.length !== 5) {
    throw new RangeError(`${name} must contain levels 1 through 5`);
  }
  values.forEach((value, index) =>
    assertNonNegativeInteger(value, `${name}[${index}]`)
  );
}

function assertParameter(
  value: ServantEffectParameter,
  name: string,
): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`${name} number must be a safe integer`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertParameter(entry, `${name}[${index}]`)
    );
    return;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assertNonEmpty(key, `${name} key`);
      assertParameter(entry, `${name}.${key}`);
    }
    return;
  }
  throw new RangeError(`${name} must be JSON-compatible`);
}

function assertTarget(target: ServantEffectTarget, name: string): void {
  if (!(["self", "allies", "enemies"] as const).includes(target.relation)) {
    throw new RangeError(`${name}.relation is invalid`);
  }
  if (!(["single", "all", "frontmost", "rearmost"] as const).includes(target.selection)) {
    throw new RangeError(`${name}.selection is invalid`);
  }
  if (target.relation === "self") {
    if (target.selection !== "single") {
      throw new RangeError(`${name} self target must use single selection`);
    }
    if (target.excludeSource) {
      throw new RangeError(`${name} self target cannot exclude its source`);
    }
    if (target.includeReserve) {
      throw new RangeError(`${name} self target does not use includeReserve`);
    }
  }
  if (target.requiredTraits) {
    assertUniqueStrings(target.requiredTraits, `${name}.requiredTraits`);
  }
}

function assertEffect(
  effect: ServantEffectDefinition,
  name: string,
  stableIds: Set<string>,
): void {
  if (effect.kind !== "effect") {
    throw new RangeError(`${name}.kind must be effect`);
  }
  registerStableId(effect.stableId, `${name}.stableId`, stableIds);
  assertPositiveInteger(effect.order, `${name}.order`);
  if (!MECHANIC_ID.test(effect.mechanicId)) {
    throw new RangeError(`${name}.mechanicId must be lower_snake_case`);
  }
  assertNonEmpty(effect.description, `${name}.description`);
  assertTarget(effect.target, `${name}.target`);
  if (effect.parameters) {
    for (const [key, value] of Object.entries(effect.parameters)) {
      assertNonEmpty(key, `${name}.parameters key`);
      assertParameter(value, `${name}.parameters.${key}`);
    }
  }
}

function registerStableId(
  stableId: string,
  name: string,
  stableIds: Set<string>,
): void {
  assertStableId(stableId, name);
  if (stableIds.has(stableId)) {
    throw new RangeError(`duplicate servant stable ID: ${stableId}`);
  }
  stableIds.add(stableId);
}

function assertOrderedEffects(
  effects: readonly ServantEffectDefinition[],
  name: string,
  stableIds: Set<string>,
): void {
  if (effects.length === 0) {
    throw new RangeError(`${name} must contain at least one effect`);
  }
  effects.forEach((effect, index) => {
    assertEffect(effect, `${name}[${index}]`, stableIds);
    if (effect.order !== index + 1) {
      throw new RangeError(`${name} effect order must be contiguous from 1`);
    }
  });
}

function assertNpAttack(
  effect: ServantNoblePhantasmAttackEffect,
  name: string,
  stableIds: Set<string>,
): void {
  registerStableId(effect.stableId, `${name}.stableId`, stableIds);
  assertPositiveInteger(effect.order, `${name}.order`);
  if (effect.targetScope !== "single" && effect.targetScope !== "all") {
    throw new RangeError(`${name}.targetScope is invalid`);
  }
  assertHitWeights(effect.hitWeights, `${name}.hitWeights`);
  assertFiveMultipliers(
    effect.damageMultiplierPermilleByLevel,
    `${name}.damageMultiplierPermilleByLevel`,
  );
  if (effect.specialAttack) {
    registerStableId(
      effect.specialAttack.stableId,
      `${name}.specialAttack.stableId`,
      stableIds,
    );
    assertFiveMultipliers(
      effect.specialAttack.multiplierPermilleByOvercharge,
      `${name}.specialAttack.multiplierPermilleByOvercharge`,
    );
    if (effect.specialAttack.requiredTargetTraits) {
      assertUniqueStrings(
        effect.specialAttack.requiredTargetTraits,
        `${name}.specialAttack.requiredTargetTraits`,
      );
    }
  }
}

function assertNoblePhantasmEffects(
  effects: readonly ServantNoblePhantasmEffect[],
  stableIds: Set<string>,
): void {
  if (effects.length === 0) {
    throw new RangeError("noblePhantasm.effects must not be empty");
  }
  let attacks = 0;
  effects.forEach((effect, index) => {
    const name = `noblePhantasm.effects[${index}]`;
    if (effect.order !== index + 1) {
      throw new RangeError(
        "noblePhantasm effect order must be contiguous from 1",
      );
    }
    if (effect.kind === "attack") {
      attacks += 1;
      assertNpAttack(effect, name, stableIds);
    } else {
      assertEffect(effect, name, stableIds);
    }
  });
  if (attacks !== 1) {
    throw new RangeError("noblePhantasm must contain exactly one attack effect");
  }
}

function assertSource(
  source: ServantDefinition["sources"][number],
  index: number,
): void {
  let parsed: URL;
  try {
    parsed = new URL(source.url);
  } catch {
    throw new RangeError(`sources[${index}].url must be an absolute URL`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new RangeError(`sources[${index}].url must use HTTP or HTTPS`);
  }
  if (!ISO_DATE.test(source.checkedAt)) {
    throw new RangeError(`sources[${index}].checkedAt must be YYYY-MM-DD`);
  }
  const normalized = new Date(`${source.checkedAt}T00:00:00.000Z`);
  if (
    Number.isNaN(normalized.getTime())
    || normalized.toISOString().slice(0, 10) !== source.checkedAt
  ) {
    throw new RangeError(`sources[${index}].checkedAt is not a valid date`);
  }
  if (source.note !== undefined) {
    assertNonEmpty(source.note, `sources[${index}].note`);
  }
}

/** Validates one reusable servant record before it enters the registry. */
export function assertValidServantDefinition(
  definition: ServantDefinition,
): void {
  if (definition.schemaVersion !== SERVANT_DATA_SCHEMA_VERSION) {
    throw new RangeError(
      `unsupported servant schema version: ${definition.schemaVersion}`,
    );
  }
  const stableIds = new Set<string>();
  registerStableId(definition.dataId, "dataId", stableIds);
  assertNonEmpty(definition.name, "name");
  if (![0, 1, 2, 3, 4, 5].includes(definition.rarity)) {
    throw new RangeError("rarity must be from 0 to 5");
  }
  if (definition.collectionNo !== undefined) {
    assertPositiveInteger(definition.collectionNo, "collectionNo");
  }
  if (definition.contentRevision !== "current_upgraded_only") {
    throw new RangeError("only current upgraded servant data is supported");
  }
  if (definition.skillLevelPolicy !== "max") {
    throw new RangeError("servant skill data must use maximum level values");
  }
  assertNonEmpty(definition.classKey, "classKey");
  assertNonEmpty(definition.attributeKey, "attributeKey");
  assertPositiveInteger(
    definition.classAttackCoefficientPermille,
    "classAttackCoefficientPermille",
  );

  const expectedLevels = SERVANT_LEVELS_BY_RARITY[definition.rarity];
  if (definition.levelStats.length !== expectedLevels.length) {
    throw new RangeError("levelStats must contain the eight selectable stages");
  }
  definition.levelStats.forEach((stat, index) => {
    if (stat.level !== expectedLevels[index]) {
      throw new RangeError(
        `levelStats[${index}].level must be ${expectedLevels[index]}`,
      );
    }
    assertPositiveInteger(stat.hp, `levelStats[${index}].hp`);
    assertPositiveInteger(stat.attack, `levelStats[${index}].attack`);
  });

  if (definition.commandCards.length !== 5) {
    throw new RangeError("commandCards must contain exactly five cards");
  }
  definition.commandCards.forEach((card, index) => {
    if (card !== "buster" && card !== "arts" && card !== "quick") {
      throw new RangeError(`commandCards[${index}] is invalid`);
    }
  });
  if (definition.commandCardHitWeights.length !== 5) {
    throw new RangeError(
      "commandCardHitWeights must contain exactly five cards",
    );
  }
  definition.commandCardHitWeights.forEach((weights, index) =>
    assertHitWeights(weights, `commandCardHitWeights[${index}]`)
  );
  assertHitWeights(
    definition.extraAttackHitWeights,
    "extraAttackHitWeights",
  );

  const battleRateNames = [
    "attackNpUnits",
    "receivedNpUnits",
    "attackNpRatePermille",
    "targetNpRatePermille",
    "starRatePermille",
    "starWeight",
    "targetStarRatePermille",
    "deathRatePermille",
  ] as const;
  for (const name of battleRateNames) {
    const value = definition.battleRates[name];
    if (name === "targetStarRatePermille") {
      if (!Number.isSafeInteger(value)) {
        throw new RangeError(`${name} must be a safe integer`);
      }
    } else {
      assertNonNegativeInteger(value, name);
    }
  }
  assertUniqueStrings(definition.traits, "traits");

  if (definition.activeSkills.length !== 3) {
    throw new RangeError("activeSkills must contain exactly three skills");
  }
  definition.activeSkills.forEach((skill, index) => {
    registerStableId(
      skill.stableId,
      `activeSkills[${index}].stableId`,
      stableIds,
    );
    assertNonEmpty(skill.name, `activeSkills[${index}].name`);
    assertNonEmpty(skill.rank, `activeSkills[${index}].rank`);
    if (skill.slot !== index + 1) {
      throw new RangeError("active skill slots must be 1, 2, and 3 in order");
    }
    assertNonNegativeInteger(
      skill.cooldownAtMax,
      `activeSkills[${index}].cooldownAtMax`,
    );
    assertOrderedEffects(
      skill.effects,
      `activeSkills[${index}].effects`,
      stableIds,
    );
  });

  definition.classSkills.forEach((skill, index) => {
    registerStableId(
      skill.stableId,
      `classSkills[${index}].stableId`,
      stableIds,
    );
    assertNonEmpty(skill.name, `classSkills[${index}].name`);
    assertNonEmpty(skill.rank, `classSkills[${index}].rank`);
    assertOrderedEffects(
      skill.effects,
      `classSkills[${index}].effects`,
      stableIds,
    );
  });

  registerStableId(
    definition.noblePhantasm.stableId,
    "noblePhantasm.stableId",
    stableIds,
  );
  assertNonEmpty(definition.noblePhantasm.name, "noblePhantasm.name");
  assertNonEmpty(definition.noblePhantasm.rank, "noblePhantasm.rank");
  if (definition.noblePhantasm.reading !== undefined) {
    assertNonEmpty(
      definition.noblePhantasm.reading,
      "noblePhantasm.reading",
    );
  }
  if (
    definition.noblePhantasm.cardType !== "buster"
    && definition.noblePhantasm.cardType !== "arts"
    && definition.noblePhantasm.cardType !== "quick"
  ) {
    throw new RangeError("noblePhantasm.cardType is invalid");
  }
  assertNoblePhantasmEffects(definition.noblePhantasm.effects, stableIds);

  if (definition.sources.length === 0) {
    throw new RangeError("sources must contain at least one reference");
  }
  const sourceUrls = new Set<string>();
  definition.sources.forEach((source, index) => {
    assertSource(source, index);
    if (sourceUrls.has(source.url)) {
      throw new RangeError(`duplicate source URL: ${source.url}`);
    }
    sourceUrls.add(source.url);
  });
}
