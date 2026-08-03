import { describe, expect, it } from "vitest";
import {
  createBattleAttackDataRegistry,
  type BattleAttackDataRegistry,
} from "../src/core/battle/actionData";
import {
  resolveBattleTurn,
} from "../src/core/battle/battleTurn";
import {
  findUnitLocation,
} from "../src/core/battle/formation";
import {
  createBattleState,
  type BattleState,
} from "../src/core/battle/state";
import type {
  EnemyActionState,
} from "../src/core/battle/types";
import { BattleRng } from "../src/core/rng";
import {
  selectCommandCards,
  type CommandCardSelection,
} from "../src/core/cards/selection";
import { combatantData } from "./helpers/attackData";
import { unit } from "./helpers/battle";

// Canonical full-turn order:
// docs/specs/BATTLE_SYSTEM.md, EFFECTS_AND_TIMING.md, and
// docs/PROJECT_RULES.md (checked 2026-08-03).

function enemyAction(): EnemyActionState {
  return {
    maxActions: 1,
    normalAttack: {
      stableId: "enemy-normal",
      name: "Enemy Normal",
    },
    skills: [],
    noblePhantasm: null,
    charge: 0,
    chargeMax: 0,
  };
}

interface BattleOptions {
  allyHp?: number;
  enemyHp?: number;
  enemyActionConfigured?: boolean;
  secondWave?: boolean;
}

function battle(options: BattleOptions = {}): BattleState {
  const allyHp = options.allyHp ?? 100_000;
  const enemyHp = options.enemyHp ?? 1_000_000;
  const state = createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally", {
          hp: allyHp,
          maxHp: allyHp,
          baseMaxHp: allyHp,
          commandCards: [
            "buster",
            "buster",
            "buster",
            "arts",
            "quick",
          ],
        }),
        unit("ally-b", "ally", {
          hp: allyHp,
          maxHp: allyHp,
          baseMaxHp: allyHp,
        }),
        unit("ally-c", "ally", {
          hp: allyHp,
          maxHp: allyHp,
          baseMaxHp: allyHp,
        }),
      ],
      reserve: [],
    },
    waves: [
      {
        enemy: {
          frontline: [
            unit("enemy-a", "enemy", {
              hp: enemyHp,
              maxHp: enemyHp,
              baseMaxHp: enemyHp,
              enemyAction:
                options.enemyActionConfigured === false
                  ? null
                  : enemyAction(),
            }),
            null,
            null,
          ],
          reserve: [],
        },
      },
      ...(options.secondWave
        ? [
            {
              enemy: {
                frontline: [
                  unit("enemy-b", "enemy", {
                    hp: 100_000,
                    maxHp: 100_000,
                    baseMaxHp: 100_000,
                    enemyAction: enemyAction(),
                  }),
                  null,
                  null,
                ],
                reserve: [],
              },
            },
          ]
        : []),
    ],
    enemyFrontlineLimit: 3,
  });
  return {
    ...state,
    commandDeck: {
      ...state.commandDeck,
      currentHand: state.commandDeck.sourceCards.filter(
        ({ ownerInstanceId }) => ownerInstanceId === "ally-a",
      ),
    },
  };
}

function selection(state: BattleState): CommandCardSelection {
  const result = selectCommandCards(
    state,
    state.commandDeck.currentHand
      .slice(0, 3)
      .map(({ cardId }) => cardId),
  );
  if (!result.accepted) {
    throw new Error(`selection rejected: ${result.reason}`);
  }
  return result.selection;
}

function standardRegistry(
  enemyTargetScope: "single" | "all" = "single",
  enemyAttack = 10_000,
): BattleAttackDataRegistry {
  return createBattleAttackDataRegistry([
    combatantData("ally-a", "ally-a", {
      attack: 10_000,
      starRatePermille: 0,
      commandCardHitWeights: [
        [1],
        [1],
        [1],
        [1],
        [1],
      ],
      extraAttackHitWeights: [1],
    }),
    combatantData("enemy-a", "enemy-a", {
      attack: enemyAttack,
      commandCardHitWeights: null,
      extraAttackHitWeights: null,
      enemyAttacks: [
        {
          actionStableId: "enemy-normal",
          kind: "normal_attack",
          targetScope: enemyTargetScope,
          cardType: "buster",
          hitWeights: [1],
          cardDamageValuePermille: 1_000,
        },
      ],
    }),
  ]);
}

