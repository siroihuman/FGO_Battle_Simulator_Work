import type {
  AttackCalculationData,
} from "./attackInput";
import type {
  AttackTargetDefenseResolution,
} from "../../effects/defense";
import type {
  LethalHpResolution,
} from "../../effects/survival";
import type {
  TriggerEventResolutionResult,
} from "../../effects/triggerExecution";
import type { CommonActionResult } from "../../effects/actions";
import type {
  DeclaredActionEffectGroupResult,
} from "../../effects/actionExecution";
import type {
  ActionBoundaryResult,
  EnemyTargetAnchor,
} from "./actionBoundary";
import type {
  DirectAllyExchangeEvent,
} from "./replacement";
import type {
  BattleAttackSequenceResolution,
} from "./attackSequence";
import type {
  BattleState,
} from "./state";
import type {
  BattleSide,
  BattleUnitState,
} from "./types";
import {
  RNG_STREAM_NAMES,
  type DeterministicRng,
  type RngAuditEvent,
  type RngStreamName,
} from "../rng";

export const BATTLE_LOG_SCHEMA_VERSION = 5 as const;

export type BattleLogBatchKind =
  | "ally_command"
  | "ally_input"
  | "enemy_turn";

export type BattleLogActionKind =
  | "normal_command"
  | "noble_phantasm"
  | "extra_attack"
  | "ally_skill"
  | "mystic_code_skill"
  | "enemy_normal_attack"
  | "enemy_skill"
  | "enemy_noble_phantasm";

export interface BattleLogContext {
  waveNumber: number;
  totalWaves: number;
  battleTurn: number;
  waveTurn: number;
  phase: "ally_action" | "enemy_action";
}

export interface BattleLogUnitRef {
  instanceId: string;
  dataId: string | null;
  name: string | null;
  side: BattleSide | null;
}

export type BattleLogUnitIndex = ReadonlyMap<
  string,
  BattleLogUnitRef
>;

export type BattleLogRngEvent = RngAuditEvent & {
  eventNumber: number;
  stream: RngStreamName;
};

export interface BattleLogRngCapture<T> {
  result: T;
  events: BattleLogRngEvent[];
}

export interface BattleLogActionDescriptor {
  kind: BattleLogActionKind;
  stage: "input" | "selected" | "extra" | "priority" | "normal";
  sequence: number;
  stableId: string | null;
  name: string | null;
  cardId: string | null;
  cardType: "quick" | "arts" | "buster" | "extra" | null;
}

export interface BattleLogActionOutcome {
  status: "resolved" | "fizzled" | "skipped";
  reasons: string[];
  resolverCalled: boolean;
}

export interface BattleLogCritical {
  cardId: string;
  assignedStars: number;
  starCriticalRatePermille: number;
  firstCardBonusPermille: number;
  ratePermille: number;
  rolled: boolean;
  isCritical: boolean;
}

export interface BattleLogProtection {
  effectInstanceId: string;
  effectStableId: string;
  kind: "evade" | "invincibility" | "solemn_defense";
  bypassed: boolean;
  consumedUse: boolean;
}

export interface BattleLogDefense {
  outcome: AttackTargetDefenseResolution["outcome"];
  damageAllowed: boolean;
  countsAsSuccessfulHit: boolean;
  postAttackEffectsContinue: boolean;
  protection: BattleLogProtection | null;
  sureHit: boolean;
  invincibilityPierce: boolean;
  ignoreDefense: boolean;
  defenseModPermille: number;
  specialDefenseModPermille: number;
  damageCut: number;
  targetFixedDamage: number;
  consumedTargetEffectInstanceIds: string[];
}

export interface BattleLogSurvival {
  outcome: LethalHpResolution["outcome"];
  consumedGutsUse: boolean;
  gutsEffectInstanceId: string | null;
  recoveryHp: number;
  deathTriggerAllowed: boolean;
}

