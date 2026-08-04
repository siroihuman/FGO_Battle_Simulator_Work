import { describe, expect, it } from "vitest";
import {
  resolveBattleAttackSequence,
} from "../src/core/battle/attackSequence";
import {
  findUnitLocation,
} from "../src/core/battle/formation";
import {
  createBattleState,
  type BattleState,
} from "../src/core/battle/state";
import type {
  BattleUnitState,
  SideFormation,
} from "../src/core/battle/types";
import { BattleRng } from "../src/core/rng";
import {
  COMMON_EFFECT_TYPES,
} from "../src/effects/modifiers";
import {
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import type {
  EffectRuntimeCounters,
  EffectTemplate,
} from "../src/effects/types";
import { unit } from "./helpers/battle";

// Reference behavior checked 2026-08-03:
// https://w.atwiki.jp/f_go/pages/955.html

function register(
  target: BattleUnitState,
  template: EffectTemplate,
  counters: EffectRuntimeCounters,
): {
  unit: BattleUnitState;
  counters: EffectRuntimeCounters;
} {
  const applied = applyEffect(
    target,
    template,
    null,
    counters,
  );
  return {
    unit: applied.unit,
    counters: applied.counters,
  };
}

function enemyFormation(
  enemyA: BattleUnitState,
  enemyB: BattleUnitState | null = null,
): SideFormation {
  return {
    frontline: [enemyA, enemyB, null],
    reserve: [],
  };
}

function battle(
  allyA: BattleUnitState,
  enemyA: BattleUnitState,
  enemyB: BattleUnitState | null = null,
): BattleState {
  return createBattleState({
    ally: {
      frontline: [
        allyA,
        unit("ally-b", "ally"),
        unit("ally-c", "ally"),
      ],
      reserve: [],
    },
    waves: [
      {
        enemy: enemyFormation(enemyA, enemyB),
      },
    ],
    enemyFrontlineLimit: 3,
  });
}

function damageInput() {
  return {
    attack: 10_000,
    cardDamageValuePermille: 1_000,
    classAttackCoefficientPermille: 1_000,
    classAffinityPermille: 1_000,
    attributeAffinityPermille: 1_000,
  };
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

const noActions = (
  stableId: string,
  timing: NonNullable<EffectTemplate["trigger"]>["timing"],
): EffectTemplate => ({
  stableId,
  name: stableId,
  effectType: stableId,
  category: "buff",
  trigger: { timing },
});

describe("complete attack trigger sequence", () => {
  it("runs source Hit triggers once per Hit batch and preserves canonical target order", () => {
    let counters = createEffectRuntimeCounters();
    let source = unit("ally-a", "ally");
    for (const effect of [
      noActions("before", "before_attack"),
      {
        stableId: "per-hit",
        name: "per-hit",
        effectType: "per-hit",
        category: "buff",
        trigger: {
          timing: "on_hit",
          actions: [
            {
              target: {
                relation: "self",
                selection: "single",
              },
              action: {
                kind: "change_np",
                amount: 100,
                npLevel: 1,
              },
            },
            {
              target: {
                relation: "enemies",
                selection: "single",
                selectedInstanceId: "enemy-a",
              },
              action: {
                kind: "reduce_hp",
                amount: 1_000,
                canDefeat: false,
              },
            },
          ],
        },
      } satisfies EffectTemplate,
      noActions("on-attack", "on_attack"),
      noActions("after", "after_attack"),
    ]) {
      const applied = register(source, effect, counters);
      source = applied.unit;
      counters = applied.counters;
    }
    let enemyA = unit("enemy-a", "enemy", {
      hp: 100_000,
      maxHp: 100_000,
      baseMaxHp: 100_000,
    });
    const received = register(
      enemyA,
      noActions("received", "on_damage_taken"),
      counters,
    );
    enemyA = received.unit;
    counters = received.counters;
    const enemyB = unit("enemy-b", "enemy", {
      hp: 100_000,
      maxHp: 100_000,
      baseMaxHp: 100_000,
    });
    const random = streams("ordered-attack-triggers");
    const preparedTargets: string[][] = [];

    const result = resolveBattleAttackSequence(
      battle(source, enemyA, enemyB),
      {
        sourceInstanceId: "ally-a",
        targetInstanceIds: ["enemy-b", "enemy-a"],
        triggerContext: { attackKind: "normal_command", cardType: "buster" },
        rng: random.streams,
        prepareAttack: (_state, activeTargetInstanceIds) => {
          preparedTargets.push([...activeTargetInstanceIds]);
          return {
            targets: activeTargetInstanceIds.map(
              (targetInstanceId) => ({
                targetInstanceId,
                damage: damageInput(),
              }),
            ),
            hitWeights: [1, 1],
            defense: {},
          };
        },
      },
      counters,
    );

    expect(preparedTargets).toEqual([
      ["enemy-a", "enemy-b"],
    ]);
    expect(result.stoppedBeforeHits).toBe(false);
    expect(result.beforeAttack?.event.timing).toBe(
      "before_attack",
    );
    expect(result.beforeAttack?.activations[0]?.effectStableId)
      .toBe("before");
    expect(result.hitTriggers).toHaveLength(2);
    expect(
      result.hitTriggers.map(
        ({ activations }) =>
          activations[0]?.effectStableId,
      ),
    ).toEqual(["per-hit", "per-hit"]);
    expect(result.onAttack?.activations[0]?.effectStableId)
      .toBe("on-attack");
    expect(result.damageTaken).toHaveLength(2);
    expect(
      result.damageTaken[0]?.activations[0]?.effectStableId,
    ).toBe("received");
    expect(result.damageTaken[1]?.activations).toEqual([]);
    expect(result.afterAttack?.activations[0]?.effectStableId)
      .toBe("after");

    const attack = result.attack?.attack;
    if (!attack) throw new Error("attack did not resolve");
    const enemyAHits = attack.hits.filter(
      ({ targetInstanceId }) =>
        targetInstanceId === "enemy-a",
    );
    expect(enemyAHits[1]?.hpBefore).toBe(
      (enemyAHits[0]?.hpAfter ?? 0) - 1_000,
    );
    expect(
      findUnitLocation(
        result.state.formation,
        "ally-a",
      )?.unit.np,
    ).toBe(200);
    expect(result.attack?.hitBatchDetails).toHaveLength(2);
  });

  it("runs an unconditional damage-taken trigger even when protection blocks the attack", () => {
    let counters = createEffectRuntimeCounters();
    let target = unit("enemy-a", "enemy");
    for (const effect of [
      {
        stableId: "invincible",
        name: "invincible",
        effectType: COMMON_EFFECT_TYPES.invincibility,
        category: "buff",
        remainingUses: 1,
      } satisfies EffectTemplate,
      {
        stableId: "received-any",
        name: "received-any",
        effectType: "received-any",
        category: "buff",
        trigger: {
          timing: "on_damage_taken",
          actions: [
            {
              target: {
                relation: "self",
                selection: "single",
              },
              action: {
                kind: "change_np",
                amount: 100,
                npLevel: 1,
              },
            },
          ],
        },
      } satisfies EffectTemplate,
      {
        stableId: "received-hit-only",
        name: "received-hit-only",
        effectType: "received-hit-only",
        category: "buff",
        trigger: {
          timing: "on_damage_taken",
          condition: { requiresHit: true },
          actions: [
            {
              target: {
                relation: "self",
                selection: "single",
              },
              action: {
                kind: "change_np",
                amount: 500,
                npLevel: 1,
              },
            },
          ],
        },
      } satisfies EffectTemplate,
    ]) {
      const applied = register(target, effect, counters);
      target = applied.unit;
      counters = applied.counters;
    }
    const random = streams("blocked-damage-trigger");
    const result = resolveBattleAttackSequence(
      battle(unit("ally-a", "ally"), target),
      {
        sourceInstanceId: "ally-a",
        targetInstanceIds: ["enemy-a"],
        triggerContext: { attackKind: "normal_command", cardType: "buster" },
        rng: random.streams,
        prepareAttack: (_state, [targetInstanceId]) => ({
          targets: [
            {
              targetInstanceId,
              damage: damageInput(),
            },
          ],
          hitWeights: [1],
          defense: {},
        }),
      },
      counters,
    );

    expect(result.attack?.attack.hits[0]).toMatchObject({
      damage: 0,
      actualHpLoss: 0,
      countsAsSuccessfulHit: false,
      attackProtectionBlocked: true,
    });
    expect(
      result.damageTaken[0]?.activations.map(
        ({ effectStableId }) => effectStableId,
      ),
    ).toEqual(["received-any"]);
    expect(
      findUnitLocation(
        result.state.formation,
        "enemy-a",
      )?.unit.np,
    ).toBe(100);
    expect(
      random.rng.stream("damage").snapshot().drawCount,
    ).toBe(0);
  });

  it("fires on-death after a lethal attack but not when guts revives the target", () => {
    const deathEffect: EffectTemplate = {
      stableId: "death-counter",
      name: "death-counter",
      effectType: "death-counter",
      category: "buff",
      trigger: {
        timing: "on_death",
        actions: [
          {
            target: {
              relation: "enemies",
              selection: "single",
              selectedInstanceId: "ally-a",
            },
            action: {
              kind: "reduce_hp",
              amount: 500,
              canDefeat: false,
            },
          },
        ],
      },
    };
    let counters = createEffectRuntimeCounters();
    let target = register(
      unit("enemy-a", "enemy", {
        hp: 1,
        maxHp: 1,
        baseMaxHp: 1,
      }),
      deathEffect,
      counters,
    );
    counters = target.counters;
    const firstRandom = streams("death-after-attack");
    const defeated = resolveBattleAttackSequence(
      battle(unit("ally-a", "ally"), target.unit),
      {
        sourceInstanceId: "ally-a",
        targetInstanceIds: ["enemy-a"],
        triggerContext: { attackKind: "normal_command", cardType: "buster" },
        rng: firstRandom.streams,
        prepareAttack: (_state, [targetInstanceId]) => ({
          targets: [
            {
              targetInstanceId,
              damage: damageInput(),
            },
          ],
          hitWeights: [1],
          defense: {},
        }),
      },
      counters,
    );

    expect(defeated.deaths).toHaveLength(1);
    expect(
      defeated.deaths[0]?.activations[0]?.effectStableId,
    ).toBe("death-counter");
    expect(
      findUnitLocation(
        defeated.state.formation,
        "ally-a",
      )?.unit.hp,
    ).toBe(9_500);

    counters = createEffectRuntimeCounters();
    target = register(
      unit("enemy-a", "enemy", {
        hp: 1,
        maxHp: 100,
        baseMaxHp: 100,
      }),
      deathEffect,
      counters,
    );
    counters = target.counters;
    target = register(
      target.unit,
      {
        stableId: "guts",
        name: "guts",
        effectType: COMMON_EFFECT_TYPES.guts,
        category: "buff",
        value: 50,
        remainingUses: 1,
      },
      counters,
    );
    counters = target.counters;
    const gutsRandom = streams("guts-no-death-trigger");
    const revived = resolveBattleAttackSequence(
      battle(unit("ally-a", "ally"), target.unit),
      {
        sourceInstanceId: "ally-a",
        targetInstanceIds: ["enemy-a"],
        triggerContext: { attackKind: "normal_command", cardType: "buster" },
        rng: gutsRandom.streams,
        prepareAttack: (_state, [targetInstanceId]) => ({
          targets: [
            {
              targetInstanceId,
              damage: damageInput(),
            },
          ],
          hitWeights: [1],
          defense: {},
        }),
      },
      counters,
    );

    expect(revived.deaths).toEqual([]);
    expect(
      findUnitLocation(
        revived.state.formation,
        "enemy-a",
      )?.unit,
    ).toMatchObject({
      hp: 50,
      alive: true,
    });
  });

  it("cascades new deaths caused by death triggers exactly once", () => {
    let counters = createEffectRuntimeCounters();
    let source = register(
      unit("ally-a", "ally", {
        hp: 1,
        maxHp: 1,
        baseMaxHp: 1,
      }),
      {
        stableId: "ally-death",
        name: "ally-death",
        effectType: "ally-death",
        category: "buff",
        trigger: {
          timing: "on_death",
          actions: [
            {
              target: {
                relation: "enemies",
                selection: "single",
                selectedInstanceId: "enemy-b",
              },
              action: {
                kind: "reduce_hp",
                amount: 400,
                canDefeat: false,
              },
            },
          ],
        },
      },
      counters,
    );
    counters = source.counters;
    let target = register(
      unit("enemy-a", "enemy", {
        hp: 1,
        maxHp: 1,
        baseMaxHp: 1,
      }),
      {
        stableId: "enemy-death",
        name: "enemy-death",
        effectType: "enemy-death",
        category: "buff",
        trigger: {
          timing: "on_death",
          actions: [
            {
              target: {
                relation: "enemies",
                selection: "single",
                selectedInstanceId: "ally-a",
              },
              action: {
                kind: "reduce_hp",
                amount: 1,
                canDefeat: true,
              },
            },
          ],
        },
      },
      counters,
    );
    counters = target.counters;
    const random = streams("cascading-death-triggers");
    const result = resolveBattleAttackSequence(
      battle(
        source.unit,
        target.unit,
        unit("enemy-b", "enemy", {
          hp: 1_000,
          maxHp: 1_000,
          baseMaxHp: 1_000,
        }),
      ),
      {
        sourceInstanceId: "ally-a",
        targetInstanceIds: ["enemy-a"],
        triggerContext: { attackKind: "normal_command", cardType: "buster" },
        rng: random.streams,
        prepareAttack: (_state, [targetInstanceId]) => ({
          targets: [
            {
              targetInstanceId,
              damage: damageInput(),
            },
          ],
          hitWeights: [1],
          defense: {},
        }),
      },
      counters,
    );

    expect(
      result.deaths.map(
        ({ event }) => event.actorInstanceId,
      ),
    ).toEqual(["enemy-a", "ally-a"]);
    expect(
      result.deaths.map(
        ({ activations }) =>
          activations[0]?.effectStableId,
      ),
    ).toEqual(["enemy-death", "ally-death"]);
    expect(
      findUnitLocation(
        result.state.formation,
        "ally-a",
      )?.unit.alive,
    ).toBe(false);
    expect(
      findUnitLocation(
        result.state.formation,
        "enemy-b",
      )?.unit.hp,
    ).toBe(600);
  });

  it("stops all Hits, NP, and stars after a successful pre-damage instant death", () => {
    let counters = createEffectRuntimeCounters();
    const source = register(
      unit("ally-a", "ally"),
      {
        stableId: "pre-death",
        name: "pre-death",
        effectType: "pre-death",
        category: "buff",
        trigger: {
          timing: "before_attack",
          actions: [
            {
              target: {
                relation: "enemies",
                selection: "single",
                selectedInstanceId: "enemy-a",
              },
              action: {
                kind: "instant_death",
                options: {
                  effectRatePermille: 1_000,
                  timing: "before_damage",
                  forceSuccess: true,
                  ignoreImmunity: true,
                },
              },
            },
          ],
        },
      },
      counters,
    );
    counters = source.counters;
    const random = streams("pre-death-stops-attack");
    let prepareCalled = false;
    const result = resolveBattleAttackSequence(
      battle(
        source.unit,
        unit("enemy-a", "enemy", {
          deathRatePermille: 1_000,
        }),
      ),
      {
        sourceInstanceId: "ally-a",
        targetInstanceIds: ["enemy-a"],
        triggerContext: { attackKind: "normal_command", cardType: "buster" },
        rng: random.streams,
        prepareAttack: () => {
          prepareCalled = true;
          throw new Error("prepareAttack must not run");
        },
      },
      counters,
    );

    expect(prepareCalled).toBe(false);
    expect(result.stoppedBeforeHits).toBe(true);
    expect(result.attack).toBeNull();
    expect(result.hitTriggers).toEqual([]);
    expect(result.onAttack).toBeNull();
    expect(result.damageTaken).toEqual([]);
    expect(result.deaths).toHaveLength(1);
    expect(
      findUnitLocation(
        result.state.formation,
        "enemy-a",
      )?.unit,
    ).toMatchObject({
      hp: 0,
      alive: false,
    });
    expect(
      random.rng.stream("damage").snapshot().drawCount,
    ).toBe(0);
    expect(
      random.rng.stream("stars").snapshot().drawCount,
    ).toBe(0);
  });

  it("matches NP-use trigger context, consumes one use, and applies ordered state actions", () => {
    const registered = applyEffect(
      unit("ally-a", "ally", {
        skillCooldowns: [5, 2, 0],
      }),
      {
        stableId: "np-use-state",
        name: "宝具使用時発動",
        effectType: "np_use_state",
        category: "buff",
        remainingTurns: 1,
        remainingUses: 1,
        trigger: {
          timing: "after_attack",
          consumeUseOnActivation: true,
          condition: {
            actor: "owner",
            attackKinds: ["noble_phantasm"],
          },
          actions: [
            {
              target: { relation: "self", selection: "single" },
              action: { kind: "advance_skill_cooldowns", amount: 1 },
            },
            {
              target: { relation: "self", selection: "single" },
              action: {
                kind: "apply_effects",
                effects: [{
                  template: {
                    stableId: "np-use-critical-up",
                    name: "クリティカル威力アップ",
                    effectType: COMMON_EFFECT_TYPES.criticalDamage,
                    category: "buff",
                    value: 300,
                    remainingTurns: 3,
                  },
                }],
              },
            },
            {
              target: { relation: "self", selection: "single" },
              action: {
                kind: "gain_stars",
                amount: 15,
                destination: "next_command",
              },
            },
          ],
        },
      },
      null,
      createEffectRuntimeCounters(),
    );
    const target = unit("enemy-a", "enemy", {
      hp: 100_000,
      maxHp: 100_000,
      baseMaxHp: 100_000,
    });
    const random = streams("conditional-np-use-trigger");
    const prepareAttack = (
      _state: BattleState,
      [targetInstanceId]: readonly string[],
    ) => ({
      targets: [{ targetInstanceId, damage: damageInput() }],
      hitWeights: [1],
      defense: {},
    });
    const mismatch = resolveBattleAttackSequence(
      battle(registered.unit, target),
      {
        sourceInstanceId: "ally-a",
        targetInstanceIds: ["enemy-a"],
        triggerContext: {
          attackKind: "normal_command",
          cardType: "buster",
        },
        rng: random.streams,
        prepareAttack,
      },
      registered.counters,
    );
    expect(mismatch.afterAttack?.activations).toEqual([]);
    expect(findUnitLocation(
      mismatch.state.formation,
      "ally-a",
    )?.unit.effects.map(({ stableId }) => stableId)).toEqual([
      "np-use-state",
    ]);

    const matched = resolveBattleAttackSequence(
      mismatch.state,
      {
        sourceInstanceId: "ally-a",
        targetInstanceIds: ["enemy-a"],
        triggerContext: {
          attackKind: "noble_phantasm",
          cardType: "buster",
        },
        rng: random.streams,
        prepareAttack,
      },
      mismatch.counters,
    );
    expect(matched.afterAttack?.event).toMatchObject({
      attackKind: "noble_phantasm",
      cardType: "buster",
    });
    expect(matched.afterAttack?.activations[0]).toMatchObject({
      effectStableId: "np-use-state",
      outcome: "activated",
      consumedUse: true,
      actions: [
        { action: { action: { kind: "advance_skill_cooldowns" } } },
        { action: { action: { kind: "apply_effects" } } },
        {
          action: { action: { kind: "gain_stars" } },
          starAddition: {
            bucket: "next_command",
            requested: 15,
            added: 15,
          },
        },
      ],
    });
    const source = findUnitLocation(
      matched.state.formation,
      "ally-a",
    )?.unit;
    expect(source?.skillCooldowns).toEqual([4, 1, 0]);
    expect(source?.effects.map(({ stableId }) => stableId)).toEqual([
      "np-use-critical-up",
    ]);
    expect(matched.state.nextCommandStars).toBe(15);
    expect(random.rng.stream("effects").snapshot().drawCount).toBe(0);
  });

  it("rejects friendly targets before any trigger or RNG work", () => {
    const random = streams("invalid-friendly-attack");
    let prepareCalled = false;
    expect(() =>
      resolveBattleAttackSequence(
        battle(
          unit("ally-a", "ally"),
          unit("enemy-a", "enemy"),
        ),
        {
          sourceInstanceId: "ally-a",
          targetInstanceIds: ["ally-b"],
          triggerContext: { attackKind: "normal_command", cardType: "buster" },
          rng: random.streams,
          prepareAttack: () => {
            prepareCalled = true;
            throw new Error("prepareAttack must not run");
          },
        },
        createEffectRuntimeCounters(),
      )
    ).toThrow(/opposing side/);
    expect(prepareCalled).toBe(false);
    expect(
      Object.values(random.rng.snapshot().streams).every(
        ({ drawCount }) => drawCount === 0,
      ),
    ).toBe(true);
  });
});
