import { describe, expect, it } from "vitest";
import {
  resolveBattleAttack,
} from "../src/core/battle/battleAttack";
import {
  beginAllyTurnEnd,
  beginEnemyTurnEnd,
  completeAllyTurnEnd,
  completeEnemyTurnEnd,
} from "../src/core/battle/progression";
import {
  createBattleState,
  setBattleFormation,
  type BattleState,
} from "../src/core/battle/state";
import {
  activateNextCommandStars,
  addCommandStars,
  addNextCommandStars,
  spendCommandStars,
} from "../src/core/battle/starState";
import type {
  NoblePhantasmState,
  SideFormation,
} from "../src/core/battle/types";
import { BattleRng } from "../src/core/rng";
import {
  findUnitLocation,
  replaceUnit,
} from "../src/core/battle/formation";
import { unit } from "./helpers/battle";

// Canonical behavior checked 2026-07-30:
// docs/specs/CALCULATIONS_AND_RNG.md and docs/specs/BATTLE_SYSTEM.md.

function noblePhantasm(): NoblePhantasmState {
  return {
    stableId: "test-np",
    name: "Test NP",
    cardType: "arts",
    level: 1,
  };
}

function enemyFormation(
  prefix = "enemy",
): SideFormation {
  return {
    frontline: [
      unit(`${prefix}-a`, "enemy"),
      unit(`${prefix}-b`, "enemy"),
      null,
    ],
    reserve: [],
  };
}

function battle(
  waves: readonly SideFormation[] = [enemyFormation()],
): BattleState {
  return createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally", {
          noblePhantasm: noblePhantasm(),
        }),
        unit("ally-b", "ally"),
        unit("ally-c", "ally"),
      ],
      reserve: [],
    },
    waves: waves.map((enemy) => ({ enemy })),
    enemyFrontlineLimit: 3,
  });
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

function damageInput() {
  return {
    attack: 10_000,
    cardDamageValuePermille: 1_000,
    classAttackCoefficientPermille: 1_000,
    classAffinityPermille: 1_000,
    attributeAffinityPermille: 1_000,
  };
}

describe("battle star state", () => {
  it("starts both current and next-command buckets at zero", () => {
    expect(battle()).toMatchObject({
      commandStars: 0,
      nextCommandStars: 0,
    });
  });

  it("caps each bucket at 99 and lets skills spend stars above 50", () => {
    const current = addCommandStars(battle(), 120);
    expect(current).toMatchObject({
      requested: 120,
      before: 0,
      added: 99,
      after: 99,
    });

    const spent = spendCommandStars(current.state, 75);
    expect(spent).toMatchObject({
      accepted: true,
      before: 99,
      spent: 75,
      after: 24,
    });
    if (!spent.accepted) return;

    const pending = addNextCommandStars(spent.state, 120);
    expect(pending).toMatchObject({
      added: 99,
      after: 99,
    });
    expect(pending.state).toMatchObject({
      commandStars: 24,
      nextCommandStars: 99,
    });
  });

  it("rejects an unaffordable spend without changing state", () => {
    const state = addCommandStars(battle(), 20).state;
    const result = spendCommandStars(state, 21);

    expect(result).toEqual({
      accepted: false,
      reason: "insufficient_stars",
      state,
      requested: 21,
      available: 20,
    });
  });

  it("does not let an enemy phase spend stale command stars", () => {
    let state = addCommandStars(battle(), 20).state;
    state = completeAllyTurnEnd(beginAllyTurnEnd(state));

    expect(() => spendCommandStars(state, 1)).toThrow(
      /only change during ally action/,
    );
    expect(state.commandStars).toBe(20);
  });

  it("expires old stars and activates only the pending bucket", () => {
    let state = addCommandStars(battle(), 80).state;
    state = addNextCommandStars(state, 35).state;
    expect(() => activateNextCommandStars(state)).toThrow(
      /only activate from a turn-end phase/,
    );
    state = completeAllyTurnEnd(beginAllyTurnEnd(state));
    state = beginEnemyTurnEnd(state);
    const result = activateNextCommandStars(state);

    expect(result).toMatchObject({
      expiredCommandStars: 80,
      activatedStars: 35,
      state: {
        commandStars: 35,
        nextCommandStars: 0,
      },
    });
  });

  it("activates pending stars only when the next normal ally phase begins", () => {
    let state = addCommandStars(battle(), 80).state;
    state = addNextCommandStars(state, 35).state;
    state = completeAllyTurnEnd(beginAllyTurnEnd(state));
    expect(state).toMatchObject({
      phase: "enemy_action",
      commandStars: 80,
      nextCommandStars: 35,
    });

    state = completeEnemyTurnEnd(beginEnemyTurnEnd(state));
    expect(state).toMatchObject({
      phase: "ally_action",
      commandStars: 35,
      nextCommandStars: 0,
    });
  });

  it("activates pending stars on an ally-turn Wave transition", () => {
    let state = battle([
      enemyFormation("wave-1"),
      enemyFormation("wave-2"),
    ]);
    state = addCommandStars(state, 50).state;
    state = addNextCommandStars(state, 12).state;
    let formation = state.formation;
    for (const target of ["wave-1-a", "wave-1-b"]) {
      const location = findUnitLocation(formation, target);
      if (!location) throw new Error(`missing ${target}`);
      formation = replaceUnit(formation, {
        ...location.unit,
        hp: 0,
        alive: false,
      });
    }
    state = setBattleFormation(state, formation);
    state = completeAllyTurnEnd(beginAllyTurnEnd(state));

    expect(state).toMatchObject({
      waveNumber: 2,
      phase: "ally_action",
      commandStars: 12,
      nextCommandStars: 0,
    });
  });
});

