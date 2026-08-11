import type {
  SideTurnEndResult,
  TurnEndHpContribution,
} from "../../effects/turnEnd";
import type {
  RemovedEffect,
  SlipDamageKind,
} from "../../effects/types";
import type {
  BattleRngSnapshot,
  RngStreamName,
  RngStreamSnapshot,
} from "../rng";
import {
  battleLogUnitRef,
  createBattleLogCommonActionResult,
  createBattleLogTriggerStage,
  createBattleLogUnitIndex,
  type BattleLogBatch,
  type BattleLogCommonActionResult,
  type BattleLogRngEvent,
  type BattleLogTriggerStage,
  type BattleLogUnitIndex,
  type BattleLogUnitRef,
} from "./log";
import { orderedLocations } from "./formation";
import type {
  AllyDefeatReplacementResult,
  EnemyReplacementResult,
} from "./replacement";
import type {
  BattleOutcome,
  BattlePhase,
  BattleState,
} from "./state";
import type {
  AllyTurnEndResolution,
  EnemyTurnEndResolution,
} from "./turnEndCoordinator";

export const BATTLE_TURN_LOG_SCHEMA_VERSION = 2 as const;

export interface BattleLogStatePoint {
  waveNumber: number;
  totalWaves: number;
  battleTurn: number;
  waveTurn: number;
  phase: BattlePhase;
  outcome: BattleOutcome;
  commandStars: number;
  nextCommandStars: number;
  remainingWaveCount: number;
}

export interface BattleLogActionBatchRecord {
  schemaVersion: typeof BATTLE_TURN_LOG_SCHEMA_VERSION;
  recordType: "action_batch";
  recordId: string;
  batch: BattleLogBatch;
}

export interface BattleLogEffectRemoval {
  effectInstanceId: string;
  effectStableId: string;
  reason: string;
}

export interface BattleLogTurnEndAction {
  actionIndex: number;
  actionKind: string;
  targetInstanceIds: string[];
  targets: BattleLogUnitRef[];
  deferredSettlement:
    | "recurring_hp_recovery"
    | "slip_damage"
    | null;
  starAddition?: {
    bucket: "next_command";
    requested: number;
    before: number;
    added: number;
    after: number;
    overflow: number;
  };
  results: BattleLogCommonActionResult[];
}

export interface BattleLogTurnEndActivation {
  owner: BattleLogUnitRef;
  effectInstanceId: string;
  effectStableId: string;
  outcome: string;
  consumedUse: boolean;
  removedByUse: BattleLogEffectRemoval | null;
  actions: BattleLogTurnEndAction[];
}

export interface BattleLogTurnEndHpContribution {
  owner: BattleLogUnitRef;
  effectInstanceId: string;
  effectStableId: string;
  actionIndex: number;
  source: BattleLogUnitRef | null;
  amount: number;
  slipDamageKind?: SlipDamageKind;
  amplifierPermille?: number;
  categoryBaseAmount?: number;
  categoryResolvedDamage?: number;
  ignoreRecoveryModifiers: boolean;
  ignoreHealingBlock: boolean;
}

export interface BattleLogTurnEndHpSettlement {
  target: BattleLogUnitRef;
  recoveryContributions: BattleLogTurnEndHpContribution[];
  slipDamageContributions: BattleLogTurnEndHpContribution[];
  result: {
    outcome: string;
    totalBaseRecovery: number;
    scaledRecovery: number;
    totalSlipDamage: number;
    slipDamageCategories?: Array<{
      kind: SlipDamageKind;
      baseAmount: number;
      resolvedDamage: number;
    }>;
    hpBefore: number | null;
    hpAfter: number | null;
    hpChange: number;
    receivedModifierPermille: number;
    sourceModifiers: Array<{
      source: BattleLogUnitRef | null;
      givenModifierPermille: number;
    }>;
    blockedByEffectInstanceId: string | null;
    consumedSourceEffectInstanceIds: string[];
    consumedTargetEffectInstanceIds: string[];
    slipPreventedDefeat: boolean;
  };
}

