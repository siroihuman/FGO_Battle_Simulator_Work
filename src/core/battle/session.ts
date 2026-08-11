import type { EnemyPrioritySkillRequest } from "../../ai/enemyTurn";
import {
  battleActionEffectSequence,
  combatantActionEffectData,
  createBattleActionEffectDataRegistry,
  type BattleActionEffectDataRegistry,
  type CombatantActionEffectData,
} from "../../effects/actionData";
import type { EffectRuntimeCounters } from "../../effects/types";
import {
  resolveMysticCodeSkillUse,
  type MysticCodeOrderChangeSelection,
  type MysticCodeSkillUseResult,
} from "../../effects/mysticCodeExecution";
import {
  resolveAllySkillUse,
  type AllySkillUseResult,
} from "../../effects/skillExecution";
import {
  createMysticCodeDataRegistry,
  mysticCodeDefinition,
  type MysticCodeDataRegistry,
  type MysticCodeDefinition,
} from "../../data/mysticCodes";
import {
  createBattleAttackDataRegistry,
  type AttackAffinityTables,
  type BattleAttackDataRegistry,
  type CombatantAttackData,
} from "./actionData";
import {
  createBattleLoop,
  resolveBattleLoopTurn,
  type BattleLoop,
  type BattleLoopTurnResult,
} from "./loop";
import type {
  BattleTurnAllyOptions,
  BattleTurnEnemyOptions,
} from "./battleTurn";
import type { BattleTurnLog } from "./turnLog";
import {
  BATTLE_LOG_SCHEMA_VERSION,
  battleLogBatchId,
  captureBattleLogRng,
  createBattleActionLogEntry,
  createBattleLogContext,
  createBattleLogUnitIndex,
  mergeBattleLogRngEvents,
  type BattleLogBatch,
  type BattleLogUnitRef,
} from "./log";
import type { ActionBoundaryResult } from "./actionBoundary";
import { findUnitLocation } from "./formation";
import type { DirectAllyExchangeEvent } from "./replacement";
import {
  assertBattleLoadoutState,
  type BattleState,
} from "./state";
import {
  BattleRng,
  RNG_ALGORITHM_VERSION,
  type BattleRngSnapshot,
} from "../rng";
import {
  assertCommandStarDistributionState,
} from "../cards/critical";
import {
  hasCommandCardRedistribution,
} from "../../effects/commandCardRedistribution";

/** Increment only with an explicit migration or replay compatibility policy. */
export const BATTLE_SUSPEND_SCHEMA_VERSION = 4 as const;
export const BATTLE_SUSPEND_SPEC_VERSION = "1.0.0" as const;
export const BATTLE_SUSPEND_DATA_SCHEMA_VERSION = "1.38.0" as const;
export const BATTLE_TURN_LOG_SCHEMA_VERSION = 2 as const;

const LEGACY_BATTLE_SUSPEND_SCHEMA_VERSION = 3 as const;
const LEGACY_BATTLE_SUSPEND_DATA_SCHEMA_VERSION = "1.36.0" as const;
const LEGACY_BATTLE_LOG_SCHEMA_VERSION = 4 as const;
const PRE_REDISTRIBUTION_DATA_SCHEMA_VERSION = "1.37.0" as const;

export interface BattleReplayTurnInput {
  cardIds: string[];
  ally?: BattleTurnAllyOptions;
  enemy?: {
    priorityRequests?: EnemyPrioritySkillRequest[];
  };
}

export interface BattleReplayMysticCodeSkillInput {
  kind: "mystic_code_skill";
  skillStableId: string;
  selectedTargetInstanceId?: string;
  orderChange?: MysticCodeOrderChangeSelection;
}

export interface BattleReplayAllySkillInput {
  kind: "ally_skill";
  sourceInstanceId: string;
  skillStableId: string;
  selectedTargetInstanceId?: string;
}

export type BattleReplayOperation =
  | BattleReplayTurnInput
  | BattleReplayAllySkillInput
  | BattleReplayMysticCodeSkillInput;

export interface BattleSessionInitialSnapshot {
  state: BattleState;
  rng: BattleRngSnapshot;
  counters: EffectRuntimeCounters;
}

export interface BattleSession {
  loop: BattleLoop;
  registry: BattleAttackDataRegistry;
  actionEffectRegistry?: BattleActionEffectDataRegistry;
  mysticCodeRegistry?: MysticCodeDataRegistry;
  initial: BattleSessionInitialSnapshot;
  operationHistory: BattleReplayOperation[];
  inputLogs: BattleLogBatch[];
  inputLogsComplete: boolean;
  turnLogs: BattleTurnLog[];
}

export interface CreateBattleSessionInput {
  state: BattleState;
  rng: BattleRng;
  registry: BattleAttackDataRegistry;
  actionEffectRegistry?: BattleActionEffectDataRegistry;
  mysticCodeRegistry?: MysticCodeDataRegistry;
  counters?: EffectRuntimeCounters;
}

export interface BattleSessionTurnResult {
  session: BattleSession;
  result: BattleLoopTurnResult;
}

export interface BattleSessionMysticCodeSkillResult {
  session: BattleSession;
  result: MysticCodeSkillUseResult;
}

export interface BattleSessionAllySkillResult {
  session: BattleSession;
  result: AllySkillUseResult;
}

