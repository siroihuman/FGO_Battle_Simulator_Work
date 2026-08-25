import {
  resolveAttackSourceDefense,
  resolveAttackTargetDefense,
  type AttackDefenseContext,
  type AttackSourceDefenseResolution,
  type AttackTargetDefenseResolution,
} from "../../effects/defense";
import {
  resolveLethalHp,
  type LethalHpResolution,
} from "../../effects/survival";
import {
  calculateDamage,
  type DamageBreakdown,
  type DamageInput,
} from "../../formulas/damage";
import { drawDamageRandom } from "../../formulas/damageRandom";
import { distributeDamageAcrossHits } from "../../formulas/hitDistribution";
import {
  addNp,
  calculateAttackNp,
  calculateReceivedNp,
  type AttackNpInput,
  type NoblePhantasmLevel,
  type NpCardResult,
  type ReceivedNpInput,
} from "../../formulas/np";
import {
  calculateStarRate,
  resolveStarsForHit,
  type StarHitResult,
  type StarRateInput,
} from "../../formulas/stars";
import { assertSafeInteger, toSafeNumber } from "../numeric";
import type { DeterministicRng } from "../rng";
import type { BattleUnitState } from "./types";

export type AttackDamageInput = Omit<
  DamageInput,
  | "randomModifierPermille"
  | "defenseModPermille"
  | "specialDefenseModPermille"
  | "targetFixedDamage"
>;

export type AttackNpTargetInput = Omit<
  AttackNpInput,
  "overkillOrOvergaugeByHit"
>;

export type ReceivedNpTargetInput = Omit<
  ReceivedNpInput,
  "overkillByHit"
>;

export type AttackStarTargetInput = Omit<
  StarRateInput,
  "isOverkillOrOvergauge"
>;

export interface AttackTargetInput {
  target: BattleUnitState;
  damage: AttackDamageInput;
  /**
   * Attack NP is calculated independently for every target, then all target
   * gains are added to the source once after the complete attack.
   */
  attackNp?: AttackNpTargetInput;
  /** Optional because enemies do not use the ally NP gauge. */
  receivedNp?: ReceivedNpTargetInput;
  receivedNpLevel?: NoblePhantasmLevel;
  /** Optional because enemy attacks do not generate critical stars. */
  stars?: AttackStarTargetInput;
}

export interface AttackRngStreams {
  effects: DeterministicRng;
  damage: DeterministicRng;
  stars: DeterministicRng;
}

export interface AttackHitBatchContext {
  hitNumber: number;
  source: BattleUnitState | null;
  targets: readonly BattleUnitState[];
  /** Results for this Hit in target order. */
  hits: readonly AttackHitResolution[];
}

export interface AttackHitBatchUpdate {
  source: BattleUnitState | null;
  targets: readonly BattleUnitState[];
}

export type AttackHitBatchHook = (
  context: AttackHitBatchContext,
) => AttackHitBatchUpdate;

export interface ResolveAttackInput {
  source: BattleUnitState | null;
  /**
   * Keep targets in frontline order. The resolver intentionally processes
   * Hit number first and target order second.
   */
  targets: readonly AttackTargetInput[];
  hitWeights: readonly number[];
  defense: Omit<AttackDefenseContext, "phase">;
  sourceNpLevel?: NoblePhantasmLevel;
  rng: AttackRngStreams;
  /**
   * Runs once after the current Hit has resolved against every target and
   * before the next Hit starts. It may update the same source and targets,
   * but cannot replace their identities or sides.
   */
  afterHitBatch?: AttackHitBatchHook;
}

export interface AttackHitResolution {
  hitNumber: number;
  targetIndex: number;
  targetInstanceId: string;
  plannedDamage: number;
  damage: number;
  actualHpLoss: number;
  hpBefore: number;
  hpAfter: number;
  overkillOrOvergauge: boolean;
  countsAsSuccessfulHit: boolean;
  attackProtectionBlocked: boolean;
  hitDefense: AttackTargetDefenseResolution | null;
  survival: LethalHpResolution | null;
  star: StarHitResult | null;
}

export interface AttackTargetResolution {
  targetIndex: number;
  targetInstanceId: string;
  target: BattleUnitState;
  attackDefense: AttackTargetDefenseResolution;
  damageRandomModifierPermille: number | null;
  damageBreakdown: DamageBreakdown | null;
  totalDamage: number;
  distributedDamage: number[];
  attackNp: NpCardResult | null;
  receivedNp: NpCardResult | null;
}

