import { describe, expect, it } from "vitest";
import {
  resolveActionBoundary,
} from "../src/core/battle/actionBoundary";
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