describe("complete battle-turn coordinator", () => {
  it("runs ally attacks, both turn ends, and enemy attacks through the next input boundary", () => {
    const state = battle();
    const result = resolveBattleTurn({
      state,
      selection: selection(state),
      registry: standardRegistry(),
      rng: new BattleRng("complete-battle-turn"),
    });

    expect(result).toMatchObject({
      stopReason: "turn_complete",
      state: {
        phase: "ally_action",
        outcome: "ongoing",
        waveNumber: 1,
        battleTurn: 2,
        waveTurn: 2,
      },
    });
    expect(result.allyTurnEnd).not.toBeNull();
    expect(result.enemyAttacks?.sequence.actions).toHaveLength(1);
    expect(result.enemyTurnEnd).not.toBeNull();
    expect(
      findUnitLocation(result.state.formation, "enemy-a")?.unit.hp,
    ).toBeLessThan(1_000_000);
    expect(
      findUnitLocation(result.state.formation, "ally-a")?.unit.hp,
    ).toBeLessThan(100_000);
    expect(
      result.actionLogBatches.map(({ kind }) => kind),
    ).toEqual(["ally_command", "enemy_turn"]);
  });

  it("reproduces the complete turn and every named RNG position from one fixed seed", () => {
    const firstState = battle();
    const firstRng = new BattleRng("fixed-complete-turn");
    const first = resolveBattleTurn({
      state: firstState,
      selection: selection(firstState),
      registry: standardRegistry(),
      rng: firstRng,
    });
    const secondState = battle();
    const secondRng = new BattleRng("fixed-complete-turn");
    const second = resolveBattleTurn({
      state: secondState,
      selection: selection(secondState),
      registry: standardRegistry(),
      rng: secondRng,
    });

    expect(second).toEqual(first);
    expect(secondRng.snapshot()).toEqual(firstRng.snapshot());
  });

  it("completes the turn when every enemy action definition is omitted", () => {
    const state = battle({ enemyActionConfigured: false });
    const result = resolveBattleTurn({
      state,
      selection: selection(state),
      registry: standardRegistry(),
      rng: new BattleRng("enemy-actions-omitted"),
    });

    expect(result).toMatchObject({
      stopReason: "turn_complete",
      state: {
        phase: "ally_action",
        outcome: "ongoing",
        battleTurn: 2,
      },
    });
    expect(result.enemyAttacks?.sequence.actions).toHaveLength(3);
    expect(
      result.enemyAttacks?.sequence.actions.map(
        ({ preflight }) => preflight,
      ),
    ).toEqual([
      expect.objectContaining({
        outcome: "skipped",
        reason: "normal_attack_not_configured",
      }),
      expect.objectContaining({
        outcome: "skipped",
        reason: "normal_attack_not_configured",
      }),
      expect.objectContaining({
        outcome: "skipped",
        reason: "normal_attack_not_configured",
      }),
    ]);
    expect(
      findUnitLocation(result.state.formation, "ally-a")?.unit.hp,
    ).toBe(100_000);
  });

  it("stops after ally turn end when the final enemy is defeated", () => {
    const state = battle({ enemyHp: 1 });
    const result = resolveBattleTurn({
      state,
      selection: selection(state),
      registry: standardRegistry(),
      rng: new BattleRng("ally-turn-victory"),
    });

    expect(result).toMatchObject({
      stopReason: "battle_finished_after_ally_turn_end",
      state: { phase: "finished", outcome: "victory" },
      enemyAttacks: null,
      enemyTurnEnd: null,
    });
    expect(result.actionLogBatches).toHaveLength(1);
  });

  it("starts the next Wave after ally turn end without running the old Wave enemy turn", () => {
    const state = battle({ enemyHp: 1, secondWave: true });
    const result = resolveBattleTurn({
      state,
      selection: selection(state),
      registry: standardRegistry(),
      rng: new BattleRng("ally-turn-next-wave"),
    });

    expect(result).toMatchObject({
      stopReason: "wave_advanced_after_ally_turn_end",
      state: {
        phase: "ally_action",
        outcome: "ongoing",
        waveNumber: 2,
        battleTurn: 2,
        waveTurn: 1,
      },
      enemyAttacks: null,
      enemyTurnEnd: null,
    });
    expect(
      result.state.formation.enemy.frontline[0]?.instanceId,
    ).toBe("enemy-b");
  });

  it("settles ally annihilation only after the enemy turn end", () => {
    const state = battle({ allyHp: 1 });
    const result = resolveBattleTurn({
      state,
      selection: selection(state),
      registry: createBattleAttackDataRegistry([
        combatantData("enemy-a", "enemy-a", {
          attack: 100_000,
          commandCardHitWeights: null,
          extraAttackHitWeights: null,
          enemyAttacks: [
            {
              actionStableId: "enemy-normal",
              kind: "normal_attack",
              targetScope: "all",
              cardType: "buster",
              hitWeights: [1],
              cardDamageValuePermille: 1_000,
            },
          ],
        }),
      ]),
      rng: new BattleRng("enemy-turn-defeat"),
    });

    expect(result.enemyAttacks?.sequence.stopReason).toBe(
      "ally_annihilated",
    );
    expect(result).toMatchObject({
      stopReason: "battle_finished_after_enemy_turn_end",
      state: { phase: "finished", outcome: "defeat" },
    });
    expect(result.enemyTurnEnd).not.toBeNull();
  });

  it("leaves later stages untouched when the requested target is rejected", () => {
    const state = battle();
    const rng = new BattleRng("rejected-battle-turn");
    const result = resolveBattleTurn({
      state,
      selection: selection(state),
      registry: standardRegistry(),
      rng,
      ally: { requestedTargetInstanceId: "missing-enemy" },
    });

    expect(result).toMatchObject({
      state,
      stopReason: "ally_command_rejected",
      allyTurnEnd: null,
      enemyAttacks: null,
      enemyTurnEnd: null,
      actionLogBatches: [
        { status: "rejected", entries: [] },
      ],
    });
    expect(rng.stream("effects").snapshot().drawCount).toBe(0);
    expect(rng.stream("damage").snapshot().drawCount).toBe(0);
    expect(rng.stream("stars").snapshot().drawCount).toBe(0);
  });
});
