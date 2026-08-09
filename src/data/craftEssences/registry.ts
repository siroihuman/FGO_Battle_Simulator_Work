import { assertValidDeclaredActionEffect } from "../../effects/declarations";
import {
  CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
  type CraftEssenceDefinition,
  type CraftEssenceSourceReference,
} from "./schema";

export interface CraftEssenceDataRegistry {
  schemaVersion: typeof CRAFT_ESSENCE_DATA_SCHEMA_VERSION;
  byDataId: Readonly<Record<string, CraftEssenceDefinition>>;
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

function assertSource(source: CraftEssenceSourceReference, name: string): void {
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

export function assertValidCraftEssenceDefinition(
  definition: CraftEssenceDefinition,
): void {
  if (definition.schemaVersion !== CRAFT_ESSENCE_DATA_SCHEMA_VERSION) {
    throw new RangeError("unsupported Craft Essence data schema version");
  }
  assertStableId(definition.dataId, "Craft Essence dataId");
  assertNonEmpty(definition.name, `${definition.dataId}.name`);
  if (![1, 2, 3, 4, 5].includes(definition.rarity)) {
    throw new RangeError(`${definition.dataId}.rarity must be from 1 to 5`);
  }
  if (definition.limitBreak !== "base" && definition.limitBreak !== "max") {
    throw new RangeError(`${definition.dataId}.limitBreak is invalid`);
  }
  for (const [name, value] of [
    ["level", definition.level],
    ["attack", definition.attack],
    ["hp", definition.hp],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < (name === "level" ? 1 : 0)) {
      throw new RangeError(`${definition.dataId}.${name} is invalid`);
    }
  }
  const stableIds = new Set<string>();
  definition.startEffects.forEach((effect, index) => {
    if (effect.order !== index + 1) {
      throw new RangeError(
        `${definition.dataId}.startEffects order must be contiguous from 1`,
      );
    }
    assertStableId(effect.stableId, `${definition.dataId}.startEffects[${index}].stableId`);
    if (stableIds.has(effect.stableId)) {
      throw new RangeError(`duplicate Craft Essence effect ID: ${effect.stableId}`);
    }
    stableIds.add(effect.stableId);
    assertValidDeclaredActionEffect(
      effect,
      `${definition.dataId}.startEffects[${index}]`,
    );
    if (effect.action.kind === "apply_effects") {
      effect.action.effects.forEach(({ template }, templateIndex) => {
        if (template.removalPolicy !== "unremovable") {
          throw new RangeError(
            `${definition.dataId}.startEffects[${index}].action.effects[${templateIndex}] must be unremovable`,
          );
        }
      });
    }
  });
  if (definition.sources.length === 0) {
    throw new RangeError(`${definition.dataId}.sources must not be empty`);
  }
  definition.sources.forEach((source, index) =>
    assertSource(source, `${definition.dataId}.sources[${index}]`)
  );
}

export function createCraftEssenceDataRegistry(
  definitions: readonly CraftEssenceDefinition[],
): CraftEssenceDataRegistry {
  const byDataId: Record<string, CraftEssenceDefinition> = {};
  for (const definition of definitions) {
    assertValidCraftEssenceDefinition(definition);
    if (byDataId[definition.dataId]) {
      throw new RangeError(`duplicate Craft Essence dataId: ${definition.dataId}`);
    }
    byDataId[definition.dataId] = definition;
  }
  return {
    schemaVersion: CRAFT_ESSENCE_DATA_SCHEMA_VERSION,
    byDataId,
  };
}

export function craftEssenceDefinition(
  registry: CraftEssenceDataRegistry,
  dataId: string,
): CraftEssenceDefinition | null {
  return registry.byDataId[dataId] ?? null;
}
