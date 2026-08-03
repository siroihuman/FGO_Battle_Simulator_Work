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
import type {
  EffectRuntimeCounters,
} from "../../effects/types";
import {
  resolveNoblePhantasmOverchargeStage,
  type NoblePhantasmOverchargeStage,
} from "./chain";
import {
  resolveAllyCommandSequence,
  type AllyCommandActionResolverInput,
  type AllyCommandSequenceStartResult,
} from "./turnCoordinator";
import type {
  CommandCardSelection,
} from "./selection";
import {
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
      resolution: BattleAttackSequenceResolution;
    };

export interface AllyCommandRngStreams extends AttackRngStreams {
  critical: DeterministicRng;
}

export interface ResolveAllyCommandAttacksInput {
  state: BattleState;
  selection: CommandCardSelection;
  registry: BattleAttackDataRegistry;
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
}

interface ResolvedAllyActionData {
  targetScope: AttackTargetScope;
  calculation: AttackCalculationData;
  overchargeStage: NoblePhantasmOverchargeStage | null;
  critical: CommandCardCriticalResult | null;
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
    additionalOverchargeStagesByCardId[card.cardId] ?? 0,
  );
  return {
    accepted: true,
    data: {
      targetScope: noblePhantasm.targetScope,
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
          noblePhantasm.specialAttackPermilleByOvercharge?.[
            overchargeStage - 1
          ],
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
  const starDistribution = resolveCommandStarDistribution(
    input.state,
    input.registry,
    input.rng.critical,
  );
  const additionalOverchargeStagesByCardId =
    input.additionalOverchargeStagesByCardId ?? {};
  const sequence = resolveAllyCommandSequence(
    input.state,
    input.selection,
    (resolverInput) => {
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
      const resolution = resolveBattleAttackSequence(
        resolverInput.state,
        {
          sourceInstanceId:
            resolverInput.action.ownerInstanceId,
          targetInstanceIds,
          rng: input.rng,
          prepareAttack: (
            state,
            activeTargetInstanceIds,
          ) => prepareBattleAttackInput(
            state,
            input.registry,
            resolverInput.action.ownerInstanceId,
            activeTargetInstanceIds,
            actionData.data.calculation,
          ).input,
        },
        counters,
      );
      counters = resolution.counters;
      return {
        state: resolution.state,
        detail: {
          outcome: "resolved",
          targetScope: actionData.data.targetScope,
          targetInstanceIds,
          calculation: actionData.data.calculation,
          overchargeStage:
            actionData.data.overchargeStage,
          critical: actionData.data.critical,
          resolution,
        } satisfies AllyCommandAttackDetail,
      };
    },
    input.requestedTargetInstanceId,
  );
  return { sequence, starDistribution, counters };
}
