import { assertSafeInteger } from "../numeric";
import { assertValidFormation } from "./formation";
import type {
  BattleFormation,
  BattleSide,
  BattleUnitState,
  SideFormation,
} from "./types";

export const ALLY_FRONTLINE_SIZE = 3 as const;
export const MAX_ALLY_ROSTER_SIZE = 6 as const;
export const MIN_WAVE_COUNT = 1 as const;
export const MAX_WAVE_COUNT = 3 as const;
export const MIN_ENEMY_COUNT_PER_WAVE = 1 as const;
export const MAX_ENEMY_COUNT_TOTAL = 99 as const;

export type EnemyFrontlineLimit = 3 | 6;

/**
 * The action phase is the part of a turn in which that side selects and
 * resolves actions. Turn-end phases are separate so their ordered settlement
 * can be implemented without allowing a caller to skip it accidentally.
 */
export type BattlePhase =
  | "ally_action"
  | "ally_turn_end"
  | "enemy_action"
  | "enemy_turn_end"
  | "finished";

export type BattleOutcome =
  | "ongoing"
  | "victory"
  | "defeat"
  | "retreat";

/**
 * Conditions outside the visible enemy formation that keep a Wave active.
 * The dedicated break, revival, and scheduled-addition engines will update
 * these counters as those systems are implemented.
 */
export interface WaveContinuationState {
  pendingBreaks: number;
  pendingRevives: number;
  pendingAdditions: number;
}

export interface BattleWaveInput {
  enemy: SideFormation;
  continuation?: Partial<WaveContinuationState>;
}

export interface BattleWaveState {
  enemy: SideFormation;
  continuation: WaveContinuationState;
}

export interface CreateBattleStateInput {
  ally: SideFormation;
  waves: readonly BattleWaveInput[];
  enemyFrontlineLimit: EnemyFrontlineLimit;
}

export interface BattleState {
  formation: BattleFormation;
  enemyFrontlineLimit: EnemyFrontlineLimit;
  remainingWaves: BattleWaveState[];
  /** One-based Wave number for UI and logs. */
  waveNumber: number;
  totalWaves: number;
  /**
   * Number of ally action phases that have started in the whole battle.
   * The initial ally action phase is turn 1.
   */
  battleTurn: number;
  /**
   * Number of ally action phases that have started in the current Wave.
   * A newly entered Wave starts at turn 1.
   */
  waveTurn: number;
  phase: BattlePhase;
  outcome: BattleOutcome;
  waveContinuation: WaveContinuationState;
}

export const EMPTY_WAVE_CONTINUATION: Readonly<WaveContinuationState> = {
  pendingBreaks: 0,
  pendingRevives: 0,
  pendingAdditions: 0,
};

function copySideFormation(formation: SideFormation): SideFormation {
  return {
    frontline: [...formation.frontline],
    reserve: [...formation.reserve],
  };
}

function copyWave(wave: BattleWaveState): BattleWaveState {
  return {
    enemy: copySideFormation(wave.enemy),
    continuation: { ...wave.continuation },
  };
}

function listedUnits(formation: SideFormation): BattleUnitState[] {
  return [
    ...formation.frontline.filter(
      (unit): unit is BattleUnitState => unit !== null,
    ),
    ...formation.reserve,
  ];
}

function assertSide(
  formation: SideFormation,
  expectedSide: BattleSide,
  label: string,
): void {
  for (const unit of listedUnits(formation)) {
    if (unit.side !== expectedSide) {
      throw new RangeError(
        `${label} contains ${unit.instanceId} on the wrong battle side`,
      );
    }
  }
}

function assertUniqueInstanceIds(
  ally: SideFormation,
  waves: readonly BattleWaveState[],
): void {
  const seen = new Set<string>();
  const register = (unit: BattleUnitState): void => {
    if (seen.has(unit.instanceId)) {
      throw new RangeError(`duplicate instanceId: ${unit.instanceId}`);
    }
    seen.add(unit.instanceId);
  };

  listedUnits(ally).forEach(register);
  for (const wave of waves) {
    listedUnits(wave.enemy).forEach(register);
  }
}