describe("BattleState attack adapter", () => {
  it("applies HP, source NP, pending break count, and generated stars atomically", () => {
    let state = battle();
    const target = findUnitLocation(
      state.formation,
      "enemy-a",
    )?.unit;
    if (!target) throw new Error("missing enemy-a");
    state = setBattleFormation(
      state,
      replaceUnit(state.formation, {
        ...target,
        hp: 1,
        maxHp: 1,
        baseMaxHp: 1,
        remainingBreakGauges: [{ maxHp: 5_000 }],
      }),
    );
    const random = streams("battle-attack");
    const result = resolveBattleAttack(state, {
      sourceInstanceId: "ally-a",
      targets: [
        {
          targetInstanceId: "enemy-a",
          damage: damageInput(),
          attackNp: {
            baseNpUnits: 100,
            cardNpValuePermille: 1_000,
            targetNpRatePermille: 1_000,
          },
          stars: {
            servantStarRatePermille: 700,
            cardStarValuePermille: 0,
          },
        },
      ],
      hitWeights: [1, 1],
      defense: {},
      rng: random.streams,
    });

    expect(result.updatedInstanceIds).toEqual([
      "ally-a",
      "enemy-a",
    ]);
    expect(
      findUnitLocation(
        result.state.formation,
        "enemy-a",
      )?.unit,
    ).toMatchObject({
      hp: 0,
      alive: true,
      breakPending: true,
    });
    expect(
      findUnitLocation(
        result.state.formation,
        "ally-a",
      )?.unit.np,
    ).toBe(300);
    expect(result.state.waveContinuation.pendingBreaks).toBe(1);
    expect(result.starAddition).toMatchObject({
      requested: 2,
      added: 2,
      after: 2,
    });
    expect(result.state.nextCommandStars).toBe(2);
  });

  it("canonicalizes reversed multi-target input to formation order and caps pending stars", () => {
    const pending = addNextCommandStars(battle(), 95).state;
    const random = streams("ordered-battle-attack");
    const result = resolveBattleAttack(pending, {
      sourceInstanceId: "ally-a",
      targets: [
        {
          targetInstanceId: "enemy-b",
          damage: damageInput(),
          stars: {
            servantStarRatePermille: 1_000,
            cardStarValuePermille: 0,
          },
        },
        {
          targetInstanceId: "enemy-a",
          damage: damageInput(),
          stars: {
            servantStarRatePermille: 1_000,
            cardStarValuePermille: 0,
          },
        },
      ],
      hitWeights: [1, 1],
      defense: {},
      rng: random.streams,
    });

    expect(
      result.attack.targets.map(({ targetInstanceId }) =>
        targetInstanceId
      ),
    ).toEqual(["enemy-a", "enemy-b"]);
    expect(
      result.attack.hits.map(
        ({ hitNumber, targetInstanceId }) => [
          hitNumber,
          targetInstanceId,
        ],
      ),
    ).toEqual([
      [1, "enemy-a"],
      [1, "enemy-b"],
      [2, "enemy-a"],
      [2, "enemy-b"],
    ]);
    expect(result.starAddition).toMatchObject({
      requested: 4,
      added: 4,
      after: 99,
    });
    expect(result.state.nextCommandStars).toBe(99);
  });

  it("applies enemy attack damage and received NP without generating command stars", () => {
    let state = battle();
    const target = findUnitLocation(
      state.formation,
      "ally-a",
    )?.unit;
    if (!target) throw new Error("missing ally-a");
    state = setBattleFormation(
      state,
      replaceUnit(state.formation, {
        ...target,
        hp: 100_000,
        maxHp: 100_000,
        baseMaxHp: 100_000,
      }),
    );
    state = completeAllyTurnEnd(beginAllyTurnEnd(state));
    const random = streams("enemy-battle-attack");
    const result = resolveBattleAttack(state, {
      sourceInstanceId: "enemy-a",
      targets: [
        {
          targetInstanceId: "ally-a",
          damage: damageInput(),
          receivedNp: {
            baseDefenseNpUnits: 300,
            attackerNpRatePermille: 1_000,
          },
        },
      ],
      hitWeights: [1, 1],
      defense: {},
      rng: random.streams,
    });

    const updated = findUnitLocation(
      result.state.formation,
      "ally-a",
    )?.unit;
    expect(updated?.hp).toBeLessThan(100_000);
    expect(updated?.np).toBe(600);
    expect(result.attack.generatedStars).toBe(0);
    expect(result.state.nextCommandStars).toBe(0);
  });

  it("preserves non-target BattleState changes from each after-Hit hook", () => {
    const random = streams("battle-after-hit");
    const result = resolveBattleAttack(battle(), {
      sourceInstanceId: "ally-a",
      targets: [
        {
          targetInstanceId: "enemy-a",
          damage: damageInput(),
        },
      ],
      hitWeights: [1, 1],
      defense: {},
      rng: random.streams,
      afterHitBatch: ({ state, hitNumber }) => {
        const bystander = findUnitLocation(
          state.formation,
          "ally-b",
        )?.unit;
        if (!bystander) throw new Error("missing ally-b");
        return {
          state: setBattleFormation(
            state,
            replaceUnit(state.formation, {
              ...bystander,
              hp: bystander.hp - 1_000,
            }),
          ),
          detail: `hit-${hitNumber}`,
        };
      },
    });

    expect(
      findUnitLocation(
        result.state.formation,
        "ally-b",
      )?.unit.hp,
    ).toBe(8_000);
    expect(result.hitBatchDetails).toEqual([
      "hit-1",
      "hit-2",
    ]);
  });

  it("rejects missing units and enemy star requests before consuming RNG", () => {
    const random = streams("invalid-battle-attack");
    const base = battle();

    expect(() =>
      resolveBattleAttack(base, {
        sourceInstanceId: "ally-a",
        targets: [
          {
            targetInstanceId: "missing",
            damage: damageInput(),
          },
        ],
        hitWeights: [1],
        defense: {},
        rng: random.streams,
      })
    ).toThrow(/attack target is not in formation/);
    expect(() =>
      resolveBattleAttack(base, {
        sourceInstanceId: "enemy-a",
        targets: [
          {
            targetInstanceId: "ally-a",
            damage: damageInput(),
            stars: {
              servantStarRatePermille: 1_000,
              cardStarValuePermille: 0,
            },
          },
        ],
        hitWeights: [1],
        defense: {},
        rng: random.streams,
      })
    ).toThrow(/only an ally attack can request star generation/);
    expect(() =>
      resolveBattleAttack(base, {
        sourceInstanceId: "ally-a",
        targets: [
          {
            targetInstanceId: "ally-b",
            damage: damageInput(),
          },
        ],
        hitWeights: [1],
        defense: {},
        rng: random.streams,
      })
    ).toThrow(/must target the opposing side/);
    expect(
      Object.values(random.rng.snapshot().streams).every(
        ({ drawCount }) => drawCount === 0,
      ),
    ).toBe(true);
  });
});
