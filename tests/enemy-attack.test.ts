import { describe, expect, it } from "vitest";
import {
  createBattleAttackDataRegistry,
} from "../src/core/battle/actionData";
import {
  findUnitLocation,
} from "../src/core/battle/formation";
import {
  beginAllyTurnEnd,
  completeAllyTurnEnd,
} from "../src/core/battle/progression";
import {
  createBattleState,
  type BattleState,
} from "../src/core/battle/state";
import type {
  EnemyActionState,
} from "../src/core/battle/types";
import { BattleRng } from "../src/core/rng";
import {
  resolveEnemyAttacks,
  type EnemyAttackDetail,
} from "../src/ai/enemyAttack";
import { combatantData } from "./helpers/attackData";
import { unit } from "./helpers/battle";

function noblePhantasm() {
  return {
    stableId: "ally-np",
    name: "Ally NP",
    cardType: "arts" as const,
    level: 1 as const,
  };
}

function enemyActions(
  fullCharge = false,
): EnemyActionState {
  return {
    maxActions: 1,
    normalAttack: {
      stableId: "enemy-normal",
      name: "Enemy Normal",
    },
    skills: [],
    noblePhantasm: {
      stableId: "enemy-np",
      name: "Enemy NP",
    },
    charge: fullCharge ? 3 : 0,
    chargeMax: 3,
  };
}

function enemyTurn(fullCharge = false): BattleState {
  const state = createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally", {
          dataId: "servant-a",
          hp: 100_000,
          maxHp: 100_000,
          baseMaxHp: 100_000,
          noblePhantasm: noblePhantasm(),
        }),
        unit("ally-b", "ally", {
          dataId: "servant-b",
          hp: 100_000,
          maxHp: 100_000,
          baseMaxHp: 100_000,
          noblePhantasm: noblePhantasm(),
        }),
        unit("ally-c", "ally", {
          dataId: "servant-c",
          hp: 100_000,
          maxHp: 100_000,
          baseMaxHp: 100_000,
          noblePhantasm: noblePhantasm(),
        }),
      ],
      reserve: [
        unit("ally-d", "ally", {
          dataId: "servant-d",
        }),
      ],
    },
    waves: [
      {
        enemy: {
          frontline: [
            unit("enemy-a", "enemy", {
              dataId: "enemy",
              enemyAction: enemyActions(fullCharge),
            }),
            null,
            null,
          ],
          reserve: [],
        },
      },
    ],
    enemyFrontlineLimit: 3,
  });
  return completeAllyTurnEnd(beginAllyTurnEnd(state));
}

function registry() {
  return createBattleAttackDataRegistry([
    combatantData("enemy-a", "enemy", {
      attack: 10_000,
      attackNpRatePermille: 800,
      commandCardHitWeights: null,
      extraAttackHitWeights: null,
      enemyAttacks: [
        {
          actionStableId: "enemy-normal",
          kind: "normal_attack",
          targetScope: "single",
          cardType: "buster",
          hitWeights: [1, 1],
          cardDamageValuePermille: 1_000,
        },
        {
          actionStableId: "enemy-np",
          kind: "noble_phantasm",
          targetScope: "all",
          cardType: "buster",
          hitWeights: [1],
          cardDamageValuePermille: 1_500,
          npDamageMultiplierPermille: 3_000,
        },
      ],
    }),
    ...["a", "b", "c"].map((suffix) =>
      combatantData(
        `ally-${suffix}`,
        `servant-${suffix}`,
        {
          receivedNpUnits: 300,
        },
      )
    ),
  ]);
}

function streams(seed: string) {
  const rng = new BattleRng(seed);
  return {
    rng,
    streams: {
      effects: rng.stream("effects"),
      damage: rng.stream("damage"),
      stars: rng.stream("stars"),
    },
  };
}

