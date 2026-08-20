import {
  createBattleAttackDataRegistry,
} from "../core/battle/actionData";
import {
  initializeBattleLoadout,
  type BattleLoadoutSelection,
} from "../core/battle/loadout";
import {
  createBattleSession,
  type BattleSession,
} from "../core/battle/session";
import { createBattleState } from "../core/battle/state";
import { BattleRng } from "../core/rng";
import {
  INITIAL_CRAFT_ESSENCE_REGISTRY,
} from "../data/craftEssences";
import {
  EMBER_GATHERING_SABER_EXTREME,
  INITIAL_ENEMY_ENCOUNTER_REGISTRY,
  INITIAL_ENEMY_REGISTRY,
  createEnemyEncounterBattleData,
  enemyEncounterDefinition,
} from "../data/enemies";
import {
  INITIAL_MYSTIC_CODE_REGISTRY,
} from "../data/mysticCodes";
import {
  INITIAL_SERVANT_DEFINITIONS,
  createServantBattleInstance,
  createServantDataRegistry,
  servantDefinition,
  type ServantLevel,
} from "../data/servants";
import {
  createBattleActionEffectDataRegistry,
} from "../effects/actionData";
import { createEffectRuntimeCounters } from "../effects/runtime";
import type { NoblePhantasmLevel } from "../formulas/np";

export const INITIAL_ENEMY_ENCOUNTER_DATA_ID =
  EMBER_GATHERING_SABER_EXTREME.dataId;

export const SERVANT_FOU_MIN = 0;
export const SERVANT_FOU_MAX = 3_000;

export const INITIAL_SERVANT_REGISTRY = createServantDataRegistry(
  INITIAL_SERVANT_DEFINITIONS,
);

export interface InitialAllySlotSelection {
  servantDataId: string | null;
  level: ServantLevel | null;
  noblePhantasmLevel: NoblePhantasmLevel | null;
  hpFou: number;
  attackFou: number;
  craftEssenceDataId: string | null;
}

export interface InitialBattleSetup {
  frontline: InitialAllySlotSelection[];
  reserve: InitialAllySlotSelection[];
  mysticCodeDataId: string | null;
  enemyEncounterDataId: string;
  seedMode: "random" | "fixed";
  seed: string;
}

export interface InitialBattleSetupValidation {
  valid: boolean;
  errors: string[];
}

interface CompleteAllySelection {
  instanceId: string;
  servantDataId: string;
  level: ServantLevel;
  noblePhantasmLevel: NoblePhantasmLevel;
  hpFou: number;
  attackFou: number;
  craftEssenceDataId: string | null;
}

export function emptyInitialAllySlot(): InitialAllySlotSelection {
  return {
    servantDataId: null,
    level: null,
    noblePhantasmLevel: null,
    hpFou: SERVANT_FOU_MIN,
    attackFou: SERVANT_FOU_MIN,
    craftEssenceDataId: null,
  };
}

export function createEmptyInitialBattleSetup(): InitialBattleSetup {
  return {
    frontline: Array.from({ length: 3 }, emptyInitialAllySlot),
    reserve: Array.from({ length: 3 }, emptyInitialAllySlot),
    mysticCodeDataId: null,
    enemyEncounterDataId: INITIAL_ENEMY_ENCOUNTER_DATA_ID,
    seedMode: "random",
    seed: "",
  };
}

/** The sixth registered level is the ordinary final-ascension cap (before Grails). */
export function finalAscensionLevelForServant(
  servantDataId: string,
): ServantLevel {
  const definition = servantDefinition(INITIAL_SERVANT_REGISTRY, servantDataId);
  if (!definition) {
    throw new RangeError(`selected servant is not registered: ${servantDataId}`);
  }
  return definition.levelStats[5].level;
}

export function initialAllySelectionForServant(
  servantDataId: string,
): InitialAllySlotSelection {
  return {
    servantDataId,
    level: finalAscensionLevelForServant(servantDataId),
    noblePhantasmLevel: 1,
    hpFou: SERVANT_FOU_MIN,
    attackFou: SERVANT_FOU_MIN,
    craftEssenceDataId: null,
  };
}

function randomSeedBytes(): Uint32Array {
  const values = new Uint32Array(4);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(values);
    return values;
  }
  for (let index = 0; index < values.length; index += 1) {
    values[index] = Math.floor(Math.random() * 0x1_0000_0000);
  }
  return values;
}

/** Generates a printable concrete seed before BattleRng is constructed. */
export function generateReplayableSeed(): string {
  const entropy = [...randomSeedBytes()]
    .map((value) => value.toString(36).padStart(7, "0"))
    .join("-");
  return `random-${Date.now().toString(36)}-${entropy}`;
}