interface BattleRegistrySaveData {
  combatants: CombatantAttackData[];
  affinities: AttackAffinityTables;
}

interface BattleActionEffectRegistrySaveData {
  combatants: CombatantActionEffectData[];
}

interface BattleMysticCodeRegistrySaveData {
  definitions: MysticCodeDefinition[];
}

export interface BattleLoopSuspendSnapshot {
  state: BattleState;
  rng: BattleRngSnapshot;
  counters: EffectRuntimeCounters;
}

/** JSON format for a player-input-boundary suspend save. */
export interface BattleSuspendSave {
  kind: "battle_suspend";
  schemaVersion: typeof BATTLE_SUSPEND_SCHEMA_VERSION;
  specVersion: typeof BATTLE_SUSPEND_SPEC_VERSION;
  dataSchemaVersion: typeof BATTLE_SUSPEND_DATA_SCHEMA_VERSION;
  rngAlgorithmVersion: typeof RNG_ALGORITHM_VERSION;
  battleLogSchemaVersion: typeof BATTLE_LOG_SCHEMA_VERSION;
  battleTurnLogSchemaVersion: typeof BATTLE_TURN_LOG_SCHEMA_VERSION;
  initial: BattleSessionInitialSnapshot;
  current: BattleLoopSuspendSnapshot;
  attackData: BattleRegistrySaveData;
  actionEffectData?: BattleActionEffectRegistrySaveData;
  mysticCodeData?: BattleMysticCodeRegistrySaveData;
  operationHistory: BattleReplayOperation[];
  inputLogs: BattleLogBatch[];
  inputLogsComplete: boolean;
  turnLogs: BattleTurnLog[];
}

function cloneJson<T>(value: T): T {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) {
    throw new RangeError("battle session value is not JSON serializable");
  }
  return JSON.parse(encoded) as T;
}

function assertCounters(counters: EffectRuntimeCounters): void {
  for (const [name, value] of Object.entries(counters)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new RangeError(`${name} must be a positive safe integer`);
    }
  }
}

function assertSelectedMysticCodeData(
  state: BattleState,
  registry: MysticCodeDataRegistry | undefined,
): void {
  const selected = state.loadout.mysticCode;
  if (!selected) return;
  const definition = registry
    ? mysticCodeDefinition(registry, selected.dataId)
    : null;
  if (
    !definition
    || definition.name !== selected.name
    || definition.levelPolicy !== selected.levelPolicy
    || definition.skills.some(
      (skill, index) => skill.stableId !== selected.skillStableIds[index],
    )
  ) {
    throw new RangeError(
      "selected Mystic Code data is missing or inconsistent",
    );
  }
}

function cloneLoopSnapshot(loop: BattleLoop): BattleLoopSuspendSnapshot {
  assertCounters(loop.counters);
  return cloneJson({
    state: loop.state,
    rng: loop.rng.snapshot(),
    counters: loop.counters,
  });
}

function saveAttackData(
  registry: BattleAttackDataRegistry,
): BattleRegistrySaveData {
  return cloneJson({
    combatants: Object.values(registry.byInstanceId),
    affinities: registry.affinities,
  });
}

function saveActionEffectData(
  registry: BattleActionEffectDataRegistry | undefined,
): BattleActionEffectRegistrySaveData | undefined {
  if (!registry) return undefined;
  return cloneJson({
    combatants: Object.values(registry.byInstanceId),
  });
}

function saveMysticCodeData(
  registry: MysticCodeDataRegistry | undefined,
): BattleMysticCodeRegistrySaveData | undefined {
  if (!registry) return undefined;
  return cloneJson({
    definitions: Object.values(registry.byDataId),
  });
}

function unsupportedSelectorError(): RangeError {
  return new RangeError(
    "function-based enemy selectors cannot be saved or replayed",
  );
}

function normalizeReplayTurnInput(
  input: BattleReplayTurnInput,
): BattleReplayTurnInput {
  if (!Array.isArray(input.cardIds)) {
    throw new RangeError("battle replay cardIds must be an array");
  }
  if (input.cardIds.some((cardId) => typeof cardId !== "string")) {
    throw new RangeError("battle replay cardIds must contain strings");
  }
  return cloneJson({
    cardIds: [...input.cardIds],
    ...(input.ally ? { ally: input.ally } : {}),
    ...(input.enemy?.priorityRequests
      ? { enemy: { priorityRequests: input.enemy.priorityRequests } }
      : {}),
  });
}

function normalizeReplayMysticCodeSkillInput(
  input: BattleReplayMysticCodeSkillInput,
): BattleReplayMysticCodeSkillInput {
  if (
    input.kind !== "mystic_code_skill"
    || typeof input.skillStableId !== "string"
    || input.skillStableId.length === 0
  ) {
    throw new RangeError("battle replay Mystic Code skill input is invalid");
  }
  if (
    input.selectedTargetInstanceId !== undefined
    && typeof input.selectedTargetInstanceId !== "string"
  ) {
    throw new RangeError("battle replay Mystic Code target is invalid");
  }
  if (
    input.orderChange
    && (
      typeof input.orderChange.frontlineInstanceId !== "string"
      || typeof input.orderChange.reserveInstanceId !== "string"
    )
  ) {
    throw new RangeError("battle replay order change selection is invalid");
  }
  return cloneJson(input);
}

