import {
  resolveEnemyAttacks,
  type EnemyAttacksResult,
  type EnemySingleTargetSelector,
} from "../../ai/enemyAttack";
import type {
  EnemyPrioritySkillRequest,
} from "../../ai/enemyTurn";
import type {
  EnemyNormalActionSelector,
} from "../../ai/enemyTurnCoordinator";
import {
  createEffectRuntimeCounters,
} from "../../effects/runtime";
import type {
  EffectRuntimeCounters,
} from "../../effects/types";
import type {
  BattleActionEffectDataRegistry,
} from "../../effects/actionData";
import type { BattleRng } from "../rng";
import {
  resolveAllyCommandAttacks,
  type AllyCommandAttacksResult,
} from "../cards/commandAttack";
import type {
  CommandCardSelection,
} from "../cards/selection";
import type {
  BattleAttackDataRegistry,
} from "./actionData";
import {
  captureBattleLogRng,
  type BattleLogBatch,
} from "./log";
import type { BattleState } from "./state";
import {
  createAllyTurnEndLogRecord,
  createBattleLogActionBatchRecord,
  createBattleTurnLog,
  createEnemyTurnEndLogRecord,
  type BattleTurnLog,
  type BattleTurnLogRecord,
} from "./turnLog";
import {
  resolveAllyTurnEnd,
  resolveEnemyTurnEnd,
  type AllyTurnEndResolution,
  type EnemyTurnEndResolution,
} from "./turnEndCoordinator";

export interface BattleTurnAllyOptions {
  requestedTargetInstanceId?: string;
  additionalOverchargeStagesByCardId?: Readonly<
    Record<string, number>
  >;
}

export interface BattleTurnEnemyOptions {
  /** Quest-specific priority skills. Empty by default. */
  priorityRequests?: readonly EnemyPrioritySkillRequest[];
  /** Optional quest AI for the three normal action slots. */
  normalSelector?: EnemyNormalActionSelector;
  /** Optional single-target selector. The frontmost ally is the default. */
  singleTargetSelector?: EnemySingleTargetSelector;
}

export interface ResolveBattleTurnInput {
  state: BattleState;
  selection: CommandCardSelection;
  registry: BattleAttackDataRegistry;
  /** Optional declared passive/skill/NP effect data for battle instances. */
  actionEffectRegistry?: BattleActionEffectDataRegistry;
  /** Owns all named streams so one fixed seed covers the complete turn. */
  rng: BattleRng;
  counters?: EffectRuntimeCounters;
  ally?: BattleTurnAllyOptions;
  enemy?: BattleTurnEnemyOptions;
}

export type BattleTurnStopReason =
  | "ally_command_rejected"
  | "battle_finished_after_ally_turn_end"
  | "wave_advanced_after_ally_turn_end"
  | "battle_finished_after_enemy_turn_end"
  | "wave_advanced_after_enemy_turn_end"
  | "turn_complete";

/**
 * One invocation always stops at a safe player-input boundary or a finished
 * battle. Turn-end stages cannot be skipped after an accepted command chain.
 */
export interface BattleTurnResolution {
  state: BattleState;
  counters: EffectRuntimeCounters;
  stopReason: BattleTurnStopReason;
  allyAttacks: AllyCommandAttacksResult;
  allyTurnEnd: AllyTurnEndResolution | null;
  enemyAttacks: EnemyAttacksResult | null;
  enemyTurnEnd: EnemyTurnEndResolution | null;
  /** Action-only compatibility view in execution order. */
  actionLogBatches: BattleLogBatch[];
  /** Ordered actions, turn ends, Wave checkpoints, and outcome for this turn. */
  battleLog: BattleTurnLog;
}

function checkpointReason(
  state: BattleState,
  waveNumberAtStart: number,
  stage: "ally" | "enemy",
): BattleTurnStopReason {
  if (state.phase === "finished") {
    return stage === "ally"
      ? "battle_finished_after_ally_turn_end"
      : "battle_finished_after_enemy_turn_end";
  }
  if (
    state.phase === "ally_action"
    && state.waveNumber > waveNumberAtStart
  ) {
    return stage === "ally"
      ? "wave_advanced_after_ally_turn_end"
      : "wave_advanced_after_enemy_turn_end";
  }
  if (stage === "enemy" && state.phase === "ally_action") {
    return "turn_complete";
  }
  throw new RangeError(
    `unexpected ${stage} turn-end checkpoint: ${state.phase}`,
  );
}

/**
 * Resolves one complete battle turn from an ally command selection.
 *
 * Accepted commands are followed by the ally turn end. Enemy actions run only
 * when that checkpoint keeps the current Wave active, and are always followed
 * by the enemy turn end. A rejected command leaves the battle at the same
 * input boundary and does not run any later stage.
 */