function assertSameAllyRoster(
  current: SideFormation,
  next: SideFormation,
): void {
  const currentIds = listedUnits(current)
    .map(({ instanceId }) => instanceId)
    .sort();
  const nextIds = listedUnits(next)
    .map(({ instanceId }) => instanceId)
    .sort();
  if (
    currentIds.length !== nextIds.length
    || currentIds.some((instanceId, index) => instanceId !== nextIds[index])
  ) {
    throw new RangeError("ally roster instanceIds cannot change during battle");
  }
}

function assertStartingUnit(unit: BattleUnitState, label: string): void {
  if (!unit.alive || unit.hp <= 0) {
    throw new RangeError(
      `${label} must start alive with positive HP: ${unit.instanceId}`,
    );
  }
}

function normalizeContinuation(
  continuation: Partial<WaveContinuationState> = {},
): WaveContinuationState {
  const normalized = {
    ...EMPTY_WAVE_CONTINUATION,
    ...continuation,
  };
  for (const [name, value] of Object.entries(normalized)) {
    assertSafeInteger(value, name);
    if (value < 0) {
      throw new RangeError(`${name} must not be negative`);
    }
  }
  return normalized;
}

function assertEnemyFrontlineLimit(
  value: number,
): asserts value is EnemyFrontlineLimit {
  if (value !== 3 && value !== 6) {
    throw new RangeError("enemyFrontlineLimit must be 3 or 6");
  }
}

function normalizeInitialWave(
  wave: BattleWaveInput,
  waveIndex: number,
  enemyFrontlineLimit: EnemyFrontlineLimit,
): BattleWaveState {
  const enemy = copySideFormation(wave.enemy);
  if (enemy.frontline.length !== enemyFrontlineLimit) {
    throw new RangeError(
      `wave ${waveIndex + 1} enemy frontline must have ${enemyFrontlineLimit} slots`,
    );
  }
  assertSide(enemy, "enemy", `wave ${waveIndex + 1}`);
  const enemies = listedUnits(enemy);
  if (enemies.length < MIN_ENEMY_COUNT_PER_WAVE) {
    throw new RangeError(
      `wave ${waveIndex + 1} must contain at least ${MIN_ENEMY_COUNT_PER_WAVE} enemy`,
    );
  }
  if (enemy.frontline.every((unit) => unit === null)) {
    throw new RangeError(
      `wave ${waveIndex + 1} must start with a frontline enemy`,
    );
  }
  enemies.forEach((unit) =>
    assertStartingUnit(unit, `wave ${waveIndex + 1} enemy`),
  );
  return {
    enemy,
    continuation: normalizeContinuation(wave.continuation),
  };
}

function assertCurrentFormation(
  formation: BattleFormation,
  enemyFrontlineLimit: EnemyFrontlineLimit,
): void {
  if (formation.ally.frontline.length !== ALLY_FRONTLINE_SIZE) {
    throw new RangeError(
      `ally frontline must retain ${ALLY_FRONTLINE_SIZE} slots`,
    );
  }
  if (formation.enemy.frontline.length !== enemyFrontlineLimit) {
    throw new RangeError(
      `enemy frontline must retain ${enemyFrontlineLimit} slots`,
    );
  }
  const allyCount = listedUnits(formation.ally).length;
  if (allyCount < ALLY_FRONTLINE_SIZE || allyCount > MAX_ALLY_ROSTER_SIZE) {
    throw new RangeError(
      `ally roster must retain from ${ALLY_FRONTLINE_SIZE} to ${MAX_ALLY_ROSTER_SIZE} units`,
    );
  }
  const enemyCount = listedUnits(formation.enemy).length;
  if (enemyCount > MAX_ENEMY_COUNT_TOTAL) {
    throw new RangeError(
      `current Wave enemy count must not exceed ${MAX_ENEMY_COUNT_TOTAL}`,
    );
  }
  assertValidFormation(formation);
}

