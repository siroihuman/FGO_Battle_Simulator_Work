import { describe, expect, it } from "vitest";
import {
  resolveActionBoundary,
} from "../src/core/battle/actionBoundary";
import {
  resolveBattleAttack,
} from "../src/core/battle/battleAttack";
import {
  findUnitLocation,
  replaceUnit,
} from "../src/core/battle/formation";
import { beginAllyTurnEnd } from "../src/core/battle/progression";
import {
  createBattleState,
  setBattleFormation,
  type BattleState,
  type EnemyReplacementMode,
} from "../src/core/battle/state";
import type { NoblePhantasmState } from "../src/core/battle/types";
import { BattleRng } from "../src/core/rng";
import {
  listCommandCardChoices,
  selectCommandCards,
  type CommandCardSelection,
} from "../src/core/cards/selection";
import {
  resolveAllyCommandSequence,
  type AllyCommandActionResolver,
} from "../src/core/cards/turnCoordinator";
import { unit } from "./helpers/battle";

// Canonical behavior:
// docs/specs/BATTLE_SYSTEM.md and docs/PROJECT_RULES.md (checked 2026-07-30).

function noblePhantasm(
  stableId: string,
  cardType: NoblePhantasmState["cardType"] = "buster",
): NoblePhantasmState {
  return {
    stableId,
    name: stableId,
    cardType,
    level: 2,
  };
}

function battle(
  mode: EnemyReplacementMode = "standard",
): BattleState {
  return createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally", {
          np: 15_000,
          noblePhantasm: noblePhantasm("np-a"),
        }),
        unit("ally-b", "ally", {
          np: 12_000,
          noblePhantasm: noblePhantasm("np-b", "arts"),
        }),
        unit("ally-c", "ally"),
      ],
      reserve: [
        unit("ally-d", "ally"),
        unit("ally-e", "ally"),
        unit("ally-f", "ally"),
      ],
    },
    waves: [
      {
        enemy: {
          frontline: [
            unit("enemy-a", "enemy"),
            unit("enemy-b", "enemy"),
            unit("enemy-c", "enemy"),
          ],
          reserve: [
            unit("enemy-d", "enemy"),
            unit("enemy-e", "enemy"),
          ],
        },
      },
    ],
    enemyFrontlineLimit: 3,
    enemyReplacementMode: mode,
  });
}

function updateUnit(
  state: BattleState,
  instanceId: string,
  update: (
    current: NonNullable<
      ReturnType<typeof findUnitLocation>
    >["unit"],
  ) => NonNullable<
    ReturnType<typeof findUnitLocation>
  >["unit"],
): BattleState {
  const location = findUnitLocation(state.formation, instanceId);
  if (!location) throw new Error(`missing unit: ${instanceId}`);
  return setBattleFormation(
    state,
    replaceUnit(state.formation, update(location.unit)),
  );
}

function defeat(
  state: BattleState,
  ...instanceIds: string[]
): BattleState {
  let current = state;
  for (const instanceId of instanceIds) {
    current = updateUnit(current, instanceId, (unitState) => ({
      ...unitState,
      hp: 0,
      alive: false,
    }));
  }
  return current;
}

function withHand(
  state: BattleState,
  cards: readonly [ownerInstanceId: string, cardIndex: number][],
): BattleState {
  const currentHand = cards.map(([ownerInstanceId, cardIndex]) => {
    const card = state.commandDeck.sourceCards.find(
      (candidate) =>
        candidate.ownerInstanceId === ownerInstanceId
        && candidate.cardIndex === cardIndex,
    );
    if (!card) {
      throw new Error(
        `missing card: ${ownerInstanceId}:${cardIndex}`,
      );
    }
    return card;
  });
  const fillers = state.commandDeck.sourceCards.filter(
    (candidate) =>
      !currentHand.some(({ cardId }) => cardId === candidate.cardId),
  ).slice(0, Math.max(0, 5 - currentHand.length));
  return {
    ...state,
    commandDeck: {
      ...state.commandDeck,
      currentHand: [...currentHand, ...fillers],
    },
  };
}

