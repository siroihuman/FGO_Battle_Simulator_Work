import { describe, expect, it } from "vitest";
import {
  resolveAttack,
  type AttackDamageInput,
  type AttackTargetInput,
  type ResolveAttackInput,
} from "../src/core/battle/attack";
import { BattleRng } from "../src/core/rng";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import {
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import type { EffectTemplate } from "../src/effects/types";
import { unit } from "./helpers/battle";

// Reference behavior checked 2026-07-30:
// https://w.atwiki.jp/f_go/pages/304.html
// https://w.atwiki.jp/f_go/pages/955.html

const BASE_DAMAGE: AttackDamageInput = {
  attack: 10_000,
  cardDamageValuePermille: 1_000,
  classAttackCoefficientPermille: 1_000,
  classAffinityPermille: 1_000,
  attributeAffinityPermille: 1_000,
};

function noblePhantasm() {
  return {
    stableId: "test-np",
    name: "Test NP",
    cardType: "arts" as const,
    level: 1 as const,
  };
}

function effect(
  stableId: string,
  effectType: string,
  options: Partial<EffectTemplate> = {},
): EffectTemplate {
  return {
    stableId,
    name: stableId,
    effectType,
    category: "buff",
    ...options,
  };
}

function addEffects(
  target: ReturnType<typeof unit>,
  effects: readonly EffectTemplate[],
): ReturnType<typeof unit> {
  let current = target;
  let counters = createEffectRuntimeCounters();
  for (const template of effects) {
    const result = applyEffect(current, template, null, counters);
    current = result.unit;
    counters = result.counters;
  }
  return current;
}

function rng(seed: string): {
  battle: BattleRng;
  streams: ResolveAttackInput["rng"];
} {
  const battle = new BattleRng(seed);
  return {
    battle,
    streams: {
      effects: battle.stream("effects"),
      damage: battle.stream("damage"),
      stars: battle.stream("stars"),
    },
  };
}

function targetInput(
  target: ReturnType<typeof unit>,
  options: Partial<Omit<AttackTargetInput, "target" | "damage">> = {},
): AttackTargetInput {
  return {
    target,
    damage: BASE_DAMAGE,
    ...options,
  };
}

function resolve(
  seed: string,
  options: Partial<Omit<ResolveAttackInput, "rng">> = {},
) {
  const random = rng(seed);
  const result = resolveAttack({
    source: unit("ally-a", "ally"),
    targets: [targetInput(unit("enemy-a", "enemy"))],
    hitWeights: [1],
    defense: {},
    ...options,
    rng: random.streams,
  });
  return { result, battleRng: random.battle };
}

describe("complete attack Hit resolution", () => {
  it("uses Hit-major target order and adds all target NP gains once", () => {
    const source = unit("ally-a", "ally", {
      noblePhantasm: noblePhantasm(),
    });
    const fragile = unit("enemy-a", "enemy", {
      hp: 1,
      maxHp: 1,
      baseMaxHp: 1,
    });
    const durable = unit("enemy-b", "enemy", {
      hp: 1_000_000,
      maxHp: 1_000_000,
      baseMaxHp: 1_000_000,
    });
    const attackNp = {
      baseNpUnits: 100,
      cardNpValuePermille: 1_000,
      targetNpRatePermille: 1_000,
    };
    const { result, battleRng } = resolve("hit-major", {
      source,
      targets: [
        targetInput(fragile, { attackNp }),
        targetInput(durable, { attackNp }),
      ],
      hitWeights: [10, 30, 60],
    });

    expect(
      result.hits.map(({ hitNumber, targetInstanceId }) => [
        hitNumber,
        targetInstanceId,
      ]),
    ).toEqual([
      [1, "enemy-a"],
      [1, "enemy-b"],
      [2, "enemy-a"],
      [2, "enemy-b"],
      [3, "enemy-a"],
      [3, "enemy-b"],
    ]);
    expect(
      result.targets[0].distributedDamage.reduce(
        (sum, damage) => sum + damage,
        0,
      ),
    ).toBe(result.targets[0].totalDamage);
    expect(
      result.hits
        .filter(({ targetInstanceId }) => targetInstanceId === "enemy-a")
        .map(({ overkillOrOvergauge }) => overkillOrOvergauge),
    ).toEqual([true, true, true]);
    expect(
      result.hits
        .filter(({ targetInstanceId }) => targetInstanceId === "enemy-b")
        .map(({ overkillOrOvergauge }) => overkillOrOvergauge),
    ).toEqual([false, false, false]);
    expect(result.attackNpTotalUnits).toBe(750);
    expect(result.source?.np).toBe(750);
    expect(battleRng.stream("damage").snapshot().drawCount).toBe(2);
  });

  it("keeps NP and star work after attack-wide invincibility blocks damage", () => {
    const source = unit("ally-a", "ally", {
      noblePhantasm: noblePhantasm(),
    });
    const target = addEffects(unit("enemy-a", "enemy"), [
      effect("attack-invincible", COMMON_EFFECT_TYPES.invincibility, {
        remainingUses: 1,
      }),
      effect("hit-evade", COMMON_EFFECT_TYPES.evade, {
        remainingUses: 2,
        flags: { consumptionUnit: "hit" },
      }),
    ]);
    const { result, battleRng } = resolve("blocked-resources", {
      source,
      targets: [
        targetInput(target, {
          attackNp: {
            baseNpUnits: 100,
            cardNpValuePermille: 1_000,
            targetNpRatePermille: 1_000,
          },
          stars: {
            servantStarRatePermille: 1_000,
            cardStarValuePermille: 0,
          },
        }),
      ],
      hitWeights: [1, 1],
    });

    expect(result.targets[0]).toMatchObject({
      damageRandomModifierPermille: null,
      totalDamage: 0,
      distributedDamage: [0, 0],
    });
    expect(result.hits.every(({ damage }) => damage === 0)).toBe(true);
    expect(
      result.hits.every(({ countsAsSuccessfulHit }) =>
        !countsAsSuccessfulHit
      ),
    ).toBe(true);
    expect(result.attackNpTotalUnits).toBe(200);
    expect(result.source?.np).toBe(200);
    expect(result.generatedStars).toBe(2);
    expect(
      result.targets[0].target.effects.map(
        ({ stableId, remainingUses }) => ({
          stableId,
          remainingUses,
        }),
      ),
    ).toEqual([{ stableId: "hit-evade", remainingUses: 2 }]);
    expect(battleRng.stream("damage").snapshot().drawCount).toBe(0);
    expect(battleRng.stream("stars").snapshot().drawCount).toBe(0);
  });

  it("consumes an attack-wide source pierce once and applies it to every target", () => {
    const source = addEffects(unit("ally-a", "ally"), [
      effect(
        "pierce",
        COMMON_EFFECT_TYPES.invincibilityPierce,
        { remainingUses: 1 },
      ),
    ]);
    const first = addEffects(unit("enemy-a", "enemy"), [
      effect("first-invincible", COMMON_EFFECT_TYPES.invincibility, {
        remainingUses: 1,
      }),
    ]);
    const second = addEffects(unit("enemy-b", "enemy"), [
      effect("second-invincible", COMMON_EFFECT_TYPES.invincibility, {
        remainingUses: 1,
      }),
    ]);
    const { result } = resolve("aoe-pierce", {
      source,
      targets: [targetInput(first), targetInput(second)],
    });

    expect(result.source?.effects).toEqual([]);
    expect(
      result.targets.map(({ attackDefense }) => ({
        allowed: attackDefense.damageAllowed,
        protection: attackDefense.protection?.kind,
        bypassed: attackDefense.protection?.bypassed,
      })),
    ).toEqual([
      { allowed: true, protection: "invincibility", bypassed: true },
      { allowed: true, protection: "invincibility", bypassed: true },
    ]);
    expect(result.targets.every(({ target }) => target.effects.length === 0))
      .toBe(true);
  });

  it("consumes a Hit-scoped source sure-hit once per emitted Hit, not per target", () => {
    const source = addEffects(unit("ally-a", "ally"), [
      effect("one-hit-sure-hit", COMMON_EFFECT_TYPES.sureHit, {
        remainingUses: 1,
        flags: { consumptionUnit: "hit" },
      }),
    ]);
    const targets = ["enemy-a", "enemy-b"].map((instanceId) =>
      addEffects(unit(instanceId, "enemy"), [
        effect(
          `${instanceId}-evade`,
          COMMON_EFFECT_TYPES.evade,
          {
            remainingUses: 1,
            flags: { consumptionUnit: "hit" },
          },
        ),
      ])
    );
    const { result } = resolve("hit-source-once", {
      source,
      targets: targets.map((target) => targetInput(target)),
    });

    expect(result.source?.effects).toEqual([]);
    expect(result.hits.every(({ damage }) => damage > 0)).toBe(true);
    expect(
      result.hits.map(({ hitDefense }) => ({
        protection: hitDefense?.protection?.kind,
        bypassed: hitDefense?.protection?.bypassed,
      })),
    ).toEqual([
      { protection: "evade", bypassed: true },
      { protection: "evade", bypassed: true },
    ]);
  });

  it("lets a one-Hit evasion block only the first Hit", () => {
    const target = addEffects(unit("enemy-a", "enemy"), [
      effect("one-hit-evade", COMMON_EFFECT_TYPES.evade, {
        remainingUses: 1,
        flags: { consumptionUnit: "hit" },
      }),
    ]);
    const { result } = resolve("one-hit-evade", {
      targets: [targetInput(target)],
      hitWeights: [1, 1],
    });

    expect(result.hits.map(({ damage }) => damage)).toEqual([
      0,
      result.targets[0].distributedDamage[1],
    ]);
    expect(
      result.hits.map(({ countsAsSuccessfulHit }) =>
        countsAsSuccessfulHit
      ),
    ).toEqual([false, true]);
    expect(result.targets[0].target.effects).toEqual([]);
  });

  it("applies Hit-scoped defense and damage cut only to the consuming Hit", () => {
    const target = addEffects(unit("enemy-a", "enemy"), [
      effect("one-hit-defense", COMMON_EFFECT_TYPES.defense, {
        value: 500,
        remainingUses: 1,
        flags: { consumptionUnit: "hit" },
      }),
      effect("one-hit-cut", COMMON_EFFECT_TYPES.damageCut, {
        value: 10,
        remainingUses: 1,
        flags: { consumptionUnit: "hit" },
      }),
    ]);
    const { result } = resolve("one-hit-reducers", {
      targets: [targetInput(target)],
      hitWeights: [1, 1],
    });
    const [firstPlanned, secondPlanned] =
      result.targets[0].distributedDamage;

    expect(result.hits.map(({ damage }) => damage)).toEqual([
      Math.max(0, Math.floor(firstPlanned / 2) - 10),
      secondPlanned,
    ]);
    expect(result.targets[0].target.effects).toEqual([]);
  });

  it("marks a lethal intermediate-gauge Hit and later Hits as overgauge", () => {
    const target = unit("enemy-a", "enemy", {
      hp: 1,
      maxHp: 1,
      baseMaxHp: 1,
      remainingBreakGauges: [{ maxHp: 5_000 }],
    });
    const { result } = resolve("break-hits", {
      targets: [targetInput(target)],
      hitWeights: [1, 1],
    });

    expect(result.hits[0].survival?.outcome).toBe("break_pending");
    expect(
      result.hits.map(({ overkillOrOvergauge }) =>
        overkillOrOvergauge
      ),
    ).toEqual([true, true]);
    expect(result.targets[0].target).toMatchObject({
      hp: 0,
      alive: true,
      breakPending: true,
    });
  });

  it("resolves guts and a later final defeat at their individual Hits", () => {
    const target = addEffects(
      unit("enemy-a", "enemy", {
        hp: 1,
        maxHp: 100,
        baseMaxHp: 100,
      }),
      [
        effect("guts", COMMON_EFFECT_TYPES.guts, {
          value: 50,
          remainingUses: 1,
        }),
      ],
    );
    const { result } = resolve("guts-hits", {
      targets: [targetInput(target)],
      hitWeights: [1, 1],
    });

    expect(result.hits.map(({ survival }) => survival?.outcome)).toEqual([
      "guts",
      "defeated",
    ]);
    expect(
      result.hits.map(({ overkillOrOvergauge }) =>
        overkillOrOvergauge
      ),
    ).toEqual([true, true]);
    expect(result.targets[0].target).toMatchObject({
      hp: 0,
      alive: false,
    });
  });

  it("grants received NP even when invincibility blocks every Hit", () => {
    const target = addEffects(
      unit("ally-a", "ally", {
        noblePhantasm: noblePhantasm(),
      }),
      [
        effect("invincible", COMMON_EFFECT_TYPES.invincibility, {
          remainingUses: 1,
        }),
      ],
    );
    const { result } = resolve("blocked-received-np", {
      source: unit("enemy-a", "enemy"),
      targets: [
        targetInput(target, {
          receivedNp: {
            baseDefenseNpUnits: 300,
            attackerNpRatePermille: 1_000,
          },
        }),
      ],
      hitWeights: [1, 1],
    });

    expect(result.targets[0].receivedNp?.totalUnits).toBe(600);
    expect(result.targets[0].target.np).toBe(600);
    expect(result.targets[0].target.hp).toBe(10_000);
  });

  it("starts the star overkill bonus on the Hit that reaches zero HP", () => {
    const target = unit("enemy-a", "enemy", {
      hp: 1,
      maxHp: 1,
      baseMaxHp: 1,
    });
    const { result, battleRng } = resolve("overkill-star", {
      targets: [
        targetInput(target, {
          stars: {
            servantStarRatePermille: 700,
            cardStarValuePermille: 0,
          },
        }),
      ],
      hitWeights: [1, 1],
    });

    expect(result.hits.map(({ star }) => star?.ratePermille)).toEqual([
      1_000,
      1_000,
    ]);
    expect(result.generatedStars).toBe(2);
    expect(battleRng.stream("stars").snapshot().drawCount).toBe(0);
  });

  it("replays the complete multi-stream result from the same seed", () => {
    const attack = (seed: string) =>
      resolve(seed, {
        targets: [
          targetInput(
            addEffects(unit("enemy-a", "enemy"), [
              effect("chance-evade", COMMON_EFFECT_TYPES.evade, {
                remainingUses: 1,
                flags: { activationRatePermille: 500 },
              }),
            ]),
            {
              stars: {
                servantStarRatePermille: 550,
                cardStarValuePermille: 0,
              },
            },
          ),
        ],
        hitWeights: [1, 2, 3],
      });

    expect(attack("replay")).toEqual(attack("replay"));
  });

  it("rejects invalid targets before consuming any RNG stream", () => {
    const random = rng("invalid-targets");
    const repeated = targetInput(unit("enemy-a", "enemy"));

    expect(() =>
      resolveAttack({
        source: unit("ally-a", "ally"),
        targets: [repeated, repeated],
        hitWeights: [1],
        defense: {},
        rng: random.streams,
      })
    ).toThrow(/duplicate attack target/);
    expect(
      Object.values(random.battle.snapshot().streams).every(
        ({ drawCount }) => drawCount === 0,
      ),
    ).toBe(true);
  });

  it("rejects a missing NP level before consuming any RNG stream", () => {
    const random = rng("invalid-np-level");

    expect(() =>
      resolveAttack({
        source: unit("ally-a", "ally"),
        targets: [
          targetInput(unit("enemy-a", "enemy"), {
            attackNp: {
              baseNpUnits: 100,
              cardNpValuePermille: 1_000,
              targetNpRatePermille: 1_000,
            },
          }),
        ],
        hitWeights: [1],
        defense: {},
        rng: random.streams,
      })
    ).toThrow(/attack NP gain requires a noble phantasm level/);
    expect(
      Object.values(random.battle.snapshot().streams).every(
        ({ drawCount }) => drawCount === 0,
      ),
    ).toBe(true);
  });
});