export function createBattleState(
  input: CreateBattleStateInput,
): BattleState {
  assertEnemyFrontlineLimit(input.enemyFrontlineLimit);
  if (
    input.waves.length < MIN_WAVE_COUNT
    || input.waves.length > MAX_WAVE_COUNT
  ) {
    throw new RangeError(
      `wave count must be from ${MIN_WAVE_COUNT} to ${MAX_WAVE_COUNT}`,
    );
  }
  if (input.ally.frontline.length !== ALLY_FRONTLINE_SIZE) {
    throw new RangeError(
      `ally frontline must have ${ALLY_FRONTLINE_SIZE} slots`,
    );
  }
  if (input.ally.frontline.some((unit) => unit === null)) {
    throw new RangeError("all three ally frontline slots are required");
  }
  if (input.ally.reserve.length > MAX_ALLY_ROSTER_SIZE - ALLY_FRONTLINE_SIZE) {
    throw new RangeError("ally reserve must have at most 3 units");
  }
  assertSide(input.ally, "ally", "ally formation");
  listedUnits(input.ally).forEach((unit) =>
    assertStartingUnit(unit, "ally formation"),
  );

  const waves = input.waves.map((wave, index) =>
    normalizeInitialWave(wave, index, input.enemyFrontlineLimit),
  );
  const totalEnemyCount = waves.reduce(
    (total, wave) => total + listedUnits(wave.enemy).length,
    0,
  );
  if (totalEnemyCount > MAX_ENEMY_COUNT_TOTAL) {
    throw new RangeError(
      `total enemy count must not exceed ${MAX_ENEMY_COUNT_TOTAL}`,
    );
  }
  assertUniqueInstanceIds(input.ally, waves);
  const [currentWave, ...remainingWaves] = waves;
  const formation: BattleFormation = {
    ally: copySideFormation(input.ally),
    enemy: copySideFormation(currentWave.enemy),
  };
  assertCurrentFormation(formation, input.enemyFrontlineLimit);

  return {
    formation,
    enemyFrontlineLimit: input.enemyFrontlineLimit,
    remainingWaves: remainingWaves.map(copyWave),
    waveNumber: 1,
    totalWaves: waves.length,
    battleTurn: 1,
    waveTurn: 1,
    phase: "ally_action",
    outcome: "ongoing",
    waveContinuation: { ...currentWave.continuation },
  };
}

function assertBattleOngoing(state: BattleState): void {
  if (state.outcome !== "ongoing" || state.phase === "finished") {
    throw new RangeError("finished battles cannot be changed");
  }
}

/**
 * Replaces the formation after a skill, attack, death, or turn-end subsystem
 * has resolved it. This function checks structural battle invariants without
 * deciding replacements or survival itself.
 */
export function setBattleFormation(
  state: BattleState,
  formation: BattleFormation,
): BattleState {
  assertBattleOngoing(state);
  assertCurrentFormation(formation, state.enemyFrontlineLimit);
  assertSameAllyRoster(state.formation.ally, formation.ally);
  assertUniqueInstanceIds(formation.ally, [
    {
      enemy: formation.enemy,
      continuation: state.waveContinuation,
    },
    ...state.remainingWaves,
  ]);
  const totalRemainingEnemyCount = [
    formation.enemy,
    ...state.remainingWaves.map(({ enemy }) => enemy),
  ].reduce(
    (total, enemy) => total + listedUnits(enemy).length,
    0,
  );
  if (totalRemainingEnemyCount > MAX_ENEMY_COUNT_TOTAL) {
    throw new RangeError(
      `total remaining enemy count must not exceed ${MAX_ENEMY_COUNT_TOTAL}`,
    );
  }
  return {
    ...state,
    formation: {
      ally: copySideFormation(formation.ally),
      enemy: copySideFormation(formation.enemy),
    },
  };
}

export function setWaveContinuation(
  state: BattleState,
  continuation: WaveContinuationState,
): BattleState {
  assertBattleOngoing(state);
  return {
    ...state,
    waveContinuation: normalizeContinuation(continuation),
  };
}

export function hasLivingUnit(formation: SideFormation): boolean {
  return listedUnits(formation).some((unit) => unit.alive);
}

export function isCurrentWaveCleared(state: BattleState): boolean {
  return (
    !hasLivingUnit(state.formation.enemy)
    && state.waveContinuation.pendingBreaks === 0
    && state.waveContinuation.pendingRevives === 0
    && state.waveContinuation.pendingAdditions === 0
  );
}
