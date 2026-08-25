import {
  combatantAttackData,
  enemyAttackActionData,
  type AttackTargetScope,
  type BattleAttackDataRegistry,
  type EnemyAttackActionData,
  type EnemyAttackTargetPolicy,
} from "../core/battle/actionData";
import {
  prepareEnemyNoblePhantasmContext,
  type EnemyNoblePhantasmPreflightSnapshot,
} from "../core/battle/enemyNoblePhantasmContext";
import type {
  AttackRngStreams,
} from "../core/battle/attack";
import type { BattleUnitState } from "../core/battle/types";
import {
  resolveBattleAttackSequence,
  type BattleAttackSequenceResolution,
} from "../core/battle/attackSequence";
import {
  BATTLE_LOG_SCHEMA_VERSION,
  battleLogBatchId,
  captureBattleLogRng,
  createBattleActionLogEntry,
  createBattleLogContext,
  createBattleLogUnitIndex,
  mergeBattleLogRngEvents,
  type BattleLogActionDescriptor,
  type BattleLogActionOutcome,
  type BattleLogBatch,
  type BattleLogRngEvent,
} from "../core/battle/log";
import {
  prepareBattleAttackInput,
  type AttackCalculationData,
} from "../core/battle/attackInput";
import {
  findUnitLocation,
  orderedLocations,
} from "../core/battle/formation";
import type { BattleState } from "../core/battle/state";
import type { DeterministicRng } from "../core/rng";
import {
  createEffectRuntimeCounters,
} from "../effects/runtime";
import {
  battleActionEffectSequence,
  combatantActionEffectData,
  hasUnsupportedDeclaredEffects,
  noblePhantasmEffectPhases,
  type BattleActionEffectDataRegistry,
  type BattleActionEffectSequence,
} from "../effects/actionData";
import {
  declaredActionEffectsStopAttackHits,
  declaredActionTargetSelectionIssue,
  executeDeclaredActionEffects,
  type DeclaredActionEffectGroupResult,
} from "../effects/actionExecution";
import type {
  EffectRuntimeCounters,
} from "../effects/types";
import {
  declaredActionScalingRequirements,
  type EnemyNoblePhantasmContext,
} from "../effects/declarations";
import {
  COMMON_EFFECT_TYPES,
  sumEffectModifiers,
} from "../effects/modifiers";
import type {
  EnemyActionRequest,
  EnemyPrioritySkillRequest,
} from "./enemyTurn";
import {
  resolveEnemyTurnSequence,
  type EnemyActionGuardInput,
  type EnemyTurnActionResolution,
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
      noblePhantasmContext?: Readonly<EnemyNoblePhantasmContext>;
      declaredEffects: DeclaredActionEffectGroupResult[];
      resolution: BattleAttackSequenceResolution;
    }
  | {
      outcome: "resolved_effects";
      targetInstanceIds: string[];
      declaredEffects: DeclaredActionEffectGroupResult[];
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
  /** Optional typed enemy skill and NP effects. */
  actionEffectRegistry?: BattleActionEffectDataRegistry;
  rng: AttackRngStreams;
  counters?: EffectRuntimeCounters;
  normalSelector?: EnemyNormalActionSelector;
  singleTargetSelector?: EnemySingleTargetSelector;
  /** AI stream used by declarative random targets and optional normal selectors. */
  aiRng?: DeterministicRng;
  /** Critical stream used only after a valid single target is fixed. */
  criticalRng?: DeterministicRng;
}

export interface EnemyAttacksResult {
  sequence: EnemyTurnSequenceResult;
  counters: EffectRuntimeCounters;
  battleLog: BattleLogBatch;
}

function actionEffectSequence(
  state: BattleState,
  registry: BattleActionEffectDataRegistry | undefined,
  actorInstanceId: string,
  stableId: string,
): BattleActionEffectSequence | null {
  if (!registry) return null;
  const actor = findUnitLocation(
    state.formation,
    actorInstanceId,
  )?.unit;
  if (!actor) return null;
  const combatant = combatantActionEffectData(registry, actor);
  return combatant
    ? battleActionEffectSequence(combatant, stableId)
    : null;
}

function requestedEffectSequence(
  input: EnemyActionGuardInput,
  registry: BattleActionEffectDataRegistry | undefined,
): BattleActionEffectSequence | null {
  if (input.request.kind === "normal_attack") return null;
  const stableId = input.request.kind === "skill"
    ? input.request.skillStableId
    : findUnitLocation(
        input.state.formation,
        input.actorInstanceId,
      )?.unit.enemyAction?.noblePhantasm?.stableId;
  return stableId
    ? actionEffectSequence(
        input.state,
        registry,
        input.actorInstanceId,
        stableId,
      )
    : null;
}