export interface BattleLogBreakResolution {
  enemy: BattleLogUnitRef;
  area: "frontline" | "reserve";
  index: number;
  brokenGaugeNumber: number;
  activatedGaugeNumber: number;
  baseMaxHp: number;
  maxHp: number;
  remainingGaugeCount: number;
  trigger: BattleLogTriggerStage | null;
}

export interface BattleLogAllyReplacement {
  events: Array<{
    frontlineIndex: number;
    defeated: BattleLogUnitRef;
    replacement: BattleLogUnitRef | null;
    replacementReserveIndex: number | null;
    defeatedMovedToReserve: true;
  }>;
  cardDeckRebuilt: boolean;
}

export type BattleLogEnemyReplacementStage =
  | "after_break"
  | "after_ally_recurring"
  | "after_enemy_recurring"
  | "enemy_turn_end";

export interface BattleLogEnemyReplacement {
  stage: BattleLogEnemyReplacementStage;
  stageSequence: number | null;
  departures: Array<{
    area: "frontline" | "reserve";
    index: number;
    unit: BattleLogUnitRef;
  }>;
  arrivals: Array<{
    frontlineIndex: number;
    reserveIndexBefore: number;
    unit: BattleLogUnitRef;
  }>;
  replacementDeferred: boolean;
}

export interface BattleLogDurationTick {
  owner: BattleLogUnitRef;
  removed: BattleLogEffectRemoval[];
}

export interface BattleLogCooldowns {
  units: Array<{
    unit: BattleLogUnitRef;
    before: number[];
    after: number[];
  }>;
  mysticCodeBefore: number[] | null;
  mysticCodeAfter: number[] | null;
}

export interface BattleLogEnemyChargeChange {
  enemy: BattleLogUnitRef;
  before: number;
  after: number;
}

export type BattleLogCheckpointKind =
  | "enemy_action_started"
  | "next_ally_turn_started"
  | "wave_advanced"
  | "battle_finished";

export interface BattleLogTurnEndCheckpoint {
  kind: BattleLogCheckpointKind;
  battleOutcome: BattleOutcome;
  battleTurnBefore: number;
  battleTurnAfter: number;
  waveTurnBefore: number;
  waveTurnAfter: number;
  commandStarsBefore: number;
  commandStarsAfter: number;
  nextCommandStarsBefore: number;
  nextCommandStarsAfter: number;
  waveTransition: {
    fromWaveNumber: number;
    toWaveNumber: number;
    incomingEnemies: Array<{
      area: "frontline" | "reserve";
      index: number;
      unit: BattleLogUnitRef;
    }>;
  } | null;
}

export interface BattleLogTurnEndRecord {
  schemaVersion: typeof BATTLE_TURN_LOG_SCHEMA_VERSION;
  recordType: "turn_end";
  recordId: string;
  side: "ally" | "enemy";
  before: BattleLogStatePoint;
  after: BattleLogStatePoint;
  registrationCutoff: number;
  breaks: BattleLogBreakResolution[];
  deferredBreaks: BattleLogUnitRef[];
  activations: BattleLogTurnEndActivation[];
  hpSettlements: BattleLogTurnEndHpSettlement[];
  allyReplacement: BattleLogAllyReplacement;
  enemyReplacements: BattleLogEnemyReplacement[];
  enemyChargeChanges: BattleLogEnemyChargeChange[];
  durations: BattleLogDurationTick[];
  cooldowns: BattleLogCooldowns;
  checkpoint: BattleLogTurnEndCheckpoint;
  rngEvents: BattleLogRngEvent[];
}

export type BattleTurnLogRecord =
  | BattleLogActionBatchRecord
  | BattleLogTurnEndRecord;