export interface BattleLogHit {
  hitNumber: number;
  targetIndex: number;
  target: BattleLogUnitRef;
  plannedDamage: number;
  damage: number;
  actualHpLoss: number;
  hpBefore: number;
  hpAfter: number;
  overkillOrOvergauge: boolean;
  countsAsSuccessfulHit: boolean;
  attackProtectionBlocked: boolean;
  defense: BattleLogDefense | null;
  survival: BattleLogSurvival | null;
  star: {
    ratePermille: number;
    guaranteed: number;
    fractionalPermille: number;
    rolled: boolean;
    stars: number;
  } | null;
}

export interface BattleLogAttackTarget {
  targetIndex: number;
  target: BattleLogUnitRef;
  attackDefense: BattleLogDefense;
  damageRandomModifierPermille: number | null;
  damageBreakdown: {
    cardFactorPermille: number;
    cardTermNumerator: number;
    attackDefenseFactorPermille: number;
    specialDefenseFactorPermille: number;
    powerFactorPermille: number;
    specialDamageFactorPermille: number;
    damageBeforeFloorNumerator: string;
    damageBeforeFloorDenominator: string;
    damage: number;
  } | null;
  totalDamage: number;
  distributedDamage: number[];
  actualHpLoss: number;
  hpBefore: number;
  hpAfter: number;
  attackNp: {
    baseUnitsPerHit: number;
    normalHits: number;
    overkillHits: number;
    totalUnits: number;
  } | null;
  receivedNp: {
    baseUnitsPerHit: number;
    normalHits: number;
    overkillHits: number;
    totalUnits: number;
  } | null;
}

export interface BattleLogCommonActionResult {
  actionKind: string;
  outcome: "changed" | "unchanged" | "no_target";
  sourceInstanceId: string | null;
  targetInstanceId: string | null;
  hpChange: number | null;
  npChange: number | null;
  skillCooldownsBefore: number[] | null;
  skillCooldownsAfter: number[] | null;
  enemyChargeChange: number | null;
  applications: Array<{
    specIndex: number;
    stableId: string;
    outcome: "applied" | "resisted" | "immune" | "no_target";
    rate: {
      baseRatePermille: number;
      sourceModifierPermille: number;
      targetModifierPermille: number;
      resolvedRatePermille: number;
    } | null;
    appliedEffectInstanceId: string | null;
    immunityEffectInstanceId: string | null;
    consumedImmunityUse: boolean;
  }>;
  removals: Array<{
    effectInstanceId: string;
    effectStableId: string;
    outcome: "removed" | "resisted";
    resolvedRatePermille: number;
  }>;
  survival: BattleLogSurvival | null;
  instantDeath: {
    outcome: string;
    resolvedRatePermille: number | null;
    deathRollSucceeded: boolean;
    immunityEffectInstanceId: string | null;
    consumedImmunityUse: boolean;
    skipAttackHits: boolean;
  } | null;
}

export interface BattleLogDeclaredEffect {
  effectStableId: string;
  order: number;
  outcome: "resolved" | "no_target" | "unsupported";
  targetInstanceIds: string[];
  resolvedAmount: number | null;
  unsupportedMechanicId: string | null;
  starAddition: {
    bucket: "command" | "next_command";
    requested: number;
    before: number;
    added: number;
    after: number;
  } | null;
  commandCardRedistribution: {
    cycleBefore: number;
    cycleAfter: number;
    drawsInCycleBefore: number;
    drawsInCycleAfter: number;
    rebuildReason: "card_redistribution";
    previousHandCardIds: string[];
    newHandCardIds: string[];
    sourceCardCount: number;
    remainingCardCount: number;
    commandStarsBefore: number;
    commandStarsAfter: number;
    nextCommandStarsBefore: number;
    nextCommandStarsAfter: number;
    starDistribution: {
      commandStars: number;
      distributed: number;
      unassigned: number;
      cards: Array<{
        cardId: string;
        ownerInstanceId: string;
        cardIndex: number;
        cardType: "quick" | "arts" | "buster";
        baseWeight: number;
        starFocusModPermille: number;
        randomBonus: number;
        effectiveWeight: number;
        stars: number;
        criticalRatePermille: number;
      }>;
    } | null;
  } | null;
  results: BattleLogCommonActionResult[];
}