export interface AttackResolution {
  source: BattleUnitState | null;
  attackSourceDefense: AttackSourceDefenseResolution;
  targets: AttackTargetResolution[];
  /** Actual execution order: Hit 1 targets, Hit 2 targets, and so on. */
  hits: AttackHitResolution[];
  attackNpTotalUnits: number;
  generatedStars: number;
}

interface MutableTargetResolution {
  input: AttackTargetInput;
  target: BattleUnitState;
  attackDefense: AttackTargetDefenseResolution;
  damageRandomModifierPermille: number | null;
  damageBreakdown: DamageBreakdown | null;
  totalDamage: number;
  distributedDamage: number[];
  overkillOrOvergaugeByHit: boolean[];
  attackNp: NpCardResult | null;
  receivedNp: NpCardResult | null;
}

function assertAttackInput(input: ResolveAttackInput): void {
  if (input.targets.length === 0) {
    throw new RangeError("attack targets must not be empty");
  }
  const hasAttackNp = input.targets.some(
    ({ attackNp }) => attackNp !== undefined,
  );
  if (hasAttackNp && input.source === null) {
    throw new RangeError("attack NP gain requires an attack source");
  }
  if (
    hasAttackNp
    && input.sourceNpLevel === undefined
    && input.source?.noblePhantasm === null
  ) {
    throw new RangeError(
      "attack NP gain requires a noble phantasm level",
    );
  }
  const targetIds = new Set<string>();
  input.targets.forEach((targetInput, index) => {
    const { target } = targetInput;
    if (targetIds.has(target.instanceId)) {
      throw new RangeError(
        `duplicate attack target instanceId: ${target.instanceId}`,
      );
    }
    targetIds.add(target.instanceId);
    if (input.source?.instanceId === target.instanceId) {
      throw new RangeError(
        `attack source cannot also be targets[${index}]`,
      );
    }
    if (
      targetInput.receivedNp !== undefined
      && targetInput.receivedNpLevel === undefined
      && target.noblePhantasm === null
    ) {
      throw new RangeError(
        `received NP target ${target.instanceId} requires a noble phantasm level`,
      );
    }
  });
}

function applyHitBatchUpdate(
  currentSource: BattleUnitState | null,
  targets: readonly MutableTargetResolution[],
  update: AttackHitBatchUpdate,
): BattleUnitState | null {
  if (currentSource === null) {
    if (update.source !== null) {
      throw new RangeError(
        "after-Hit hook cannot add an attack source",
      );
    }
  } else if (
    update.source === null
    || update.source.instanceId !== currentSource.instanceId
    || update.source.side !== currentSource.side
  ) {
    throw new RangeError(
      "after-Hit hook cannot replace the attack source",
    );
  }
  if (update.targets.length !== targets.length) {
    throw new RangeError(
      "after-Hit hook must return every attack target",
    );
  }
  update.targets.forEach((target, index) => {
    const current = targets[index].target;
    if (
      target.instanceId !== current.instanceId
      || target.side !== current.side
    ) {
      throw new RangeError(
        "after-Hit hook cannot replace attack targets",
      );
    }
    targets[index].target = target;
  });
  return update.source;
}

function damageInputWithAttackDefense(
  input: AttackDamageInput,
  randomModifierPermille: number,
  defense: AttackTargetDefenseResolution,
): DamageInput {
  return {
    ...input,
    randomModifierPermille,
    defenseModPermille: defense.defenseModPermille,
    specialDefenseModPermille: defense.specialDefenseModPermille,
    targetFixedDamage: defense.targetFixedDamage,
  };
}

/**
 * Hit-scoped numeric defenses are applied after the documented whole-card
 * damage has been distributed. This preserves the exact total whenever no
 * Hit-scoped reducer is active while still allowing a one-Hit defense or cut
 * to affect only the Hit that consumed it.
 */
function applyHitScopedDamage(
  plannedDamage: number,
  defense: AttackTargetDefenseResolution,
): number {
  assertSafeInteger(plannedDamage, "plannedDamage");
  const defenseFactorPermille = Math.max(
    0,
    1000 - defense.defenseModPermille,
  );
  const specialDefenseFactorPermille = Math.max(
    0,
    1000 - defense.specialDefenseModPermille,
  );
  assertSafeInteger(defenseFactorPermille, "hit defense factor");
  assertSafeInteger(
    specialDefenseFactorPermille,
    "hit special defense factor",
  );
  const denominator = 1_000_000n;
  const numerator =
    BigInt(plannedDamage)
      * BigInt(defenseFactorPermille)
      * BigInt(specialDefenseFactorPermille)
    + BigInt(defense.targetFixedDamage) * denominator;
  return toSafeNumber(
    numerator <= 0n ? 0n : numerator / denominator,
    "Hit damage",
  );
}

