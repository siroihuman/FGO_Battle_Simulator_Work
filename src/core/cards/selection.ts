import {
  findUnitLocation,
  replaceUnit,
} from "../battle/formation";
import {
  setBattleFormation,
  type BattleState,
} from "../battle/state";
import type {
  BattleUnitState,
  CommandCardType,
  NoblePhantasmState,
} from "../battle/types";
import { NP_FULL_GAUGE } from "../../formulas/np";
import { isActionDisabled } from "../../effects/classification";
import { COMMON_EFFECT_TYPES } from "../../effects/modifiers";
import {
  resolveNoblePhantasmCardType,
} from "../../effects/noblePhantasmCardType";
import {
  consumeNoblePhantasmOverchargeStageEffects,
} from "../../effects/noblePhantasmOvercharge";
import type { CommandCard } from "./deck";

export const COMMAND_CARD_SELECTION_SIZE = 3 as const;
export {
  ACTION_DISABLED_CLASSIFICATION,
} from "../../effects/classification";

export type CommandCardExecutionRestriction =
  | "owner_missing"
  | "owner_not_frontline"
  | "owner_defeated"
  | "owner_action_disabled"
  | "noble_phantasm_not_configured"
  | "noble_phantasm_changed"
  | "noble_phantasm_sealed"
  | "insufficient_np"
  | "action_effects_unresolved"
  | "action_effect_target_required"
  | "action_effect_target_invalid";

export interface SelectedNormalCommandCard extends CommandCard {
  kind: "normal";
}

export interface SelectedNoblePhantasmCard {
  kind: "noble_phantasm";
  cardId: string;
  ownerInstanceId: string;
  type: CommandCardType;
  noblePhantasmStableId: string;
  noblePhantasmName: string;
  noblePhantasmLevel: NoblePhantasmState["level"];
}

export type SelectedCommandCard =
  | SelectedNormalCommandCard
  | SelectedNoblePhantasmCard;

export interface CommandCardChoice {
  card: SelectedCommandCard;
  selectable: boolean;
  /**
   * Normal cards remain selectable when these restrictions are present and
   * will fizzle if they still exist at execution. NP cards are selectable
   * only when this list is empty.
   */
  executionRestrictions: CommandCardExecutionRestriction[];
}

export interface CommandCardSelection {
  cards: [
    SelectedCommandCard,
    SelectedCommandCard,
    SelectedCommandCard,
  ];
}

export type CommandCardSelectionRejectionReason =
  | "invalid_phase"
  | "wrong_card_count"
  | "duplicate_card"
  | "card_not_available"
  | "noble_phantasm_unavailable";

export type CommandCardSelectionResult =
  | {
      accepted: true;
      selection: CommandCardSelection;
    }
  | {
      accepted: false;
      reason: CommandCardSelectionRejectionReason;
      cardId?: string;
      executionRestrictions?: CommandCardExecutionRestriction[];
    };

export type CommandCardExecutionResult =
  | {
      outcome: "ready";
      state: BattleState;
      card: SelectedCommandCard;
      npBeforeUse: number | null;
      npConsumed: number;
      additionalOverchargeStages: number;
      consumedOverchargeEffectInstanceIds: string[];
    }
  | {
      outcome: "fizzled";
      state: BattleState;
      card: SelectedCommandCard;
      restrictions: CommandCardExecutionRestriction[];
      npBeforeUse: number | null;
      npConsumed: 0;
      additionalOverchargeStages: 0;
      consumedOverchargeEffectInstanceIds: [];
    };

function noblePhantasmCardId(ownerInstanceId: string): string {
  return `${ownerInstanceId}:noble-phantasm`;
}

function isNoblePhantasmSealed(unit: BattleUnitState): boolean {
  return unit.effects.some(
    (effect) =>
      effect.effectType === COMMON_EFFECT_TYPES.noblePhantasmSeal
      || effect.flags.sealsNoblePhantasm === true,
  );
}