describe("enemy data-to-attack integration", () => {
  it("uses the default frontmost target and grants received NP", () => {
    const random = streams("enemy-normal-data");
    const resolved = resolveEnemyAttacks({
      state: enemyTurn(),
      priorityRequests: [],
      registry: registry(),
      rng: random.streams,
    });

    expect(resolved.sequence.actions).toHaveLength(1);
    const detail = resolved.sequence.actions[0]
      ?.resolverDetail as EnemyAttackDetail;
    expect(detail).toMatchObject({
      outcome: "resolved",
      targetScope: "single",
      targetInstanceIds: ["ally-a"],
    });
    expect(
      findUnitLocation(
        resolved.sequence.state.formation,
        "ally-a",
      )?.unit,
    ).toMatchObject({
      alive: true,
    });
    expect(
      findUnitLocation(
        resolved.sequence.state.formation,
        "ally-a",
      )?.unit.hp,
    ).toBeLessThan(100_000);
    expect(
      findUnitLocation(
        resolved.sequence.state.formation,
        "ally-a",
      )?.unit.np,
    ).toBeGreaterThan(0);
    expect(resolved.sequence.state.nextCommandStars).toBe(0);
    expect(resolved.sequence.state.phase).toBe("enemy_turn_end");
  });

  it("uses a full-charge all-target NP and resets charge before damage", () => {
    const random = streams("enemy-np-data");
    const resolved = resolveEnemyAttacks({
      state: enemyTurn(true),
      priorityRequests: [],
      registry: registry(),
      rng: random.streams,
    });
    const detail = resolved.sequence.actions[0]
      ?.resolverDetail as EnemyAttackDetail;

    expect(detail).toMatchObject({
      outcome: "resolved",
      targetScope: "all",
      targetInstanceIds: ["ally-a", "ally-b", "ally-c"],
      calculation: {
        isNoblePhantasm: true,
        npDamageMultiplierPermille: 3_000,
      },
    });
    if (detail.outcome !== "resolved") return;
    expect(detail.resolution.attack?.attack.hits).toHaveLength(3);
    for (const instanceId of ["ally-a", "ally-b", "ally-c"]) {
      expect(
        findUnitLocation(
          resolved.sequence.state.formation,
          instanceId,
        )?.unit.hp,
      ).toBeLessThan(100_000);
    }
    expect(
      findUnitLocation(
        resolved.sequence.state.formation,
        "enemy-a",
      )?.unit.enemyAction?.charge,
    ).toBe(0);
  });

  it("treats missing numeric action data as a safe no-op", () => {
    const random = streams("enemy-missing-action-data");
    const resolved = resolveEnemyAttacks({
      state: enemyTurn(),
      priorityRequests: [],
      registry: createBattleAttackDataRegistry([
        combatantData("enemy-a", "enemy", {
          commandCardHitWeights: null,
          extraAttackHitWeights: null,
        }),
      ]),
      rng: random.streams,
    });

    expect(resolved.sequence.actions[0]?.resolverDetail).toEqual({
      outcome: "skipped",
      reason: "action_attack_data_missing",
    });
    expect(
      Object.values(random.rng.snapshot().streams).every(
        ({ drawCount }) => drawCount === 0,
      ),
    ).toBe(true);
    expect(
      findUnitLocation(
        resolved.sequence.state.formation,
        "ally-a",
      )?.unit.hp,
    ).toBe(100_000);
  });

  it("rejects an unavailable custom target before attack RNG", () => {
    const random = streams("enemy-invalid-target");
    expect(() =>
      resolveEnemyAttacks({
        state: enemyTurn(),
        priorityRequests: [],
        registry: registry(),
        rng: random.streams,
        singleTargetSelector: () => "ally-d",
      })
    ).toThrow(/unavailable ally/);
    expect(
      Object.values(random.rng.snapshot().streams).every(
        ({ drawCount }) => drawCount === 0,
      ),
    ).toBe(true);
  });
});