function normalizeReplayAllySkillInput(
  input: BattleReplayAllySkillInput,
): BattleReplayAllySkillInput {
  if (
    input.kind !== "ally_skill"
    || typeof input.sourceInstanceId !== "string"
    || input.sourceInstanceId.length === 0
    || typeof input.skillStableId !== "string"
    || input.skillStableId.length === 0
  ) {
    throw new RangeError("battle replay ally skill input is invalid");
  }
  if (
    input.selectedTargetInstanceId !== undefined
    && typeof input.selectedTargetInstanceId !== "string"
  ) {
    throw new RangeError("battle replay ally skill target is invalid");
  }
  return cloneJson(input);
}

function isMysticCodeOperation(
  operation: BattleReplayOperation,
): operation is BattleReplayMysticCodeSkillInput {
  return "kind" in operation && operation.kind === "mystic_code_skill";
}

function isAllySkillOperation(
  operation: BattleReplayOperation,
): operation is BattleReplayAllySkillInput {
  return "kind" in operation && operation.kind === "ally_skill";
}

function normalizeReplayOperation(
  operation: BattleReplayOperation,
): BattleReplayOperation {
  if (isMysticCodeOperation(operation)) {
    return normalizeReplayMysticCodeSkillInput(operation);
  }
  if (isAllySkillOperation(operation)) {
    return normalizeReplayAllySkillInput(operation);
  }
  return normalizeReplayTurnInput(operation);
}

function assertReplayableEnemyOptions(
  enemy: BattleTurnEnemyOptions | undefined,
): void {
  if (!enemy) return;
  if (enemy.normalSelector || enemy.singleTargetSelector) {
    throw unsupportedSelectorError();
  }
}

function createSessionFromInitial(
  initial: BattleSessionInitialSnapshot,
  registry: BattleAttackDataRegistry,
  actionEffectRegistry: BattleActionEffectDataRegistry | undefined,
  mysticCodeRegistry: MysticCodeDataRegistry | undefined,
): BattleSession {
  assertCounters(initial.counters);
  assertBattleLoadoutState(initial.state);
  assertSelectedMysticCodeData(initial.state, mysticCodeRegistry);
  assertCommandStarDistributionState(initial.state, registry, true);
  const initialCopy = cloneJson(initial);
  const loop = createBattleLoop({
    state: cloneJson(initialCopy.state),
    rng: BattleRng.restore(initialCopy.rng),
    registry,
    counters: cloneJson(initialCopy.counters),
  });
  return {
    loop,
    registry,
    ...(actionEffectRegistry ? { actionEffectRegistry } : {}),
    ...(mysticCodeRegistry ? { mysticCodeRegistry } : {}),
    initial: initialCopy,
    operationHistory: [],
    inputLogs: [],
    inputLogsComplete: true,
    turnLogs: [],
  };
}

/**
 * Starts a session at an initial state without a command hand. The initial
 * state, all pre-draw RNG positions, and effect counters are retained so a
 * saved operation history can be replayed from exactly the same boundary.
 */
export function createBattleSession(
  input: CreateBattleSessionInput,
): BattleSession {
  assertCounters(input.counters ?? {
    nextInstanceNumber: 1,
    nextRegistrationOrder: 1,
  });
  return createSessionFromInitial({
    state: cloneJson(input.state),
    rng: input.rng.snapshot(),
    counters: cloneJson(input.counters ?? {
      nextInstanceNumber: 1,
      nextRegistrationOrder: 1,
    }),
  }, input.registry, input.actionEffectRegistry, input.mysticCodeRegistry);
}

/**
 * Resolves one user operation and accumulates its completed turn log. Invalid
 * card submissions are retained in replay history but intentionally add no
 * turn log because the battle engine did not execute a turn.
 */
export function resolveBattleSessionTurn(
  session: BattleSession,
  input: BattleReplayTurnInput & {
    enemy?: BattleTurnEnemyOptions;
  },
): BattleSessionTurnResult {
  assertReplayableEnemyOptions(input.enemy);
  const operation = normalizeReplayTurnInput(input);
  const result = resolveBattleLoopTurn(session.loop, {
    cardIds: operation.cardIds,
    registry: session.registry,
    ...(session.actionEffectRegistry
      ? { actionEffectRegistry: session.actionEffectRegistry }
      : {}),
    ...(operation.ally ? { ally: operation.ally } : {}),
    ...(operation.enemy ? { enemy: operation.enemy } : {}),
  });
  const nextSession: BattleSession = {
    ...session,
    loop: result.loop,
    operationHistory: [...session.operationHistory, operation],
    turnLogs: result.accepted
      ? [...session.turnLogs, cloneJson(result.resolution.battleLog)]
      : session.turnLogs,
  };
  return { session: nextSession, result };
}

function unchangedInputBoundary(state: BattleState): ActionBoundaryResult {
  if (state.phase !== "ally_action") {
    throw new RangeError("ally input log requires the ally action phase");
  }
  return {
    state,
    phase: "ally_action",
    allyReplacement: {
      state,
      events: [],
      cardDeckRebuildRequired: false,
    },
    enemyReplacement: {
      state,
      departures: [],
      arrivals: [],
      replacementDeferred: false,
    },
    previousEnemyTarget: null,
    nextEnemyTarget: null,
  };
}

function uniqueInstanceIds(values: readonly string[]): string[] {
  return [...new Set(values)];
}

