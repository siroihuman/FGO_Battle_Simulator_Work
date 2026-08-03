import type { BattleUnitState } from "../core/battle/types";
import type { DeclaredActionEffect } from "./declarations";
import { assertValidDeclaredActionEffect } from "./declarations";

export interface BattlePassiveEffectGroup {
  stableId: string;
  name: string;
  effects: readonly DeclaredActionEffect[];
}

export interface BattleActionEffectSequence {
  stableId: string;
  name: string;
  kind: "skill" | "noble_phantasm";
  skillSlot?: 1 | 2 | 3;
  cooldownAtMax?: number;
  /** Position of the damaging attack among source-ordered effects. */
  attackOrder: number | null;
  effects: readonly DeclaredActionEffect[];
}

export interface CombatantActionEffectData {
  instanceId: string;
  dataId: string;
  passives: readonly BattlePassiveEffectGroup[];
  actions: readonly BattleActionEffectSequence[];
}

export interface BattleActionEffectDataRegistry {
  byInstanceId: Readonly<Record<string, CombatantActionEffectData>>;
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new RangeError(`${name} must not be empty`);
  }
}

function assertOrderedEffects(
  effects: readonly DeclaredActionEffect[],
  attackOrder: number | null,
  name: string,
  stableIds: Set<string>,
): void {
  const orders = effects.map(({ order }) => order);
  if (attackOrder !== null) orders.push(attackOrder);
  orders.sort((left, right) => left - right);
  if (
    orders.length === 0
    || orders.some((order, index) => order !== index + 1)
  ) {
    throw new RangeError(
      `${name} effect and attack order must be contiguous from 1`,
    );
  }
  effects.forEach((effect, index) => {
    assertNonEmpty(effect.stableId, `${name}.effects[${index}].stableId`);
    if (stableIds.has(effect.stableId)) {
      throw new RangeError(
        `duplicate action-effect stable ID: ${effect.stableId}`,
      );
    }
    stableIds.add(effect.stableId);
    assertValidDeclaredActionEffect(effect, `${name}.effects[${index}]`);
  });
}

function assertCombatant(data: CombatantActionEffectData): void {
  assertNonEmpty(data.instanceId, "instanceId");
  assertNonEmpty(data.dataId, `${data.instanceId}.dataId`);
  const stableIds = new Set<string>();
  const skillSlots = new Set<number>();
  data.passives.forEach((passive, index) => {
    assertNonEmpty(passive.stableId, `passives[${index}].stableId`);
    assertNonEmpty(passive.name, `passives[${index}].name`);
    if (stableIds.has(passive.stableId)) {
      throw new RangeError(
        `duplicate action-effect stable ID: ${passive.stableId}`,
      );
    }
    stableIds.add(passive.stableId);
    assertOrderedEffects(
      passive.effects,
      null,
      `passives[${index}]`,
      stableIds,
    );
  });
  data.actions.forEach((action, index) => {
    assertNonEmpty(action.stableId, `actions[${index}].stableId`);
    assertNonEmpty(action.name, `actions[${index}].name`);
    if (stableIds.has(action.stableId)) {
      throw new RangeError(
        `duplicate action-effect stable ID: ${action.stableId}`,
      );
    }
    stableIds.add(action.stableId);
    if (action.kind === "skill") {
      if (
        action.skillSlot === undefined
        || action.cooldownAtMax === undefined
        || action.attackOrder !== null
      ) {
        throw new RangeError(
          `${action.stableId} skill metadata is incomplete`,
        );
      }
      if (
        !Number.isSafeInteger(action.cooldownAtMax)
        || action.cooldownAtMax < 0
      ) {
        throw new RangeError(
          `${action.stableId}.cooldownAtMax must be non-negative`,
        );
      }
      if (skillSlots.has(action.skillSlot)) {
        throw new RangeError(
          `duplicate action-effect skill slot: ${action.skillSlot}`,
        );
      }
      skillSlots.add(action.skillSlot);
    } else if (
      action.skillSlot !== undefined
      || action.cooldownAtMax !== undefined
      || action.attackOrder === null
    ) {
      throw new RangeError(
        `${action.stableId} noble phantasm metadata is invalid`,
      );
    }
    assertOrderedEffects(
      action.effects,
      action.attackOrder,
      `actions[${index}]`,
      stableIds,
    );
  });
}

export function createBattleActionEffectDataRegistry(
  combatants: readonly CombatantActionEffectData[],
): BattleActionEffectDataRegistry {
  const byInstanceId: Record<string, CombatantActionEffectData> = {};
  for (const combatant of combatants) {
    assertCombatant(combatant);
    if (byInstanceId[combatant.instanceId]) {
      throw new RangeError(
        `duplicate action-effect instanceId: ${combatant.instanceId}`,
      );
    }
    byInstanceId[combatant.instanceId] = combatant;
  }
  return { byInstanceId };
}

export function combatantActionEffectData(
  registry: BattleActionEffectDataRegistry,
  unit: Pick<BattleUnitState, "instanceId" | "dataId">,
): CombatantActionEffectData | null {
  const data = registry.byInstanceId[unit.instanceId] ?? null;
  if (data && data.dataId !== unit.dataId) {
    throw new RangeError(
      `stale action-effect data for ${unit.instanceId}: ${data.dataId} != ${unit.dataId}`,
    );
  }
  return data;
}

export function battleActionEffectSequence(
  data: CombatantActionEffectData,
  stableId: string,
): BattleActionEffectSequence | null {
  return data.actions.find((action) => action.stableId === stableId) ?? null;
}

export function unresolvedActionEffectStableIds(
  data: CombatantActionEffectData,
): string[] {
  return [
    ...data.passives.flatMap(({ effects }) => effects),
    ...data.actions.flatMap(({ effects }) => effects),
  ].filter(({ action }) => action.kind === "unsupported")
    .map(({ stableId }) => stableId);
}
