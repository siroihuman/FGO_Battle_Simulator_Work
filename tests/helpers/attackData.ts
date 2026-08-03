import type {
  CombatantAttackData,
} from "../../src/core/battle/actionData";

const DEFAULT_COMMAND_HITS = [
  [1],
  [1],
  [1],
  [1],
  [1],
] as const;

export function combatantData(
  instanceId: string,
  dataId: string,
  options: Partial<CombatantAttackData> = {},
): CombatantAttackData {
  return {
    instanceId,
    dataId,
    attack: 10_000,
    classKey: "neutral",
    attributeKey: "neutral",
    classAttackCoefficientPermille: 1_000,
    attackNpUnits: 100,
    receivedNpUnits: 300,
    attackNpRatePermille: 1_000,
    targetNpRatePermille: 1_000,
    starRatePermille: 100,
    starWeight: 100,
    targetStarRatePermille: 0,
    commandCardHitWeights: DEFAULT_COMMAND_HITS,
    extraAttackHitWeights: [1],
    noblePhantasms: [],
    enemyAttacks: [],
    ...options,
  };
}