export interface BattleLogDeclaredEffectGroup {
  phase: DeclaredActionEffectGroupResult["phase"];
  sourceInstanceId: string;
  effects: BattleLogDeclaredEffect[];
  unresolvedEffectStableIds: string[];
}

export interface BattleLogTriggerStage {
  stageNumber: number;
  timing: string;
  actorInstanceId: string | null;
  targetInstanceId: string | null;
  hit: boolean | null;
  damage: number | null;
  attackKind: string | null;
  cardType: string | null;
  activations: Array<{
    ownerInstanceId: string;
    effectInstanceId: string;
    effectStableId: string;
    outcome: string;
    consumedUse: boolean;
    removedByUse: {
      effectInstanceId: string;
      reason: string;
    } | null;
    actions: Array<{
      actionIndex: number;
      actionKind: string;
      targetInstanceIds: string[];
      starAddition: {
        bucket: "command" | "next_command";
        requested: number;
        before: number;
        added: number;
        after: number;
      } | null;
      results: BattleLogCommonActionResult[];
    }>;
  }>;
}

export interface BattleLogAttack {
  stoppedBeforeHits: boolean;
  targetInstanceIds: string[];
  targets: BattleLogAttackTarget[];
  hits: BattleLogHit[];
  triggerStages: BattleLogTriggerStage[];
  totalCalculatedDamage: number;
  totalActualHpLoss: number;
  attackNpTotalUnits: number;
  receivedNpTotalUnits: number;
  generatedStars: number;
  starAddition: {
    bucket: "command" | "next_command";
    requested: number;
    before: number;
    added: number;
    after: number;
  } | null;
}

export interface BattleLogTargetTransition {
  outcome: "not_applicable" | "maintained" | "retargeted" | "cleared";
  previous: EnemyTargetAnchor | null;
  next: EnemyTargetAnchor | null;
}

export interface BattleLogBoundary {
  allyReplacements: Array<{
    frontlineIndex: number;
    defeated: BattleLogUnitRef;
    replacement: BattleLogUnitRef | null;
    replacementReserveIndex: number | null;
    defeatedMovedToReserve: true;
  }>;
  allyCardDeckRebuilt: boolean;
  enemyDepartures: Array<{
    area: "frontline" | "reserve";
    index: number;
    unit: BattleLogUnitRef;
  }>;
  enemyArrivals: Array<{
    frontlineIndex: number;
    reserveIndexBefore: number;
    unit: BattleLogUnitRef;
  }>;
  enemyReplacementDeferred: boolean;
  directAllyExchange: {
    frontlineIndex: number;
    reserveIndex: number;
    frontline: BattleLogUnitRef;
    reserve: BattleLogUnitRef;
    cardDeckRebuilt: false;
  } | null;
  targetTransition: BattleLogTargetTransition;
}

export interface BattleActionLogEntry {
  schemaVersion: typeof BATTLE_LOG_SCHEMA_VERSION;
  entryId: string;
  context: BattleLogContext;
  side: BattleSide;
  actionNumber: number;
  actor: BattleLogUnitRef;
  action: BattleLogActionDescriptor;
  outcome: BattleLogActionOutcome;
  targetsAtStart: BattleLogUnitRef[];
  calculation: AttackCalculationData | null;
  overchargeStage: number | null;
  critical: BattleLogCritical | null;
  declaredEffects: BattleLogDeclaredEffectGroup[];
  attack: BattleLogAttack | null;
  boundary: BattleLogBoundary;
  rngEvents: BattleLogRngEvent[];
}

export interface BattleLogBatch {
  schemaVersion: typeof BATTLE_LOG_SCHEMA_VERSION;
  batchId: string;
  kind: BattleLogBatchKind;
  context: BattleLogContext;
  status: "completed" | "rejected";
  stopReason: string;
  setupRngEvents: BattleLogRngEvent[];
  entries: BattleActionLogEntry[];
}

