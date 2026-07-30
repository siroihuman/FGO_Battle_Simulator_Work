import type {
  BattleFormation,
  BattleSide,
  BattleUnitState,
} from "../../src/core/battle/types";

export function unit(
  instanceId: string,
  side: BattleSide,
  options: Partial<BattleUnitState> = {},
): BattleUnitState {
  const baseMaxHp = options.baseMaxHp ?? options.maxHp ?? 10_000;
  return {
    instanceId,
    dataId: options.dataId ?? instanceId.replace(/\d+$/, ""),
    name: options.name ?? instanceId,
    side,
    baseMaxHp,
    maxHp: options.maxHp ?? baseMaxHp,
    hp: options.hp ?? 10_000,
    np: options.np ?? 0,
    deathRatePermille: options.deathRatePermille ?? 0,
    alive: options.alive ?? true,
    hpGaugeNumber: options.hpGaugeNumber ?? 1,
    remainingBreakGauges: options.remainingBreakGauges ?? [],
    breakPending: options.breakPending ?? false,
    lastBreakBattleTurn: options.lastBreakBattleTurn ?? null,
    commandCards: options.commandCards ?? [
      "buster",
      "buster",
      "arts",
      "arts",
      "quick",
    ],
    traits: options.traits ?? [],
    effects: options.effects ?? [],
    skillCooldowns: options.skillCooldowns ?? [0, 0, 0],
  };
}

export function formation(): BattleFormation {
  return {
    ally: {
      frontline: [
        unit("ally-a", "ally", { dataId: "same-servant", traits: ["human"] }),
        unit("ally-b", "ally", { dataId: "same-servant", traits: ["divine"] }),
        unit("ally-c", "ally"),
      ],
      reserve: [
        unit("ally-d", "ally", { traits: ["divine"] }),
        unit("ally-e", "ally"),
        unit("ally-f", "ally"),
      ],
    },
    enemy: {
      frontline: [
        unit("enemy-a", "enemy", { traits: ["dragon"] }),
        null,
        unit("enemy-c", "enemy"),
      ],
      reserve: [unit("enemy-d", "enemy", { traits: ["dragon"] })],
    },
  };
}
