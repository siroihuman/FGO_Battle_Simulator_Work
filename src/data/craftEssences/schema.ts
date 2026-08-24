import type { DeclaredActionEffect } from "../../effects/declarations";

export const CRAFT_ESSENCE_DATA_SCHEMA_VERSION = 1 as const;

export type CraftEssenceRarity = 1 | 2 | 3 | 4 | 5;
export type CraftEssenceLimitBreak = "base" | "max";

export interface CraftEssenceSourceReference {
  url: string;
  checkedAt: string;
  note?: string;
}

/**
 * One reusable Craft Essence record at a specific level and limit-break state.
 * ATK/HP are final selected values; battle-instance IDs are kept outside data.
 */
export interface CraftEssenceDefinition {
  schemaVersion: typeof CRAFT_ESSENCE_DATA_SCHEMA_VERSION;
  dataId: string;
  name: string;
  rarity: CraftEssenceRarity;
  limitBreak: CraftEssenceLimitBreak;
  level: number;
  attack: number;
  hp: number;
  /**
   * When set, this Craft Essence can only be equipped by these exact servant
   * data IDs. This deliberately distinguishes class changes and variants.
   */
  eligibleServantDataIds?: readonly string[];
  /** Source-ordered effects applied once before the first card draw. */
  startEffects: readonly DeclaredActionEffect[];
  /** Effects supplied to allies only while this equipped servant is frontline. */
  fieldEffects?: readonly DeclaredActionEffect[];
  sources: readonly CraftEssenceSourceReference[];
}