function enemyActionEffectGuard(
  input: EnemyActionGuardInput,
  registry: BattleActionEffectDataRegistry | undefined,
) {
  const sequence = requestedEffectSequence(input, registry);
  if (!sequence) return null;
  const expectedKind = input.request.kind === "skill"
    ? "skill"
    : "noble_phantasm";
  if (
    hasUnsupportedDeclaredEffects(sequence)
    || (
      input.request.kind === "skill"
      && (
        sequence.kind !== expectedKind
        || Object.values(
          declaredActionScalingRequirements(sequence.effects),
        ).some(Boolean)
      )
    )
  ) {
    return "action_effects_unresolved" as const;
  }
  if (
    input.request.kind === "noble_phantasm"
    && sequence.kind !== expectedKind
  ) {
    return "enemy_noble_phantasm_data_invalid" as const;
  }
  if (input.request.kind !== "skill") return null;
  const targetIssue = declaredActionTargetSelectionIssue(
    input.state,
    input.actorInstanceId,
    sequence.effects,
    input.request.selectedTargetInstanceId,
  );
  if (targetIssue === "selected_target_required") {
    return "action_effect_target_required" as const;
  }
  return targetIssue === "selected_target_invalid"
    ? "action_effect_target_invalid" as const
    : null;
}

function declaredEffectTargetInstanceIds(
  groups: readonly DeclaredActionEffectGroupResult[],
): string[] {
  return [...new Set(groups.flatMap(({ result }) =>
    result.effects.flatMap(({ targetInstanceIds }) =>
      targetInstanceIds
    )
  ))];
}

function livingAllyFrontlineInstanceIds(state: BattleState): string[] {
  return orderedLocations(state.formation, "ally")
    .filter(({ area, unit }) => area === "frontline" && unit.alive)
    .map(({ unit }) => unit.instanceId);
}

function targetFocusCandidateIds(state: BattleState): string[] {
  return orderedLocations(state.formation, "ally")
    .filter(({ area, unit }) =>
      area === "frontline"
      && unit.alive
      && unit.effects.some(
        ({ effectType, value }) =>
          effectType === COMMON_EFFECT_TYPES.targetFocus && value > 0,
      )
    )
    .map(({ unit }) => unit.instanceId);
}

function declarativeSingleTarget(
  state: BattleState,
  policy: EnemyAttackTargetPolicy,
  aiRng: DeterministicRng | undefined,
  candidates = livingAllyFrontlineInstanceIds(state),
): string | null {
  if (candidates.length === 0) return null;
  if (
    policy === "frontmost_living_ally"
    || candidates.length === 1
  ) {
    return candidates[0] ?? null;
  }
  if (!aiRng) {
    throw new RangeError(
      "random enemy single-target policy requires the ai RNG stream",
    );
  }
  return candidates[
    aiRng.nextIntInclusive(0, candidates.length - 1)
  ] ?? null;
}