export interface CreateBattleActionLogEntryInput {
  batchId: string;
  context: BattleLogContext;
  unitIndex: BattleLogUnitIndex;
  side: BattleSide;
  actionNumber: number;
  actorInstanceId: string;
  action: BattleLogActionDescriptor;
  outcome: BattleLogActionOutcome;
  targetInstanceIds: readonly string[];
  calculation: AttackCalculationData | null;
  overchargeStage: number | null;
  critical: BattleLogCritical | null;
  declaredEffectGroups?: readonly DeclaredActionEffectGroupResult[];
  attackSequence: BattleAttackSequenceResolution | null;
  boundary: ActionBoundaryResult;
  directAllyExchange?: DirectAllyExchangeEvent | null;
  rngEvents?: readonly BattleLogRngEvent[];
}

function listedUnits(state: BattleState): BattleUnitState[] {
  return (["ally", "enemy"] as const).flatMap((side) => [
    ...state.formation[side].frontline.filter(
      (unit): unit is BattleUnitState => unit !== null,
    ),
    ...state.formation[side].reserve,
  ]);
}

export function createBattleLogContext(
  state: BattleState,
): BattleLogContext {
  if (
    state.phase !== "ally_action"
    && state.phase !== "enemy_action"
  ) {
    throw new RangeError(
      "battle action logs require an ally or enemy action phase",
    );
  }
  return {
    waveNumber: state.waveNumber,
    totalWaves: state.totalWaves,
    battleTurn: state.battleTurn,
    waveTurn: state.waveTurn,
    phase: state.phase,
  };
}

export function createBattleLogUnitIndex(
  ...states: readonly BattleState[]
): BattleLogUnitIndex {
  return new Map(
    states.flatMap((state) =>
      listedUnits(state).map((unit) => [
        unit.instanceId,
        {
          instanceId: unit.instanceId,
          dataId: unit.dataId,
          name: unit.name,
          side: unit.side,
        },
      ] as const)
    ),
  );
}

export function battleLogUnitRef(
  index: BattleLogUnitIndex,
  instanceId: string,
): BattleLogUnitRef {
  return index.get(instanceId) ?? {
    instanceId,
    dataId: null,
    name: null,
    side: null,
  };
}

export function captureBattleLogRng<T>(
  streams: Partial<Record<RngStreamName, DeterministicRng>>,
  operation: () => T,
): BattleLogRngCapture<T> {
  const events: BattleLogRngEvent[] = [];
  const removers = RNG_STREAM_NAMES.flatMap((stream) => {
    const rng = streams[stream];
    if (!rng) return [];
    return [
      rng.addAuditListener((event) => {
        events.push({
          ...event,
          eventNumber: events.length + 1,
          stream,
        });
      }),
    ];
  });
  try {
    return { result: operation(), events };
  } finally {
    removers.forEach((remove) => remove());
  }
}

export function mergeBattleLogRngEvents(
  ...groups: readonly (readonly BattleLogRngEvent[])[]
): BattleLogRngEvent[] {
  return groups.flat().map((event, index) => ({
    ...event,
    eventNumber: index + 1,
  }));
}

export function battleLogBatchId(
  context: BattleLogContext,
  kind: BattleLogBatchKind,
): string {
  return [
    `wave-${context.waveNumber}`,
    `battle-turn-${context.battleTurn}`,
    `wave-turn-${context.waveTurn}`,
    kind,
  ].join(":");
}