export interface BattleTurnLog {
  schemaVersion: typeof BATTLE_TURN_LOG_SCHEMA_VERSION;
  turnId: string;
  seed: string;
  rngAlgorithmVersion: number;
  before: BattleLogStatePoint;
  after: BattleLogStatePoint;
  stopReason: string;
  rngBefore: Record<RngStreamName, RngStreamSnapshot>;
  rngAfter: Record<RngStreamName, RngStreamSnapshot>;
  records: BattleTurnLogRecord[];
}

export interface CreateBattleTurnLogInput {
  beforeState: BattleState;
  afterState: BattleState;
  stopReason: string;
  rngBefore: BattleRngSnapshot;
  rngAfter: BattleRngSnapshot;
  records: readonly BattleTurnLogRecord[];
}

export function createBattleLogStatePoint(
  state: BattleState,
): BattleLogStatePoint {
  return {
    waveNumber: state.waveNumber,
    totalWaves: state.totalWaves,
    battleTurn: state.battleTurn,
    waveTurn: state.waveTurn,
    phase: state.phase,
    outcome: state.outcome,
    commandStars: state.commandStars,
    nextCommandStars: state.nextCommandStars,
    remainingWaveCount: state.remainingWaves.length,
  };
}

function turnId(state: BattleState): string {
  return [
    `wave-${state.waveNumber}`,
    `battle-turn-${state.battleTurn}`,
    `wave-turn-${state.waveTurn}`,
  ].join(":");
}

export function createBattleLogActionBatchRecord(
  batch: BattleLogBatch,
): BattleLogActionBatchRecord {
  return {
    schemaVersion: BATTLE_TURN_LOG_SCHEMA_VERSION,
    recordType: "action_batch",
    recordId: batch.batchId,
    batch,
  };
}

function removalLog(removed: RemovedEffect): BattleLogEffectRemoval {
  return {
    effectInstanceId: removed.effect.instanceId,
    effectStableId: removed.effect.stableId,
    reason: removed.reason,
  };
}

function turnEndActivationLogs(
  recurring: SideTurnEndResult,
  unitIndex: BattleLogUnitIndex,
): BattleLogTurnEndActivation[] {
  return recurring.activations.map((activation) => ({
    owner: battleLogUnitRef(
      unitIndex,
      activation.ownerInstanceId,
    ),
    effectInstanceId: activation.effectInstanceId,
    effectStableId: activation.effectStableId,
    outcome: activation.outcome,
    consumedUse: activation.consumedUse,
    removedByUse: activation.removedByUse
      ? removalLog(activation.removedByUse)
      : null,
    actions: activation.actions.map((action) => ({
      actionIndex: action.actionIndex,
      actionKind: action.action.action.kind,
      targetInstanceIds: [...action.targetInstanceIds],
      targets: action.targetInstanceIds.map((instanceId) =>
        battleLogUnitRef(unitIndex, instanceId)
      ),
      deferredSettlement: action.deferredSettlement ?? null,
      ...(action.starAddition
        ? { starAddition: { ...action.starAddition } }
        : {}),
      results: action.batch.results.map((result, index) =>
        createBattleLogCommonActionResult(
          result,
          action.targetInstanceIds[index] ?? null,
        )
      ),
    })),
  }));
}

function hpContributionLog(
  contribution: TurnEndHpContribution,
  unitIndex: BattleLogUnitIndex,
): BattleLogTurnEndHpContribution {
  return {
    owner: battleLogUnitRef(
      unitIndex,
      contribution.ownerInstanceId,
    ),
    effectInstanceId: contribution.effectInstanceId,
    effectStableId: contribution.effectStableId,
    actionIndex: contribution.actionIndex,
    source: contribution.sourceInstanceId
      ? battleLogUnitRef(unitIndex, contribution.sourceInstanceId)
      : null,
    amount: contribution.amount,
    ...(contribution.slipDamageKind
      ? {
          slipDamageKind: contribution.slipDamageKind,
          amplifierPermille: contribution.amplifierPermille ?? 0,
          categoryBaseAmount: contribution.categoryBaseAmount,
          categoryResolvedDamage: contribution.categoryResolvedDamage,
        }
      : {}),
    ignoreRecoveryModifiers:
      contribution.ignoreRecoveryModifiers ?? false,
    ignoreHealingBlock:
      contribution.ignoreHealingBlock ?? false,
  };
}

