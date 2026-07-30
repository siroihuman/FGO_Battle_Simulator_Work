import { addStars } from "../../formulas/stars";
import { assertSafeInteger } from "../numeric";
import type { BattleState } from "./state";

export type BattleStarBucket =
  | "command"
  | "next_command";

export interface BattleStarAddition {
  state: BattleState;
  bucket: BattleStarBucket;
  requested: number;
  before: number;
  added: number;
  after: number;
}

export type BattleStarSpendResult =
  | {
      accepted: true;
      state: BattleState;
      requested: number;
      before: number;
      spent: number;
      after: number;
    }
  | {
      accepted: false;
      reason: "insufficient_stars";
      state: BattleState;
      requested: number;
      available: number;
    };

export interface BattleStarActivation {
  state: BattleState;
  expiredCommandStars: number;
  activatedStars: number;
}

function assertOngoing(state: BattleState): void {
  if (state.outcome !== "ongoing" || state.phase === "finished") {
    throw new RangeError("finished battles cannot change stars");
  }
}

function assertAllyAction(state: BattleState): void {
  assertOngoing(state);
  if (state.phase !== "ally_action") {
    throw new RangeError(
      "current command stars can only change during ally action",
    );
  }
}

function assertStarCount(value: number, name: string): void {
  assertSafeInteger(value, name);
  if (value < 0 || value > 99) {
    throw new RangeError(`${name} must be from 0 to 99`);
  }
}

function assertStarState(state: BattleState): void {
  assertStarCount(state.commandStars, "commandStars");
  assertStarCount(state.nextCommandStars, "nextCommandStars");
}

function assertAddition(amount: number): void {
  assertSafeInteger(amount, "star addition");
  if (amount < 0) {
    throw new RangeError("star addition must not be negative");
  }
}

function addToBucket(
  state: BattleState,
  amount: number,
  bucket: BattleStarBucket,
): BattleStarAddition {
  assertOngoing(state);
  assertStarState(state);
  assertAddition(amount);
  const field =
    bucket === "command"
      ? "commandStars"
      : "nextCommandStars";
  const before = state[field];
  const after = addStars(before, amount);
  return {
    state:
      after === before
        ? state
        : { ...state, [field]: after },
    bucket,
    requested: amount,
    before,
    added: after - before,
    after,
  };
}

/**
 * Adds stars that can be spent during the current ally command phase.
 * Instant star-gain skills use this bucket.
 */
export function addCommandStars(
  state: BattleState,
  amount: number,
): BattleStarAddition {
  assertAllyAction(state);
  return addToBucket(state, amount, "command");
}

/**
 * Adds attack drops, Quick-chain stars, and end-of-turn gains for the next
 * ally command phase.
 */
export function addNextCommandStars(
  state: BattleState,
  amount: number,
): BattleStarAddition {
  return addToBucket(state, amount, "next_command");
}

/**
 * Spends from all 0–99 currently available stars, including stars above the
 * first 50 that are not assigned to command-card critical rates.
 */
export function spendCommandStars(
  state: BattleState,
  amount: number,
): BattleStarSpendResult {
  assertAllyAction(state);
  assertStarState(state);
  assertSafeInteger(amount, "star spend");
  if (amount < 0) {
    throw new RangeError("star spend must not be negative");
  }
  if (state.commandStars < amount) {
    return {
      accepted: false,
      reason: "insufficient_stars",
      state,
      requested: amount,
      available: state.commandStars,
    };
  }
  return {
    accepted: true,
    state:
      amount === 0
        ? state
        : {
            ...state,
            commandStars: state.commandStars - amount,
          },
    requested: amount,
    before: state.commandStars,
    spent: amount,
    after: state.commandStars - amount,
  };
}

/**
 * Starts a new ally command phase. Unused current stars expire, the pending
 * bucket becomes current, and pending is reset instead of carrying both.
 */
export function activateNextCommandStars(
  state: BattleState,
): BattleStarActivation {
  assertOngoing(state);
  assertStarState(state);
  if (
    state.phase !== "ally_turn_end"
    && state.phase !== "enemy_turn_end"
  ) {
    throw new RangeError(
      "next command stars can only activate from a turn-end phase",
    );
  }
  return {
    state: {
      ...state,
      commandStars: state.nextCommandStars,
      nextCommandStars: 0,
    },
    expiredCommandStars: state.commandStars,
    activatedStars: state.nextCommandStars,
  };
}