function defenseLog(
  defense: AttackTargetDefenseResolution | null,
): BattleLogDefense | null {
  if (!defense) return null;
  return {
    outcome: defense.outcome,
    damageAllowed: defense.damageAllowed,
    countsAsSuccessfulHit: defense.countsAsSuccessfulHit,
    postAttackEffectsContinue: defense.postAttackEffectsContinue,
    protection: defense.protection
      ? {
          effectInstanceId: defense.protection.effect.instanceId,
          effectStableId: defense.protection.effect.stableId,
          kind: defense.protection.kind,
          bypassed: defense.protection.bypassed,
          consumedUse: defense.protection.consumedUse,
        }
      : null,
    sureHit: defense.sureHit,
    invincibilityPierce: defense.invincibilityPierce,
    ignoreDefense: defense.ignoreDefense,
    defenseModPermille: defense.defenseModPermille,
    specialDefenseModPermille:
      defense.specialDefenseModPermille,
    damageCut: defense.damageCut,
    targetFixedDamage: defense.targetFixedDamage,
    consumedTargetEffectInstanceIds: [
      ...defense.consumedTargetEffectInstanceIds,
    ],
  };
}

function survivalLog(
  survival: LethalHpResolution | null | undefined,
): BattleLogSurvival | null {
  if (!survival) return null;
  return {
    outcome: survival.outcome,
    consumedGutsUse: survival.consumedGutsUse,
    gutsEffectInstanceId:
      survival.gutsEffect?.instanceId ?? null,
    recoveryHp: survival.recoveryHp,
    deathTriggerAllowed: survival.deathTriggerAllowed,
  };
}

export function createBattleLogCommonActionResult(
  result: CommonActionResult,
  fallbackTargetInstanceId: string | null,
): BattleLogCommonActionResult {
  return {
    actionKind: result.action.kind,
    outcome: result.outcome,
    sourceInstanceId: result.source?.instanceId ?? null,
    targetInstanceId:
      result.target?.instanceId ?? fallbackTargetInstanceId,
    hpChange: result.hpChange ?? null,
    npChange: result.npChange ?? null,
    skillCooldownsBefore:
      result.skillCooldownsBefore
        ? [...result.skillCooldownsBefore]
        : null,
    skillCooldownsAfter:
      result.skillCooldownsAfter
        ? [...result.skillCooldownsAfter]
        : null,
    enemyChargeChange: result.enemyChargeChange ?? null,
    applications: (result.applicationResults ?? []).map(
      (application) => ({
        specIndex: application.specIndex,
        stableId: application.stableId,
        outcome: application.outcome,
        rate: application.rate
          ? { ...application.rate }
          : null,
        appliedEffectInstanceId:
          application.appliedEffect?.instanceId ?? null,
        immunityEffectInstanceId:
          application.immunityEffectInstanceId ?? null,
        consumedImmunityUse:
          application.consumedImmunityUse ?? false,
      }),
    ),
    removals: (result.removalAttempts ?? []).map((attempt) => ({
      effectInstanceId: attempt.effect.instanceId,
      effectStableId: attempt.effect.stableId,
      outcome: attempt.outcome,
      resolvedRatePermille: attempt.resolvedRatePermille,
    })),
    survival: survivalLog(result.survivalResult),
    instantDeath: result.instantDeathResult
      ? {
          outcome: result.instantDeathResult.outcome,
          resolvedRatePermille:
            result.instantDeathResult.rate?.resolvedRatePermille
            ?? null,
          deathRollSucceeded:
            result.instantDeathResult.deathRollSucceeded,
          immunityEffectInstanceId:
            result.instantDeathResult.immunityEffect?.instanceId
            ?? null,
          consumedImmunityUse:
            result.instantDeathResult.consumedImmunityUse,
          skipAttackHits:
            result.instantDeathResult.skipAttackHits,
        }
      : null,
  };
}