function select(
  state: BattleState,
  cardIds: readonly string[],
): CommandCardSelection {
  const selected = selectCommandCards(state, cardIds);
  if (!selected.accepted) {
    throw new Error(`selection rejected: ${selected.reason}`);
  }
  return selected.selection;
}

function normalCardId(
  state: BattleState,
  ownerInstanceId: string,
  cardIndex: number,
): string {
  const choice = listCommandCardChoices(state).find(
    ({ card }) =>
      card.kind === "normal"
      && card.ownerInstanceId === ownerInstanceId
      && card.cardIndex === cardIndex,
  );
  if (!choice) throw new Error("missing normal card choice");
  return choice.card.cardId;
}

function npCardId(
  state: BattleState,
  ownerInstanceId: string,
): string {
  const choice = listCommandCardChoices(state).find(
    ({ card }) =>
      card.kind === "noble_phantasm"
      && card.ownerInstanceId === ownerInstanceId,
  );
  if (!choice) throw new Error("missing NP card choice");
  return choice.card.cardId;
}

function mixedSelection(state: BattleState): {
  state: BattleState;
  selection: CommandCardSelection;
} {
  const ready = withHand(state, [
    ["ally-a", 0],
    ["ally-b", 0],
    ["ally-c", 0],
  ]);
  return {
    state: ready,
    selection: select(ready, [
      normalCardId(ready, "ally-a", 0),
      normalCardId(ready, "ally-b", 0),
      normalCardId(ready, "ally-c", 0),
    ]),
  };
}

function braveSelection(state: BattleState): {
  state: BattleState;
  selection: CommandCardSelection;
} {
  const ready = withHand(state, [
    ["ally-a", 0],
    ["ally-a", 1],
    ["ally-a", 2],
  ]);
  return {
    state: ready,
    selection: select(ready, [
      normalCardId(ready, "ally-a", 0),
      normalCardId(ready, "ally-a", 1),
      normalCardId(ready, "ally-a", 2),
    ]),
  };
}