export function commandCardOwnerRestrictions(
  state: BattleState,
  ownerInstanceId: string,
): {
  unit: BattleUnitState | null;
  restrictions: CommandCardExecutionRestriction[];
} {
  const location = findUnitLocation(
    state.formation,
    ownerInstanceId,
  );
  if (!location || location.side !== "ally") {
    return {
      unit: null,
      restrictions: ["owner_missing"],
    };
  }
  const restrictions: CommandCardExecutionRestriction[] = [];
  if (location.area !== "frontline") {
    restrictions.push("owner_not_frontline");
  }
  if (!location.unit.alive || location.unit.hp <= 0) {
    restrictions.push("owner_defeated");
  }
  if (isActionDisabled(location.unit)) {
    restrictions.push("owner_action_disabled");
  }
  return { unit: location.unit, restrictions };
}

function noblePhantasmRestrictions(
  state: BattleState,
  card: SelectedNoblePhantasmCard,
): {
  unit: BattleUnitState | null;
  restrictions: CommandCardExecutionRestriction[];
} {
  const owner = commandCardOwnerRestrictions(
    state,
    card.ownerInstanceId,
  );
  const restrictions = [...owner.restrictions];
  if (!owner.unit) {
    return { unit: null, restrictions };
  }
  if (!owner.unit.noblePhantasm) {
    restrictions.push("noble_phantasm_not_configured");
    return { unit: owner.unit, restrictions };
  }
  const current = owner.unit.noblePhantasm;
  const cardType = resolveNoblePhantasmCardType(owner.unit);
  if (
    current.stableId !== card.noblePhantasmStableId
    || cardType?.cardType !== card.type
    || current.level !== card.noblePhantasmLevel
  ) {
    restrictions.push("noble_phantasm_changed");
  }
  if (isNoblePhantasmSealed(owner.unit)) {
    restrictions.push("noble_phantasm_sealed");
  }
  if (owner.unit.np < NP_FULL_GAUGE) {
    restrictions.push("insufficient_np");
  }
  return { unit: owner.unit, restrictions };
}

export function commandCardExecutionRestrictions(
  state: BattleState,
  card: SelectedCommandCard,
): CommandCardExecutionRestriction[] {
  if (card.kind === "normal") {
    return commandCardOwnerRestrictions(
      state,
      card.ownerInstanceId,
    ).restrictions;
  }
  return noblePhantasmRestrictions(state, card).restrictions;
}

function normalChoices(
  state: BattleState,
): CommandCardChoice[] {
  return state.commandDeck.currentHand.map((card) => {
    const selected: SelectedNormalCommandCard = {
      ...card,
      kind: "normal",
    };
    return {
      card: selected,
      selectable: true,
      executionRestrictions: commandCardExecutionRestrictions(
        state,
        selected,
      ),
    };
  });
}

function noblePhantasmChoice(
  state: BattleState,
  unit: BattleUnitState,
): CommandCardChoice | null {
  const noblePhantasm = unit.noblePhantasm;
  if (!noblePhantasm) return null;
  const cardType = resolveNoblePhantasmCardType(unit);
  if (!cardType) return null;
  const card: SelectedNoblePhantasmCard = {
    kind: "noble_phantasm",
    cardId: noblePhantasmCardId(unit.instanceId),
    ownerInstanceId: unit.instanceId,
    type: cardType.cardType,
    noblePhantasmStableId: noblePhantasm.stableId,
    noblePhantasmName: noblePhantasm.name,
    noblePhantasmLevel: noblePhantasm.level,
  };
  const executionRestrictions = commandCardExecutionRestrictions(
    state,
    card,
  );
  return {
    card,
    selectable: executionRestrictions.length === 0,
    executionRestrictions,
  };
}

/**
 * Returns the five currently distributed normal cards followed by configured
 * frontline NP cards in frontline order.
 */