function declaredEffectGroups(
  groups: readonly DeclaredActionEffectGroupResult[],
): BattleLogDeclaredEffectGroup[] {
  return groups.map(({ phase, result }) => ({
    phase,
    sourceInstanceId: result.sourceInstanceId,
    effects: result.effects.map((effect) => ({
      effectStableId: effect.effectStableId,
      order: effect.order,
      outcome: effect.outcome,
      targetInstanceIds: [...effect.targetInstanceIds],
      resolvedAmount: effect.resolvedAmount ?? null,
      unsupportedMechanicId:
        effect.unsupportedMechanicId ?? null,
      starAddition: effect.starAddition
        ? {
            bucket: effect.starAddition.bucket,
            requested: effect.starAddition.requested,
            before: effect.starAddition.before,
            added: effect.starAddition.added,
            after: effect.starAddition.after,
          }
        : null,
      commandCardRedistribution: effect.commandCardRedistribution
        ? {
            cycleBefore: effect.commandCardRedistribution.cycleBefore,
            cycleAfter: effect.commandCardRedistribution.cycleAfter,
            drawsInCycleBefore:
              effect.commandCardRedistribution.drawsInCycleBefore,
            drawsInCycleAfter:
              effect.commandCardRedistribution.drawsInCycleAfter,
            rebuildReason: "card_redistribution" as const,
            previousHandCardIds: [
              ...effect.commandCardRedistribution.previousHandCardIds,
            ],
            newHandCardIds: effect.commandCardRedistribution.hand.map(
              ({ cardId }) => cardId,
            ),
            sourceCardCount:
              effect.commandCardRedistribution.sourceCardCount,
            remainingCardCount:
              effect.commandCardRedistribution.remainingCardCount,
            commandStarsBefore:
              effect.commandCardRedistribution.commandStarsBefore,
            commandStarsAfter:
              effect.commandCardRedistribution.commandStarsAfter,
            nextCommandStarsBefore:
              effect.commandCardRedistribution.nextCommandStarsBefore,
            nextCommandStarsAfter:
              effect.commandCardRedistribution.nextCommandStarsAfter,
            starDistribution: effect.commandCardRedistribution.starDistribution
              ? {
                  commandStars:
                    effect.commandCardRedistribution.starDistribution.commandStars,
                  distributed:
                    effect.commandCardRedistribution.starDistribution.distributed,
                  unassigned:
                    effect.commandCardRedistribution.starDistribution.unassigned,
                  cards:
                    effect.commandCardRedistribution.starDistribution.cards.map(
                      (card) => ({ ...card }),
                    ),
                }
              : null,
          }
        : null,
      results: (effect.batch?.results ?? []).map(
        (item, index) => createBattleLogCommonActionResult(
          item,
          effect.targetInstanceIds[index] ?? null,
        ),
      ),
    })),
    unresolvedEffectStableIds: [
      ...result.unresolvedEffectStableIds,
    ],
  }));
}

export function createBattleLogTriggerStage(
  result: TriggerEventResolutionResult,
  stageNumber: number,
): BattleLogTriggerStage {
  return {
    stageNumber,
    timing: result.event.timing,
    actorInstanceId: result.event.actorInstanceId ?? null,
    targetInstanceId: result.event.targetInstanceId ?? null,
    hit: result.event.hit ?? null,
    damage: result.event.damage ?? null,
    attackKind: result.event.attackKind ?? null,
    cardType: result.event.cardType ?? null,
    activations: result.activations.map((activation) => ({
      ownerInstanceId: activation.ownerInstanceId,
      effectInstanceId: activation.effectInstanceId,
      effectStableId: activation.effectStableId,
      outcome: activation.outcome,
      consumedUse: activation.consumedUse,
      removedByUse: activation.removedByUse
        ? {
            effectInstanceId:
              activation.removedByUse.effect.instanceId,
            reason: activation.removedByUse.reason,
          }
        : null,
      actions: activation.actions.map((action) => ({
        actionIndex: action.actionIndex,
        actionKind: action.action.action.kind,
        targetInstanceIds: [...action.targetInstanceIds],
        starAddition: action.starAddition
          ? {
              bucket: action.starAddition.bucket,
              requested: action.starAddition.requested,
              before: action.starAddition.before,
              added: action.starAddition.added,
              after: action.starAddition.after,
            }
          : null,
        results: action.batch.results.map((resultItem, index) =>
          createBattleLogCommonActionResult(
            resultItem,
            action.targetInstanceIds[index] ?? null,
          )
        ),
      })),
    })),
  };
}