export function resolveInitialBattleSeed(
  setup: Pick<InitialBattleSetup, "seedMode" | "seed">,
  randomSeedFactory: () => string = generateReplayableSeed,
): string {
  if (setup.seedMode === "fixed") return setup.seed.trim();
  return randomSeedFactory();
}

function validateAllySlot(
  slot: InitialAllySlotSelection,
  label: string,
  required: boolean,
): string[] {
  if (!slot.servantDataId) {
    const errors = required ? [`${label}のサーヴァントは必須です。`] : [];
    if (
      slot.level !== null
      || slot.noblePhantasmLevel !== null
      || slot.hpFou !== SERVANT_FOU_MIN
      || slot.attackFou !== SERVANT_FOU_MIN
      || slot.craftEssenceDataId !== null
    ) {
      errors.push(`${label}はサーヴァント未選択のため、個体設定を保持できません。`);
    }
    return errors;
  }

  const definition = servantDefinition(
    INITIAL_SERVANT_REGISTRY,
    slot.servantDataId,
  );
  if (!definition) {
    return [`${label}のサーヴァントが登録されていません。`];
  }

  const errors: string[] = [];
  if (
    slot.level === null
    || !definition.levelStats.some(({ level }) => level === slot.level)
  ) {
    errors.push(`${label}のLvを登録済み候補から選択してください。`);
  }
  if (
    slot.noblePhantasmLevel === null
    || !([1, 2, 3, 4, 5] as const).includes(slot.noblePhantasmLevel)
  ) {
    errors.push(`${label}の宝具Lvを1～5から選択してください。`);
  }
  if (
    !Number.isSafeInteger(slot.hpFou)
    || slot.hpFou < SERVANT_FOU_MIN
    || slot.hpFou > SERVANT_FOU_MAX
  ) {
    errors.push(`${label}のHPフォウを0～3000の整数で入力してください。`);
  }
  if (
    !Number.isSafeInteger(slot.attackFou)
    || slot.attackFou < SERVANT_FOU_MIN
    || slot.attackFou > SERVANT_FOU_MAX
  ) {
    errors.push(`${label}のATKフォウを0～3000の整数で入力してください。`);
  }
  if (
    slot.craftEssenceDataId !== null
    && !INITIAL_CRAFT_ESSENCE_REGISTRY.byDataId[slot.craftEssenceDataId]
  ) {
    errors.push(`${label}の概念礼装が登録されていません。`);
  }
  return errors;
}

/**
 * Validates only setup structure and registry membership. Battle values and
 * effects remain owned by the data adapters and the battle engine.
 */
export function validateInitialBattleSetup(
  setup: InitialBattleSetup,
): InitialBattleSetupValidation {
  const errors: string[] = [];
  if (setup.frontline.length !== 3) {
    errors.push("前衛は3枠で指定してください。");
  }
  if (setup.reserve.length > 3) {
    errors.push("控えは3枠以下で指定してください。");
  }
  setup.frontline.forEach((slot, index) => {
    errors.push(...validateAllySlot(slot, `前衛${index + 1}`, true));
  });
  setup.reserve.forEach((slot, index) => {
    errors.push(...validateAllySlot(slot, `控え${index + 1}`, false));
  });

  if (
    !setup.mysticCodeDataId
    || !INITIAL_MYSTIC_CODE_REGISTRY.byDataId[setup.mysticCodeDataId]
  ) {
    errors.push("登録済み魔術礼装を1着選択してください。");
  }
  if (
    setup.enemyEncounterDataId !== INITIAL_ENEMY_ENCOUNTER_DATA_ID
    || !enemyEncounterDefinition(
      INITIAL_ENEMY_ENCOUNTER_REGISTRY,
      setup.enemyEncounterDataId,
    )
  ) {
    errors.push("初期敵設定が登録済みの極級データと一致しません。");
  }
  if (setup.seedMode === "fixed" && setup.seed.trim().length === 0) {
    errors.push("固定シードを入力してください。");
  }
  return { valid: errors.length === 0, errors };
}

