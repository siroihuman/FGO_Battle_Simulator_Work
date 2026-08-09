import { assertValidDeclaredActionEffect } from "../../effects/declarations";
import {
  MYSTIC_CODE_DATA_SCHEMA_VERSION,
  type MysticCodeDefinition,
  type MysticCodeSourceReference,
} from "./schema";

export interface MysticCodeDataRegistry {
  schemaVersion: typeof MYSTIC_CODE_DATA_SCHEMA_VERSION;
  byDataId: Readonly<Record<string, MysticCodeDefinition>>;
}

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

function assertSource(source: MysticCodeSourceReference, name: string): void {
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

export function assertValidMysticCodeDefinition(
  definition: MysticCodeDefinition,
): void {
  if (definition.schemaVersion !== MYSTIC_CODE_DATA_SCHEMA_VERSION) {
    throw new RangeError("unsupported Mystic Code data schema version");
  }
  assertStableId(definition.dataId, "Mystic Code dataId");
  assertNonEmpty(definition.name, `${definition.dataId}.name`);
  if (definition.levelPolicy !== "max") {
    throw new RangeError(`${definition.dataId}.levelPolicy must be max`);
  }
  if (definition.skills.length !== 3) {
    throw new RangeError(`${definition.dataId}.skills must contain 3 skills`);
  }
  const stableIds = new Set<string>();
  definition.skills.forEach((skill, index) => {
    if (skill.slot !== index + 1) {
      throw new RangeError(`${definition.dataId}.skills must be ordered by slot`);
    }
    assertStableId(skill.stableId, `${definition.dataId}.skills[${index}].stableId`);
    assertNonEmpty(skill.name, `${definition.dataId}.skills[${index}].name`);
    if (stableIds.has(skill.stableId)) {
      throw new RangeError(`duplicate Mystic Code effect ID: ${skill.stableId}`);
    }
    stableIds.add(skill.stableId);
    if (!Number.isSafeInteger(skill.cooldownAtMax) || skill.cooldownAtMax < 0) {
      throw new RangeError(`${skill.stableId}.cooldownAtMax must be non-negative`);
    }
    if (skill.effects.length === 0) {
      throw new RangeError(`${skill.stableId}.effects must not be empty`);
    }
    skill.effects.forEach((effect, effectIndex) => {
      if (effect.order !== effectIndex + 1) {
        throw new RangeError(
          `${skill.stableId}.effects order must be contiguous from 1`,
        );
      }
      assertStableId(effect.stableId, `${skill.stableId}.effects[${effectIndex}].stableId`);
      if (stableIds.has(effect.stableId)) {
        throw new RangeError(`duplicate Mystic Code effect ID: ${effect.stableId}`);
      }
      stableIds.add(effect.stableId);
      assertValidDeclaredActionEffect(
        effect,
        `${skill.stableId}.effects[${effectIndex}]`,
      );
    });
  });
  if (definition.sources.length === 0) {
    throw new RangeError(`${definition.dataId}.sources must not be empty`);
  }
  definition.sources.forEach((source, index) =>
    assertSource(source, `${definition.dataId}.sources[${index}]`)
  );
}

export function createMysticCodeDataRegistry(
  definitions: readonly MysticCodeDefinition[],
): MysticCodeDataRegistry {
  const byDataId: Record<string, MysticCodeDefinition> = {};
  for (const definition of definitions) {
    assertValidMysticCodeDefinition(definition);
    if (byDataId[definition.dataId]) {
      throw new RangeError(`duplicate Mystic Code dataId: ${definition.dataId}`);
    }
    byDataId[definition.dataId] = definition;
  }
  return {
    schemaVersion: MYSTIC_CODE_DATA_SCHEMA_VERSION,
    byDataId,
  };
}

export function mysticCodeDefinition(
  registry: MysticCodeDataRegistry,
  dataId: string,
): MysticCodeDefinition | null {
  return registry.byDataId[dataId] ?? null;
}