export function listCommandCardChoices(
  state: BattleState,
): CommandCardChoice[] {
  const noblePhantasms = state.formation.ally.frontline.flatMap((unit) => {
    if (!unit) return [];
    const choice = noblePhantasmChoice(state, unit);
    return choice ? [choice] : [];
  });
  return [...normalChoices(state), ...noblePhantasms];
}

/**
 * Validates exactly three distinct card IDs without mutating battle state.
 * Normal cards only need to be in the current hand; NP cards must also be
 * usable at selection time.
 */
export function selectCommandCards(
  state: BattleState,
  cardIds: readonly string[],
): CommandCardSelectionResult {
  if (state.outcome !== "ongoing" || state.phase !== "ally_action") {
    return { accepted: false, reason: "invalid_phase" };
  }
  if (cardIds.length !== COMMAND_CARD_SELECTION_SIZE) {
    return { accepted: false, reason: "wrong_card_count" };
  }
  const seen = new Set<string>();
  for (const cardId of cardIds) {
    if (seen.has(cardId)) {
      return {
        accepted: false,
        reason: "duplicate_card",
        cardId,
      };
    }
    seen.add(cardId);
  }

  const choices = new Map(
    listCommandCardChoices(state).map((choice) => [
      choice.card.cardId,
      choice,
    ]),
  );
  const selected: SelectedCommandCard[] = [];
  for (const cardId of cardIds) {
    const choice = choices.get(cardId);
    if (!choice) {
      return {
        accepted: false,
        reason: "card_not_available",
        cardId,
      };
    }
    if (
      choice.card.kind === "noble_phantasm"
      && !choice.selectable
    ) {
      return {
        accepted: false,
        reason: "noble_phantasm_unavailable",
        cardId,
        executionRestrictions: [...choice.executionRestrictions],
      };
    }
    selected.push(choice.card);
  }

  return {
    accepted: true,
    selection: {
      cards: selected as CommandCardSelection["cards"],
    },
  };
}

function assertAllyActionPhase(state: BattleState): void {
  if (state.outcome !== "ongoing" || state.phase !== "ally_action") {
    throw new RangeError(
      "command cards can only execute during an ongoing ally action phase",
    );
  }
}

/**
 * Rechecks the selected card immediately before execution. A failed check is
 * a normal fizzle and never consumes NP. A valid NP consumes the entire gauge
 * by setting it to zero before its effects are resolved.
 */
export function beginCommandCardExecution(
  state: BattleState,
  card: SelectedCommandCard,
  additionalRestrictions: readonly CommandCardExecutionRestriction[] = [],
): CommandCardExecutionResult {
  assertAllyActionPhase(state);
  const restrictions = [
    ...commandCardExecutionRestrictions(state, card),
    ...additionalRestrictions,
  ];
  const owner = findUnitLocation(
    state.formation,
    card.ownerInstanceId,
  )?.unit ?? null;
  const npBeforeUse =
    card.kind === "noble_phantasm" && owner
      ? owner.np
      : null;
  if (restrictions.length > 0) {
    return {
      outcome: "fizzled",
      state,
      card,
      restrictions,
      npBeforeUse,
      npConsumed: 0,
      additionalOverchargeStages: 0,
      consumedOverchargeEffectInstanceIds: [],
    };
  }
  if (card.kind === "normal") {
    return {
      outcome: "ready",
      state,
      card,
      npBeforeUse: null,
      npConsumed: 0,
      additionalOverchargeStages: 0,
      consumedOverchargeEffectInstanceIds: [],
    };
  }
  if (!owner) {
    throw new RangeError("validated NP owner is missing");
  }
  const overcharge = consumeNoblePhantasmOverchargeStageEffects(owner);
  const formation = replaceUnit(
    state.formation,
    { ...overcharge.unit, np: 0 },
  );
  return {
    outcome: "ready",
    state: setBattleFormation(state, formation),
    card,
    npBeforeUse: owner.np,
    npConsumed: owner.np,
    additionalOverchargeStages: overcharge.additionalStages,
    consumedOverchargeEffectInstanceIds:
      overcharge.consumedEffectInstanceIds,
  };
}
