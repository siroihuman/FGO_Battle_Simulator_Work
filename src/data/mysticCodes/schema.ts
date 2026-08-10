import type { DeclaredActionEffect } from "../../effects/declarations";

export const MYSTIC_CODE_DATA_SCHEMA_VERSION = 2 as const;

export interface MysticCodeSourceReference {
  url: string;
  checkedAt: string;
  note?: string;
}

export interface MysticCodeSkillDefinition {
  stableId: string;
  name: string;
  slot: 1 | 2 | 3;
  /** Remaining cooldown immediately after use at maximum Mystic Code level. */
  cooldownAtMax: number;
  execution: "effects" | "order_change";
  effects: readonly DeclaredActionEffect[];
}

export interface MysticCodeDefinition {
  schemaVersion: typeof MYSTIC_CODE_DATA_SCHEMA_VERSION;
  dataId: string;
  name: string;
  levelPolicy: "max";
  skills: readonly [
    MysticCodeSkillDefinition,
    MysticCodeSkillDefinition,
    MysticCodeSkillDefinition,
  ];
  sources: readonly MysticCodeSourceReference[];
}
