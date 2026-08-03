import {
  combatantAttackData,
  enemyAttackActionData,
  type AttackTargetScope,
  type BattleAttackDataRegistry,
} from "../core/battle/actionData";
import type {
  AttackRngStreams,
} from "../core/battle/attack";
import {
  resolveBattleAttackSequence,
  type BattleAttackSequenceResolution,
} from "../core/battle/attackSequence";
import {
  prepareBattleAttackInput,
  type AttackCalculationData,
} from "../core/battle/attackInput";
import {
  findUnitLocation,
  orderedLocations,
} from "../core/battle/formation";
import type { BattleState } from "../core/battle/state";
import {
  createEffectRuntimeCounters,
} from "../effects/runtime";
import type {
  EffectRuntimeCounters,
} from "../effects/types";
import type {
  EnemyActionRequest,
  EnemyPrioritySkillRequest,
} from "./enemyTurn";
import {
  resolveEnemyTurnSequence,
  type EnemyActionResolverInput,
  type EnemyNormalActionSelector,
  type EnemyTurnSequenceResult,
} from "./enemyTurnCoordinator";

export type EnemyAttackDataSkipReason =
  | "non_damaging_action"
  | "source_attack_data_missing"
  | "action_attack_data_missing"
  | "no_ally_target";

export type EnemyAttackDetail =
  | {
      outcome: "skipped";
      reason: EnemyAttackDataSkipReason;
    }
  | {
      outcome: "resolved";
      targetScope: AttackTargetScope;
      targetInstanceIds: string[];
      calculation: AttackCalculationData;
      resolution: BattleAttackSequenceResolution;
    };

export interface EnemySingleTargetSelectorInput {
  state: BattleState;
  actorInstanceId: string;
  request: Extract<
    EnemyActionRequest,
    { kind: "normal_attack" | "noble_phantasm" }
  >;
  actionStableId: string;
}

export type EnemySingleTargetSelector = (
  input: EnemySingleTargetSelectorInput,
) => string | null;

export interface ResolveEnemyAttacksInput {
  state: BattleState;
  priorityRequests: readonly EnemyPrioritySkillRequest[];
  registry: BattleAttackDataRegistry;
  rng: AttackRngStreams;
  counters?: EffectRuntimeCounters;
  normalSelector?: EnemyNormalActionSelector;
  singleTargetSelector?: EnemySingleTargetSelector;
}

export interface EnemyAttacksResult {
  sequence: EnemyTurnSequenceResult;
  counters: EffectRuntimeCounters;
}

function firstLivingAlly(state: BattleState): string | null {
  return orderedLocations(state.formation, "ally")
    .find(({ unit }) => unit.alive)?.unit.instanceId
    ?? null;
}

function targetIds(
  input: EnemyActionResolverInput,
  scope: AttackTargetScope,
  selector: EnemySingleTargetSelector | undefined,
): string[] {
  if (scope === "all") {
    return orderedLocations(input.state.formation, "ally")
      .filter(({ unit }) => unit.alive)
      .map(({ unit }) => unit.instanceId);
  }
  if (
    input.request.kind !== "normal_attack"
    && input.request.kind !== "noble_phantasm"
  ) {
    return [];
  }
  const selected = selector
    ? selector({
        state: input.state,
        actorInstanceId: input.actorInstanceId,
        request: input.request,
        actionStableId: input.preflight.action.stableId,
      })
    : firstLivingAlly(input.state);
  if (selected === null) return [];
  const location = findUnitLocation(
    input.state.formation,
    selected,
  );
  if (
    !location
    || location.side !== "ally"
    || location.area !== "frontline"
    || !location.unit.alive
  ) {
    throw new RangeError(
      `enemy target selector returned an unavailable ally: ${selected}`,
    );
  }
  return [selected];
}

/**
 * Runs the enemy coordinator with concrete normal-attack and NP data. Skills
 * remain valid no-ops until their separate effect-data layer is supplied, and
 * missing enemy attack data consumes no attack RNG.
 */
export function resolveEnemyAttacks(
  input: ResolveEnemyAttacksInput,
): EnemyAttacksResult {
  let counters = input.counters
    ?? createEffectRuntimeCounters();
  const sequence = resolveEnemyTurnSequence(
    input.state,
    input.priorityRequests,
    (resolverInput) => {
      const request = resolverInput.request;
      if (request.kind === "skill") {
        return {
          state: resolverInput.state,
          detail: {
            outcome: "skipped",
            reason: "non_damaging_action",
          } satisfies EnemyAttackDetail,
        };
      }
      const source = findUnitLocation(
        resolverInput.state.formation,
        resolverInput.actorInstanceId,
      )?.unit;
      const combatant = source
        ? combatantAttackData(input.registry, source)
        : null;
      if (!source || !combatant) {
        return {
          state: resolverInput.state,
          detail: {
            outcome: "skipped",
            reason: "source_attack_data_missing",
          } satisfies EnemyAttackDetail,
        };
      }
      const action = enemyAttackActionData(
        combatant,
        resolverInput.preflight.action.stableId,
        request.kind,
      );
      if (!action) {
        return {
          state: resolverInput.state,
          detail: {
            outcome: "skipped",
            reason: "action_attack_data_missing",
          } satisfies EnemyAttackDetail,
        };
      }
      const targets = targetIds(
        resolverInput,
        action.targetScope,
        input.singleTargetSelector,
      );
      if (targets.length === 0) {
        return {
          state: resolverInput.state,
          detail: {
            outcome: "skipped",
            reason: "no_ally_target",
          } satisfies EnemyAttackDetail,
        };
      }
      const calculation: AttackCalculationData = {
        cardType: action.cardType,
        isNoblePhantasm:
          request.kind === "noble_phantasm",
        isCritical: false,
        cardDamageValuePermille:
          action.cardDamageValuePermille,
        cardNpValuePermille: 0,
        cardStarValuePermille: 0,
        firstCardDamageBonusPermille: 0,
        firstCardNpBonusPermille: 0,
        firstCardStarBonusPermille: 0,
        busterChainModPermille: 0,
        extraCardModifierPermille: 1_000,
        hitWeights: action.hitWeights,
        npDamageMultiplierPermille:
          action.npDamageMultiplierPermille,
        npSpecialAttackPermille:
          action.npSpecialAttackPermille,
      };
      const resolution = resolveBattleAttackSequence(
        resolverInput.state,
        {
          sourceInstanceId:
            resolverInput.actorInstanceId,
          targetInstanceIds: targets,
          rng: input.rng,
          prepareAttack: (
            state,
            activeTargetInstanceIds,
          ) => prepareBattleAttackInput(
            state,
            input.registry,
            resolverInput.actorInstanceId,
            activeTargetInstanceIds,
            calculation,
          ).input,
        },
        counters,
      );
      counters = resolution.counters;
      return {
        state: resolution.state,
        detail: {
          outcome: "resolved",
          targetScope: action.targetScope,
          targetInstanceIds: targets,
          calculation,
          resolution,
        } satisfies EnemyAttackDetail,
      };
    },
    input.normalSelector,
  );
  return { sequence, counters };
}
