import type { EnemyPrioritySkillRequest } from "../../ai/enemyTurn";
import {
  createBattleActionEffectDataRegistry,
  type BattleActionEffectDataRegistry,
  type CombatantActionEffectData,
} from "../../effects/actionData";
import type { EffectRuntimeCounters } from "../../effects/types";
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
  assertBattleLoadoutState,
  type BattleState,
} from "./state";
import {
  BattleRng,
  RNG_ALGORITHM_VERSION,
  type BattleRngSnapshot,
} from "../rng";

/** Increment only with an explicit migration or replay compatibility policy. */
export const BATTLE_SUSPEND_SCHEMA_VERSION = 2 as const;
export const BATTLE_SUSPEND_SPEC_VERSION = "1.0.0" as const;
export const BATTLE_SUSPEND_DATA_SCHEMA_VERSION = "1.34.0" as const;
export const BATTLE_LOG_SCHEMA_VERSION = 4 as const;
export const BATTLE_TURN_LOG_SCHEMA_VERSION = 1 as const;

export interface BattleReplayTurnInput {
  cardIds: string[];
  ally?: BattleTurnAllyOptions;
  enemy?: {
    priorityRequests?: EnemyPrioritySkillRequest[];
  };
}

export interface BattleSessionInitialSnapshot {
  state: BattleState;
  rng: BattleRngSnapshot;
  counters: EffectRuntimeCounters;
}

export interface BattleSession {
  loop: BattleLoop;
  registry: BattleAttackDataRegistry;
  actionEffectRegistry?: BattleActionEffectDataRegistry;
  initial: BattleSessionInitialSnapshot;
  operationHistory: BattleReplayTurnInput[];
  turnLogs: BattleTurnLog[];
}

export interface CreateBattleSessionInput {
  state: BattleState;
  rng: BattleRng;
  registry: BattleAttackDataRegistry;
  actionEffectRegistry?: BattleActionEffectDataRegistry;
  counters?: EffectRuntimeCounters;
}

export interface BattleSessionTurnResult {
  session: BattleSession;
  result: BattleLoopTurnResult;
}

interface BattleRegistrySaveData {
  combatants: CombatantAttackData[];
  affinities: AttackAffinityTables;
}

interface BattleActionEffectRegistrySaveData {
  combatants: CombatantActionEffectData[];
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
  operationHistory: BattleReplayTurnInput[];
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

function assertReplayableEnemyOptions(
  enemy: BattleTurnEnemyOptions | undefined,
): void {
  if (!enemy) return;
  if (enemy.normalSelector || enemy.singleTargetSelector) {
    throw unsupportedSelectorError();
  }
}

function replayInputFromTurnInput(
  input: BattleReplayTurnInput,
): BattleReplayTurnInput {
  return normalizeReplayTurnInput(input);
}

function createSessionFromInitial(
  initial: BattleSessionInitialSnapshot,
  registry: BattleAttackDataRegistry,
  actionEffectRegistry: BattleActionEffectDataRegistry | undefined,
): BattleSession {
  assertCounters(initial.counters);
  const initialCopy = cloneJson(initial);
  const loop = createBattleLoop({
    state: cloneJson(initialCopy.state),
    rng: BattleRng.restore(initialCopy.rng),
    counters: cloneJson(initialCopy.counters),
  });
  return {
    loop,
    registry,
    ...(actionEffectRegistry ? { actionEffectRegistry } : {}),
    initial: initialCopy,
    operationHistory: [],
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
  }, input.registry, input.actionEffectRegistry);
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

/** Creates a versioned JSON-safe suspend record at a player input boundary. */
export function createBattleSuspendSave(
  session: BattleSession,
): BattleSuspendSave {
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
    operationHistory: session.operationHistory.map(replayInputFromTurnInput),
    turnLogs: session.turnLogs,
  });
}

export function serializeBattleSuspendSave(session: BattleSession): string {
  return JSON.stringify(createBattleSuspendSave(session));
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
  const history = save.operationHistory.map(replayInputFromTurnInput);
  const logs = cloneJson(save.turnLogs);
  return {
    loop: {
      state: cloneJson(save.current.state),
      rng: BattleRng.restore(save.current.rng),
      counters: cloneJson(save.current.counters),
    },
    registry,
    ...(actionEffectRegistry ? { actionEffectRegistry } : {}),
    initial: cloneJson(save.initial),
    operationHistory: history,
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
  const save = parsed as BattleSuspendSave;
  assertSaveHeader(save);
  return cloneJson(save);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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
  );
  for (const operation of restored.operationHistory) {
    replayed = resolveBattleSessionTurn(replayed, operation).session;
  }
  const expected = cloneLoopSnapshot(restored.loop);
  const actual = cloneLoopSnapshot(replayed.loop);
  if (
    !sameJson(actual, expected)
    || !sameJson(replayed.turnLogs, restored.turnLogs)
  ) {
    throw new RangeError(
      "battle replay diverged from the saved state or accumulated logs",
    );
  }
  return replayed;
}