interface CreateInputActionLogInput {
  session: BattleSession;
  afterState: BattleState;
  actor: {
    instanceId: string;
    dataId: string | null;
    name: string | null;
    side: "ally";
  };
  actionKind: "ally_skill" | "mystic_code_skill";
  stableId: string;
  name: string | null;
  accepted: boolean;
  rejectionReason?: string;
  targetInstanceIds: readonly string[];
  declaredEffects?: Parameters<typeof createBattleActionLogEntry>[0]["declaredEffectGroups"];
  boundary?: ActionBoundaryResult;
  directAllyExchange?: DirectAllyExchangeEvent | null;
  rngEvents: Parameters<typeof createBattleActionLogEntry>[0]["rngEvents"];
  setupRngEvents?: BattleLogBatch["setupRngEvents"];
}

function createInputActionLog(
  input: CreateInputActionLogInput,
): BattleLogBatch {
  const context = createBattleLogContext(input.session.loop.state);
  const operationNumber = input.session.operationHistory.length + 1;
  const batchId = `${battleLogBatchId(context, "ally_input")}:operation-${operationNumber}`;
  const unitIndex = new Map<string, BattleLogUnitRef>(
    createBattleLogUnitIndex(input.session.loop.state, input.afterState),
  );
  unitIndex.set(input.actor.instanceId, input.actor);
  const entry = createBattleActionLogEntry({
    batchId,
    context,
    unitIndex,
    side: "ally",
    actionNumber: operationNumber,
    actorInstanceId: input.actor.instanceId,
    action: {
      kind: input.actionKind,
      stage: "input",
      sequence: operationNumber,
      stableId: input.stableId,
      name: input.name,
      cardId: null,
      cardType: null,
    },
    outcome: input.accepted
      ? { status: "resolved", reasons: [], resolverCalled: true }
      : {
          status: "fizzled",
          reasons: input.rejectionReason ? [input.rejectionReason] : [],
          resolverCalled: false,
        },
    targetInstanceIds: uniqueInstanceIds(input.targetInstanceIds),
    calculation: null,
    overchargeStage: null,
    critical: null,
    declaredEffectGroups: input.declaredEffects ?? [],
    attackSequence: null,
    boundary: input.boundary ?? unchangedInputBoundary(input.session.loop.state),
    directAllyExchange: input.directAllyExchange ?? null,
    rngEvents: input.rngEvents,
  });
  return {
    schemaVersion: BATTLE_LOG_SCHEMA_VERSION,
    batchId,
    kind: "ally_input",
    context,
    status: input.accepted ? "completed" : "rejected",
    stopReason: input.accepted
      ? "input_action_resolved"
      : (input.rejectionReason ?? "input_action_rejected"),
    setupRngEvents: input.setupRngEvents ?? [],
    entries: [entry],
  };
}

function allySkillName(
  session: BattleSession,
  input: BattleReplayAllySkillInput,
): string | null {
  const source = findUnitLocation(
    session.loop.state.formation,
    input.sourceInstanceId,
  )?.unit;
  if (!source || !session.actionEffectRegistry) return null;
  const combatant = combatantActionEffectData(
    session.actionEffectRegistry,
    source,
  );
  return combatant
    ? battleActionEffectSequence(combatant, input.skillStableId)?.name ?? null
    : null;
}

function allySkillUsesCommandCardRedistribution(
  session: BattleSession,
  input: BattleReplayAllySkillInput,
): boolean {
  const source = findUnitLocation(
    session.loop.state.formation,
    input.sourceInstanceId,
  )?.unit;
  if (!source || !session.actionEffectRegistry) return false;
  const combatant = combatantActionEffectData(
    session.actionEffectRegistry,
    source,
  );
  const skill = combatant
    ? battleActionEffectSequence(combatant, input.skillStableId)
    : null;
  return Boolean(skill && hasCommandCardRedistribution(skill.effects));
}

function mysticCodeSkillUsesCommandCardRedistribution(
  session: BattleSession,
  input: BattleReplayMysticCodeSkillInput,
): boolean {
  const selected = session.loop.state.loadout.mysticCode;
  const definition = selected && session.mysticCodeRegistry
    ? mysticCodeDefinition(session.mysticCodeRegistry, selected.dataId)
    : null;
  const skill = definition?.skills.find(
    ({ stableId }) => stableId === input.skillStableId,
  );
  return Boolean(
    skill
    && skill.execution === "effects"
    && hasCommandCardRedistribution(skill.effects),
  );
}

function splitInputBoundaryRngEvents(
  events: Parameters<typeof createBattleActionLogEntry>[0]["rngEvents"],
): {
  setup: BattleLogBatch["setupRngEvents"];
  action: Parameters<typeof createBattleActionLogEntry>[0]["rngEvents"];
} {
  const captured = events ?? [];
  return {
    setup: mergeBattleLogRngEvents(
      captured.filter(({ stream }) =>
        stream === "cards" || stream === "critical"
      ),
    ),
    action: mergeBattleLogRngEvents(
      captured.filter(({ stream }) =>
        stream !== "cards" && stream !== "critical"
      ),
    ),
  };
}

