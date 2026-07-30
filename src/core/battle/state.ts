import { assertSafeInteger } from "../numeric";
import {
  createCommandCardDeck,
  type CommandCardDeckState,
} from "../cards/deck";
import { npCap } from "../../formulas/np";
import { assertValidFormation } from "./formation";
import type {
  BattleFormation,
  BattleSide,
  BattleUnitState,
  EnemyActionDefinition,
  SideFormation,
} from "./types";

export const ALLY_FRONTLINE_SIZE = 3 as const;
export const MAX_ALLY_ROSTER_SIZE = 6 as const;
export const MIN_WAVE_COUNT = 1 as const;
export const MAX_WAVE_COUNT = 3 as const;
export const MIN_ENEMY_COUNT_PER_WAVE = 1 as const;
export const MAX_ENEMY_COUNT_TOTAL = 99 as const;
export const MAX_ENEMY_HP_GAUGES = 10 as const;

export type EnemyFrontlineLimit = 3 | 6;
export type EnemyReplacementMode = "standard" | "immediate";

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
  enemyReplacementMode?: EnemyReplacementMode;
  mysticCodeCooldowns?: readonly number[];
}

export interface BattleState {
  formation: BattleFormation;
  enemyFrontlineLimit: EnemyFrontlineLimit;
  enemyReplacementMode: EnemyReplacementMode;
  /** Cooldowns of the three selected Mystic Code skills. */
  mysticCodeCooldowns: number[];
  commandDeck: CommandCardDeckState;
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

function normalizeEnemyUnitAction(
  unit: BattleUnitState,
): BattleUnitState {
  const action = unit.enemyAction;
  if (
    unit.side !== "enemy"
    || !action
    || action.noblePhantasm !== null
    || (action.charge === 0 && action.chargeMax === 0)
  ) {
    return unit;
  }
  return {
    ...unit,
    enemyAction: {
      ...action,
      charge: 0,
      chargeMax: 0,
    },
  };
}

function normalizeEnemyFormation(
  formation: SideFormation,
): SideFormation {
  return {
    frontline: formation.frontline.map((unit) =>
      unit ? normalizeEnemyUnitAction(unit) : null,
    ),
    reserve: formation.reserve.map(normalizeEnemyUnitAction),
  };
}

function copyWave(wave: BattleWaveState): BattleWaveState {
  return {
    enemy: normalizeEnemyFormation(copySideFormation(wave.enemy)),
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
  if (unit.breakPending || unit.lastBreakBattleTurn !== null) {
    throw new RangeError(
      `${label} must not start with break progress: ${unit.instanceId}`,
    );
  }
  if (unit.hpGaugeNumber !== 1) {
    throw new RangeError(
      `${label} must start on HP gauge 1: ${unit.instanceId}`,
    );
  }
}

function assertBreakState(unit: BattleUnitState, label: string): void {
  assertSafeInteger(unit.hpGaugeNumber, `${label} hpGaugeNumber`);
  if (unit.hpGaugeNumber < 1) {
    throw new RangeError(`${label} hpGaugeNumber must be positive`);
  }
  if (
    unit.hpGaugeNumber + unit.remainingBreakGauges.length
    > MAX_ENEMY_HP_GAUGES
  ) {
    throw new RangeError(
      `${label} must not exceed ${MAX_ENEMY_HP_GAUGES} total HP gauges`,
    );
  }
  for (const [index, gauge] of unit.remainingBreakGauges.entries()) {
    assertSafeInteger(gauge.maxHp, `${label} break gauge ${index + 1} maxHp`);
    if (gauge.maxHp <= 0) {
      throw new RangeError(
        `${label} break gauge ${index + 1} maxHp must be positive`,
      );
    }
  }
  if (unit.side === "ally") {
    if (
      unit.hpGaugeNumber !== 1
      || unit.remainingBreakGauges.length > 0
      || unit.breakPending
      || unit.lastBreakBattleTurn !== null
    ) {
      throw new RangeError(`${label} allies cannot have break gauges`);
    }
    return;
  }
  if (
    unit.breakPending
    && (
      !unit.alive
      || unit.hp !== 0
      || unit.remainingBreakGauges.length === 0
    )
  ) {
    throw new RangeError(
      `${label} pending break requires a living enemy at HP 0 with a next gauge`,
    );
  }
  if (unit.lastBreakBattleTurn !== null) {
    assertSafeInteger(
      unit.lastBreakBattleTurn,
      `${label} lastBreakBattleTurn`,
    );
    if (unit.lastBreakBattleTurn < 1) {
      throw new RangeError(
        `${label} lastBreakBattleTurn must be positive`,
      );
    }
  }
}

function assertSkillCooldowns(
  unit: BattleUnitState,
  label: string,
): void {
  for (const [index, cooldown] of unit.skillCooldowns.entries()) {
    assertSafeInteger(cooldown, `${label} skillCooldowns[${index}]`);
    if (cooldown < 0) {
      throw new RangeError(
        `${label} skillCooldowns[${index}] must not be negative`,
      );
    }
  }
}

function assertCommandCards(
  unit: BattleUnitState,
  label: string,
): void {
  if (unit.commandCards.length !== 5) {
    throw new RangeError(`${label} must have exactly 5 command cards`);
  }
  for (const [index, card] of unit.commandCards.entries()) {
    if (card !== "buster" && card !== "arts" && card !== "quick") {
      throw new RangeError(
        `${label} commandCards[${index}] is invalid`,
      );
    }
  }
}

function assertNoblePhantasm(
  unit: BattleUnitState,
  label: string,
): void {
  assertSafeInteger(unit.np, `${label} NP`);
  if (unit.np < 0) {
    throw new RangeError(`${label} NP must not be negative`);
  }
  const noblePhantasm = unit.noblePhantasm;
  if (!noblePhantasm) return;
  if (!noblePhantasm.stableId || !noblePhantasm.name) {
    throw new RangeError(
      `${label} noblePhantasm stableId and name are required`,
    );
  }
  if (
    noblePhantasm.cardType !== "buster"
    && noblePhantasm.cardType !== "arts"
    && noblePhantasm.cardType !== "quick"
  ) {
    throw new RangeError(`${label} noblePhantasm cardType is invalid`);
  }
  if (
    noblePhantasm.level !== 1
    && noblePhantasm.level !== 2
    && noblePhantasm.level !== 3
    && noblePhantasm.level !== 4
    && noblePhantasm.level !== 5
  ) {
    throw new RangeError(`${label} noblePhantasm level must be from 1 to 5`);
  }
  if (unit.np > npCap(noblePhantasm.level)) {
    throw new RangeError(
      `${label} NP exceeds the noblePhantasm level cap`,
    );
  }
}

function assertEnemyActionDefinition(
  action: EnemyActionDefinition,
  label: string,
): void {
  if (!action.stableId || !action.name) {
    throw new RangeError(`${label} stableId and name are required`);
  }
}

function assertEnemyActionState(
  unit: BattleUnitState,
  label: string,
): void {
  const action = unit.enemyAction;
  if (unit.side === "ally") {
    if (action !== null) {
      throw new RangeError(`${label} ally cannot have enemyAction data`);
    }
    return;
  }
  if (!action) return;
  if (
    action.maxActions !== "auto"
    && action.maxActions !== 1
    && action.maxActions !== 2
    && action.maxActions !== 3
  ) {
    throw new RangeError(
      `${label} enemyAction maxActions must be auto or 1 to 3`,
    );
  }
  if (action.normalAttack) {
    assertEnemyActionDefinition(
      action.normalAttack,
      `${label} normalAttack`,
    );
  }
  action.skills.forEach((skill, index) =>
    assertEnemyActionDefinition(
      skill,
      `${label} skills[${index}]`,
    ),
  );
  if (action.noblePhantasm) {
    assertEnemyActionDefinition(
      action.noblePhantasm,
      `${label} enemy noblePhantasm`,
    );
  }
  assertSafeInteger(action.charge, `${label} charge`);
  assertSafeInteger(action.chargeMax, `${label} chargeMax`);
  if (action.charge < 0 || action.chargeMax < 0) {
    throw new RangeError(
      `${label} enemy charge values must not be negative`,
    );
  }
  if (!action.noblePhantasm) {
    if (action.charge !== 0 || action.chargeMax !== 0) {
      throw new RangeError(
        `${label} enemy without noblePhantasm must have zero charge`,
      );
    }
    return;
  }
  if (action.chargeMax < 1) {
    throw new RangeError(
      `${label} enemy with noblePhantasm requires positive chargeMax`,
    );
  }
  if (action.charge > action.chargeMax) {
    throw new RangeError(
      `${label} enemy charge must not exceed chargeMax`,
    );
  }
}

function countPendingBreaks(formation: SideFormation): number {
  return listedUnits(formation).filter(({ breakPending }) => breakPending).length;
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

function assertEnemyReplacementMode(
  value: string,
): asserts value is EnemyReplacementMode {
  if (value !== "standard" && value !== "immediate") {
    throw new RangeError(
      "enemyReplacementMode must be standard or immediate",
    );
  }
}

function normalizeMysticCodeCooldowns(
  cooldowns: readonly number[] = [0, 0, 0],
): number[] {
  if (cooldowns.length !== 3) {
    throw new RangeError("mysticCodeCooldowns must contain 3 values");
  }
  return cooldowns.map((cooldown, index) => {
    assertSafeInteger(cooldown, `mysticCodeCooldowns[${index}]`);
    if (cooldown < 0) {
      throw new RangeError(
        `mysticCodeCooldowns[${index}] must not be negative`,
      );
    }
    return cooldown;
  });
}

function normalizeInitialWave(
  wave: BattleWaveInput,
  waveIndex: number,
  enemyFrontlineLimit: EnemyFrontlineLimit,
): BattleWaveState {
  const enemy = normalizeEnemyFormation(
    copySideFormation(wave.enemy),
  );
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
  for (const unit of listedUnits(formation.ally)) {
    assertBreakState(unit, `ally ${unit.instanceId}`);
    assertSkillCooldowns(unit, `ally ${unit.instanceId}`);
    assertCommandCards(unit, `ally ${unit.instanceId}`);
    assertNoblePhantasm(unit, `ally ${unit.instanceId}`);
    assertEnemyActionState(unit, `ally ${unit.instanceId}`);
  }
  for (const unit of listedUnits(formation.enemy)) {
    assertBreakState(unit, `enemy ${unit.instanceId}`);
    assertSkillCooldowns(unit, `enemy ${unit.instanceId}`);
    assertNoblePhantasm(unit, `enemy ${unit.instanceId}`);
    assertEnemyActionState(unit, `enemy ${unit.instanceId}`);
  }
  assertValidFormation(formation);
}

export function createBattleState(
  input: CreateBattleStateInput,
): BattleState {
  assertEnemyFrontlineLimit(input.enemyFrontlineLimit);
  const enemyReplacementMode = input.enemyReplacementMode ?? "standard";
  assertEnemyReplacementMode(enemyReplacementMode);
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
    enemyReplacementMode,
    mysticCodeCooldowns: normalizeMysticCodeCooldowns(
      input.mysticCodeCooldowns,
    ),
    commandDeck: createCommandCardDeck(formation.ally),
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
  const normalizedFormation: BattleFormation = {
    ally: formation.ally,
    enemy: normalizeEnemyFormation(formation.enemy),
  };
  assertCurrentFormation(
    normalizedFormation,
    state.enemyFrontlineLimit,
  );
  assertSameAllyRoster(
    state.formation.ally,
    normalizedFormation.ally,
  );
  assertUniqueInstanceIds(normalizedFormation.ally, [
    {
      enemy: normalizedFormation.enemy,
      continuation: state.waveContinuation,
    },
    ...state.remainingWaves,
  ]);
  const totalRemainingEnemyCount = [
    normalizedFormation.enemy,
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
  const pendingBreakDelta =
    countPendingBreaks(normalizedFormation.enemy)
    - countPendingBreaks(state.formation.enemy);
  const pendingBreaks =
    state.waveContinuation.pendingBreaks + pendingBreakDelta;
  if (pendingBreaks < 0) {
    throw new RangeError("pending break count cannot become negative");
  }
  return {
    ...state,
    formation: {
      ally: copySideFormation(normalizedFormation.ally),
      enemy: copySideFormation(normalizedFormation.enemy),
    },
    waveContinuation: {
      ...state.waveContinuation,
      pendingBreaks,
    },
  };
}

export function setWaveContinuation(
  state: BattleState,
  continuation: WaveContinuationState,
): BattleState {
  assertBattleOngoing(state);
  const normalized = normalizeContinuation(continuation);
  const representedPendingBreaks = countPendingBreaks(
    state.formation.enemy,
  );
  if (normalized.pendingBreaks < representedPendingBreaks) {
    throw new RangeError(
      "pendingBreaks cannot be smaller than pending enemy gauges",
    );
  }
  return {
    ...state,
    waveContinuation: normalized,
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
