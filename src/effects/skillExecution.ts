import {
  resolveActionBoundary,
  type ActionBoundaryResult,
} from "../core/battle/actionBoundary";
import {
  findUnitLocation,
  replaceUnit,
} from "../core/battle/formation";
import {
  setBattleFormation,
  type BattleState,
} from "../core/battle/state";
import type { DeterministicRng } from "../core/rng";
import {
  battleActionEffectSequence,
  combatantActionEffectData,
  type BattleActionEffectDataRegistry,
  type BattleActionEffectSequence,
} from "./actionData";
import {
  declaredActionTargetSelectionIssue,
  executeDeclaredActionEffects,
  type DeclaredActionEffectsResult,
} from "./actionExecution";
import type { EffectRuntimeCounters } from "./types";

export type AllySkillUseRejectionReason =
  | "invalid_phase"
  | "source_unavailable"
  | "action_data_missing"
  | "not_a_skill"
  | "skill_on_cooldown"
  | "selected_target_required"
  | "selected_target_invalid"
  | "unresolved_effects";

export type AllySkillUseResult =
  | {
      accepted: false;
      reason: AllySkillUseRejectionReason;
      state: BattleState;
      counters: EffectRuntimeCounters;
    }
  | {
      accepted: true;
      state: BattleState;
      counters: EffectRuntimeCounters;
      sourceInstanceId: string;
      skill: BattleActionEffectSequence;
      cooldownBefore: number;
      cooldownAfterUse: number;
      effects: DeclaredActionEffectsResult;
      boundary: ActionBoundaryResult;
    };

export interface ResolveAllySkillUseInput {
  state: BattleState;
  registry: BattleActionEffectDataRegistry;
  sourceInstanceId: string;
  skillStableId: string;
  selectedTargetInstanceId?: string;
  counters: EffectRuntimeCounters;
  rng: DeterministicRng;
}

function rejected(
  input: ResolveAllySkillUseInput,
  reason: AllySkillUseRejectionReason,
): AllySkillUseResult {
  return {
    accepted: false,
    reason,
    state: input.state,
    counters: input.counters,
  };
}

function selectedTargetReason(
  input: ResolveAllySkillUseInput,
  skill: BattleActionEffectSequence,
): AllySkillUseRejectionReason | null {
  return declaredActionTargetSelectionIssue(
    input.state,
    input.sourceInstanceId,
    skill.effects,
    input.selectedTargetInstanceId,
  );
}

/**
 * Uses one complete, declared ally skill without consuming a command-card
 * action. Cooldown is registered before effects, then the completed-action
 * boundary performs deaths and automatic replacements.
 */
export function resolveAllySkillUse(
  input: ResolveAllySkillUseInput,
): AllySkillUseResult {
  if (
    input.state.outcome !== "ongoing"
    || input.state.phase !== "ally_action"
  ) {
    return rejected(input, "invalid_phase");
  }
  const sourceLocation = findUnitLocation(
    input.state.formation,
    input.sourceInstanceId,
  );
  if (
    !sourceLocation
    || sourceLocation.side !== "ally"
    || sourceLocation.area !== "frontline"
    || !sourceLocation.unit.alive
  ) {
    return rejected(input, "source_unavailable");
  }
  const combatant = combatantActionEffectData(
    input.registry,
    sourceLocation.unit,
  );
  const skill = combatant
    ? battleActionEffectSequence(combatant, input.skillStableId)
    : null;
  if (!skill) return rejected(input, "action_data_missing");
  if (skill.kind !== "skill" || skill.skillSlot === undefined) {
    return rejected(input, "not_a_skill");
  }
  if (
    skill.effects.some(({ action }) => action.kind === "unsupported")
  ) {
    return rejected(input, "unresolved_effects");
  }
  const targetReason = selectedTargetReason(input, skill);
  if (targetReason) return rejected(input, targetReason);

  const cooldownIndex = skill.skillSlot - 1;
  const cooldownBefore =
    sourceLocation.unit.skillCooldowns[cooldownIndex];
  if (cooldownBefore === undefined) {
    return rejected(input, "action_data_missing");
  }
  if (cooldownBefore > 0) {
    return rejected(input, "skill_on_cooldown");
  }
  const cooldownAfterUse = skill.cooldownAtMax ?? 0;
  const sourceWithCooldown = {
    ...sourceLocation.unit,
    skillCooldowns: sourceLocation.unit.skillCooldowns.map(
      (cooldown, index) =>
        index === cooldownIndex ? cooldownAfterUse : cooldown,
    ),
  };
  const stateWithCooldown = setBattleFormation(
    input.state,
    replaceUnit(input.state.formation, sourceWithCooldown),
  );
  const effects = executeDeclaredActionEffects(
    stateWithCooldown,
    input.sourceInstanceId,
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
    sourceInstanceId: input.sourceInstanceId,
    skill,
    cooldownBefore,
    cooldownAfterUse,
    effects,
    boundary,
  };
}
