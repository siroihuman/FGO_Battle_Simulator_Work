import {
  combatantAttackData,
  noblePhantasmAttackData,
  noblePhantasmDamageMultiplier,
  type AttackTargetScope,
  type BattleAttackDataRegistry,
} from "../battle/actionData";
import {
  resolveBattleAttackSequence,
  type BattleAttackSequenceResolution,
} from "../battle/attackSequence";
import {
  BATTLE_LOG_SCHEMA_VERSION,
  battleLogBatchId,
  captureBattleLogRng,
  createBattleActionLogEntry,
  createBattleLogContext,
  createBattleLogUnitIndex,
  type BattleLogActionDescriptor,
  type BattleLogActionOutcome,
  type BattleLogBatch,
  type BattleLogRngEvent,
} from "../battle/log";
import {
  prepareBattleAttackInput,
  type AttackCalculationData,
} from "../battle/attackInput";
import {
  findUnitLocation,
  orderedLocations,
} from "../battle/formation";
import type { BattleState } from "../battle/state";
import type {
  AttackRngStreams,
} from "../battle/attack";
import type { DeterministicRng } from "../rng";
import {
  createEffectRuntimeCounters,
} from "../../effects/runtime";
import {
  battleActionEffectSequence,
  combatantActionEffectData,
  hasUnsupportedDeclaredEffects,
  noblePhantasmEffectPhases,
  type BattleActionEffectDataRegistry,
  type BattleActionEffectSequence,
} from "../../effects/actionData";
import {
  declaredActionEffectsStopAttackHits,
  declaredActionTargetSelectionIssue,
  executeDeclaredActionEffects,
  type DeclaredActionEffectGroupResult,
  type DeclaredActionExecutionContext,
} from "../../effects/actionExecution";
import type {
  EffectRuntimeCounters,
} from "../../effects/types";
import {
  resolveNoblePhantasmOverchargeStage,
  type NoblePhantasmOverchargeStage,
} from "./chain";
import {
  resolveAllyCommandSequence,
  type AllyCommandActionResolution,
  type AllyCommandActionResolverInput,
  type AllyCommandSequenceStartResult,
} from "./turnCoordinator";
import type {
  CommandCardExecutionRestriction,
  CommandCardSelection,
} from "./selection";
import {
  assertStoredCommandStarDistribution,
  resolveCommandCardCritical,
  resolveCommandStarDistribution,
  type CommandCardCriticalResult,
  type CommandStarDistribution,
} from "./critical";

export type AllyAttackDataSkipReason =
  | "source_attack_data_missing"
  | "command_card_attack_data_missing"
  | "extra_attack_data_missing"
  | "noble_phantasm_attack_data_missing";

export type AllyCommandAttackDetail =
  | {
      outcome: "skipped";
      reason: AllyAttackDataSkipReason;
    }
  | {
      outcome: "resolved";
      targetScope: AttackTargetScope;
      targetInstanceIds: string[];
      calculation: AttackCalculationData;
      overchargeStage: NoblePhantasmOverchargeStage | null;
      critical: CommandCardCriticalResult | null;
      declaredEffects: DeclaredActionEffectGroupResult[];
      resolution: BattleAttackSequenceResolution;
    };

export interface AllyCommandRngStreams extends AttackRngStreams {
  critical: DeterministicRng;
}

export interface ResolveAllyCommandAttacksInput {
  state: BattleState;
  selection: CommandCardSelection;
  registry: BattleAttackDataRegistry;
  /** Optional typed skill/NP effect data keyed by the same battle instance. */
  actionEffectRegistry?: BattleActionEffectDataRegistry;
  rng: AllyCommandRngStreams;
  counters?: EffectRuntimeCounters;
  requestedTargetInstanceId?: string;
  additionalOverchargeStagesByCardId?: Readonly<
    Record<string, number>
  >;
}