function applyHitDamage(
  target: BattleUnitState,
  damage: number,
): {
  target: BattleUnitState;
  actualHpLoss: number;
  survival: LethalHpResolution | null;
} {
  if (damage <= 0 || !target.alive || target.hp <= 0) {
    return {
      target,
      actualHpLoss: 0,
      survival: null,
    };
  }
  const hpAfterDamage = Math.max(0, target.hp - damage);
  const damaged = {
    ...target,
    hp: hpAfterDamage,
  };
  const actualHpLoss = target.hp - hpAfterDamage;
  if (hpAfterDamage > 0) {
    return {
      target: damaged,
      actualHpLoss,
      survival: null,
    };
  }
  const survival = resolveLethalHp(damaged);
  return {
    target: survival.unit,
    actualHpLoss,
    survival,
  };
}

function resolvedNpLevel(
  explicit: NoblePhantasmLevel | undefined,
  unit: BattleUnitState,
  label: string,
): NoblePhantasmLevel {
  const level = explicit ?? unit.noblePhantasm?.level;
  if (level === undefined) {
    throw new RangeError(`${label} requires a noble phantasm level`);
  }
  return level;
}

/**
 * Resolves one complete damaging action against one or more fixed targets.
 *
 * Source-side attack states are consumed once per attack and once per emitted
 * Hit, target defenses are resolved per target, damage RNG is drawn once per
 * damage-allowed target, and Hit events run in Hit-major/frontline order.
 * Formation removal, replacement, trigger actions, and star inventory
 * settlement deliberately remain at the surrounding action layer.
 */