function targetIds(
  input: EnemyActionResolverInput,
  action: EnemyAttackActionData,
  selector: EnemySingleTargetSelector | undefined,
  aiRng: DeterministicRng | undefined,
): string[] {
  if (action.targetScope === "all") {
    return orderedLocations(input.state.formation, "ally")
      .filter(({ area, unit }) => area === "frontline" && unit.alive)
      .map(({ unit }) => unit.instanceId);
  }
  if (
    input.request.kind !== "normal_attack"
    && input.request.kind !== "noble_phantasm"
  ) {
    return [];
  }
  const targetFocusCandidates = targetFocusCandidateIds(input.state);
  const selected = targetFocusCandidates.length > 0
    ? declarativeSingleTarget(
        input.state,
        action.targetPolicy ?? "frontmost_living_ally",
        aiRng,
        targetFocusCandidates,
      )
    : selector
      ? selector({
        state: input.state,
        actorInstanceId: input.actorInstanceId,
        request: input.request,
        actionStableId: input.preflight.action.stableId,
      })
      : declarativeSingleTarget(
          input.state,
          action.targetPolicy ?? "frontmost_living_ally",
          aiRng,
        );
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

function resolveEnemyCritical(
  action: EnemyAttackActionData,
  source: BattleUnitState,
  criticalRng: DeterministicRng | undefined,
): boolean {
  if (action.kind !== "normal_attack") return false;
  const rate = Math.max(0, Math.min(
    1_000,
    (action.criticalChancePermille ?? 0)
      + sumEffectModifiers(source, COMMON_EFFECT_TYPES.criticalChance, []),
  ));
  if (rate === 0) return false;
  if (rate === 1_000) return true;
  if (!criticalRng) {
    throw new RangeError(
      "enemy critical chance requires the critical RNG stream",
    );
  }
  return criticalRng.chance(rate);
}

function enemyAttackDataGuard(
  input: EnemyActionGuardInput,
  registry: BattleAttackDataRegistry,
  effectRegistry: BattleActionEffectDataRegistry | undefined,
) {
  const effectIssue = enemyActionEffectGuard(input, effectRegistry);
  if (effectIssue) return { skipReason: effectIssue };
  if (input.request.kind === "skill") return { skipReason: null };
  const source = findUnitLocation(
    input.state.formation,
    input.actorInstanceId,
  )?.unit;
  const combatant = source
    ? combatantAttackData(registry, source)
    : null;
  if (!source || !combatant) {
    return { skipReason: "source_attack_data_missing" as const };
  }
  const actionStableId = input.request.kind === "normal_attack"
    ? source.enemyAction?.normalAttack?.stableId
    : source.enemyAction?.noblePhantasm?.stableId;
  const action = actionStableId
    ? enemyAttackActionData(
        combatant,
        actionStableId,
        input.request.kind,
      )
    : null;
  if (!action) {
    return { skipReason: "action_attack_data_missing" as const };
  }
  if (input.request.kind === "normal_attack") {
    return { skipReason: null };
  }
  const combatantEffects = effectRegistry
    ? combatantActionEffectData(effectRegistry, source)
    : null;
  const noblePhantasmSequences = combatantEffects?.actions.filter(
    ({ kind }) => kind === "noble_phantasm",
  ) ?? [];
  const effectSequence = noblePhantasmSequences.find(
    ({ stableId }) => stableId === action.actionStableId,
  ) ?? null;
  if (!effectSequence && noblePhantasmSequences.length > 0) {
    return {
      skipReason: "enemy_noble_phantasm_data_invalid" as const,
    };
  }
  const prepared = prepareEnemyNoblePhantasmContext(
    action,
    effectSequence,
  );
  return prepared.outcome === "skipped"
    ? { skipReason: prepared.reason }
    : { skipReason: null, snapshot: prepared.snapshot };
}

function enemyActionDetail(
  action: EnemyTurnActionResolution,
): EnemyAttackDetail | null {
  if (!action.resolverCalled) return null;
  const detail = action.resolverDetail;
  if (
    !detail
    || typeof detail !== "object"
    || !("outcome" in detail)
    || (
      detail.outcome !== "resolved"
      && detail.outcome !== "resolved_effects"
      && detail.outcome !== "skipped"
    )
  ) {
    throw new RangeError(
      "resolved enemy action is missing its typed detail",
    );
  }
  return detail as EnemyAttackDetail;
}

function enemyActionDescriptor(
  action: EnemyTurnActionResolution,
  detail: EnemyAttackDetail | null,
): BattleLogActionDescriptor {
  const request = action.request;
  const configured =
    action.preflight.outcome === "ready"
      ? action.preflight.action
      : null;
  const kind =
    request.kind === "normal_attack"
      ? "enemy_normal_attack" as const
      : request.kind === "skill"
        ? "enemy_skill" as const
        : "enemy_noble_phantasm" as const;
  return {
    kind,
    stage: action.stage,
    sequence: action.actionNumber,
    stableId:
      configured?.stableId
      ?? (request.kind === "skill" ? request.skillStableId : null),
    name: configured?.name ?? null,
    cardId: null,
    cardType:
      detail?.outcome === "resolved"
        ? detail.calculation.cardType
        : null,
  };
}

function enemyActionOutcome(
  action: EnemyTurnActionResolution,
  detail: EnemyAttackDetail | null,
): BattleLogActionOutcome {
  if (action.preflight.outcome === "skipped") {
    return {
      status: "skipped",
      reasons: [action.preflight.reason],
      resolverCalled: false,
    };
  }
  if (detail?.outcome === "skipped") {
    return {
      status: "skipped",
      reasons: [detail.reason],
      resolverCalled: true,
    };
  }
  if (
    detail?.outcome === "resolved"
    || detail?.outcome === "resolved_effects"
  ) {
    return {
      status: "resolved",
      reasons: [],
      resolverCalled: true,
    };
  }
  throw new RangeError(
    "ready enemy action is missing its resolution detail",
  );
}

function createEnemyAttackBattleLog(
  stateAtStart: BattleState,
  sequence: EnemyTurnSequenceResult,
  selectorRngEvents: ReadonlyMap<
    number,
    readonly BattleLogRngEvent[]
  >,
  actionRngEvents: ReadonlyMap<
    number,
    readonly BattleLogRngEvent[]
  >,
): BattleLogBatch {
  const context = createBattleLogContext(stateAtStart);
  const kind = "enemy_turn" as const;
  const batchId = battleLogBatchId(context, kind);
  const unitIndex = createBattleLogUnitIndex(stateAtStart);
  const entries = sequence.actions.map((action) => {
    const detail = enemyActionDetail(action);
    const selectorEvents = action.normalSlot
      ? selectorRngEvents.get(action.normalSlot.sequence) ?? []
      : [];
    return createBattleActionLogEntry({
      batchId,
      context,
      unitIndex,
      side: "enemy",
      actionNumber: action.actionNumber,
      actorInstanceId: action.actorInstanceId,
      action: enemyActionDescriptor(action, detail),
      outcome: enemyActionOutcome(action, detail),
      targetInstanceIds:
        detail?.outcome === "resolved"
          || detail?.outcome === "resolved_effects"
          ? detail.targetInstanceIds
          : [],
      calculation:
        detail?.outcome === "resolved"
          ? detail.calculation
          : null,
      ...(detail?.outcome === "resolved"
          && detail.noblePhantasmContext?.noblePhantasmLevel !== undefined
        ? {
            noblePhantasmLevel:
              detail.noblePhantasmContext.noblePhantasmLevel,
          }
        : {}),
      overchargeStage:
        detail?.outcome === "resolved"
          ? detail.noblePhantasmContext?.overchargeStage ?? null
          : null,
      critical: null,
      declaredEffectGroups:
        detail?.outcome === "resolved"
          || detail?.outcome === "resolved_effects"
          ? detail.declaredEffects
          : [],
      attackSequence:
        detail?.outcome === "resolved"
          ? detail.resolution
          : null,
      boundary: action.boundary,
      rngEvents: mergeBattleLogRngEvents(
        selectorEvents,
        actionRngEvents.get(action.actionNumber) ?? [],
      ),
    });
  });
  return {
    schemaVersion: BATTLE_LOG_SCHEMA_VERSION,
    batchId,
    kind,
    context,
    status: "completed",
    stopReason: sequence.stopReason,
    setupRngEvents: [],
    entries,
  };
}

/**
 * Runs the enemy coordinator with concrete attacks plus optional declared
 * skill/NP effects. Missing action data remains a deterministic no-op.
 */
export function resolveEnemyAttacks(
  input: ResolveEnemyAttacksInput,
): EnemyAttacksResult {
  let counters = input.counters
    ?? createEffectRuntimeCounters();
  const actionRngEvents = new Map<
    number,
    readonly BattleLogRngEvent[]
  >();
  const selectorRngEvents = new Map<
    number,
    readonly BattleLogRngEvent[]
  >();
  const auditedNormalSelector = input.normalSelector
    ? (selectorInput: Parameters<EnemyNormalActionSelector>[0]) => {
        if (!input.aiRng) {
          return input.normalSelector?.(selectorInput)
            ?? { kind: "normal_attack" as const };
        }
        const captured = captureBattleLogRng(
          { ai: input.aiRng },
          () => input.normalSelector?.(selectorInput)
            ?? { kind: "normal_attack" as const },
        );
        selectorRngEvents.set(
          selectorInput.slot.sequence,
          captured.events,
        );
        return captured.result;
      }
    : undefined;
  const sequence = resolveEnemyTurnSequence(
    input.state,
    input.priorityRequests,
    (resolverInput) => {
      const captured = captureBattleLogRng(
        {
          ...(input.aiRng ? { ai: input.aiRng } : {}),
          effects: input.rng.effects,
          ...(input.criticalRng
            ? { critical: input.criticalRng }
            : {}),
          damage: input.rng.damage,
          stars: input.rng.stars,
        },
        () => {
          const request = resolverInput.request;
          if (request.kind === "skill") {
            const effectSequence = actionEffectSequence(
              resolverInput.state,
              input.actionEffectRegistry,
              resolverInput.actorInstanceId,
              resolverInput.preflight.action.stableId,
            );
            if (!effectSequence || effectSequence.kind !== "skill") {
              return {
                state: resolverInput.state,
                detail: {
                  outcome: "skipped",
                  reason: "non_damaging_action",
                } satisfies EnemyAttackDetail,
              };
            }
            const effectResult = executeDeclaredActionEffects(
              resolverInput.state,
              resolverInput.actorInstanceId,
              effectSequence.effects,
              {
                selectedTargetInstanceId:
                  request.selectedTargetInstanceId,
              },
              counters,
              input.rng.effects,
            );
            counters = effectResult.counters;
            const declaredEffects: DeclaredActionEffectGroupResult[] = [{
              phase: "non_damaging",
              result: effectResult,
            }];
            return {
              state: effectResult.state,
              detail: {
                outcome: "resolved_effects",
                targetInstanceIds:
                  declaredEffectTargetInstanceIds(declaredEffects),
                declaredEffects,
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
          const guardSnapshot = resolverInput.preflight.guardSnapshot as
            | EnemyNoblePhantasmPreflightSnapshot
            | undefined;
          const noblePhantasmSnapshot = request.kind === "noble_phantasm"
            ? guardSnapshot ?? null
            : null;
          const action = noblePhantasmSnapshot?.action
            ?? enemyAttackActionData(
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
            action,
            input.singleTargetSelector,
            input.aiRng,
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
            isCritical: resolveEnemyCritical(
              action,
              source,
              input.criticalRng,
            ),
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
              noblePhantasmSnapshot?.npDamageMultiplierPermille
              ?? (typeof action.npDamageMultiplierPermille === "number"
                ? action.npDamageMultiplierPermille
                : undefined),
            npSpecialAttackPermille:
              action.npSpecialAttackPermille,
          };
          const effectSequence = noblePhantasmSnapshot?.effectSequence ?? null;
          const effectPhases = effectSequence
            ? noblePhantasmEffectPhases(effectSequence)
            : null;
          const effectContext = {
            selectedTargetInstanceId: targets[0],
            ...(noblePhantasmSnapshot?.context?.noblePhantasmLevel === undefined
              ? {}
              : {
                  noblePhantasmLevel:
                    noblePhantasmSnapshot.context.noblePhantasmLevel,
                }),
            ...(noblePhantasmSnapshot?.context?.overchargeStage === undefined
              ? {}
              : {
                  overchargeStage:
                    noblePhantasmSnapshot.context.overchargeStage,
                }),
          };
          const declaredEffects: DeclaredActionEffectGroupResult[] = [];
          const resolution = resolveBattleAttackSequence(
            resolverInput.state,
            {
              sourceInstanceId:
                resolverInput.actorInstanceId,
              targetInstanceIds: targets,
              triggerContext: {
                attackKind:
                  request.kind === "noble_phantasm"
                    ? "noble_phantasm"
                    : "enemy_normal_attack",
                cardType: action.cardType,
              },
              rng: input.rng,
              ...(effectPhases
                  && effectPhases.beforeAttack.length > 0
                ? {
                    beforeDamage: ({
                      state,
                      counters: phaseCounters,
                    }) => {
                      const result = executeDeclaredActionEffects(
                        state,
                        resolverInput.actorInstanceId,
                        effectPhases.beforeAttack,
                        effectContext,
                        phaseCounters,
                        input.rng.effects,
                      );
                      declaredEffects.push({
                        phase: "before_attack",
                        result,
                      });
                      return {
                        state: result.state,
                        counters: result.counters,
                        stopAttackHits:
                          declaredActionEffectsStopAttackHits(result),
                      };
                    },
                  }
                : {}),
              ...(effectPhases
                  && effectPhases.afterAttack.length > 0
                ? {
                    afterAttackEffects: ({
                      state,
                      counters: phaseCounters,
                    }) => {
                      const result = executeDeclaredActionEffects(
                        state,
                        resolverInput.actorInstanceId,
                        effectPhases.afterAttack,
                        effectContext,
                        phaseCounters,
                        input.rng.effects,
                      );
                      declaredEffects.push({
                        phase: "after_attack",
                        result,
                      });
                      return {
                        state: result.state,
                        counters: result.counters,
                      };
                    },
                  }
                : {}),
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
              ...(noblePhantasmSnapshot?.context
                ? { noblePhantasmContext: noblePhantasmSnapshot.context }
                : {}),
              declaredEffects,
              resolution,
            } satisfies EnemyAttackDetail,
          };
        },
      );
      actionRngEvents.set(
        resolverInput.actionNumber,
        captured.events,
      );
      return captured.result;
    },
    auditedNormalSelector,
    (guardInput) => enemyAttackDataGuard(
      guardInput,
      input.registry,
      input.actionEffectRegistry,
    ),
  );
  const battleLog = createEnemyAttackBattleLog(
    input.state,
    sequence,
    selectorRngEvents,
    actionRngEvents,
  );
  return { sequence, counters, battleLog };
}