export interface AllyCommandAttacksResult {
  sequence: AllyCommandSequenceStartResult;
  starDistribution: CommandStarDistribution;
  counters: EffectRuntimeCounters;
  battleLog: BattleLogBatch;
}

interface ResolvedAllyActionData {
  targetScope: AttackTargetScope;
  calculation: AttackCalculationData;
  additionalAttacks: Array<{
    stableId: string;
    calculation: AttackCalculationData;
  }>;
  overchargeStage: NoblePhantasmOverchargeStage | null;
  critical: CommandCardCriticalResult | null;
}

function noblePhantasmEffectSequence(
  state: BattleState,
  registry: BattleActionEffectDataRegistry | undefined,
  sourceInstanceId: string,
  stableId: string,
): BattleActionEffectSequence | null {
  if (!registry) return null;
  const source = findUnitLocation(
    state.formation,
    sourceInstanceId,
  )?.unit;
  if (!source) return null;
  const combatant = combatantActionEffectData(registry, source);
  return combatant
    ? battleActionEffectSequence(combatant, stableId)
    : null;
}

function allyActionEffectRestrictions(
  state: BattleState,
  action: AllyCommandActionResolverInput["action"],
  targetInstanceId: string,
  registry: BattleActionEffectDataRegistry | undefined,
): CommandCardExecutionRestriction[] {
  if (action.kind !== "selected_card") return [];
  const card = action.calculation.card;
  if (card.kind !== "noble_phantasm") return [];
  const sequence = noblePhantasmEffectSequence(
    state,
    registry,
    action.ownerInstanceId,
    card.noblePhantasmStableId,
  );
  if (!sequence) return [];
  if (
    sequence.kind !== "noble_phantasm"
    || hasUnsupportedDeclaredEffects(sequence)
  ) {
    return ["action_effects_unresolved"];
  }
  const targetIssue = declaredActionTargetSelectionIssue(
    state,
    action.ownerInstanceId,
    sequence.effects,
    targetInstanceId,
  );
  if (targetIssue === "selected_target_required") {
    return ["action_effect_target_required"];
  }
  return targetIssue === "selected_target_invalid"
    ? ["action_effect_target_invalid"]
    : [];
}