export function resolveAttack(input: ResolveAttackInput): AttackResolution {
  assertAttackInput(input);
  // Validates Hit weights before any state or RNG is consumed.
  distributeDamageAcrossHits(0, input.hitWeights);

  const attackContext: AttackDefenseContext = {
    ...input.defense,
    phase: "attack",
  };
  const attackSourceDefense = resolveAttackSourceDefense(
    input.source,
    attackContext,
  );
  let currentSource = attackSourceDefense.source;

  const targets: MutableTargetResolution[] = input.targets.map(
    (targetInput) => {
      const attackDefense = resolveAttackTargetDefense(
        targetInput.target,
        attackContext,
        attackSourceDefense,
        input.rng.effects,
        attackSourceDefense.source,
      );
      if (!attackDefense.damageAllowed) {
        return {
          input: targetInput,
          target: attackDefense.target,
          attackDefense,
          damageRandomModifierPermille: null,
          damageBreakdown: null,
          totalDamage: 0,
          distributedDamage: input.hitWeights.map(() => 0),
          overkillOrOvergaugeByHit: [],
          attackNp: null,
          receivedNp: null,
        };
      }
      const damageRandomModifierPermille = drawDamageRandom(
        input.rng.damage,
      );
      const damageBreakdown = calculateDamage(
        damageInputWithAttackDefense(
          targetInput.damage,
          damageRandomModifierPermille,
          attackDefense,
        ),
      );
      return {
        input: targetInput,
        target: attackDefense.target,
        attackDefense,
        damageRandomModifierPermille,
        damageBreakdown,
        totalDamage: damageBreakdown.damage,
        distributedDamage: distributeDamageAcrossHits(
          damageBreakdown.damage,
          input.hitWeights,
        ),
        overkillOrOvergaugeByHit: [],
        attackNp: null,
        receivedNp: null,
      };
    },
  );

  const hits: AttackHitResolution[] = [];
  let generatedStars = 0;

  for (let hitIndex = 0; hitIndex < input.hitWeights.length; hitIndex += 1) {
    const firstHitResultIndex = hits.length;
    const hitContext: AttackDefenseContext = {
      ...input.defense,
      phase: "hit",
      sureHit: attackSourceDefense.sureHit,
      invincibilityPierce:
        attackSourceDefense.invincibilityPierce,
      ignoreDefense: attackSourceDefense.ignoreDefense,
    };
    const hitSourceDefense = resolveAttackSourceDefense(
      currentSource,
      hitContext,
    );
    currentSource = hitSourceDefense.source;

    for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
      const current = targets[targetIndex];
      const hpBefore = current.target.hp;
      const alreadyOverkillOrOvergauge =
        !current.target.alive
        || current.target.breakPending
        || current.target.hp <= 0;
      let hitDefense: AttackTargetDefenseResolution | null = null;
      let damage = 0;
      let countsAsSuccessfulHit = false;

      if (current.attackDefense.damageAllowed) {
        hitDefense = resolveAttackTargetDefense(
          current.target,
          hitContext,
          hitSourceDefense,
          input.rng.effects,
          hitSourceDefense.source,
        );
        current.target = hitDefense.target;
        countsAsSuccessfulHit = hitDefense.countsAsSuccessfulHit;
        if (hitDefense.damageAllowed) {
          damage = applyHitScopedDamage(
            current.distributedDamage[hitIndex],
            hitDefense,
          );
        }
      }

      const applied = applyHitDamage(current.target, damage);
      current.target = applied.target;
      const becameLethal = applied.survival !== null;
      const overkillOrOvergauge =
        alreadyOverkillOrOvergauge || becameLethal;
      current.overkillOrOvergaugeByHit.push(
        overkillOrOvergauge,
      );

      let star: StarHitResult | null = null;
      if (current.input.stars) {
        const rate = calculateStarRate({
          ...current.input.stars,
          isOverkillOrOvergauge: overkillOrOvergauge,
        });
        star = resolveStarsForHit(rate, input.rng.stars);
        generatedStars += star.stars;
        assertSafeInteger(generatedStars, "generatedStars");
      }

      hits.push({
        hitNumber: hitIndex + 1,
        targetIndex,
        targetInstanceId: current.target.instanceId,
        plannedDamage: current.distributedDamage[hitIndex],
        damage,
        actualHpLoss: applied.actualHpLoss,
        hpBefore,
        hpAfter: current.target.hp,
        overkillOrOvergauge,
        countsAsSuccessfulHit,
        attackProtectionBlocked:
          !current.attackDefense.damageAllowed,
        hitDefense,
        survival: applied.survival,
        star,
      });
    }

    if (input.afterHitBatch) {
      const update = input.afterHitBatch({
        hitNumber: hitIndex + 1,
        source: currentSource,
        targets: targets.map(({ target }) => target),
        hits: hits.slice(firstHitResultIndex),
      });
      currentSource = applyHitBatchUpdate(
        currentSource,
        targets,
        update,
      );
    }
  }

  let attackNpTotalUnits = 0;
  for (const current of targets) {
    if (current.input.attackNp) {
      current.attackNp = calculateAttackNp({
        ...current.input.attackNp,
        overkillOrOvergaugeByHit:
          current.overkillOrOvergaugeByHit,
      });
      attackNpTotalUnits += current.attackNp.totalUnits;
      assertSafeInteger(attackNpTotalUnits, "attackNpTotalUnits");
    }
    if (current.input.receivedNp) {
      current.receivedNp = calculateReceivedNp({
        ...current.input.receivedNp,
        overkillByHit: current.overkillOrOvergaugeByHit,
      });
      const level = resolvedNpLevel(
        current.input.receivedNpLevel,
        current.target,
        `received NP target ${current.target.instanceId}`,
      );
      current.target = {
        ...current.target,
        np: addNp(
          current.target.np,
          current.receivedNp.totalUnits,
          level,
        ),
      };
    }
  }

  if (attackNpTotalUnits > 0) {
    if (!currentSource) {
      throw new RangeError("attack NP gain requires an attack source");
    }
    const level = resolvedNpLevel(
      input.sourceNpLevel,
      currentSource,
      `attack NP source ${currentSource.instanceId}`,
    );
    currentSource = {
      ...currentSource,
      np: addNp(
        currentSource.np,
        attackNpTotalUnits,
        level,
      ),
    };
  }

  return {
    source: currentSource,
    attackSourceDefense,
    targets: targets.map((current, targetIndex) => ({
      targetIndex,
      targetInstanceId: current.target.instanceId,
      target: current.target,
      attackDefense: current.attackDefense,
      damageRandomModifierPermille:
        current.damageRandomModifierPermille,
      damageBreakdown: current.damageBreakdown,
      totalDamage: current.totalDamage,
      distributedDamage: current.distributedDamage,
      attackNp: current.attackNp,
      receivedNp: current.receivedNp,
    })),
    hits,
    attackNpTotalUnits,
    generatedStars,
  };
}