export function resolveBattleTurn(
  input: ResolveBattleTurnInput,
): BattleTurnResolution {
  const rngBefore = input.rng.snapshot();
  const initialCounters = input.counters
    ?? createEffectRuntimeCounters();
  const effects = input.rng.stream("effects");
  const damage = input.rng.stream("damage");
  const stars = input.rng.stream("stars");
  const allyAttacks = resolveAllyCommandAttacks({
    state: input.state,
    selection: input.selection,
    registry: input.registry,
    actionEffectRegistry: input.actionEffectRegistry,
    rng: {
      effects,
      critical: input.rng.stream("critical"),
      damage,
      stars,
    },
    counters: initialCounters,
    requestedTargetInstanceId:
      input.ally?.requestedTargetInstanceId,
    additionalOverchargeStagesByCardId:
      input.ally?.additionalOverchargeStagesByCardId,
  });
  const actionLogBatches = [allyAttacks.battleLog];
  const logRecords: BattleTurnLogRecord[] = [
    createBattleLogActionBatchRecord(allyAttacks.battleLog),
  ];

  if (!allyAttacks.sequence.accepted) {
    const stopReason = "ally_command_rejected";
    return {
      state: input.state,
      counters: allyAttacks.counters,
      stopReason,
      allyAttacks,
      allyTurnEnd: null,
      enemyAttacks: null,
      enemyTurnEnd: null,
      actionLogBatches,
      battleLog: createBattleTurnLog({
        beforeState: input.state,
        afterState: input.state,
        stopReason,
        rngBefore,
        rngAfter: input.rng.snapshot(),
        records: logRecords,
      }),
    };
  }

  const allyTurnEndState = allyAttacks.sequence.result.state;
  const allyTurnEndCapture = captureBattleLogRng(
    { effects },
    () => resolveAllyTurnEnd(
      allyTurnEndState,
      allyAttacks.counters,
      effects,
    ),
  );
  const allyTurnEnd = allyTurnEndCapture.result;
  logRecords.push(createAllyTurnEndLogRecord({
    beforeState: allyTurnEndState,
    resolution: allyTurnEnd,
    rngEvents: allyTurnEndCapture.events,
  }));
  if (allyTurnEnd.state.phase !== "enemy_action") {
    const stopReason = checkpointReason(
      allyTurnEnd.state,
      input.state.waveNumber,
      "ally",
    );
    return {
      state: allyTurnEnd.state,
      counters: allyTurnEnd.counters,
      stopReason,
      allyAttacks,
      allyTurnEnd,
      enemyAttacks: null,
      enemyTurnEnd: null,
      actionLogBatches,
      battleLog: createBattleTurnLog({
        beforeState: input.state,
        afterState: allyTurnEnd.state,
        stopReason,
        rngBefore,
        rngAfter: input.rng.snapshot(),
        records: logRecords,
      }),
    };
  }

  const enemyAttacks = resolveEnemyAttacks({
    state: allyTurnEnd.state,
    priorityRequests:
      input.enemy?.priorityRequests ?? [],
    registry: input.registry,
    actionEffectRegistry: input.actionEffectRegistry,
    rng: { effects, damage, stars },
    counters: allyTurnEnd.counters,
    normalSelector: input.enemy?.normalSelector,
    singleTargetSelector:
      input.enemy?.singleTargetSelector,
    aiRng: input.rng.stream("ai"),
  });
  actionLogBatches.push(enemyAttacks.battleLog);
  logRecords.push(
    createBattleLogActionBatchRecord(enemyAttacks.battleLog),
  );
  const enemyTurnEndState = enemyAttacks.sequence.state;
  const enemyTurnEndCapture = captureBattleLogRng(
    { effects },
    () => resolveEnemyTurnEnd(
      enemyTurnEndState,
      enemyAttacks.counters,
      effects,
    ),
  );
  const enemyTurnEnd = enemyTurnEndCapture.result;
  logRecords.push(createEnemyTurnEndLogRecord({
    beforeState: enemyTurnEndState,
    resolution: enemyTurnEnd,
    rngEvents: enemyTurnEndCapture.events,
  }));
  const stopReason = checkpointReason(
    enemyTurnEnd.state,
    input.state.waveNumber,
    "enemy",
  );

  return {
    state: enemyTurnEnd.state,
    counters: enemyTurnEnd.counters,
    stopReason,
    allyAttacks,
    allyTurnEnd,
    enemyAttacks,
    enemyTurnEnd,
    actionLogBatches,
    battleLog: createBattleTurnLog({
      beforeState: input.state,
      afterState: enemyTurnEnd.state,
      stopReason,
      rngBefore,
      rngAfter: input.rng.snapshot(),
      records: logRecords,
    }),
  };
}