function completeAllySelections(
  setup: InitialBattleSetup,
): CompleteAllySelection[] {
  const selections: CompleteAllySelection[] = [];
  setup.frontline.forEach((slot, index) => {
    if (
      !slot.servantDataId
      || slot.level === null
      || slot.noblePhantasmLevel === null
    ) {
      throw new RangeError(`frontline ${index + 1} is incomplete`);
    }
    selections.push({
      instanceId: `ally-frontline-${index + 1}`,
      servantDataId: slot.servantDataId,
      level: slot.level,
      noblePhantasmLevel: slot.noblePhantasmLevel,
      hpFou: slot.hpFou,
      attackFou: slot.attackFou,
      craftEssenceDataId: slot.craftEssenceDataId,
    });
  });
  setup.reserve.forEach((slot, index) => {
    if (!slot.servantDataId) return;
    if (slot.level === null || slot.noblePhantasmLevel === null) {
      throw new RangeError(`reserve ${index + 1} is incomplete`);
    }
    selections.push({
      instanceId: `ally-reserve-${index + 1}`,
      servantDataId: slot.servantDataId,
      level: slot.level,
      noblePhantasmLevel: slot.noblePhantasmLevel,
      hpFou: slot.hpFou,
      attackFou: slot.attackFou,
      craftEssenceDataId: slot.craftEssenceDataId,
    });
  });
  return selections;
}

/**
 * Converts registered initial content into one BattleSession. Loadout
 * initialization is completed exactly once before createBattleSession draws
 * the initial five-card hand.
 */
export function createInitialBattleSession(
  setup: InitialBattleSetup,
  randomSeedFactory: () => string = generateReplayableSeed,
): BattleSession {
  const validation = validateInitialBattleSetup(setup);
  if (!validation.valid) {
    throw new RangeError(validation.errors.join("\n"));
  }

  const selections = completeAllySelections(setup);
  const allyInstances = selections.map((selection) => {
    const definition = servantDefinition(
      INITIAL_SERVANT_REGISTRY,
      selection.servantDataId,
    );
    if (!definition) {
      throw new RangeError(
        `selected servant is not registered: ${selection.servantDataId}`,
      );
    }
    const instance = createServantBattleInstance(definition, {
      instanceId: selection.instanceId,
      level: selection.level,
      noblePhantasmLevel: selection.noblePhantasmLevel,
      maxHpAdjustment: selection.hpFou,
      attackAdjustment: selection.attackFou,
    });
    if (instance.unresolvedEffectStableIds.length > 0) {
      throw new RangeError(
        `selected servant has unresolved effects: ${instance.unresolvedEffectStableIds.join(", ")}`,
      );
    }
    return instance;
  });

  const encounter = enemyEncounterDefinition(
    INITIAL_ENEMY_ENCOUNTER_REGISTRY,
    setup.enemyEncounterDataId,
  );
  if (!encounter) {
    throw new RangeError(
      `selected enemy encounter is not registered: ${setup.enemyEncounterDataId}`,
    );
  }
  const enemyBattleData = createEnemyEncounterBattleData(
    INITIAL_ENEMY_REGISTRY,
    encounter,
  );
  const state = createBattleState({
    ally: {
      frontline: allyInstances.slice(0, 3).map(({ unit }) => unit),
      reserve: allyInstances.slice(3).map(({ unit }) => unit),
    },
    waves: enemyBattleData.waves,
    enemyFrontlineLimit: encounter.activeMode,
    enemyReplacementMode: encounter.replacementMode,
  });
  const attackRegistry = createBattleAttackDataRegistry([
    ...allyInstances.map(({ attackData }) => attackData),
    ...enemyBattleData.attackData,
  ]);
  const actionEffectRegistry = createBattleActionEffectDataRegistry([
    ...allyInstances.map(({ actionEffectData }) => actionEffectData),
    ...enemyBattleData.actionEffectData,
  ]);
  const selection: BattleLoadoutSelection = {
    mysticCodeDataId: setup.mysticCodeDataId,
    craftEssenceDataIdByInstanceId: Object.fromEntries(
      selections.flatMap(({ instanceId, craftEssenceDataId }) =>
        craftEssenceDataId === null
          ? []
          : [[instanceId, craftEssenceDataId]],
      ),
    ),
  };
  const rng = new BattleRng(resolveInitialBattleSeed(setup, randomSeedFactory));
  const initialized = initializeBattleLoadout({
    state,
    rng,
    counters: createEffectRuntimeCounters(),
    attackRegistry,
    actionEffectRegistry,
    mysticCodeRegistry: INITIAL_MYSTIC_CODE_REGISTRY,
    craftEssenceRegistry: INITIAL_CRAFT_ESSENCE_REGISTRY,
    selection,
  });

  return createBattleSession({
    state: initialized.state,
    rng,
    counters: initialized.counters,
    registry: initialized.attackRegistry,
    actionEffectRegistry: initialized.actionEffectRegistry,
    mysticCodeRegistry: INITIAL_MYSTIC_CODE_REGISTRY,
  });
}