function resolveAllyActionData(
  input: AllyCommandActionResolverInput,
  registry: BattleAttackDataRegistry,
  starDistribution: CommandStarDistribution,
  criticalRng: DeterministicRng,
  additionalOverchargeStagesByCardId: Readonly<
    Record<string, number>
  >,
):
  | {
      accepted: true;
      data: ResolvedAllyActionData;
    }
  | {
      accepted: false;
      reason: AllyAttackDataSkipReason;
    } {
  const source = findUnitLocation(
    input.state.formation,
    input.action.ownerInstanceId,
  )?.unit;
  const combatant = source
    ? combatantAttackData(registry, source)
    : null;
  if (!source || !combatant) {
    return {
      accepted: false,
      reason: "source_attack_data_missing",
    };
  }
  if (input.action.kind === "extra_attack") {
    const hitWeights = combatant.extraAttackHitWeights;
    if (!hitWeights) {
      return {
        accepted: false,
        reason: "extra_attack_data_missing",
      };
    }
    return {
      accepted: true,
      data: {
        targetScope: "single",
        additionalAttacks: [],
        overchargeStage: null,
        critical: null,
        calculation: {
          cardType: "extra",
          isNoblePhantasm: false,
          isCritical: false,
          cardDamageValuePermille:
            input.action.calculation.cardDamageValuePermille,
          cardNpValuePermille:
            input.action.calculation.cardNpValuePermille,
          cardStarValuePermille:
            input.action.calculation.cardStarValuePermille,
          firstCardDamageBonusPermille:
            input.action.calculation.firstCardBonus.damagePermille,
          firstCardNpBonusPermille:
            input.action.calculation.firstCardBonus.npGainPermille,
          firstCardStarBonusPermille:
            input.action.calculation.firstCardBonus.starGenerationPermille,
          busterChainModPermille: 0,
          extraCardModifierPermille:
            input.action.calculation.extraCardModifierPermille,
          hitWeights,
        },
      },
    };
  }

  const context = input.action.calculation;
  const card = context.card;
  if (card.kind === "normal") {
    const hitWeights =
      combatant.commandCardHitWeights?.[card.cardIndex];
    if (!hitWeights) {
      return {
        accepted: false,
        reason: "command_card_attack_data_missing",
      };
    }
    const critical = resolveCommandCardCritical(
      card.cardId,
      context.firstCardBonus.criticalRatePermille,
      starDistribution,
      criticalRng,
    );
    return {
      accepted: true,
      data: {
        targetScope: "single",
        additionalAttacks: [],
        overchargeStage: null,
        critical,
        calculation: {
          cardType: card.type,
          isNoblePhantasm: false,
          isCritical: critical.isCritical,
          cardDamageValuePermille:
            context.cardDamageValuePermille,
          cardNpValuePermille:
            context.cardNpValuePermille,
          cardStarValuePermille:
            context.cardStarValuePermille,
          firstCardDamageBonusPermille:
            context.firstCardBonus.damagePermille,
          firstCardNpBonusPermille:
            context.firstCardBonus.npGainPermille,
          firstCardStarBonusPermille:
            context.firstCardBonus.starGenerationPermille,
          busterChainModPermille:
            context.busterChainModPermille,
          extraCardModifierPermille:
            context.extraCardModifierPermille,
          hitWeights,
        },
      },
    };
  }

  const noblePhantasm = noblePhantasmAttackData(
    combatant,
    card.noblePhantasmStableId,
  );
  if (!noblePhantasm) {
    return {
      accepted: false,
      reason: "noble_phantasm_attack_data_missing",
    };
  }
  const npBeforeUse =
    "npBeforeUse" in input.preflight
      ? input.preflight.npBeforeUse
      : null;
  if (npBeforeUse === null) {
    throw new RangeError(
      "ready noble phantasm is missing pre-consumption NP",
    );
  }
  const overchargeStage = resolveNoblePhantasmOverchargeStage(
    npBeforeUse,
    context.overchargeChainBonusStages,
    (additionalOverchargeStagesByCardId[card.cardId] ?? 0)
      + ("additionalOverchargeStages" in input.preflight
        ? input.preflight.additionalOverchargeStages
        : 0),
  );
  return {
    accepted: true,
    data: {
      targetScope: noblePhantasm.targetScope,
      additionalAttacks: noblePhantasm.additionalAttack
        ? [{
            stableId: noblePhantasm.additionalAttack.stableId,
            calculation: {
              cardType: card.type,
              isNoblePhantasm: true,
              isCritical: false,
              cardDamageValuePermille:
                context.cardDamageValuePermille,
              cardNpValuePermille:
                context.cardNpValuePermille,
              cardStarValuePermille:
                context.cardStarValuePermille,
              firstCardDamageBonusPermille: 0,
              firstCardNpBonusPermille: 0,
              firstCardStarBonusPermille: 0,
              busterChainModPermille: 0,
              extraCardModifierPermille: 1_000,
              hitWeights: noblePhantasm.additionalAttack.hitWeights,
              npDamageMultiplierPermille:
                noblePhantasm.additionalAttack
                  .damageMultiplierPermilleByOvercharge[
                    overchargeStage - 1
                  ],
            },
          }]
        : [],
      overchargeStage,
      critical: null,
      calculation: {
        cardType: card.type,
        isNoblePhantasm: true,
        isCritical: false,
        cardDamageValuePermille:
          context.cardDamageValuePermille,
        cardNpValuePermille:
          context.cardNpValuePermille,
        cardStarValuePermille:
          context.cardStarValuePermille,
        firstCardDamageBonusPermille: 0,
        firstCardNpBonusPermille: 0,
        firstCardStarBonusPermille: 0,
        busterChainModPermille: 0,
        extraCardModifierPermille: 1_000,
        hitWeights: noblePhantasm.hitWeights,
        npDamageMultiplierPermille:
          noblePhantasmDamageMultiplier(
            noblePhantasm,
            card.noblePhantasmLevel,
          ),
        npSpecialAttackPermille:
          noblePhantasm.specialAttackPermille
          ?? noblePhantasm.specialAttackPermilleByOvercharge?.[
              overchargeStage - 1
            ],
        npSpecialAttackRequiredTargetTraits:
          noblePhantasm.specialAttackRequiredTargetTraits,
        npSpecialAttackRequiresRemovableTargetDebuff:
          noblePhantasm.specialAttackRequiresRemovableTargetDebuff,
      },
    },
  };
}