describe("ally command sequence coordinator", () => {
  it("executes three selected cards in order and enters ally turn end", () => {
    const prepared = mixedSelection(battle());
    const seen: Array<{
      sequence: number;
      owner: string;
      target: string;
    }> = [];
    const resolver: AllyCommandActionResolver = (input) => {
      seen.push({
        sequence: input.action.sequence,
        owner: input.action.ownerInstanceId,
        target: input.target.instanceId,
      });
      return {
        state: input.state,
        detail: `resolved-${input.action.sequence}`,
      };
    };
    const started = resolveAllyCommandSequence(
      prepared.state,
      prepared.selection,
      resolver,
    );

    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    expect(seen).toEqual([
      { sequence: 1, owner: "ally-a", target: "enemy-a" },
      { sequence: 2, owner: "ally-b", target: "enemy-a" },
      { sequence: 3, owner: "ally-c", target: "enemy-a" },
    ]);
    expect(started.result.actions.map(
      ({ resolverDetail }) => resolverDetail,
    )).toEqual(["resolved-1", "resolved-2", "resolved-3"]);
    expect(started.result.plannedActionCount).toBe(3);
    expect(started.result.stopReason).toBe("sequence_complete");
    expect(started.result.state.phase).toBe("ally_turn_end");
  });

  it("uses the requested living target instead of the initial frontmost target", () => {
    const prepared = mixedSelection(battle());
    const targets: string[] = [];
    const started = resolveAllyCommandSequence(
      prepared.state,
      prepared.selection,
      (input) => {
        targets.push(input.target.instanceId);
        return { state: input.state };
      },
      "enemy-b",
    );

    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    expect(started.result.initialTarget).toEqual({
      instanceId: "enemy-b",
      frontlineIndex: 1,
    });
    expect(targets).toEqual(["enemy-b", "enemy-b", "enemy-b"]);
  });

  it("consumes a ready NP before passing its action to the resolver", () => {
    let state = withHand(battle(), [
      ["ally-b", 0],
      ["ally-c", 0],
    ]);
    const selection = select(state, [
      npCardId(state, "ally-a"),
      normalCardId(state, "ally-b", 0),
      normalCardId(state, "ally-c", 0),
    ]);
    const npSeen: number[] = [];
    const started = resolveAllyCommandSequence(
      state,
      selection,
      (input) => {
        if (input.action.sequence === 1) {
          npSeen.push(
            findUnitLocation(
              input.state.formation,
              "ally-a",
            )?.unit.np ?? -1,
          );
        }
        return { state: input.state };
      },
    );

    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    expect(npSeen).toEqual([0]);
    expect(started.result.actions[0]?.preflight).toMatchObject({
      outcome: "ready",
      npBeforeUse: 15_000,
      npConsumed: 15_000,
    });
  });

  it("fizzles an NP that lost charge after selection without consuming it or calling the resolver", () => {
    let state = withHand(battle(), [
      ["ally-b", 0],
      ["ally-c", 0],
    ]);
    const selection = select(state, [
      npCardId(state, "ally-a"),
      normalCardId(state, "ally-b", 0),
      normalCardId(state, "ally-c", 0),
    ]);
    state = updateUnit(state, "ally-a", (current) => ({
      ...current,
      np: 0,
    }));
    const called: number[] = [];
    const started = resolveAllyCommandSequence(
      state,
      selection,
      (input) => {
        called.push(input.action.sequence);
        return { state: input.state };
      },
    );

    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    expect(called).toEqual([2, 3]);
    expect(started.result.actions[0]).toMatchObject({
      resolverCalled: false,
      preflight: {
        outcome: "fizzled",
        restrictions: ["insufficient_np"],
        npBeforeUse: 0,
        npConsumed: 0,
      },
    });
  });

  it("fizzles a later card whose owner died and was replaced after an earlier action", () => {
    let state = withHand(battle(), [
      ["ally-a", 0],
      ["ally-a", 1],
      ["ally-b", 0],
    ]);
    const selection = select(state, [
      normalCardId(state, "ally-a", 0),
      normalCardId(state, "ally-a", 1),
      normalCardId(state, "ally-b", 0),
    ]);
    const called: number[] = [];
    const started = resolveAllyCommandSequence(
      state,
      selection,
      (input) => {
        called.push(input.action.sequence);
        return {
          state:
            input.action.sequence === 1
              ? defeat(input.state, "ally-a")
              : input.state,
        };
      },
    );

    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    expect(called).toEqual([1, 3]);
    expect(started.result.actions[1]).toMatchObject({
      resolverCalled: false,
      preflight: {
        outcome: "fizzled",
        restrictions: [
          "owner_not_frontline",
          "owner_defeated",
        ],
      },
    });
    expect(
      started.result.actions[0]?.boundary.allyReplacement.events[0],
    ).toMatchObject({
      defeatedInstanceId: "ally-a",
      replacementInstanceId: "ally-d",
    });
  });

  it("preserves selection-time Mighty-chain facts after a later owner becomes unavailable", () => {
    let state = withHand(battle(), [
      ["ally-a", 0],
      ["ally-b", 2],
      ["ally-c", 4],
    ]);
    const selection = select(state, [
      normalCardId(state, "ally-a", 0),
      normalCardId(state, "ally-b", 2),
      normalCardId(state, "ally-c", 4),
    ]);
    const seen: Array<{
      sequence: number;
      mightyChain: boolean;
    }> = [];
    const started = resolveAllyCommandSequence(
      state,
      selection,
      (input) => {
        seen.push({
          sequence: input.action.sequence,
          mightyChain: input.chain.mightyChain,
        });
        return {
          state:
            input.action.sequence === 1
              ? defeat(input.state, "ally-b")
              : input.state,
        };
      },
    );

    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    expect(started.result.chain.mightyChain).toBe(true);
    expect(seen).toEqual([
      { sequence: 1, mightyChain: true },
      { sequence: 3, mightyChain: true },
    ]);
    expect(started.result.actions[1]?.preflight.outcome).toBe(
      "fizzled",
    );
  });

  it("retargets to the rear slot between cards after a standard departure", () => {
    const prepared = mixedSelection(battle());
    const targets: string[] = [];
    const started = resolveAllyCommandSequence(
      prepared.state,
      prepared.selection,
      (input) => {
        targets.push(input.target.instanceId);
        return {
          state:
            input.action.sequence === 1
              ? defeat(input.state, input.target.instanceId)
              : input.state,
        };
      },
      "enemy-b",
    );

    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    expect(targets).toEqual(["enemy-b", "enemy-c", "enemy-c"]);
    expect(started.result.actions[0]?.boundary.nextEnemyTarget).toEqual({
      instanceId: "enemy-c",
      frontlineIndex: 2,
    });
  });

  it("keeps a defeated target through consecutive single-target normal cards from the same ally", () => {
    let state = withHand(battle(), [
      ["ally-a", 0],
      ["ally-a", 1],
      ["ally-b", 0],
    ]);
    const selection = select(state, [
      normalCardId(state, "ally-a", 0),
      normalCardId(state, "ally-a", 1),
      normalCardId(state, "ally-b", 0),
    ]);
    const targets: string[] = [];
    const started = resolveAllyCommandSequence(
      state,
      selection,
      (input) => {
        targets.push(input.target.instanceId);
        return {
          state:
            input.action.sequence === 1
              ? defeat(input.state, input.target.instanceId)
              : input.state,
          targetScope: "single",
        };
      },
      "enemy-b",
    );

    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    expect(targets).toEqual(["enemy-b", "enemy-b", "enemy-c"]);
    expect(started.result.actions[0]?.boundary).toMatchObject({
      enemyReplacement: { departures: [] },
      nextEnemyTarget: {
        instanceId: "enemy-b",
        frontlineIndex: 1,
      },
    });
    expect(started.result.actions[1]?.boundary).toMatchObject({
      enemyReplacement: {
        departures: [{ instanceId: "enemy-b" }],
      },
      nextEnemyTarget: {
        instanceId: "enemy-c",
        frontlineIndex: 2,
      },
    });
  });

  it("retargets normally when the next same-owner card is a noble phantasm", () => {
    let state = withHand(battle(), [
      ["ally-a", 0],
      ["ally-b", 0],
    ]);
    const selection = select(state, [
      normalCardId(state, "ally-a", 0),
      npCardId(state, "ally-a"),
      normalCardId(state, "ally-b", 0),
    ]);
    const targets: string[] = [];
    const started = resolveAllyCommandSequence(
      state,
      selection,
      (input) => {
        targets.push(input.target.instanceId);
        return {
          state:
            input.action.sequence === 1
              ? defeat(input.state, input.target.instanceId)
              : input.state,
          targetScope: "single",
        };
      },
      "enemy-b",
    );

    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    expect(targets).toEqual(["enemy-b", "enemy-c", "enemy-c"]);
    expect(started.result.actions[0]?.boundary.enemyReplacement.departures)
      .toEqual([expect.objectContaining({ instanceId: "enemy-b" })]);
  });

  it("does not retain a defeated target after an all-target attack", () => {
    let state = withHand(battle(), [
      ["ally-a", 0],
      ["ally-a", 1],
      ["ally-b", 0],
    ]);
    const selection = select(state, [
      normalCardId(state, "ally-a", 0),
      normalCardId(state, "ally-a", 1),
      normalCardId(state, "ally-b", 0),
    ]);
    const targets: string[] = [];
    const started = resolveAllyCommandSequence(
      state,
      selection,
      (input) => {
        targets.push(input.target.instanceId);
        return {
          state:
            input.action.sequence === 1
              ? defeat(input.state, input.target.instanceId)
              : input.state,
          targetScope: input.action.sequence === 1 ? "all" : "single",
        };
      },
      "enemy-b",
    );

    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    expect(targets).toEqual(["enemy-b", "enemy-c", "enemy-c"]);
  });

  it("does not prioritize an immediate replacement in the departed target's slot", () => {
    const prepared = mixedSelection(battle("immediate"));
    const targets: string[] = [];
    const started = resolveAllyCommandSequence(
      prepared.state,
      prepared.selection,
      (input) => {
        targets.push(input.target.instanceId);
        return {
          state:
            input.action.sequence === 1
              ? defeat(input.state, input.target.instanceId)
              : input.state,
        };
      },
      "enemy-b",
    );

    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    expect(targets).toEqual(["enemy-b", "enemy-c", "enemy-c"]);
    expect(
      started.result.actions[0]?.boundary.enemyReplacement.arrivals[0],
    ).toMatchObject({
      frontlineIndex: 1,
      instanceId: "enemy-d",
    });
  });

  it("stops before remaining cards when no living enemy target remains", () => {
    let state = withHand(battle(), [
      ["ally-b", 0],
      ["ally-c", 0],
    ]);
    const selection = select(state, [
      normalCardId(state, "ally-b", 0),
      npCardId(state, "ally-a"),
      normalCardId(state, "ally-c", 0),
    ]);
    const called: number[] = [];
    const started = resolveAllyCommandSequence(
      state,
      selection,
      (input) => {
        called.push(input.action.sequence);
        return {
          state: defeat(
            input.state,
            "enemy-a",
            "enemy-b",
            "enemy-c",
            "enemy-d",
            "enemy-e",
          ),
        };
      },
    );

    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    expect(called).toEqual([1]);
    expect(started.result.actions).toHaveLength(1);
    expect(started.result.stopReason).toBe("no_enemy_target");
    expect(
      findUnitLocation(
        started.result.state.formation,
        "ally-a",
      )?.unit.np,
    ).toBe(15_000);
    expect(started.result.state.phase).toBe("ally_turn_end");
    expect(started.result.state.outcome).toBe("ongoing");
  });

  it("keeps a pending break target for all remaining over-gauge actions", () => {
    const prepared = mixedSelection(battle());
    const targets: string[] = [];
    const started = resolveAllyCommandSequence(
      prepared.state,
      prepared.selection,
      (input) => {
        targets.push(input.target.instanceId);
        if (input.action.sequence !== 1) {
          return { state: input.state };
        }
        const withGauge = updateUnit(
          input.state,
          input.target.instanceId,
          (current) => ({
            ...current,
            hp: 0,
            alive: true,
            breakPending: true,
            remainingBreakGauges: [{ maxHp: 20_000 }],
          }),
        );
        return { state: withGauge };
      },
    );

    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    expect(targets).toEqual(["enemy-a", "enemy-a", "enemy-a"]);
    expect(
      started.result.actions[0]?.boundary.enemyReplacement.departures,
    ).toEqual([]);
  });

  it("schedules and executes Extra Attack after a valid Brave chain", () => {
    const prepared = braveSelection(battle());
    const called: Array<{
      sequence: number;
      kind: string;
    }> = [];
    const started = resolveAllyCommandSequence(
      prepared.state,
      prepared.selection,
      (input) => {
        called.push({
          sequence: input.action.sequence,
          kind: input.action.kind,
        });
        return { state: input.state };
      },
    );

    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    expect(started.result.chain.braveChain).toBe(true);
    expect(started.result.plannedActionCount).toBe(4);
    expect(called).toEqual([
      { sequence: 1, kind: "selected_card" },
      { sequence: 2, kind: "selected_card" },
      { sequence: 3, kind: "selected_card" },
      { sequence: 4, kind: "extra_attack" },
    ]);
  });

  it("keeps a target defeated by the third normal card through the same owner's Extra Attack", () => {
    const prepared = braveSelection(battle());
    const targets: string[] = [];
    const started = resolveAllyCommandSequence(
      prepared.state,
      prepared.selection,
      (input) => {
        targets.push(input.target.instanceId);
        return {
          state:
            input.action.sequence === 3
              ? defeat(input.state, input.target.instanceId)
              : input.state,
          targetScope: "single",
        };
      },
      "enemy-b",
    );

    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    expect(targets).toEqual(["enemy-b", "enemy-b", "enemy-b", "enemy-b"]);
    expect(started.result.actions[2]?.boundary).toMatchObject({
      enemyReplacement: { departures: [] },
      nextEnemyTarget: {
        instanceId: "enemy-b",
        frontlineIndex: 1,
      },
    });
    expect(started.result.actions[3]?.boundary).toMatchObject({
      enemyReplacement: {
        departures: [{ instanceId: "enemy-b" }],
      },
      nextEnemyTarget: {
        instanceId: "enemy-c",
        frontlineIndex: 2,
      },
    });
  });

  it("adds a Quick-chain bonus to the next command star bucket once", () => {
    const ready = withHand(battle(), [
      ["ally-a", 4],
      ["ally-b", 4],
      ["ally-c", 4],
    ]);
    const selection = select(ready, [
      normalCardId(ready, "ally-a", 4),
      normalCardId(ready, "ally-b", 4),
      normalCardId(ready, "ally-c", 4),
    ]);
    const started = resolveAllyCommandSequence(
      ready,
      selection,
      (input) => ({ state: input.state }),
    );

    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    expect(started.result.chain.quickChainStars).toBe(20);
    expect(started.result.quickChainStarAddition).toMatchObject({
      requested: 20,
      added: 20,
      after: 20,
    });
    expect(started.result.state.nextCommandStars).toBe(20);
  });

  it("adds Arts-chain NP once per unique battle instance before commands", () => {
    const ready = withHand(battle(), [
      ["ally-a", 2],
      ["ally-a", 3],
      ["ally-b", 2],
    ]);
    const selection = select(ready, [
      normalCardId(ready, "ally-a", 2),
      normalCardId(ready, "ally-a", 3),
      normalCardId(ready, "ally-b", 2),
    ]);
    const seenBeforeFirstAction: Array<[number, number]> = [];
    const started = resolveAllyCommandSequence(
      ready,
      selection,
      (input) => {
        if (input.action.sequence === 1) {
          seenBeforeFirstAction.push([
            findUnitLocation(input.state.formation, "ally-a")?.unit.np
              ?? -1,
            findUnitLocation(input.state.formation, "ally-b")?.unit.np
              ?? -1,
          ]);
        }
        return { state: input.state };
      },
    );

    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    expect(started.result.artsChainNpAddition).toMatchObject({
      requestedPerParticipant: 2_000,
      participantInstanceIds: ["ally-a", "ally-b"],
      changes: [
        {
          instanceId: "ally-a",
          before: 15_000,
          added: 2_000,
          after: 17_000,
        },
        {
          instanceId: "ally-b",
          before: 12_000,
          added: 2_000,
          after: 14_000,
        },
      ],
    });
    expect(seenBeforeFirstAction).toEqual([[17_000, 14_000]]);
  });

  it("applies Arts-chain NP before a selected NP is consumed", () => {
    let state = updateUnit(battle(), "ally-b", (current) => ({
      ...current,
      np: 18_000,
    }));
    state = withHand(state, [
      ["ally-a", 2],
      ["ally-c", 2],
    ]);
    const selection = select(state, [
      normalCardId(state, "ally-a", 2),
      npCardId(state, "ally-b"),
      normalCardId(state, "ally-c", 2),
    ]);
    const started = resolveAllyCommandSequence(
      state,
      selection,
      (input) => ({ state: input.state }),
    );

    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    expect(started.result.actions[1]?.preflight).toMatchObject({
      outcome: "ready",
      npBeforeUse: 20_000,
      npConsumed: 20_000,
    });
    expect(
      findUnitLocation(started.result.state.formation, "ally-b")?.unit.np,
    ).toBe(0);
  });

  it("connects the common attack resolver to each card and its action boundary", () => {
    let prepared = mixedSelection(battle());
    for (const target of ["enemy-a", "enemy-b", "enemy-c"]) {
      prepared = {
        ...prepared,
        state: updateUnit(
          prepared.state,
          target,
          (current) => ({
            ...current,
            hp: 1,
            maxHp: 1,
            baseMaxHp: 1,
          }),
        ),
      };
    }
    prepared = {
      state: prepared.state,
      selection: select(prepared.state, prepared.selection.cards.map(
        ({ cardId }) => cardId,
      )),
    };
    const battleRng = new BattleRng("card-attack-integration");
    const targets: string[] = [];
    const started = resolveAllyCommandSequence(
      prepared.state,
      prepared.selection,
      (input) => {
        targets.push(input.target.instanceId);
        const attack = resolveBattleAttack(input.state, {
          sourceInstanceId: input.action.ownerInstanceId,
          targets: [
            {
              targetInstanceId: input.target.instanceId,
              damage: {
                attack: 10_000,
                cardDamageValuePermille:
                  input.action.calculation.cardDamageValuePermille,
                classAttackCoefficientPermille: 1_000,
                classAffinityPermille: 1_000,
                attributeAffinityPermille: 1_000,
              },
      stars: {
        servantStarRatePermille: 700,
        cardStarValuePermille: 0,
      },
            },
          ],
          hitWeights: [1],
          defense: {
            cardType:
              input.action.kind === "selected_card"
                ? input.action.calculation.card.type
                : "extra",
            isNoblePhantasm:
              input.action.kind === "selected_card"
              && input.action.calculation.card.kind ===
                "noble_phantasm",
          },
          rng: {
            effects: battleRng.stream("effects"),
            damage: battleRng.stream("damage"),
            stars: battleRng.stream("stars"),
          },
        });
        return {
          state: attack.state,
          detail: attack.attack.hits[0].damage,
        };
      },
    );

    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    expect(targets).toEqual(["enemy-a", "enemy-b", "enemy-c"]);
    expect(
      started.result.actions.every(
        ({ resolverDetail }) =>
          typeof resolverDetail === "number"
          && resolverDetail > 0,
      ),
    ).toBe(true);
    expect(started.result.state.nextCommandStars).toBe(3);
    expect(
      started.result.state.formation.enemy.frontline,
    ).toEqual([null, null, null]);
  });

  it("rechecks the Extra Attack owner and fizzles it after self-defeat", () => {
    const prepared = braveSelection(battle());
    const called: number[] = [];
    const started = resolveAllyCommandSequence(
      prepared.state,
      prepared.selection,
      (input) => {
        called.push(input.action.sequence);
        return {
          state:
            input.action.sequence === 3
              ? defeat(input.state, "ally-a")
              : input.state,
        };
      },
    );

    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    expect(called).toEqual([1, 2, 3]);
    expect(started.result.actions[3]).toMatchObject({
      action: {
        kind: "extra_attack",
        sequence: 4,
      },
      resolverCalled: false,
      preflight: {
        outcome: "fizzled",
        restrictions: [
          "owner_not_frontline",
          "owner_defeated",
        ],
      },
    });
  });

  it("rejects an invalid requested target before calling the resolver", () => {
    const prepared = mixedSelection(battle());
    let calls = 0;
    const resolver: AllyCommandActionResolver = (input) => {
      calls += 1;
      return { state: input.state };
    };

    expect(
      resolveAllyCommandSequence(
        prepared.state,
        prepared.selection,
        resolver,
        "enemy-d",
      ),
    ).toEqual({
      accepted: false,
      reason: "target_not_frontline",
    });
    expect(calls).toBe(0);
  });

  it("rejects an empty enemy frontline before consuming any NP", () => {
    let prepared = mixedSelection(battle());
    prepared.state = resolveActionBoundary(
      defeat(
        prepared.state,
        "enemy-a",
        "enemy-b",
        "enemy-c",
        "enemy-d",
        "enemy-e",
      ),
    ).state;
    let calls = 0;
    const result = resolveAllyCommandSequence(
      prepared.state,
      prepared.selection,
      (input) => {
        calls += 1;
        return { state: input.state };
      },
    );

    expect(result).toEqual({
      accepted: false,
      reason: "no_enemy_target",
    });
    expect(calls).toBe(0);
  });

  it("rejects a non-ally-action phase before resolution", () => {
    const prepared = mixedSelection(battle());
    const result = resolveAllyCommandSequence(
      beginAllyTurnEnd(prepared.state),
      prepared.selection,
      (input) => ({ state: input.state }),
    );

    expect(result).toEqual({
      accepted: false,
      reason: "invalid_phase",
    });
  });

  it("rejects an action resolver that changes phase or outcome", () => {
    const prepared = mixedSelection(battle());

    expect(() =>
      resolveAllyCommandSequence(
        prepared.state,
        prepared.selection,
        (input) => ({
          state: beginAllyTurnEnd(input.state),
        }),
      ),
    ).toThrow(/must return an ongoing ally action phase/);
  });
});
