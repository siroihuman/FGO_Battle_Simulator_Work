import {
  createEnemyDataRegistry,
  createEnemyEncounterBattleData,
  createEnemyEncounterRegistry,
} from "./registry";
import {
  ENEMY_DATA_SCHEMA_VERSION,
  type EnemyDefinition,
  type EnemyEncounterDefinition,
  type EnemyEncounterPlacement,
} from "./schema";

const CHECKED_AT = "2026-08-10";

export const RADIANT_ARM_OF_DAWN_SABER: EnemyDefinition = {
  schemaVersion: ENEMY_DATA_SCHEMA_VERSION,
  dataId: "radiant-arm-of-dawn-saber",
  name: "黎明の炎腕",
  externalIds: {
    atlasAcademyServantId: 9_933_710,
    atlasAcademyAiId: 1_000_000,
  },
  category: "normal_enemy",
  classKey: "saber",
  attributeKey: "sky",
  classAttackCoefficientPermille: 1_000,
  traits: [
    "demon_unused",
    "bonus_enemy",
    "hand_or_door",
    "hand",
    "divine",
  ],
  deathRatePermille: 200,
  criticalChancePermille: 100,
  attackNpRatePermille: 1_000,
  targetNpRatePermille: 1_000,
  targetStarRatePermille: 0,
  maxActions: 1,
  normalAttack: {
    stableId: "radiant-arm-of-dawn-saber-normal-attack",
    name: "通常攻撃",
    targetScope: "single",
    targetPolicy: "random_living_ally_frontline",
    cardType: "quick",
    hitWeights: [100],
    cardDamageValuePermille: 1_000,
  },
  skills: [],
  chargeAttack: {
    stableId: "radiant-arm-of-dawn-saber-charge-attack",
    name: "業火",
    targetScope: "single",
    targetPolicy: "random_living_ally_frontline",
    cardType: "arts",
    hitWeights: [100],
    damageMultiplierPermille: 6_000,
    chargeMax: 4,
    levelScaling: "fixed",
    overchargeScaling: "none",
  },
  sources: [
    {
      url: "https://w.atwiki.jp/f_go/pages/145.html",
      checkedAt: CHECKED_AT,
      note: "黎明の炎腕（剣）の名称、クラス、基礎値、通常攻撃、業火を照合。",
    },
    {
      url: "https://w.atwiki.jp/f_go/pages/304.html",
      checkedAt: CHECKED_AT,
      note: "クラス攻撃補正、チャージ最大値、基礎率を照合。",
    },
    {
      url: "https://api.atlasacademy.io/nice/JP/servant/9933710",
      checkedAt: CHECKED_AT,
      note: "外部servant ID、属性、特性、Hit、ATDR・DTDR・DSRを照合。",
    },
    {
      url: "https://api.atlasacademy.io/nice/JP/ai/svt/1000000",
      checkedAt: CHECKED_AT,
      note: "外部AI IDと行動データを照合。",
    },
  ],
};

function placement(
  instanceId: string,
  encounterLabel: string,
  frontlineSlot: number,
  level: number,
  hp: number,
  attack: number,
): EnemyEncounterPlacement {
  return {
    instanceId,
    enemyDataId: RADIANT_ARM_OF_DAWN_SABER.dataId,
    encounterLabel,
    frontlineSlot,
    level,
    hp,
    attack,
    charge: 0,
    breakGaugeHp: [],
  };
}

export const EMBER_GATHERING_SABER_EXTREME: EnemyEncounterDefinition = {
  schemaVersion: ENEMY_DATA_SCHEMA_VERSION,
  dataId: "ember-gathering-saber-extreme",
  name: "種火集め（剣基準）極級",
  activeMode: 3,
  replacementMode: "standard",
  waves: [
    {
      frontline: [
        placement("enemy-w1-1", "A", 1, 23, 27_849, 4_561),
        placement("enemy-w1-2", "B", 2, 22, 26_649, 4_401),
        placement("enemy-w1-3", "C", 3, 24, 29_049, 4_721),
      ],
      reserve: [],
    },
    {
      frontline: [
        placement("enemy-w2-1", "A", 1, 25, 37_811, 4_881),
        placement("enemy-w2-2", "B", 2, 26, 39_311, 5_041),
        placement("enemy-w2-3", "C", 3, 27, 40_811, 5_201),
      ],
      reserve: [],
    },
    {
      frontline: [
        placement("enemy-w3-1", "A", 1, 45, 136_216, 8_113),
      ],
      reserve: [],
    },
  ],
  sources: [
    {
      url: "https://w.atwiki.jp/f_go/pages/185.html",
      checkedAt: CHECKED_AT,
      note: "種火集め極級の3 Wave配置、Lv、HPを剣基準で照合。",
    },
    {
      url: "https://w.atwiki.jp/f_go/pages/145.html",
      checkedAt: CHECKED_AT,
      note: "各Lvの黎明の炎腕（剣）のATKを照合。",
    },
    {
      url: "https://appget.com/c/fgo/296867/fate-346/",
      checkedAt: CHECKED_AT,
      note: "極級のWave構成を補助照合。",
    },
    {
      url: "https://faq.fate-go.jp/faq/show/1319",
      checkedAt: CHECKED_AT,
      note: "種火集めのクエスト区分を補助照合。",
    },
  ],
};

export const INITIAL_ENEMY_DEFINITIONS = [
  RADIANT_ARM_OF_DAWN_SABER,
] as const;

export const INITIAL_ENEMY_ENCOUNTER_DEFINITIONS = [
  EMBER_GATHERING_SABER_EXTREME,
] as const;

export const INITIAL_ENEMY_REGISTRY = createEnemyDataRegistry(
  INITIAL_ENEMY_DEFINITIONS,
);

export const INITIAL_ENEMY_ENCOUNTER_REGISTRY = createEnemyEncounterRegistry(
  INITIAL_ENEMY_ENCOUNTER_DEFINITIONS,
);

export const INITIAL_ENEMY_BATTLE_DATA = createEnemyEncounterBattleData(
  INITIAL_ENEMY_REGISTRY,
  EMBER_GATHERING_SABER_EXTREME,
);