function actionTargets(
  state: BattleState,
  scope: AttackTargetScope,
  selectedTargetInstanceId: string,
): string[] {
  if (scope === "single") return [selectedTargetInstanceId];
  return orderedLocations(state.formation, "enemy")
    .filter(({ unit }) => unit.alive)
    .map(({ unit }) => unit.instanceId);
}

function allyActionDetail(
  action: AllyCommandActionResolution,
): AllyCommandAttackDetail | null {
  if (!action.resolverCalled) return null;
  const detail = action.resolverDetail;
  if (
    !detail
    || typeof detail !== "object"
    || !("outcome" in detail)
    || (
      detail.outcome !== "resolved"
      && detail.outcome !== "skipped"
    )
  ) {
    throw new RangeError(
      "resolved ally command action is missing its typed detail",
    );
  }
  return detail as AllyCommandAttackDetail;
}

function allyActionDescriptor(
  action: AllyCommandActionResolution,
): BattleLogActionDescriptor {
  if (action.action.kind === "extra_attack") {
    return {
      kind: "extra_attack",
      stage: "extra",
      sequence: action.action.sequence,
      stableId: "extra_attack",
      name: "Extra Attack",
      cardId: null,
      cardType: "extra",
    };
  }
  const card = action.action.calculation.card;
  if (card.kind === "normal") {
    return {
      kind: "normal_command",
      stage: "selected",
      sequence: action.action.sequence,
      stableId: card.cardId,
      name: null,
      cardId: card.cardId,
      cardType: card.type,
    };
  }
  return {
    kind: "noble_phantasm",
    stage: "selected",
    sequence: action.action.sequence,
    stableId: card.noblePhantasmStableId,
    name: card.noblePhantasmName,
    cardId: card.cardId,
    cardType: card.type,
  };
}