/** Resolves, logs, and records one active Servant skill operation. */
export function resolveBattleSessionAllySkill(
  session: BattleSession,
  input: BattleReplayAllySkillInput,
): BattleSessionAllySkillResult {
  const operation = normalizeReplayAllySkillInput(input);
  const actionName = allySkillName(session, operation);
  const atomicRedistribution = allySkillUsesCommandCardRedistribution(
    session,
    operation,
  );
  const operationRng = atomicRedistribution
    ? BattleRng.restore(session.loop.rng.snapshot())
    : session.loop.rng;
  const captured = captureBattleLogRng(
    {
      cards: operationRng.stream("cards"),
      effects: operationRng.stream("effects"),
      critical: operationRng.stream("critical"),
    },
    () => session.actionEffectRegistry
      ? resolveAllySkillUse({
          state: session.loop.state,
          registry: session.actionEffectRegistry,
          sourceInstanceId: operation.sourceInstanceId,
          skillStableId: operation.skillStableId,
          ...(operation.selectedTargetInstanceId === undefined
            ? {}
            : { selectedTargetInstanceId: operation.selectedTargetInstanceId }),
          counters: session.loop.counters,
          rng: operationRng.stream("effects"),
          commandCards: {
            attackRegistry: session.registry,
            cardsRng: operationRng.stream("cards"),
            criticalRng: operationRng.stream("critical"),
          },
        })
      : {
          accepted: false as const,
          reason: "action_data_missing" as const,
          state: session.loop.state,
          counters: session.loop.counters,
        },
  );
  const result = captured.result;
  if (atomicRedistribution && !result.accepted) {
    return { session, result };
  }
  const rngEvents = splitInputBoundaryRngEvents(captured.events);
  const targetInstanceIds = result.accepted
    ? result.effects.effects.flatMap(({ targetInstanceIds: targets }) => targets)
    : operation.selectedTargetInstanceId
      ? [operation.selectedTargetInstanceId]
      : [];
  const inputLog = createInputActionLog({
    session,
    afterState: result.state,
    actor: {
      instanceId: operation.sourceInstanceId,
      dataId: findUnitLocation(
        session.loop.state.formation,
        operation.sourceInstanceId,
      )?.unit.dataId ?? null,
      name: findUnitLocation(
        session.loop.state.formation,
        operation.sourceInstanceId,
      )?.unit.name ?? null,
      side: "ally",
    },
    actionKind: "ally_skill",
    stableId: operation.skillStableId,
    name: result.accepted ? result.skill.name : actionName,
    accepted: result.accepted,
    ...(!result.accepted ? { rejectionReason: result.reason } : {}),
    targetInstanceIds,
    ...(result.accepted
      ? {
          declaredEffects: [{
            phase: "non_damaging" as const,
            result: result.effects,
          }],
          boundary: result.boundary,
        }
      : {}),
    rngEvents: rngEvents.action,
    setupRngEvents: rngEvents.setup,
  });
  return {
    session: {
      ...session,
      loop: {
        ...session.loop,
        state: result.state,
        counters: result.counters,
        rng: result.accepted ? operationRng : session.loop.rng,
      },
      operationHistory: [...session.operationHistory, operation],
      inputLogs: [...session.inputLogs, inputLog],
    },
    result,
  };
}

/** Resolves and records one Mystic Code skill operation for save/replay. */
export function resolveBattleSessionMysticCodeSkill(
  session: BattleSession,
  input: BattleReplayMysticCodeSkillInput,
): BattleSessionMysticCodeSkillResult {
  const operation = normalizeReplayMysticCodeSkillInput(input);
  const selectedMysticCode = session.loop.state.loadout.mysticCode;
  const definition = selectedMysticCode && session.mysticCodeRegistry
    ? mysticCodeDefinition(
        session.mysticCodeRegistry,
        selectedMysticCode.dataId,
      )
    : null;
  const actionName = definition?.skills.find(
    ({ stableId }) => stableId === operation.skillStableId,
  )?.name ?? null;
  const atomicRedistribution = mysticCodeSkillUsesCommandCardRedistribution(
    session,
    operation,
  );
  const operationRng = atomicRedistribution
    ? BattleRng.restore(session.loop.rng.snapshot())
    : session.loop.rng;
  const captured = captureBattleLogRng(
    {
      cards: operationRng.stream("cards"),
      effects: operationRng.stream("effects"),
      critical: operationRng.stream("critical"),
    },
    () => session.mysticCodeRegistry
      ? resolveMysticCodeSkillUse({
          state: session.loop.state,
          registry: session.mysticCodeRegistry,
          skillStableId: operation.skillStableId,
          ...(operation.selectedTargetInstanceId === undefined
            ? {}
            : { selectedTargetInstanceId: operation.selectedTargetInstanceId }),
          ...(operation.orderChange
            ? { orderChange: operation.orderChange }
            : {}),
          counters: session.loop.counters,
          rng: operationRng.stream("effects"),
          commandCards: {
            attackRegistry: session.registry,
            cardsRng: operationRng.stream("cards"),
            criticalRng: operationRng.stream("critical"),
          },
        })
      : {
          accepted: false as const,
          reason: "action_data_missing" as const,
          state: session.loop.state,
          counters: session.loop.counters,
        },
  );
  const result = captured.result;
  if (atomicRedistribution && !result.accepted) {
    return { session, result };
  }
  const rngEvents = splitInputBoundaryRngEvents(captured.events);
  const targetInstanceIds = result.accepted
    ? result.execution === "effects"
      ? result.effects.effects.flatMap(({ targetInstanceIds: targets }) => targets)
      : [
          result.exchange.event.frontlineInstanceId,
          result.exchange.event.reserveInstanceId,
        ]
    : operation.orderChange
      ? [
          operation.orderChange.frontlineInstanceId,
          operation.orderChange.reserveInstanceId,
        ]
      : operation.selectedTargetInstanceId
        ? [operation.selectedTargetInstanceId]
        : [];
  const actorInstanceId = `mystic-code:${selectedMysticCode?.dataId ?? "unselected"}`;
  const inputLog = createInputActionLog({
    session,
    afterState: result.state,
    actor: {
      instanceId: actorInstanceId,
      dataId: selectedMysticCode?.dataId ?? null,
      name: selectedMysticCode?.name ?? null,
      side: "ally",
    },
    actionKind: "mystic_code_skill",
    stableId: operation.skillStableId,
    name: result.accepted ? result.skill.name : actionName,
    accepted: result.accepted,
    ...(!result.accepted ? { rejectionReason: result.reason } : {}),
    targetInstanceIds,
    ...(result.accepted
      ? {
          declaredEffects: result.execution === "effects"
            ? [{ phase: "non_damaging" as const, result: result.effects }]
            : [],
          boundary: result.boundary,
          directAllyExchange: result.execution === "order_change"
            ? result.exchange.event
            : null,
        }
      : {}),
    rngEvents: rngEvents.action,
    setupRngEvents: rngEvents.setup,
  });
  return {
    session: {
      ...session,
      loop: {
        ...session.loop,
        state: result.state,
        counters: result.counters,
        rng: result.accepted ? operationRng : session.loop.rng,
      },
      operationHistory: [...session.operationHistory, operation],
      inputLogs: [...session.inputLogs, inputLog],
    },
    result,
  };
}