function triggerStages(
  resolution: BattleAttackSequenceResolution,
): BattleLogTriggerStage[] {
  const ordered = [
    ...(resolution.beforeAttack
      ? [resolution.beforeAttack]
      : []),
    ...resolution.hitTriggers,
    ...(resolution.onAttack ? [resolution.onAttack] : []),
    ...resolution.damageTaken,
    ...(resolution.afterAttack
      ? [resolution.afterAttack]
      : []),
    ...resolution.deaths,
  ];
  return ordered.map((trigger, index) =>
    createBattleLogTriggerStage(trigger, index + 1)
  );
}

function attackLog(
  resolution: BattleAttackSequenceResolution,
  targetInstanceIds: readonly string[],
  unitIndex: BattleLogUnitIndex,
): BattleLogAttack {
  const attack = resolution.attack?.attack ?? null;
  const hits = (attack?.hits ?? []).map((hit): BattleLogHit => ({
    hitNumber: hit.hitNumber,
    targetIndex: hit.targetIndex,
    target: battleLogUnitRef(unitIndex, hit.targetInstanceId),
    plannedDamage: hit.plannedDamage,
    damage: hit.damage,
    actualHpLoss: hit.actualHpLoss,
    hpBefore: hit.hpBefore,
    hpAfter: hit.hpAfter,
    overkillOrOvergauge: hit.overkillOrOvergauge,
    countsAsSuccessfulHit: hit.countsAsSuccessfulHit,
    attackProtectionBlocked: hit.attackProtectionBlocked,
    defense: defenseLog(hit.hitDefense),
    survival: survivalLog(hit.survival),
    star: hit.star ? { ...hit.star } : null,
  }));
  const targets = (attack?.targets ?? []).map((target) => {
    const targetHits = hits.filter(
      (hit) =>
        hit.target.instanceId === target.targetInstanceId,
    );
    const firstHit = targetHits[0];
    const lastHit = targetHits[targetHits.length - 1];
    const loggedDefense = defenseLog(target.attackDefense);
    if (!loggedDefense) {
      throw new RangeError("attack target defense is missing");
    }
    return {
      targetIndex: target.targetIndex,
      target: battleLogUnitRef(
        unitIndex,
        target.targetInstanceId,
      ),
      attackDefense: loggedDefense,
      damageRandomModifierPermille:
        target.damageRandomModifierPermille,
      damageBreakdown: target.damageBreakdown
        ? { ...target.damageBreakdown }
        : null,
      totalDamage: target.totalDamage,
      distributedDamage: [...target.distributedDamage],
      actualHpLoss: targetHits.reduce(
        (total, hit) => total + hit.actualHpLoss,
        0,
      ),
      hpBefore: firstHit?.hpBefore ?? target.target.hp,
      hpAfter: lastHit?.hpAfter ?? target.target.hp,
      attackNp: target.attackNp ? { ...target.attackNp } : null,
      receivedNp: target.receivedNp
        ? { ...target.receivedNp }
        : null,
    } satisfies BattleLogAttackTarget;
  });
  const starAddition = resolution.attack?.starAddition;
  return {
    stoppedBeforeHits: resolution.stoppedBeforeHits,
    targetInstanceIds: [...targetInstanceIds],
    targets,
    hits,
    triggerStages: triggerStages(resolution),
    totalCalculatedDamage: targets.reduce(
      (total, target) => total + target.totalDamage,
      0,
    ),
    totalActualHpLoss: targets.reduce(
      (total, target) => total + target.actualHpLoss,
      0,
    ),
    attackNpTotalUnits: attack?.attackNpTotalUnits ?? 0,
    receivedNpTotalUnits: targets.reduce(
      (total, target) =>
        total + (target.receivedNp?.totalUnits ?? 0),
      0,
    ),
    generatedStars: attack?.generatedStars ?? 0,
    starAddition: starAddition
      ? {
          bucket: starAddition.bucket,
          requested: starAddition.requested,
          before: starAddition.before,
          added: starAddition.added,
          after: starAddition.after,
        }
      : null,
  };
}

