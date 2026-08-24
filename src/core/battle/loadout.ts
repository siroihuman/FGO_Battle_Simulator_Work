import type {
  CraftEssenceDataRegistry,
  CraftEssenceDefinition,
} from "../../data/craftEssences";
import type {
  MysticCodeDataRegistry,
  MysticCodeDefinition,
} from "../../data/mysticCodes";
import {
  createBattleActionEffectDataRegistry,
  type BattleActionEffectDataRegistry,
  type CombatantActionEffectData,
} from "../../effects/actionData";
import {
  initializeBattlePassives,
  type BattlePassiveInitializationResult,
} from "../../effects/actionExecution";
import type { EffectRuntimeCounters } from "../../effects/types";
import {
  createBattleAttackDataRegistry,
  type BattleAttackDataRegistry,
  type CombatantAttackData,
} from "./actionData";
import {
  findUnitLocation,
  orderedLocations,
  replaceUnit,
} from "./formation";
import {
  setBattleFormation,
  type BattleLoadoutState,
  type BattleState,
  type SelectedCraftEssenceState,
  type SelectedMysticCodeState,
} from "./state";
import type { BattleRng } from "../rng";

export interface BattleLoadoutSelection {
  mysticCodeDataId: string | null;
  /** Omit an ally instance ID to select no Craft Essence for that instance. */
  craftEssenceDataIdByInstanceId: Readonly<Record<string, string>>;
}

export interface InitializeBattleLoadoutInput {
  state: BattleState;
  rng: BattleRng;
  counters: EffectRuntimeCounters;
  attackRegistry: BattleAttackDataRegistry;
  actionEffectRegistry?: BattleActionEffectDataRegistry;
  mysticCodeRegistry?: MysticCodeDataRegistry;
  craftEssenceRegistry?: CraftEssenceDataRegistry;
  selection: BattleLoadoutSelection;
}

export interface BattleLoadoutInitializationResult {
  state: BattleState;
  counters: EffectRuntimeCounters;
  attackRegistry: BattleAttackDataRegistry;
  actionEffectRegistry?: BattleActionEffectDataRegistry;
  passiveInitialization: BattlePassiveInitializationResult | null;
  loadout: BattleLoadoutState;
}

interface ResolvedCraftEssenceSelection {
  instanceId: string;
  definition: CraftEssenceDefinition;
}

function fieldAuraEffect(
  effect: import("../../effects/declarations").DeclaredActionEffect,
  sourceInstanceId: string,
): import("../../effects/declarations").DeclaredActionEffect {
  if (effect.action.kind !== "apply_effects") {
    throw new RangeError("Craft Essence field effect must apply effects");
  }
  return {
    ...effect,
    action: {
      kind: "apply_effects",
      effects: effect.action.effects.map(({ template, ...application }) => ({
        ...application,
        template: {
          ...template,
          flags: {
            ...template.flags,
            fieldAuraSourceInstanceId: sourceInstanceId,
            fieldAuraBaseValue: template.value as number,
          },
        },
      })),
    },
  };
}