/** Creates a versioned JSON-safe suspend record at a player input boundary. */
export function createBattleSuspendSave(
  session: BattleSession,
): BattleSuspendSave {
  assertCommandStarDistributionState(session.initial.state, session.registry, true);
  assertCommandStarDistributionState(session.loop.state, session.registry);
  return cloneJson({
    kind: "battle_suspend" as const,
    schemaVersion: BATTLE_SUSPEND_SCHEMA_VERSION,
    specVersion: BATTLE_SUSPEND_SPEC_VERSION,
    dataSchemaVersion: BATTLE_SUSPEND_DATA_SCHEMA_VERSION,
    rngAlgorithmVersion: RNG_ALGORITHM_VERSION,
    battleLogSchemaVersion: BATTLE_LOG_SCHEMA_VERSION,
    battleTurnLogSchemaVersion: BATTLE_TURN_LOG_SCHEMA_VERSION,
    initial: session.initial,
    current: cloneLoopSnapshot(session.loop),
    attackData: saveAttackData(session.registry),
    ...(session.actionEffectRegistry
      ? { actionEffectData: saveActionEffectData(session.actionEffectRegistry) }
      : {}),
    ...(session.mysticCodeRegistry
      ? { mysticCodeData: saveMysticCodeData(session.mysticCodeRegistry) }
      : {}),
    operationHistory: session.operationHistory.map(normalizeReplayOperation),
    inputLogs: session.inputLogs,
    inputLogsComplete: session.inputLogsComplete,
    turnLogs: session.turnLogs,
  });
}

export function serializeBattleSuspendSave(session: BattleSession): string {
  return JSON.stringify(createBattleSuspendSave(session));
}

interface LegacyBattleSuspendSave extends Omit<
  BattleSuspendSave,
  | "schemaVersion"
  | "dataSchemaVersion"
  | "battleLogSchemaVersion"
  | "inputLogs"
  | "inputLogsComplete"
> {
  schemaVersion: typeof LEGACY_BATTLE_SUSPEND_SCHEMA_VERSION;
  dataSchemaVersion: typeof LEGACY_BATTLE_SUSPEND_DATA_SCHEMA_VERSION;
  battleLogSchemaVersion: typeof LEGACY_BATTLE_LOG_SCHEMA_VERSION;
}

interface PreRedistributionBattleSuspendSave extends Omit<
  BattleSuspendSave,
  "dataSchemaVersion"
> {
  dataSchemaVersion: typeof PRE_REDISTRIBUTION_DATA_SCHEMA_VERSION;
}

function addLegacyCommandStarDistribution(
  snapshot: BattleLoopSuspendSnapshot | BattleSessionInitialSnapshot,
): typeof snapshot {
  return {
    ...snapshot,
    state: {
      ...snapshot.state,
      commandStarDistributionMode: "legacy_on_command_confirmation",
      commandStarDistribution: null,
    },
  };
}

function assertLegacySaveHeader(save: LegacyBattleSuspendSave): void {
  if (
    save.kind !== "battle_suspend"
    || save.schemaVersion !== LEGACY_BATTLE_SUSPEND_SCHEMA_VERSION
    || save.specVersion !== BATTLE_SUSPEND_SPEC_VERSION
    || save.dataSchemaVersion !== LEGACY_BATTLE_SUSPEND_DATA_SCHEMA_VERSION
    || save.rngAlgorithmVersion !== RNG_ALGORITHM_VERSION
    || save.battleLogSchemaVersion !== LEGACY_BATTLE_LOG_SCHEMA_VERSION
    || save.battleTurnLogSchemaVersion !== BATTLE_TURN_LOG_SCHEMA_VERSION
  ) {
    throw new RangeError("unsupported legacy battle suspend format");
  }
}