function hpSettlementLogs(
  recurring: SideTurnEndResult,
  unitIndex: BattleLogUnitIndex,
): BattleLogTurnEndHpSettlement[] {
  return recurring.hpSettlements.map((settlement) => ({
    target: battleLogUnitRef(
      unitIndex,
      settlement.targetInstanceId,
    ),
    recoveryContributions: settlement.recoveryContributions.map(
      (contribution) => hpContributionLog(contribution, unitIndex),
    ),
    slipDamageContributions:
      settlement.slipDamageContributions.map(
        (contribution) => hpContributionLog(contribution, unitIndex),
      ),
    result: {
      outcome: settlement.result.outcome,
      totalBaseRecovery: settlement.result.totalBaseRecovery,
      scaledRecovery: settlement.result.scaledRecovery,
      totalSlipDamage: settlement.result.totalSlipDamage,
      ...(settlement.result.slipDamageCategories.length > 0
        ? {
            slipDamageCategories:
              settlement.result.slipDamageCategories.map(
                (category) => ({ ...category }),
              ),
          }
        : {}),
      hpBefore: settlement.result.hpBefore,
      hpAfter: settlement.result.hpAfter,
      hpChange: settlement.result.hpChange,
      receivedModifierPermille:
        settlement.result.receivedModifierPermille,
      sourceModifiers: settlement.result.sourceModifiers.map(
        (modifier) => ({
          source: modifier.sourceInstanceId
            ? battleLogUnitRef(
                unitIndex,
                modifier.sourceInstanceId,
              )
            : null,
          givenModifierPermille:
            modifier.givenModifierPermille,
        }),
      ),
      blockedByEffectInstanceId:
        settlement.result.blockedByEffectInstanceId ?? null,
      consumedSourceEffectInstanceIds: [
        ...settlement.result.consumedSourceEffectInstanceIds,
      ],
      consumedTargetEffectInstanceIds: [
        ...settlement.result.consumedTargetEffectInstanceIds,
      ],
      slipPreventedDefeat:
        settlement.result.slipPreventedDefeat,
    },
  }));
}

function allyReplacementLog(
  replacement: AllyDefeatReplacementResult,
  unitIndex: BattleLogUnitIndex,
): BattleLogAllyReplacement {
  return {
    events: replacement.events.map((event) => ({
      frontlineIndex: event.frontlineIndex,
      defeated: battleLogUnitRef(
        unitIndex,
        event.defeatedInstanceId,
      ),
      replacement: event.replacementInstanceId
        ? battleLogUnitRef(
            unitIndex,
            event.replacementInstanceId,
          )
        : null,
      replacementReserveIndex:
        event.replacementReserveIndex,
      defeatedMovedToReserve: true,
    })),
    cardDeckRebuilt: replacement.cardDeckRebuildRequired,
  };
}

function enemyReplacementLog(
  replacement: EnemyReplacementResult,
  unitIndex: BattleLogUnitIndex,
  stage: BattleLogEnemyReplacementStage,
  stageSequence: number | null = null,
): BattleLogEnemyReplacement {
  return {
    stage,
    stageSequence,
    departures: replacement.departures.map((departure) => ({
      area: departure.area,
      index: departure.index,
      unit: battleLogUnitRef(
        unitIndex,
        departure.instanceId,
      ),
    })),
    arrivals: replacement.arrivals.map((arrival) => ({
      frontlineIndex: arrival.frontlineIndex,
      reserveIndexBefore: arrival.reserveIndexBefore,
      unit: battleLogUnitRef(unitIndex, arrival.instanceId),
    })),
    replacementDeferred: replacement.replacementDeferred,
  };
}

function durationLogs(
  durations: AllyTurnEndResolution["durations"],
  unitIndex: BattleLogUnitIndex,
): BattleLogDurationTick[] {
  return durations.durations.map((duration) => ({
    owner: battleLogUnitRef(
      unitIndex,
      duration.ownerInstanceId,
    ),
    removed: duration.removed.map(removalLog),
  }));
}

