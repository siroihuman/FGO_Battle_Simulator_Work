import type {
  BattleAttackDataRegistry,
} from "./actionData";
import {
  resolveBattleTurn,
  type BattleTurnAllyOptions,
  type BattleTurnEnemyOptions,
  type BattleTurnResolution,
} from "./battleTurn";
import type { BattleState } from "./state";
import {
  drawCommandCards,
  type CommandCardDrawResult,
} from "../cards/deck";
import {
  selectCommandCards,
  type CommandCardSelectionResult,
} from "../cards/selection";
import {
  finalizeInputBoundaryCommandStarDistribution,
} from "../cards/critical";
import { BattleRng } from "../rng";
import type {
  BattleActionEffectDataRegistry,
} from "../../effects/actionData";
import {
  createEffectRuntimeCounters,
} from "../../effects/runtime";
import type { EffectRuntimeCounters } from "../../effects/types";

/**
 * The state held at a player input boundary. `rng` is intentionally shared
 * across every distribution and resolved turn, so a fixed seed remains
 * replayable for the complete battle rather than for individual turns.
 */
export interface BattleLoop {
  state: BattleState;
  rng: BattleRng;
  counters: EffectRuntimeCounters;
}

export interface CreateBattleLoopInput {
  state: BattleState;
  rng: BattleRng;
  registry: BattleAttackDataRegistry;
  counters?: EffectRuntimeCounters;
}

export interface BattleLoopTurnInput {
  cardIds: readonly string[];
  registry: BattleAttackDataRegistry;
  actionEffectRegistry?: BattleActionEffectDataRegistry;
  ally?: BattleTurnAllyOptions;
  enemy?: BattleTurnEnemyOptions;
}

export type BattleLoopTurnResult =
  | {
      accepted: false;
      loop: BattleLoop;
      selection: Extract<CommandCardSelectionResult, { accepted: false }>;
    }
  | {
      accepted: true;
      loop: BattleLoop;
      selection: Extract<CommandCardSelectionResult, { accepted: true }>;
      resolution: BattleTurnResolution;
      nextHand: CommandCardDrawResult | null;
    };

function assertInputBoundary(state: BattleState): void {
  if (state.outcome !== "ongoing" || state.phase !== "ally_action") {
    throw new RangeError(
      "battle loop accepts commands only at an ongoing ally input boundary",
    );
  }
}

function distributeNextHand(
  state: BattleState,
  rng: BattleRng,
  registry: BattleAttackDataRegistry,
): { state: BattleState; draw: CommandCardDrawResult } {
  assertInputBoundary(state);
  const draw = drawCommandCards(
    state.commandDeck,
    state.formation.ally,
    rng.stream("cards"),
  );
  const stateWithHand: BattleState = {
    ...state,
    commandDeck: draw.deck,
    commandStarDistribution: null,
  };
  const finalized = finalizeInputBoundaryCommandStarDistribution(
    stateWithHand,
    registry,
    rng.stream("critical"),
    true,
  );
  return { state: finalized.state, draw };
}

/**
 * Starts the complete loop by distributing the initial five-card hand.
 * The battle core owns no user input, so this is the only layer that joins
 * card distribution to the existing one-turn resolver.
 */
export function createBattleLoop(
  input: CreateBattleLoopInput,
): BattleLoop {
  assertInputBoundary(input.state);
  if (input.state.commandDeck.currentHand.length !== 0) {
    throw new RangeError(
      "initial battle loop state must not already have a command hand",
    );
  }
  const initialHand = distributeNextHand(
    input.state,
    input.rng,
    input.registry,
  );
  return {
    state: initialHand.state,
    rng: input.rng,
    counters: input.counters ?? createEffectRuntimeCounters(),
  };
}

/**
 * Validates three selected cards, resolves one complete battle turn, and
 * distributes the following hand only when the resolver reaches the next
 * ally input boundary. Invalid selection therefore leaves both state and
 * every RNG stream untouched.
 */
export function resolveBattleLoopTurn(
  loop: BattleLoop,
  input: BattleLoopTurnInput,
): BattleLoopTurnResult {
  assertInputBoundary(loop.state);
  const selection = selectCommandCards(loop.state, input.cardIds);
  if (!selection.accepted) {
    return { accepted: false, loop, selection };
  }

  const resolution = resolveBattleTurn({
    state: loop.state,
    selection: selection.selection,
    registry: input.registry,
    actionEffectRegistry: input.actionEffectRegistry,
    rng: loop.rng,
    counters: loop.counters,
    ally: input.ally,
    enemy: input.enemy,
  });
  let nextState = resolution.state;
  let nextHand: CommandCardDrawResult | null = null;
  if (
    resolution.stopReason !== "ally_command_rejected"
    && nextState.outcome === "ongoing"
    && nextState.phase === "ally_action"
  ) {
    const distributed = distributeNextHand(nextState, loop.rng, input.registry);
    nextHand = distributed.draw;
    nextState = distributed.state;
  }
  return {
    accepted: true,
    loop: {
      state: nextState,
      rng: loop.rng,
      counters: resolution.counters,
    },
    selection,
    resolution,
    nextHand,
  };
}
