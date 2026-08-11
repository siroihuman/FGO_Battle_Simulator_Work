import {
  combatantAttackData,
  type BattleAttackDataRegistry,
} from "../core/battle/actionData";
import type { BattleState } from "../core/battle/state";
import {
  assertCommandCardDeckCanBeRedistributed,
  redistributeCommandCards,
  type CommandCardRedistributionResult,
} from "../core/cards/deck";
import type { DeterministicRng } from "../core/rng";
import type {
  DeclaredActionEffectsResult,
} from "./actionExecution";
import type { DeclaredActionEffect } from "./declarations";

export interface CommandCardRedistributionExecutionContext {
  attackRegistry: BattleAttackDataRegistry;
  cardsRng: DeterministicRng;
  criticalRng: DeterministicRng;
}

export type CommandCardRedistributionPreparation =
  | {
      accepted: true;
      redistributions: CommandCardRedistributionResult[];
    }
  | {
      accepted: false;
      reason:
        | "command_card_redistribution_unavailable"
        | "command_card_redistribution_invalid";
    };

export function hasCommandCardRedistribution(
  effects: readonly DeclaredActionEffect[],
): boolean {
  return effects.some(
    ({ action }) => action.kind === "redistribute_command_cards",
  );
}

/** Performs all deterministic validation before cards, CT, effects, or logs. */
export function prepareCommandCardRedistributions(
  state: BattleState,
  effects: readonly DeclaredActionEffect[],
  context: CommandCardRedistributionExecutionContext | undefined,
): CommandCardRedistributionPreparation {
  const count = effects.filter(
    ({ action }) => action.kind === "redistribute_command_cards",
  ).length;
  if (count === 0) return { accepted: true, redistributions: [] };
  if (!context) {
    return {
      accepted: false,
      reason: "command_card_redistribution_unavailable",
    };
  }
  try {
    assertCommandCardDeckCanBeRedistributed(
      state.commandDeck,
      state.formation.ally,
    );
    for (const unit of state.formation.ally.frontline) {
      if (
        unit?.alive
        && !combatantAttackData(context.attackRegistry, unit)
      ) {
        throw new RangeError(
          `command-card owner attack data is missing: ${unit.instanceId}`,
        );
      }
    }
    const redistributions: CommandCardRedistributionResult[] = [];
    let deck = state.commandDeck;
    for (let index = 0; index < count; index += 1) {
      const redistribution = redistributeCommandCards(
        deck,
        state.formation.ally,
        context.cardsRng,
      );
      redistributions.push(redistribution);
      deck = redistribution.deck;
    }
    return { accepted: true, redistributions };
  } catch {
    return {
      accepted: false,
      reason: "command_card_redistribution_invalid",
    };
  }
}

/** Adds the final input-boundary star allocation to the saved effect result. */
export function completeCommandCardRedistributionEffects(
  effects: DeclaredActionEffectsResult,
  stateBefore: BattleState,
  stateAfter: BattleState,
): DeclaredActionEffectsResult {
  const redistributedIndexes = effects.effects.flatMap((effect, index) =>
    effect.commandCardRedistribution ? [index] : []
  );
  const finalIndex = redistributedIndexes.at(-1);
  if (finalIndex === undefined) return effects;
  return {
    ...effects,
    state: stateAfter,
    effects: effects.effects.map((effect, index) => {
      if (!effect.commandCardRedistribution) return effect;
      return {
        ...effect,
        commandCardRedistribution: {
          ...effect.commandCardRedistribution,
          commandStarsBefore: stateBefore.commandStars,
          commandStarsAfter: stateAfter.commandStars,
          nextCommandStarsBefore: stateBefore.nextCommandStars,
          nextCommandStarsAfter: stateAfter.nextCommandStars,
          starDistribution:
            index === finalIndex
              ? stateAfter.commandStarDistribution
              : null,
        },
      };
    }),
  };
}