function cooldownLogs(
  cooldowns: AllyTurnEndResolution["cooldowns"],
  unitIndex: BattleLogUnitIndex,
): BattleLogCooldowns {
  return {
    units: cooldowns.units.map((tick) => ({
      unit: battleLogUnitRef(unitIndex, tick.instanceId),
      before: [...tick.before],
      after: [...tick.after],
    })),
    mysticCodeBefore: cooldowns.mysticCodeBefore
      ? [...cooldowns.mysticCodeBefore]
      : null,
    mysticCodeAfter: cooldowns.mysticCodeAfter
      ? [...cooldowns.mysticCodeAfter]
      : null,
  };
}

function checkpointLog(
  before: BattleState,
  after: BattleState,
  unitIndex: BattleLogUnitIndex,
): BattleLogTurnEndCheckpoint {
  const waveAdvanced = after.waveNumber > before.waveNumber;
  const kind: BattleLogCheckpointKind =
    after.phase === "finished"
      ? "battle_finished"
      : waveAdvanced
        ? "wave_advanced"
        : after.phase === "enemy_action"
          ? "enemy_action_started"
          : "next_ally_turn_started";
  return {
    kind,
    battleOutcome: after.outcome,
    battleTurnBefore: before.battleTurn,
    battleTurnAfter: after.battleTurn,
    waveTurnBefore: before.waveTurn,
    waveTurnAfter: after.waveTurn,
    commandStarsBefore: before.commandStars,
    commandStarsAfter: after.commandStars,
    nextCommandStarsBefore: before.nextCommandStars,
    nextCommandStarsAfter: after.nextCommandStars,
    waveTransition: waveAdvanced
      ? {
          fromWaveNumber: before.waveNumber,
          toWaveNumber: after.waveNumber,
          incomingEnemies: orderedLocations(
            after.formation,
            "enemy",
            true,
          ).map((location) => ({
            area: location.area,
            index: location.index,
            unit: battleLogUnitRef(
              unitIndex,
              location.unit.instanceId,
            ),
          })),
        }
      : null,
  };
}

interface CreateTurnEndRecordBase {
  beforeState: BattleState;
  rngEvents: readonly BattleLogRngEvent[];
}

export function createAllyTurnEndLogRecord(
  input: CreateTurnEndRecordBase & {
    resolution: AllyTurnEndResolution;
  },
): BattleLogTurnEndRecord {
  const afterState = input.resolution.state;
  const unitIndex = createBattleLogUnitIndex(
    input.beforeState,
    input.resolution.breaks.state,
    afterState,
  );
  return {
    schemaVersion: BATTLE_TURN_LOG_SCHEMA_VERSION,
    recordType: "turn_end",
    recordId: `${turnId(input.beforeState)}:ally_turn_end`,
    side: "ally",
    before: createBattleLogStatePoint(input.beforeState),
    after: createBattleLogStatePoint(afterState),
    registrationCutoff:
      input.resolution.recurring.registrationCutoff,
    breaks: input.resolution.breaks.events.map(
      (event, index) => ({
        enemy: battleLogUnitRef(unitIndex, event.instanceId),
        area: event.area,
        index: event.index,
        brokenGaugeNumber: event.brokenGaugeNumber,
        activatedGaugeNumber: event.activatedGaugeNumber,
        baseMaxHp: event.baseMaxHp,
        maxHp: event.maxHp,
        remainingGaugeCount: event.remainingGaugeCount,
        trigger: input.resolution.breakTriggers[index]
          ? createBattleLogTriggerStage(
              input.resolution.breakTriggers[index],
              index + 1,
            )
          : null,
      }),
    ),
    deferredBreaks:
      input.resolution.breaks.deferredInstanceIds.map(
        (instanceId) => battleLogUnitRef(unitIndex, instanceId),
      ),
    activations: turnEndActivationLogs(
      input.resolution.recurring,
      unitIndex,
    ),
    hpSettlements: hpSettlementLogs(
      input.resolution.recurring,
      unitIndex,
    ),
    allyReplacement: allyReplacementLog(
      input.resolution.allyReplacement,
      unitIndex,
    ),
    enemyReplacements: [
      ...input.resolution.breakEnemyReplacements.map(
        (replacement, index) => enemyReplacementLog(
          replacement,
          unitIndex,
          "after_break",
          index + 1,
        ),
      ),
      enemyReplacementLog(
        input.resolution.recurringEnemyReplacement,
        unitIndex,
        "after_ally_recurring",
      ),
    ],
    enemyChargeChanges: [],
    durations: durationLogs(
      input.resolution.durations,
      unitIndex,
    ),
    cooldowns: cooldownLogs(
      input.resolution.cooldowns,
      unitIndex,
    ),
    checkpoint: checkpointLog(
      input.beforeState,
      afterState,
      unitIndex,
    ),
    rngEvents: [...input.rngEvents],
  };
}