function upgradeLegacyBattleLogBatch(batch: BattleLogBatch): BattleLogBatch {
  const legacy = cloneJson(batch) as unknown as {
    schemaVersion: number;
    entries: Array<{
      schemaVersion: number;
      boundary: Record<string, unknown>;
    }>;
  };
  legacy.schemaVersion = BATTLE_LOG_SCHEMA_VERSION;
  legacy.entries = legacy.entries.map((entry) => ({
    ...entry,
    schemaVersion: BATTLE_LOG_SCHEMA_VERSION,
    boundary: {
      ...entry.boundary,
      directAllyExchange: null,
    },
  }));
  return legacy as unknown as BattleLogBatch;
}

/**
 * Migrates format 3 without re-running effects or transitions. Historical
 * input-action logs did not exist in that format and remain explicitly
 * incomplete after migration.
 */
function migrateLegacyBattleSuspendSave(
  legacy: LegacyBattleSuspendSave,
): BattleSuspendSave {
  assertLegacySaveHeader(legacy);
  return cloneJson({
    ...legacy,
    schemaVersion: BATTLE_SUSPEND_SCHEMA_VERSION,
    dataSchemaVersion: BATTLE_SUSPEND_DATA_SCHEMA_VERSION,
    battleLogSchemaVersion: BATTLE_LOG_SCHEMA_VERSION,
    initial: addLegacyCommandStarDistribution(legacy.initial),
    current: addLegacyCommandStarDistribution(legacy.current),
    inputLogs: [],
    inputLogsComplete: false,
    turnLogs: legacy.turnLogs.map((turnLog) => ({
      ...turnLog,
      records: turnLog.records.map((record) =>
        record.recordType === "action_batch"
          ? {
              ...record,
              batch: upgradeLegacyBattleLogBatch(record.batch),
            }
          : record
      ),
    })),
  });
}

/** Adds only the explicit legacy allocation mode; no cards, stars, or RNG run. */
function migratePreRedistributionBattleSuspendSave(
  save: PreRedistributionBattleSuspendSave,
): BattleSuspendSave {
  if (
    save.kind !== "battle_suspend"
    || save.schemaVersion !== BATTLE_SUSPEND_SCHEMA_VERSION
    || save.specVersion !== BATTLE_SUSPEND_SPEC_VERSION
    || save.dataSchemaVersion !== PRE_REDISTRIBUTION_DATA_SCHEMA_VERSION
    || save.rngAlgorithmVersion !== RNG_ALGORITHM_VERSION
    || save.battleLogSchemaVersion !== BATTLE_LOG_SCHEMA_VERSION
    || save.battleTurnLogSchemaVersion !== BATTLE_TURN_LOG_SCHEMA_VERSION
  ) {
    throw new RangeError("unsupported pre-redistribution battle suspend format");
  }
  return cloneJson({
    ...save,
    dataSchemaVersion: BATTLE_SUSPEND_DATA_SCHEMA_VERSION,
    initial: addLegacyCommandStarDistribution(save.initial),
    current: addLegacyCommandStarDistribution(save.current),
  });
}

function assertSaveHeader(save: BattleSuspendSave): void {
  if (save.kind !== "battle_suspend") {
    throw new RangeError("unsupported battle save kind");
  }
  if (save.schemaVersion !== BATTLE_SUSPEND_SCHEMA_VERSION) {
    throw new RangeError("unsupported battle suspend schema version");
  }
  if (save.specVersion !== BATTLE_SUSPEND_SPEC_VERSION) {
    throw new RangeError("unsupported battle suspend spec version");
  }
  if (save.dataSchemaVersion !== BATTLE_SUSPEND_DATA_SCHEMA_VERSION) {
    throw new RangeError("unsupported battle suspend data schema version");
  }
  if (save.rngAlgorithmVersion !== RNG_ALGORITHM_VERSION) {
    throw new RangeError("unsupported battle suspend RNG algorithm version");
  }
  if (save.battleLogSchemaVersion !== BATTLE_LOG_SCHEMA_VERSION) {
    throw new RangeError("unsupported battle action-log schema version");
  }
  if (save.battleTurnLogSchemaVersion !== BATTLE_TURN_LOG_SCHEMA_VERSION) {
    throw new RangeError("unsupported battle turn-log schema version");
  }
}

function assertInputActionLogs(save: BattleSuspendSave): void {
  if (!Array.isArray(save.inputLogs) || typeof save.inputLogsComplete !== "boolean") {
    throw new RangeError("battle input-action logs are invalid");
  }
  for (const batch of save.inputLogs) {
    const entry = batch.entries?.[0];
    if (
      batch.schemaVersion !== BATTLE_LOG_SCHEMA_VERSION
      || batch.kind !== "ally_input"
      || !Array.isArray(batch.entries)
      || batch.entries.length !== 1
      || entry?.schemaVersion !== BATTLE_LOG_SCHEMA_VERSION
      || entry.side !== "ally"
      || entry.action.stage !== "input"
      || (
        entry.action.kind !== "ally_skill"
        && entry.action.kind !== "mystic_code_skill"
      )
    ) {
      throw new RangeError("battle input-action log batch is invalid");
    }
  }
}