function targetTransition(
  previous: EnemyTargetAnchor | null,
  next: EnemyTargetAnchor | null,
): BattleLogTargetTransition {
  if (!previous) {
    return {
      outcome: "not_applicable",
      previous: null,
      next: null,
    };
  }
  if (!next) {
    return { outcome: "cleared", previous, next: null };
  }
  return {
    outcome:
      previous.instanceId === next.instanceId
        ? "maintained"
        : "retargeted",
    previous,
    next,
  };
}

function boundaryLog(
  boundary: ActionBoundaryResult,
  unitIndex: BattleLogUnitIndex,
  directAllyExchange: DirectAllyExchangeEvent | null = null,
): BattleLogBoundary {
  return {
    allyReplacements: boundary.allyReplacement.events.map((event) => ({
      frontlineIndex: event.frontlineIndex,
      defeated: battleLogUnitRef(
        unitIndex,
        event.defeatedInstanceId,
      ),
      replacement:
        event.replacementInstanceId === null
          ? null
          : battleLogUnitRef(
              unitIndex,
              event.replacementInstanceId,
            ),
      replacementReserveIndex: event.replacementReserveIndex,
      defeatedMovedToReserve: true,
    })),
    allyCardDeckRebuilt:
      boundary.allyReplacement.cardDeckRebuildRequired,
    enemyDepartures: boundary.enemyReplacement.departures.map(
      (departure) => ({
        area: departure.area,
        index: departure.index,
        unit: battleLogUnitRef(unitIndex, departure.instanceId),
      }),
    ),
    enemyArrivals: boundary.enemyReplacement.arrivals.map(
      (arrival) => ({
        frontlineIndex: arrival.frontlineIndex,
        reserveIndexBefore: arrival.reserveIndexBefore,
        unit: battleLogUnitRef(unitIndex, arrival.instanceId),
      }),
    ),
    enemyReplacementDeferred:
      boundary.enemyReplacement.replacementDeferred,
    directAllyExchange: directAllyExchange
      ? {
          frontlineIndex: directAllyExchange.frontlineIndex,
          reserveIndex: directAllyExchange.reserveIndex,
          frontline: battleLogUnitRef(
            unitIndex,
            directAllyExchange.frontlineInstanceId,
          ),
          reserve: battleLogUnitRef(
            unitIndex,
            directAllyExchange.reserveInstanceId,
          ),
          cardDeckRebuilt: false,
        }
      : null,
    targetTransition: targetTransition(
      boundary.previousEnemyTarget,
      boundary.nextEnemyTarget,
    ),
  };
}

export function createBattleActionLogEntry(
  input: CreateBattleActionLogEntryInput,
): BattleActionLogEntry {
  return {
    schemaVersion: BATTLE_LOG_SCHEMA_VERSION,
    entryId: `${input.batchId}:action-${input.actionNumber}`,
    context: input.context,
    side: input.side,
    actionNumber: input.actionNumber,
    actor: battleLogUnitRef(
      input.unitIndex,
      input.actorInstanceId,
    ),
    action: input.action,
    outcome: input.outcome,
    targetsAtStart: input.targetInstanceIds.map((instanceId) =>
      battleLogUnitRef(input.unitIndex, instanceId)
    ),
    calculation: input.calculation,
    overchargeStage: input.overchargeStage,
    critical: input.critical,
    declaredEffects: declaredEffectGroups(
      input.declaredEffectGroups ?? [],
    ),
    attack: input.attackSequence
      ? attackLog(
          input.attackSequence,
          input.targetInstanceIds,
          input.unitIndex,
        )
      : null,
    boundary: boundaryLog(
      input.boundary,
      input.unitIndex,
      input.directAllyExchange ?? null,
    ),
    rngEvents: [...(input.rngEvents ?? [])],
  };
}
