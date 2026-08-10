import {
  resolveActionBoundary,
  type ActionBoundaryResult,
} from "../core/battle/actionBoundary";
import { findUnitLocation } from "../core/battle/formation";
import {
  resolveDirectAllyExchange,
  type DirectAllyExchangeResult,
} from "../core/battle/replacement";
import type { BattleState } from "../core/battle/state";
import type { DeterministicRng } from "../core/rng";
import {
  mysticCodeDefinition,
  type MysticCodeDataRegistry,
  type MysticCodeSkillDefinition,
} from "../data/mysticCodes";
import {
  executeExternalDeclaredActionEffects,
  externalDeclaredActionTargetSelectionIssue,
  type DeclaredActionEffectsResult,
} from "./actionExecution";
import type { EffectRuntimeCounters } from "./types";

export type MysticCodeSkillUseRejectionReason =
  | "invalid_phase"
  | "mystic_code_unselected"
  | "action_data_missing"
  | "skill_on_cooldown"
  | "selected_target_required"
  | "selected_target_invalid"
  | "order_change_targets_required"
  | "order_change_targets_invalid"
  | "unresolved_effects";

export interface MysticCodeOrderChangeSelection {
  frontlineInstanceId: string;
  reserveInstanceId: string;
}

interface MysticCodeSkillUseAcceptedBase {
  accepted: true;
  state: BattleState;
  counters: EffectRuntimeCounters;
  mysticCodeDataId: string;
  skill: MysticCodeSkillDefinition;
  cooldownBefore: number;
  cooldownAfterUse: number;
  boundary: ActionBoundaryResult;
}

export type MysticCodeSkillUseResult =
  | {
      accepted: false;
      reason: MysticCodeSkillUseRejectionReason;
      state: BattleState;
      counters: EffectRuntimeCounters;
    }
  | (MysticCodeSkillUseAcceptedBase & {
      execution: "effects";
      effects: DeclaredActionEffectsResult;
    })
  | (MysticCodeSkillUseAcceptedBase & {
      execution: "order_change";
      exchange: DirectAllyExchangeResult;
    });

export interface ResolveMysticCodeSkillUseInput {
  state: BattleState;
  registry: MysticCodeDataRegistry;
  skillStableId: string;
  selectedTargetInstanceId?: string;
  orderChange?: MysticCodeOrderChangeSelection;
  counters: EffectRuntimeCounters;
  rng: DeterministicRng;
}

function rejected(
  input: ResolveMysticCodeSkillUseInput,
  reason: MysticCodeSkillUseRejectionReason,
): MysticCodeSkillUseResult {
  return {
    accepted: false,
    reason,
    state: input.state,
    counters: input.counters,
  };
}

function validOrderChangeSelection(
  state: BattleState,
  selection: MysticCodeOrderChangeSelection,
): boolean {
  const frontline = findUnitLocation(
    state.formation,
    selection.frontlineInstanceId,
  );
  const reserve = findUnitLocation(
    state.formation,
    selection.reserveInstanceId,
  );
  return Boolean(
    frontline
    && frontline.side === "ally"
    && frontline.area === "frontline"
    && frontline.unit.alive
    && reserve
    && reserve.side === "ally"
    && reserve.area === "reserve"
    && reserve.unit.alive,
  );
}

/**
 * Uses one selected Mystic Code skill without consuming a command action.
 * Every rejection is decided before cooldown, state, counters, or RNG change.
 */
export function resolveMysticCodeSkillUse(
  input: ResolveMysticCodeSkillUseInput,
): MysticCodeSkillUseResult {
  if (
    input.state.outcome !== "ongoing"
    || input.state.phase !== "ally_action"
  ) {
    return rejected(input, "invalid_phase");
  }
  const selected = input.state.loadout.mysticCode;
  if (!input.state.loadout.initialized || !selected) {
    return rejected(input, "mystic_code_unselected");
  }
  const definition = mysticCodeDefinition(input.registry, selected.dataId);
  if (
    !definition
    || definition.name !== selected.name
    || definition.levelPolicy !== selected.levelPolicy
    || definition.skills.some(
      (skill, index) => skill.stableId !== selected.skillStableIds[index],
    )
  ) {
    return rejected(input, "action_data_missing");
  }
  const skill = definition.skills.find(
    ({ stableId }) => stableId === input.skillStableId,
  );
  if (!skill) return rejected(input, "action_data_missing");
  if (skill.effects.some(({ action }) => action.kind === "unsupported")) {
    return rejected(input, "unresolved_effects");
  }
  if (skill.execution === "effects") {
    const targetIssue = externalDeclaredActionTargetSelectionIssue(
      input.state,
      "ally",
      skill.effects,
      input.selectedTargetInstanceId,
    );
    if (targetIssue) return rejected(input, targetIssue);
  } else {
    if (!input.orderChange) {
      return rejected(input, "order_change_targets_required");
    }
    if (!validOrderChangeSelection(input.state, input.orderChange)) {
      return rejected(input, "order_change_targets_invalid");
    }
  }
  const cooldownIndex = skill.slot - 1;
  const cooldownBefore = input.state.mysticCodeCooldowns[cooldownIndex];
  if (cooldownBefore === undefined) {
    return rejected(input, "action_data_missing");
  }
  if (cooldownBefore > 0) return rejected(input, "skill_on_cooldown");
  const cooldownAfterUse = skill.cooldownAtMax;
  const stateWithCooldown: BattleState = {
    ...input.state,
    mysticCodeCooldowns: input.state.mysticCodeCooldowns.map(
      (cooldown, index) =>
        index === cooldownIndex ? cooldownAfterUse : cooldown,
    ),
  };

  if (skill.execution === "order_change") {
    const exchange = resolveDirectAllyExchange(
      stateWithCooldown,
      input.orderChange!.frontlineInstanceId,
      input.orderChange!.reserveInstanceId,
    );
    const boundary = resolveActionBoundary(exchange.state);
    return {
      accepted: true,
      state: boundary.state,
      counters: input.counters,
      mysticCodeDataId: definition.dataId,
      skill,
      cooldownBefore,
      cooldownAfterUse,
      execution: "order_change",
      exchange,
      boundary,
    };
  }

  const effects = executeExternalDeclaredActionEffects(
    stateWithCooldown,
    "ally",
    `mystic-code:${definition.dataId}`,
    skill.effects,
    {
      selectedTargetInstanceId: input.selectedTargetInstanceId,
    },
    input.counters,
    input.rng,
  );
  const boundary = resolveActionBoundary(effects.state);
  return {
    accepted: true,
    state: boundary.state,
    counters: effects.counters,
    mysticCodeDataId: definition.dataId,
    skill,
    cooldownBefore,
    cooldownAfterUse,
    execution: "effects",
    effects,
    boundary,
  };
}