function assertInputBoundarySnapshot(snapshot: BattleLoopSuspendSnapshot): void {
  assertCounters(snapshot.counters);
  BattleRng.restore(snapshot.rng);
  if (
    !snapshot.state
    || (snapshot.state.outcome === "ongoing"
      && snapshot.state.phase !== "ally_action")
    || (snapshot.state.outcome !== "ongoing"
      && snapshot.state.phase !== "finished")
  ) {
    throw new RangeError(
      "battle suspend state must be an ally input boundary or a finished battle",
    );
  }
  assertBattleLoadoutState(snapshot.state);
}

/**
 * Restores the current snapshot directly. It never recomputes log entries or
 * transitions; callers that need verification should use replayBattleSession.
 */
export function restoreBattleSession(save: BattleSuspendSave): BattleSession {
  assertSaveHeader(save);
  assertInputActionLogs(save);
  assertInputBoundarySnapshot(save.initial);
  assertInputBoundarySnapshot(save.current);
  const registry = createBattleAttackDataRegistry(
    cloneJson(save.attackData.combatants),
    cloneJson(save.attackData.affinities),
  );
  const actionEffectRegistry = save.actionEffectData
    ? createBattleActionEffectDataRegistry(
        cloneJson(save.actionEffectData.combatants),
      )
    : undefined;
  const mysticCodeRegistry = save.mysticCodeData
    ? createMysticCodeDataRegistry(
        cloneJson(save.mysticCodeData.definitions),
      )
    : undefined;
  assertSelectedMysticCodeData(save.initial.state, mysticCodeRegistry);
  assertSelectedMysticCodeData(save.current.state, mysticCodeRegistry);
  assertCommandStarDistributionState(save.initial.state, registry, true);
  assertCommandStarDistributionState(save.current.state, registry);
  const history = save.operationHistory.map(normalizeReplayOperation);
  const logs = cloneJson(save.turnLogs);
  return {
    loop: {
      state: cloneJson(save.current.state),
      rng: BattleRng.restore(save.current.rng),
      counters: cloneJson(save.current.counters),
    },
    registry,
    ...(actionEffectRegistry ? { actionEffectRegistry } : {}),
    ...(mysticCodeRegistry ? { mysticCodeRegistry } : {}),
    initial: cloneJson(save.initial),
    operationHistory: history,
    inputLogs: cloneJson(save.inputLogs),
    inputLogsComplete: save.inputLogsComplete,
    turnLogs: logs,
  };
}

/** Parses a serialized save and validates its versioned envelope. */
export function parseBattleSuspendSave(serialized: string): BattleSuspendSave {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new RangeError("battle suspend save is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RangeError("battle suspend save must be an object");
  }
  if (
    (parsed as { schemaVersion?: unknown }).schemaVersion
      === LEGACY_BATTLE_SUSPEND_SCHEMA_VERSION
  ) {
    const migrated = migrateLegacyBattleSuspendSave(
      parsed as LegacyBattleSuspendSave,
    );
    assertInputActionLogs(migrated);
    return migrated;
  }
  if (
    (parsed as { schemaVersion?: unknown }).schemaVersion
      === BATTLE_SUSPEND_SCHEMA_VERSION
    && (parsed as { dataSchemaVersion?: unknown }).dataSchemaVersion
      === PRE_REDISTRIBUTION_DATA_SCHEMA_VERSION
  ) {
    const migrated = migratePreRedistributionBattleSuspendSave(
      parsed as PreRedistributionBattleSuspendSave,
    );
    assertInputActionLogs(migrated);
    return migrated;
  }
  const save = parsed as BattleSuspendSave;
  assertSaveHeader(save);
  assertInputActionLogs(save);
  return cloneJson(save);
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, nested]) => [key, canonicalJson(nested)]),
    );
  }
  return value;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalJson(left))
    === JSON.stringify(canonicalJson(right));
}

/**
 * Rebuilds the session from its saved initial settings and operation history.
 * A mismatch against the saved current snapshot or accumulated logs is an
 * explicit error rather than a best-effort approximation.
 */
export function replayBattleSession(save: BattleSuspendSave): BattleSession {
  assertSaveHeader(save);
  const restored = restoreBattleSession(save);
  let replayed = createSessionFromInitial(
    restored.initial,
    restored.registry,
    restored.actionEffectRegistry,
    restored.mysticCodeRegistry,
  );
  for (const operation of restored.operationHistory) {
    if (isMysticCodeOperation(operation)) {
      replayed = resolveBattleSessionMysticCodeSkill(
        replayed,
        operation,
      ).session;
    } else if (isAllySkillOperation(operation)) {
      replayed = resolveBattleSessionAllySkill(replayed, operation).session;
    } else {
      replayed = resolveBattleSessionTurn(replayed, operation).session;
    }
  }
  const expected = cloneLoopSnapshot(restored.loop);
  const actual = cloneLoopSnapshot(replayed.loop);
  if (!sameJson(actual, expected)) {
    throw new RangeError(
      "battle replay diverged from the saved state or RNG snapshot",
    );
  }
  if (!sameJson(replayed.turnLogs, restored.turnLogs)) {
    throw new RangeError(
      "battle replay diverged from the saved completed-turn logs",
    );
  }
  if (
    restored.inputLogsComplete
    && !sameJson(replayed.inputLogs, restored.inputLogs)
  ) {
    throw new RangeError(
      "battle replay diverged from the saved input-action logs",
    );
  }
  return replayed;
}