export function createEnemyTurnEndLogRecord(
  input: CreateTurnEndRecordBase & {
    resolution: EnemyTurnEndResolution;
  },
): BattleLogTurnEndRecord {
  const afterState = input.resolution.state;
  const unitIndex = createBattleLogUnitIndex(
    input.beforeState,
    afterState,
  );
  return {
    schemaVersion: BATTLE_TURN_LOG_SCHEMA_VERSION,
    recordType: "turn_end",
    recordId: `${turnId(input.beforeState)}:enemy_turn_end`,
    side: "enemy",
    before: createBattleLogStatePoint(input.beforeState),
    after: createBattleLogStatePoint(afterState),
    registrationCutoff:
      input.resolution.recurring.registrationCutoff,
    breaks: [],
    deferredBreaks: [],
    activations: turnEndActivationLogs(
      input.resolution.recurring,
      unitIndex,
    ),
    hpSettlements: hpSettlementLogs(
      input.resolution.recurring,
      unitIndex,
    ),
    allyReplacement: allyReplacementLog(
      input.resolution.allyReplacement,
      unitIndex,
    ),
    enemyReplacements: [
      enemyReplacementLog(
        input.resolution.defeatedEnemyDeparture,
        unitIndex,
        "after_enemy_recurring",
      ),
      enemyReplacementLog(
        input.resolution.standardReplacement,
        unitIndex,
        "enemy_turn_end",
      ),
    ],
    enemyChargeChanges: input.resolution.charge.changes.map((change) => ({
      enemy: battleLogUnitRef(unitIndex, change.instanceId),
      before: change.before,
      after: change.after,
    })),
    durations: durationLogs(
      input.resolution.durations,
      unitIndex,
    ),
    cooldowns: cooldownLogs(
      input.resolution.cooldowns,
      unitIndex,
    ),
    checkpoint: checkpointLog(
      input.beforeState,
      afterState,
      unitIndex,
    ),
    rngEvents: [...input.rngEvents],
  };
}

export function createBattleTurnLog(
  input: CreateBattleTurnLogInput,
): BattleTurnLog {
  if (
    input.rngBefore.seed !== input.rngAfter.seed
    || input.rngBefore.algorithmVersion
      !== input.rngAfter.algorithmVersion
  ) {
    throw new RangeError(
      "battle-turn log RNG snapshots must share seed and version",
    );
  }
  return {
    schemaVersion: BATTLE_TURN_LOG_SCHEMA_VERSION,
    turnId: turnId(input.beforeState),
    seed: input.rngBefore.seed,
    rngAlgorithmVersion: input.rngBefore.algorithmVersion,
    before: createBattleLogStatePoint(input.beforeState),
    after: createBattleLogStatePoint(input.afterState),
    stopReason: input.stopReason,
    rngBefore: { ...input.rngBefore.streams },
    rngAfter: { ...input.rngAfter.streams },
    records: [...input.records],
  };
}