function allyActionOutcome(
  action: AllyCommandActionResolution,
  detail: AllyCommandAttackDetail | null,
): BattleLogActionOutcome {
  if (action.preflight.outcome === "fizzled") {
    return {
      status: "fizzled",
      reasons: [...action.preflight.restrictions],
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
  if (detail?.outcome === "resolved") {
    return {
      status: "resolved",
      reasons: [],
      resolverCalled: true,
    };
  }
  throw new RangeError(
    "ready ally command action is missing its resolution detail",
  );
}

function createAllyCommandBattleLog(
  stateAtStart: BattleState,
  sequence: AllyCommandSequenceStartResult,
  setupRngEvents: readonly BattleLogRngEvent[],
  actionRngEvents: ReadonlyMap<number, readonly BattleLogRngEvent[]>,
): BattleLogBatch {
  const context = createBattleLogContext(stateAtStart);
  const kind = "ally_command" as const;
  const batchId = battleLogBatchId(context, kind);
  if (!sequence.accepted) {
    return {
      schemaVersion: BATTLE_LOG_SCHEMA_VERSION,
      batchId,
      kind,
      context,
      status: "rejected",
      stopReason: sequence.reason,
      setupRngEvents: [...setupRngEvents],
      entries: [],
    };
  }
  const unitIndex = createBattleLogUnitIndex(stateAtStart);
  const entries = sequence.result.actions.map((action, index) => {
    const detail = allyActionDetail(action);
    const targetInstanceIds =
      detail?.outcome === "resolved"
        ? detail.targetInstanceIds
        : [action.targetAtStart.instanceId];
    return createBattleActionLogEntry({
      batchId,
      context,
      unitIndex,
      side: "ally",
      actionNumber: index + 1,
      actorInstanceId: action.action.ownerInstanceId,
      action: allyActionDescriptor(action),
      outcome: allyActionOutcome(action, detail),
      targetInstanceIds,
      calculation:
        detail?.outcome === "resolved"
          ? detail.calculation
          : null,
      overchargeStage:
        detail?.outcome === "resolved"
          ? detail.overchargeStage
          : null,
      critical:
        detail?.outcome === "resolved"
          ? detail.critical
          : null,
      declaredEffectGroups:
        detail?.outcome === "resolved"
          ? detail.declaredEffects
          : [],
      attackSequence:
        detail?.outcome === "resolved"
          ? detail.resolution
          : null,
      boundary: action.boundary,
      rngEvents:
        actionRngEvents.get(action.action.sequence) ?? [],
    });
  });
  return {
    schemaVersion: BATTLE_LOG_SCHEMA_VERSION,
    batchId,
    kind,
    context,
    status: "completed",
    stopReason: sequence.result.stopReason,
    setupRngEvents: [...setupRngEvents],
    entries,
  };
}

/**
 * Runs the existing command coordinator with a concrete resolver backed by
 * battle-instance attack data. Missing numeric data becomes a logged no-op;
 * preflight, action boundaries, retargeting, and turn entry still proceed.
 */
export function resolveAllyCommandAttacks(
  input: ResolveAllyCommandAttacksInput,
): AllyCommandAttacksResult {
  let counters = input.counters
    ?? createEffectRuntimeCounters();
  const starDistributionCapture =
    input.state.commandStarDistributionMode
        === "legacy_on_command_confirmation"
      ? captureBattleLogRng(
          { critical: input.rng.critical },
          () => resolveCommandStarDistribution(
            input.state,
            input.registry,
            input.rng.critical,
          ),
        )
      : {
          result: assertStoredCommandStarDistribution(
            input.state,
            input.registry,
          ),
          events: [],
        };
  const starDistribution = starDistributionCapture.result;
  const actionRngEvents = new Map<
    number,
    readonly BattleLogRngEvent[]
  >();
  const additionalOverchargeStagesByCardId =
    input.additionalOverchargeStagesByCardId ?? {};
  const sequence = resolveAllyCommandSequence(
    input.state,
    input.selection,
    (resolverInput) => {
      const captured = captureBattleLogRng(
        {
          effects: input.rng.effects,
          critical: input.rng.critical,
          damage: input.rng.damage,
          stars: input.rng.stars,
        },
        () => {
          const actionData = resolveAllyActionData(
            resolverInput,
            input.registry,
            starDistribution,
            input.rng.critical,
            additionalOverchargeStagesByCardId,
          );
          if (!actionData.accepted) {
            return {
              state: resolverInput.state,
              detail: {
                outcome: "skipped",
                reason: actionData.reason,
              } satisfies AllyCommandAttackDetail,
            };
          }
          const targetInstanceIds = actionTargets(
            resolverInput.state,
            actionData.data.targetScope,
            resolverInput.target.instanceId,
          );
          const selectedCard =
            resolverInput.action.kind === "selected_card"
              ? resolverInput.action.calculation.card
              : null;
          const effectSequence =
            selectedCard?.kind === "noble_phantasm"
              ? noblePhantasmEffectSequence(
                  resolverInput.state,
                  input.actionEffectRegistry,
                  resolverInput.action.ownerInstanceId,
                  selectedCard.noblePhantasmStableId,
                )
              : null;
          const effectPhases = effectSequence
            ? noblePhantasmEffectPhases(effectSequence)
            : null;
          let effectContext: DeclaredActionExecutionContext | null = null;
          if (selectedCard?.kind === "noble_phantasm") {
            if (actionData.data.overchargeStage === null) {
              throw new RangeError(
                "resolved noble phantasm is missing overcharge stage",
              );
            }
            effectContext = {
              noblePhantasmLevel:
                selectedCard.noblePhantasmLevel,
              overchargeStage:
                actionData.data.overchargeStage,
              selectedTargetInstanceId:
                resolverInput.target.instanceId,
            };
          }
          const declaredEffects: DeclaredActionEffectGroupResult[] = [];
          const resolution = resolveBattleAttackSequence(
            resolverInput.state,
            {
              sourceInstanceId:
                resolverInput.action.ownerInstanceId,
              targetInstanceIds,
              allowDefeatedTargets:
                resolverInput.defeatedTargetContinuation,
              triggerContext: {
                attackKind:
                  selectedCard?.kind === "noble_phantasm"
                    ? "noble_phantasm"
                    : resolverInput.action.kind === "extra_attack"
                      ? "extra_attack"
                      : "normal_command",
                cardType: actionData.data.calculation.cardType,
              },
              rng: input.rng,
              ...(effectPhases
                  && effectContext
                  && effectPhases.beforeAttack.length > 0
                ? {
                    beforeDamage: ({
                      state,
                      counters: phaseCounters,
                    }) => {
                      const result = executeDeclaredActionEffects(
                        state,
                        resolverInput.action.ownerInstanceId,
                        effectPhases.beforeAttack,
                        effectContext!,
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
                  && effectContext
                  && effectPhases.afterAttack.length > 0
                ? {
                    afterAttackEffects: ({
                      state,
                      counters: phaseCounters,
                    }) => {
                      const result = executeDeclaredActionEffects(
                        state,
                        resolverInput.action.ownerInstanceId,
                        effectPhases.afterAttack,
                        effectContext!,
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
                resolverInput.action.ownerInstanceId,
                activeTargetInstanceIds,
                actionData.data.calculation,
                resolverInput.defeatedTargetContinuation,
              ).input,
              ...(actionData.data.additionalAttacks.length > 0
                ? {
                    additionalAttacks:
                      actionData.data.additionalAttacks.map(
                        (additional) => ({
                          stableId: additional.stableId,
                          allowDefeatedTargets: true as const,
                          prepareAttack: (
                            state,
                            retainedTargetInstanceIds,
                          ) => prepareBattleAttackInput(
                            state,
                            input.registry,
                            resolverInput.action.ownerInstanceId,
                            retainedTargetInstanceIds,
                            additional.calculation,
                            true,
                          ).input,
                        }),
                      ),
                  }
                : {}),
            },
            counters,
          );
          counters = resolution.counters;
          return {
            state: resolution.state,
            targetScope: actionData.data.targetScope,
            detail: {
              outcome: "resolved",
              targetScope: actionData.data.targetScope,
              targetInstanceIds,
              calculation: actionData.data.calculation,
              overchargeStage:
                actionData.data.overchargeStage,
              critical: actionData.data.critical,
              declaredEffects,
              resolution,
            } satisfies AllyCommandAttackDetail,
          };
        },
      );
      actionRngEvents.set(
        resolverInput.action.sequence,
        captured.events,
      );
      return captured.result;
    },
    input.requestedTargetInstanceId,
    ({ state, action, target }) =>
      allyActionEffectRestrictions(
        state,
        action,
        target.instanceId,
        input.actionEffectRegistry,
      ),
  );
  const battleLog = createAllyCommandBattleLog(
    input.state,
    sequence,
    starDistributionCapture.events,
    actionRngEvents,
  );
  return { sequence, starDistribution, counters, battleLog };
}
