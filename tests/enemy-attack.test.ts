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
import {
  createBattleActionEffectDataRegistry,
} from "../src/effects/actionData";
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
    skills: [{
      stableId: "enemy-skill",
      name: "Enemy Skill",
    }],
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

function actionEffectRegistry() {
  return createBattleActionEffectDataRegistry([{
    instanceId: "enemy-a",
    dataId: "enemy",
    passives: [],
    actions: [
      {
        stableId: "enemy-skill",
        name: "Enemy Skill",
        kind: "skill",
        skillSlot: 1,
        cooldownAtMax: 0,
        attackOrder: null,
        effects: [{
          kind: "effect",
          stableId: "enemy-skill-hp-reduction",
          order: 1,
          description: "選択した味方のHPを減らす",
          target: { relation: "enemies", selection: "single" },
          action: {
            kind: "reduce_hp",
            amount: 1_000,
            canDefeat: false,
          },
        }],
      },
      {
        stableId: "enemy-np",
        name: "Enemy NP",
        kind: "noble_phantasm",
        attackOrder: 2,
        effects: [
          {
            kind: "effect",
            stableId: "enemy-np-before",
            order: 1,
            description: "攻撃前に味方全体のNPを増やす",
            target: { relation: "enemies", selection: "all" },
            action: { kind: "change_np", amount: 1_000 },
          },
          {
            kind: "effect",
            stableId: "enemy-np-after",
            order: 3,
            description: "攻撃後に自身を回復する",
            target: { relation: "self", selection: "single" },
            action: { kind: "heal_hp", amount: 500 },
          },
        ],
      },
    ],
  }]);
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
      actionEffectRegistry: actionEffectRegistry(),
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
    expect(detail.declaredEffects.map(({ phase }) => phase)).toEqual([
      "before_attack",
      "after_attack",
    ]);
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
    expect(resolved.battleLog.entries[0]?.declaredEffects).toMatchObject([
      {
        phase: "before_attack",
        effects: [{
          effectStableId: "enemy-np-before",
          targetInstanceIds: ["ally-a", "ally-b", "ally-c"],
        }],
      },
      {
        phase: "after_attack",
        effects: [{ effectStableId: "enemy-np-after" }],
      },
    ]);
  });

  it("resolves a configured enemy skill against its AI-selected target and logs the effect", () => {
    const random = streams("enemy-declared-skill");
    const resolved = resolveEnemyAttacks({
      state: enemyTurn(),
      priorityRequests: [{
        actorInstanceId: "enemy-a",
        skillStableId: "enemy-skill",
        selectedTargetInstanceId: "ally-b",
      }],
      registry: registry(),
      actionEffectRegistry: actionEffectRegistry(),
      rng: random.streams,
    });
    const first = resolved.sequence.actions[0];
    expect(first?.preflight.outcome).toBe("ready");
    expect(first?.resolverDetail).toMatchObject({
      outcome: "resolved_effects",
      targetInstanceIds: ["ally-b"],
    });
    expect(findUnitLocation(
      resolved.sequence.state.formation,
      "ally-b",
    )?.unit.hp).toBe(99_000);
    expect(resolved.battleLog.entries[0]).toMatchObject({
      action: { kind: "enemy_skill", stage: "priority" },
      outcome: { status: "resolved", reasons: [] },
      calculation: null,
      attack: null,
      declaredEffects: [{
        phase: "non_damaging",
        effects: [{
          effectStableId: "enemy-skill-hp-reduction",
          targetInstanceIds: ["ally-b"],
          results: [{ hpChange: -1_000 }],
        }],
      }],
    });
  });

  it("skips a selected-target enemy skill before effects when AI omits the target", () => {
    const random = streams("enemy-skill-target-missing");
    const resolved = resolveEnemyAttacks({
      state: enemyTurn(),
      priorityRequests: [{
        actorInstanceId: "enemy-a",
        skillStableId: "enemy-skill",
      }],
      registry: registry(),
      actionEffectRegistry: actionEffectRegistry(),
      rng: random.streams,
    });
    expect(resolved.sequence.actions[0]).toMatchObject({
      preflight: {
        outcome: "skipped",
        reason: "action_effect_target_required",
      },
      resolverCalled: false,
    });
    expect(findUnitLocation(
      resolved.sequence.state.formation,
      "ally-b",
    )?.unit.hp).toBe(100_000);
    expect(resolved.battleLog.entries[0]).toMatchObject({
      outcome: {
        status: "skipped",
        reasons: ["action_effect_target_required"],
      },
      declaredEffects: [],
      attack: null,
      rngEvents: [],
    });
    expect(random.rng.stream("effects").snapshot().drawCount).toBe(0);
  });

  it("skips an unresolved enemy NP before charge and action RNG are consumed", () => {
    const unresolved = createBattleActionEffectDataRegistry([{
      instanceId: "enemy-a",
      dataId: "enemy",
      passives: [],
      actions: [{
        stableId: "enemy-np",
        name: "Enemy NP",
        kind: "noble_phantasm",
        attackOrder: 2,
        effects: [{
          kind: "effect",
          stableId: "enemy-np-future-effect",
          order: 1,
          description: "未対応効果",
          target: { relation: "self", selection: "single" },
          action: {
            kind: "unsupported",
            mechanicId: "future_enemy_np_effect",
          },
        }],
      }],
    }]);
    const random = streams("enemy-unresolved-np");
    const resolved = resolveEnemyAttacks({
      state: enemyTurn(true),
      priorityRequests: [],
      registry: registry(),
      actionEffectRegistry: unresolved,
      rng: random.streams,
    });
    expect(resolved.sequence.actions[0]).toMatchObject({
      preflight: {
        outcome: "skipped",
        reason: "action_effects_unresolved",
        chargeBefore: 3,
        chargeConsumed: 0,
      },
      resolverCalled: false,
    });
    expect(findUnitLocation(
      resolved.sequence.state.formation,
      "enemy-a",
    )?.unit.enemyAction?.charge).toBe(3);
    expect(
      Object.values(random.rng.snapshot().streams).every(
        ({ drawCount }) => drawCount === 0,
      ),
    ).toBe(true);
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

    expect(resolved.sequence.actions[0]).toMatchObject({
      preflight: {
        outcome: "skipped",
        reason: "action_attack_data_missing",
        chargeConsumed: 0,
      },
      resolverCalled: false,
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