function checkedAddition(left: number, right: number, name: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} exceeds the supported integer range`);
  }
  return value;
}

function resolveMysticCode(
  dataId: string | null,
  registry: MysticCodeDataRegistry | undefined,
): MysticCodeDefinition | null {
  if (dataId === null) return null;
  const definition = registry?.byDataId[dataId];
  if (!definition) {
    throw new RangeError(`selected Mystic Code is not registered: ${dataId}`);
  }
  return definition;
}

function resolveCraftEssences(
  state: BattleState,
  selection: BattleLoadoutSelection,
  registry: CraftEssenceDataRegistry | undefined,
): ResolvedCraftEssenceSelection[] {
  const allyIds = orderedLocations(state.formation, "ally", true)
    .map(({ unit }) => unit.instanceId);
  const allyIdSet = new Set(allyIds);
  for (const instanceId of Object.keys(
    selection.craftEssenceDataIdByInstanceId,
  )) {
    if (!allyIdSet.has(instanceId)) {
      throw new RangeError(
        `Craft Essence selection is not an ally instance: ${instanceId}`,
      );
    }
  }
  return allyIds.flatMap((instanceId) => {
    if (!Object.prototype.hasOwnProperty.call(
      selection.craftEssenceDataIdByInstanceId,
      instanceId,
    )) {
      return [];
    }
    const dataId = selection.craftEssenceDataIdByInstanceId[instanceId];
    const definition = registry?.byDataId[dataId];
    if (!definition) {
      throw new RangeError(
        `selected Craft Essence is not registered: ${dataId}`,
      );
    }
    const unit = findUnitLocation(state.formation, instanceId)?.unit;
    if (!unit || unit.side !== "ally") {
      throw new RangeError(`equipped ally is missing: ${instanceId}`);
    }
    if (
      definition.eligibleServantDataIds !== undefined
      && !definition.eligibleServantDataIds.includes(unit.dataId)
    ) {
      throw new RangeError(
        `Craft Essence ${dataId} cannot be equipped by servant: ${unit.dataId}`,
      );
    }
    return [{ instanceId, definition }];
  });
}

function mysticCodeState(
  definition: MysticCodeDefinition | null,
): SelectedMysticCodeState | null {
  if (!definition) return null;
  const [skillOne, skillTwo, skillThree] = definition.skills;
  return {
    dataId: definition.dataId,
    name: definition.name,
    levelPolicy: definition.levelPolicy,
    skillStableIds: [
      skillOne.stableId,
      skillTwo.stableId,
      skillThree.stableId,
    ],
  };
}

function craftEssenceState(
  instanceId: string,
  definition: CraftEssenceDefinition,
): SelectedCraftEssenceState {
  return {
    instanceId,
    dataId: definition.dataId,
    name: definition.name,
    rarity: definition.rarity,
    limitBreak: definition.limitBreak,
    level: definition.level,
    attack: definition.attack,
    hp: definition.hp,
  };
}

function createLoadoutState(
  mysticCode: MysticCodeDefinition | null,
  craftEssences: readonly ResolvedCraftEssenceSelection[],
): BattleLoadoutState {
  const craftEssencesByInstanceId: Record<string, SelectedCraftEssenceState> = {};
  for (const { instanceId, definition } of craftEssences) {
    craftEssencesByInstanceId[instanceId] = craftEssenceState(
      instanceId,
      definition,
    );
  }
  return {
    initialized: true,
    mysticCode: mysticCodeState(mysticCode),
    craftEssencesByInstanceId,
  };
}

function adjustedAttackRegistry(
  state: BattleState,
  registry: BattleAttackDataRegistry,
  craftEssences: readonly ResolvedCraftEssenceSelection[],
): BattleAttackDataRegistry {
  const adjustments = new Map(
    craftEssences.map(({ instanceId, definition }) => [
      instanceId,
      definition.attack,
    ]),
  );
  for (const instanceId of adjustments.keys()) {
    const attackData = registry.byInstanceId[instanceId];
    if (!attackData) {
      throw new RangeError(
        `Craft Essence requires attack data for ally instance: ${instanceId}`,
      );
    }
    const unit = findUnitLocation(state.formation, instanceId)?.unit;
    if (!unit || attackData.dataId !== unit.dataId) {
      throw new RangeError(
        `stale attack data for equipped ally instance: ${instanceId}`,
      );
    }
  }
  const combatants: CombatantAttackData[] = Object.values(registry.byInstanceId)
    .map((combatant) => ({
      ...combatant,
      attack: checkedAddition(
        combatant.attack,
        adjustments.get(combatant.instanceId) ?? 0,
        `${combatant.instanceId} equipped attack`,
      ),
    }));
  return createBattleAttackDataRegistry(combatants, registry.affinities);
}

function combinedActionEffectRegistry(
  state: BattleState,
  registry: BattleActionEffectDataRegistry | undefined,
  craftEssences: readonly ResolvedCraftEssenceSelection[],
): BattleActionEffectDataRegistry | undefined {
  const byInstanceId = new Map<string, CombatantActionEffectData>(
    Object.values(registry?.byInstanceId ?? {}).map((data) => [
      data.instanceId,
      data,
    ]),
  );
  for (const { instanceId, definition } of craftEssences) {
    if (definition.startEffects.length === 0 && !definition.fieldEffects?.length) continue;
    const unit = findUnitLocation(state.formation, instanceId)?.unit;
    if (!unit) {
      throw new RangeError(`equipped ally is missing: ${instanceId}`);
    }
    const current = byInstanceId.get(instanceId) ?? {
      instanceId,
      dataId: unit.dataId,
      passives: [],
      actions: [],
    };
    if (current.dataId !== unit.dataId) {
      throw new RangeError(
        `stale action-effect data for equipped ally instance: ${instanceId}`,
      );
    }
    byInstanceId.set(instanceId, {
      ...current,
      passives: [
        ...current.passives,
        {
          stableId: `craft-essence-${definition.dataId}`,
          name: definition.name,
          effects: [
            ...definition.startEffects,
            ...(definition.fieldEffects ?? []).map((effect) =>
              fieldAuraEffect(effect, instanceId)
            ),
          ].map((effect, index) => ({ ...effect, order: index + 1 })),
        },
      ],
    });
  }
  if (byInstanceId.size === 0) return undefined;
  return createBattleActionEffectDataRegistry([...byInstanceId.values()]);
}

function assertStartPassivesSupported(
  registry: BattleActionEffectDataRegistry | undefined,
): void {
  if (!registry) return;
  const unsupported = Object.values(registry.byInstanceId)
    .flatMap(({ passives }) => passives)
    .flatMap(({ effects }) => effects)
    .filter(({ action }) => action.kind === "unsupported")
    .map(({ stableId }) => stableId);
  if (unsupported.length > 0) {
    throw new RangeError(
      `unsupported battle-start effects: ${unsupported.join(", ")}`,
    );
  }
}

function applyCraftEssenceHp(
  state: BattleState,
  craftEssences: readonly ResolvedCraftEssenceSelection[],
): BattleState {
  let formation = state.formation;
  for (const { instanceId, definition } of craftEssences) {
    const unit = findUnitLocation(formation, instanceId)?.unit;
    if (!unit || unit.side !== "ally") {
      throw new RangeError(`equipped ally is missing: ${instanceId}`);
    }
    formation = replaceUnit(formation, {
      ...unit,
      baseMaxHp: checkedAddition(
        unit.baseMaxHp,
        definition.hp,
        `${instanceId} equipped baseMaxHp`,
      ),
      maxHp: checkedAddition(
        unit.maxHp,
        definition.hp,
        `${instanceId} equipped maxHp`,
      ),
      hp: checkedAddition(
        unit.hp,
        definition.hp,
        `${instanceId} equipped hp`,
      ),
    });
  }
  return formation === state.formation
    ? state
    : setBattleFormation(state, formation);
}

/**
 * Resolves selected equipment, applies per-instance ATK/HP, then executes
 * class skills and Craft Essence start effects before the first card draw.
 * Every registry and unsupported-effect check is completed before RNG use.
 */
export function initializeBattleLoadout(
  input: InitializeBattleLoadoutInput,
): BattleLoadoutInitializationResult {
  if (
    input.state.outcome !== "ongoing"
    || input.state.phase !== "ally_action"
    || input.state.commandDeck.currentHand.length !== 0
  ) {
    throw new RangeError(
      "battle loadout must be initialized before the first card draw",
    );
  }
  if (input.state.loadout.initialized) {
    throw new RangeError("battle loadout has already been initialized");
  }

  const mysticCode = resolveMysticCode(
    input.selection.mysticCodeDataId,
    input.mysticCodeRegistry,
  );
  const craftEssences = resolveCraftEssences(
    input.state,
    input.selection,
    input.craftEssenceRegistry,
  );
  const attackRegistry = adjustedAttackRegistry(
    input.state,
    input.attackRegistry,
    craftEssences,
  );
  const actionEffectRegistry = combinedActionEffectRegistry(
    input.state,
    input.actionEffectRegistry,
    craftEssences,
  );
  assertStartPassivesSupported(actionEffectRegistry);
  const loadout = createLoadoutState(mysticCode, craftEssences);

  let state = applyCraftEssenceHp(input.state, craftEssences);
  state = {
    ...state,
    mysticCodeCooldowns: [0, 0, 0],
    loadout,
  };
  const passiveInitialization = actionEffectRegistry
    ? initializeBattlePassives(
        state,
        actionEffectRegistry,
        input.counters,
        input.rng.stream("effects"),
      )
    : null;
  const initializedState = passiveInitialization?.state ?? state;
  const auraRefreshedState = setBattleFormation(
    initializedState,
    initializedState.formation,
  );

  return {
    state: auraRefreshedState,
    counters: passiveInitialization?.counters ?? input.counters,
    attackRegistry,
    ...(actionEffectRegistry ? { actionEffectRegistry } : {}),
    passiveInitialization,
    loadout,
  };
}
