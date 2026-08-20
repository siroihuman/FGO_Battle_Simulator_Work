import { describe, expect, it } from "vitest";
import { resolveEnemyAttacks } from "../src/ai/enemyAttack";
import {
  createBattleAttackDataRegistry,
} from "../src/core/battle/actionData";
import {
  findUnitLocation,
  replaceUnit,
} from "../src/core/battle/formation";
import {
  beginAllyTurnEnd,
  completeAllyTurnEnd,
} from "../src/core/battle/progression";
import {
  createBattleSession,
  createBattleSuspendSave,
  replayBattleSession,
  resolveBattleSessionTurn,
  restoreBattleSession,
} from "../src/core/battle/session";
import {
  createBattleState,
  setBattleFormation,
  type BattleState,
} from "../src/core/battle/state";
import {
  createEnemyTurnEndLogRecord,
} from "../src/core/battle/turnLog";
import { resolveEnemyTurnEnd } from "../src/core/battle/turnEndCoordinator";
import { BattleRng } from "../src/core/rng";
import {
  EMBER_GATHERING_SABER_EXTREME,
  INITIAL_ENEMY_BATTLE_DATA,
  INITIAL_ENEMY_ENCOUNTER_REGISTRY,
  INITIAL_ENEMY_REGISTRY,
  RADIANT_ARM_OF_DAWN_SABER,
  createEnemyBattleInstance,
  createEnemyDataRegistry,
  createEnemyEncounterBattleData,
} from "../src/data/enemies";
import {
  createBattleActionEffectDataRegistry,
} from "../src/effects/actionData";
import { createEffectRuntimeCounters } from "../src/effects/runtime";
import { combatantData } from "./helpers/attackData";
import { unit } from "./helpers/battle";

function enemyInstance(instanceId: string) {
  const found = INITIAL_ENEMY_BATTLE_DATA.instances.find(
    (instance) => instance.unit.instanceId === instanceId,
  );
  if (!found) throw new Error(`missing initial enemy: ${instanceId}`);
  return found;
}

function ally(instanceId: string) {
  return unit(instanceId, "ally", {
    hp: 1_000_000,
    maxHp: 1_000_000,
    baseMaxHp: 1_000_000,
  });
}

function enemyActionState(
  enemy = enemyInstance("enemy-w3-1"),
): BattleState {
  const state = createBattleState({
    ally: {
      frontline: [ally("ally-a"), ally("ally-b"), ally("ally-c")],
      reserve: [],
    },
    waves: [{
      enemy: {
        frontline: [enemy.unit, null, null],
        reserve: [],
      },
    }],
    enemyFrontlineLimit: 3,
  });
  return completeAllyTurnEnd(beginAllyTurnEnd(state));
}

function defeatAllBut(
  state: BattleState,
  survivingInstanceId: string | null,
): BattleState {
  let formation = state.formation;
  for (const current of formation.ally.frontline) {
    if (!current || current.instanceId === survivingInstanceId) continue;
    formation = replaceUnit(formation, {
      ...current,
      hp: 0,
      alive: false,
    });
  }
  return setBattleFormation(state, formation);
}

function directRegistry(instanceId = "enemy-w3-1") {
  return createBattleAttackDataRegistry([
    enemyInstance(instanceId).attackData,
  ]);
}

describe("initial enemy format 1 data", () => {
  it("registers the reusable enemy and encounter with stable IDs and checked sources", () => {
    expect(INITIAL_ENEMY_REGISTRY).toMatchObject({
      schemaVersion: 1,
      byDataId: {
        "radiant-arm-of-dawn-saber": {
          name: "黎明の炎腕",
          category: "normal_enemy",
          classKey: "saber",
          attributeKey: "sky",
          classAttackCoefficientPermille: 1_000,
          deathRatePermille: 200,
          criticalChancePermille: 100,
          attackNpRatePermille: 1_000,
          targetNpRatePermille: 1_000,
          targetStarRatePermille: 0,
          maxActions: 1,
        },
      },
    });
    expect(RADIANT_ARM_OF_DAWN_SABER.externalIds).toEqual({
      atlasAcademyServantId: 9_933_710,
      atlasAcademyAiId: 1_000_000,
    });
    expect(RADIANT_ARM_OF_DAWN_SABER.dataId).not.toContain("9933710");
    expect(RADIANT_ARM_OF_DAWN_SABER.traits).toEqual([
      "天の力",
      "demon_unused",
      "bonus_enemy",
      "hand_or_door",
      "hand",
      "divine",
    ]);
    expect(RADIANT_ARM_OF_DAWN_SABER.sources).toHaveLength(4);
    expect(RADIANT_ARM_OF_DAWN_SABER.sources.every(
      ({ url, checkedAt }) => url.startsWith("https://") && checkedAt === "2026-08-10",
    )).toBe(true);
    expect(INITIAL_ENEMY_ENCOUNTER_REGISTRY.byDataId[
      "ember-gathering-saber-extreme"
    ]).toBe(EMBER_GATHERING_SABER_EXTREME);
    expect(EMBER_GATHERING_SABER_EXTREME).toMatchObject({
      name: "種火集め（剣基準）極級",
      activeMode: 3,
      replacementMode: "standard",
    });
  });

  it("materializes all seven placements with independent state and attack data", () => {
    const expected = [
      [1, 1, "enemy-w1-1", "A", 23, 27_849, 4_561],
      [1, 2, "enemy-w1-2", "B", 22, 26_649, 4_401],
      [1, 3, "enemy-w1-3", "C", 24, 29_049, 4_721],
      [2, 1, "enemy-w2-1", "A", 25, 37_811, 4_881],
      [2, 2, "enemy-w2-2", "B", 26, 39_311, 5_041],
      [2, 3, "enemy-w2-3", "C", 27, 40_811, 5_201],
      [3, 1, "enemy-w3-1", "A", 45, 136_216, 8_113],
    ];
    const actual = EMBER_GATHERING_SABER_EXTREME.waves.flatMap(
      (wave, waveIndex) => wave.frontline.map((placement) => [
        waveIndex + 1,
        placement.frontlineSlot,
        placement.instanceId,
        placement.encounterLabel,
        placement.level,
        placement.hp,
        placement.attack,
      ]),
    );
    expect(actual).toEqual(expected);
    expect(INITIAL_ENEMY_BATTLE_DATA.instances).toHaveLength(7);
    expect(INITIAL_ENEMY_BATTLE_DATA.attackData).toHaveLength(7);
    expect(INITIAL_ENEMY_BATTLE_DATA.actionEffectData).toHaveLength(7);
    expect(new Set(INITIAL_ENEMY_BATTLE_DATA.instances.map(
      ({ unit: current }) => current.instanceId,
    )).size).toBe(7);
    expect(new Set(INITIAL_ENEMY_BATTLE_DATA.instances.map(
      ({ unit: current }) => current.dataId,
    ))).toEqual(new Set(["radiant-arm-of-dawn-saber"]));
    expect(INITIAL_ENEMY_BATTLE_DATA.instances[0]?.unit).not.toBe(
      INITIAL_ENEMY_BATTLE_DATA.instances[1]?.unit,
    );
    expect(INITIAL_ENEMY_BATTLE_DATA.instances[0]?.attackData).not.toBe(
      INITIAL_ENEMY_BATTLE_DATA.instances[1]?.attackData,
    );
    expect(INITIAL_ENEMY_BATTLE_DATA.instances.every(
      ({ placement: current }) => current.charge === 0,
    )).toBe(true);
    expect(EMBER_GATHERING_SABER_EXTREME.waves.every(
      ({ reserve }) => reserve.length === 0,
    )).toBe(true);

    let state = createBattleState({
      ally: {
        frontline: [ally("ally-a"), ally("ally-b"), ally("ally-c")],
        reserve: [],
      },
      waves: INITIAL_ENEMY_BATTLE_DATA.waves,
      enemyFrontlineLimit: 3,
    });
    const first = findUnitLocation(state.formation, "enemy-w1-1")?.unit;
    if (!first?.enemyAction) throw new Error("missing first enemy action state");
    state = setBattleFormation(
      state,
      replaceUnit(state.formation, {
        ...first,
        hp: first.hp - 1_000,
        enemyAction: { ...first.enemyAction, charge: 2 },
      }),
    );
    expect(findUnitLocation(
      state.formation,
      "enemy-w1-1",
    )?.unit).toMatchObject({ hp: 26_849, enemyAction: { charge: 2 } });
    expect(findUnitLocation(
      state.formation,
      "enemy-w1-2",
    )?.unit).toMatchObject({ hp: 26_649, enemyAction: { charge: 0 } });
    expect(state.remainingWaves[0]?.enemy.frontline[0]).toMatchObject({
      instanceId: "enemy-w2-1",
      hp: 37_811,
      enemyAction: { charge: 0 },
    });
  });

  it("converts normal and charge attacks without servant NP or OC data", () => {
    const instance = enemyInstance("enemy-w1-1");
    expect(instance.unit).toMatchObject({
      dataId: "radiant-arm-of-dawn-saber",
      name: "黎明の炎腕",
      hp: 27_849,
      maxHp: 27_849,
      deathRatePermille: 200,
      commandCards: [],
      noblePhantasm: null,
      skillCooldowns: [],
      remainingBreakGauges: [],
      enemyAction: {
        maxActions: 1,
        skills: [],
        charge: 0,
        chargeMax: 4,
        noblePhantasm: {
          stableId: "radiant-arm-of-dawn-saber-charge-attack",
          name: "業火",
        },
      },
    });
    expect(instance.attackData).toMatchObject({
      attack: 4_561,
      classKey: "saber",
      attributeKey: "sky",
      attackNpUnits: 0,
      receivedNpUnits: 0,
      attackNpRatePermille: 1_000,
      targetNpRatePermille: 1_000,
      starRatePermille: 0,
      starWeight: 0,
      targetStarRatePermille: 0,
      commandCardHitWeights: null,
      extraAttackHitWeights: null,
      noblePhantasms: [],
      enemyAttacks: [
        {
          actionStableId: "radiant-arm-of-dawn-saber-normal-attack",
          kind: "normal_attack",
          targetScope: "single",
          targetPolicy: "random_living_ally_frontline",
          cardType: "quick",
          hitWeights: [100],
          cardDamageValuePermille: 1_000,
          criticalChancePermille: 100,
        },
        {
          actionStableId: "radiant-arm-of-dawn-saber-charge-attack",
          kind: "noble_phantasm",
          targetScope: "single",
          targetPolicy: "random_living_ally_frontline",
          cardType: "arts",
          hitWeights: [100],
          cardDamageValuePermille: 1_000,
          criticalChancePermille: 0,
          npDamageMultiplierPermille: 6_000,
        },
      ],
    });
    expect(instance.actionEffectData.actions[0]).toMatchObject({
      stableId: "radiant-arm-of-dawn-saber-charge-attack",
      kind: "noble_phantasm",
      attackOrder: 1,
      effects: [],
    });
  });

  it("validates five-stage format-1 values and copies only the required placement context", () => {
    const definition = {
      ...RADIANT_ARM_OF_DAWN_SABER,
      chargeAttack: {
        ...RADIANT_ARM_OF_DAWN_SABER.chargeAttack!,
        damageMultiplierPermille: {
          scaling: "noble_phantasm_level" as const,
          values: [2_000, 3_000, 4_000, 5_000, 6_000] as const,
        },
        levelScaling: "noble_phantasm_level" as const,
      },
    };
    const basePlacement = enemyInstance("enemy-w3-1").placement;
    const instance = createEnemyBattleInstance(definition, {
      ...basePlacement,
      instanceId: "enemy-staged-context",
      noblePhantasmContext: {
        actionStableId: definition.chargeAttack.stableId,
        noblePhantasmLevel: 3,
      },
    });
    expect(instance.attackData.enemyAttacks[1]).toMatchObject({
      npDamageMultiplierPermille: {
        scaling: "noble_phantasm_level",
        values: [2_000, 3_000, 4_000, 5_000, 6_000],
      },
      noblePhantasmContext: {
        actionStableId: definition.chargeAttack.stableId,
        noblePhantasmLevel: 3,
      },
    });
    expect(instance.actionEffectData.actions[0]?.noblePhantasmContext)
      .toEqual(instance.attackData.enemyAttacks[1]?.noblePhantasmContext);

    expect(() => createEnemyDataRegistry([{
      ...definition,
      chargeAttack: {
        ...definition.chargeAttack,
        damageMultiplierPermille: {
          scaling: "noble_phantasm_level",
          values: [1, 2, 3, 4],
        } as never,
      },
    }])).toThrow(/levels 1 through 5/);
    expect(() => createEnemyBattleInstance(definition, {
      ...basePlacement,
      instanceId: "enemy-context-missing",
    })).toThrow(/noblePhantasmContext is required/);
    expect(() => createEnemyBattleInstance(
      RADIANT_ARM_OF_DAWN_SABER,
      {
        ...basePlacement,
        instanceId: "enemy-fixed-unused-context",
        noblePhantasmContext: {
          actionStableId:
            RADIANT_ARM_OF_DAWN_SABER.chargeAttack!.stableId,
          overchargeStage: 1,
        },
      },
    )).toThrow(/unused by the fixed charge attack/);
  });

  it("rejects invalid or unresolved format data before battle state or RNG work", () => {
    expect(() => createEnemyDataRegistry([{
      ...RADIANT_ARM_OF_DAWN_SABER,
      normalAttack: {
        ...RADIANT_ARM_OF_DAWN_SABER.normalAttack!,
        targetPolicy: "future-random-policy" as never,
      },
    }])).toThrow(/targetPolicy is invalid/);
    expect(() => createEnemyEncounterBattleData(
      createEnemyDataRegistry([]),
      EMBER_GATHERING_SABER_EXTREME,
    )).toThrow(/enemy definition is missing/);

    const source = enemyInstance("enemy-w3-1");
    const state = enemyActionState({
      ...source,
      unit: {
        ...source.unit,
        enemyAction: {
          ...source.unit.enemyAction!,
          charge: 4,
        },
      },
    });
    const rng = new BattleRng("missing-charge-action-data");
    const resolved = resolveEnemyAttacks({
      state,
      priorityRequests: [],
      registry: createBattleAttackDataRegistry([{
        ...source.attackData,
        enemyAttacks: [],
      }]),
      rng: {
        effects: rng.stream("effects"),
        damage: rng.stream("damage"),
        stars: rng.stream("stars"),
      },
      aiRng: rng.stream("ai"),
      criticalRng: rng.stream("critical"),
    });
    expect(resolved.sequence.actions[0]).toMatchObject({
      preflight: {
        outcome: "skipped",
        reason: "action_attack_data_missing",
        chargeBefore: 4,
        chargeConsumed: 0,
      },
      resolverCalled: false,
    });
    expect(findUnitLocation(
      resolved.sequence.state.formation,
      source.unit.instanceId,
    )?.unit.enemyAction?.charge).toBe(4);
    expect(Object.values(rng.snapshot().streams).every(
      ({ drawCount }) => drawCount === 0,
    )).toBe(true);
  });
});

describe("radiant arm common enemy actions", () => {
  it("selects a random living ally, then rolls normal critical, then damage", () => {
    const seed = "initial-enemy-random-critical";
    const expectedRng = new BattleRng(seed);
    const candidates = ["ally-a", "ally-b", "ally-c"];
    const expectedTarget = candidates[
      expectedRng.stream("ai").nextIntInclusive(0, candidates.length - 1)
    ];
    const expectedCritical = expectedRng.stream("critical").chance(100);
    const rng = new BattleRng(seed);
    const resolved = resolveEnemyAttacks({
      state: enemyActionState(),
      priorityRequests: [],
      registry: directRegistry(),
      rng: {
        effects: rng.stream("effects"),
        damage: rng.stream("damage"),
        stars: rng.stream("stars"),
      },
      aiRng: rng.stream("ai"),
      criticalRng: rng.stream("critical"),
    });
    expect(resolved.sequence.actions[0]?.resolverDetail).toMatchObject({
      outcome: "resolved",
      targetInstanceIds: [expectedTarget],
      calculation: {
        cardType: "quick",
        isNoblePhantasm: false,
        isCritical: expectedCritical,
        hitWeights: [100],
        cardDamageValuePermille: 1_000,
      },
    });
    expect(resolved.battleLog.entries[0]?.rngEvents.filter(
      ({ drawsConsumed }) => drawsConsumed > 0,
    ).map(({ stream }) => stream)).toEqual(["ai", "critical", "damage"]);
    expect(resolved.battleLog.entries[0]?.rngEvents.find(
      ({ stream }) => stream === "critical",
    )).toMatchObject({
      operation: "chance",
      ratePermille: 100,
      succeeded: expectedCritical,
    });
    for (const instanceId of candidates) {
      const hp = findUnitLocation(
        resolved.sequence.state.formation,
        instanceId,
      )?.unit.hp;
      if (instanceId === expectedTarget) {
        expect(hp).toBeLessThan(1_000_000);
      } else {
        expect(hp).toBe(1_000_000);
      }
    }
    expect(findUnitLocation(
      resolved.sequence.state.formation,
      expectedTarget!,
    )?.unit.hp).toBeLessThan(1_000_000);
  });

  it("does not consume target RNG for one candidate or any action RNG with no target", () => {
    const oneRng = new BattleRng("one-enemy-target");
    const one = resolveEnemyAttacks({
      state: defeatAllBut(enemyActionState(), "ally-b"),
      priorityRequests: [],
      registry: directRegistry(),
      rng: {
        effects: oneRng.stream("effects"),
        damage: oneRng.stream("damage"),
        stars: oneRng.stream("stars"),
      },
      aiRng: oneRng.stream("ai"),
      criticalRng: oneRng.stream("critical"),
    });
    expect(one.sequence.actions[0]?.resolverDetail).toMatchObject({
      outcome: "resolved",
      targetInstanceIds: ["ally-b"],
    });
    expect(oneRng.stream("ai").snapshot().drawCount).toBe(0);
    expect(oneRng.stream("critical").snapshot().drawCount).toBe(1);

    const noneRng = new BattleRng("no-enemy-target");
    const none = resolveEnemyAttacks({
      state: defeatAllBut(enemyActionState(), null),
      priorityRequests: [],
      registry: directRegistry(),
      rng: {
        effects: noneRng.stream("effects"),
        damage: noneRng.stream("damage"),
        stars: noneRng.stream("stars"),
      },
      aiRng: noneRng.stream("ai"),
      criticalRng: noneRng.stream("critical"),
    });
    expect(none.sequence.actions).toEqual([]);
    expect(Object.values(noneRng.snapshot().streams).every(
      ({ drawCount }) => drawCount === 0,
    )).toBe(true);
  });

  it("uses full-charge 業火 without critical and advances it to one at turn end", () => {
    const base = enemyInstance("enemy-w3-1");
    const charged = createEnemyBattleInstance(
      RADIANT_ARM_OF_DAWN_SABER,
      { ...base.placement, instanceId: "enemy-charge-test", charge: 4 },
    );
    const rng = new BattleRng("initial-enemy-goka");
    const attacks = resolveEnemyAttacks({
      state: enemyActionState(charged),
      priorityRequests: [],
      registry: createBattleAttackDataRegistry([charged.attackData]),
      actionEffectRegistry: createBattleActionEffectDataRegistry([
        charged.actionEffectData,
      ]),
      rng: {
        effects: rng.stream("effects"),
        damage: rng.stream("damage"),
        stars: rng.stream("stars"),
      },
      aiRng: rng.stream("ai"),
      criticalRng: rng.stream("critical"),
    });
    expect(attacks.sequence.actions[0]).toMatchObject({
      request: { kind: "noble_phantasm" },
      preflight: { chargeBefore: 4, chargeConsumed: 4 },
      resolverDetail: {
        outcome: "resolved",
        calculation: {
          cardType: "arts",
          isNoblePhantasm: true,
          isCritical: false,
          hitWeights: [100],
          npDamageMultiplierPermille: 6_000,
        },
      },
    });
    expect(rng.stream("critical").snapshot().drawCount).toBe(0);
    expect(findUnitLocation(
      attacks.sequence.state.formation,
      charged.unit.instanceId,
    )?.unit.enemyAction?.charge).toBe(0);

    const turnEnd = resolveEnemyTurnEnd(
      attacks.sequence.state,
      attacks.counters,
      rng.stream("effects"),
    );
    expect(turnEnd.charge.changes).toEqual([{
      instanceId: charged.unit.instanceId,
      before: 0,
      after: 1,
    }]);
    expect(findUnitLocation(
      turnEnd.state.formation,
      charged.unit.instanceId,
    )?.unit.enemyAction?.charge).toBe(1);
    const log = createEnemyTurnEndLogRecord({
      beforeState: attacks.sequence.state,
      resolution: turnEnd,
      rngEvents: [],
    });
    expect(log.enemyChargeChanges).toEqual([{
      enemy: expect.objectContaining({ instanceId: charged.unit.instanceId }),
      before: 0,
      after: 1,
    }]);
  });

  it("caps current frontline charge, pauses reserve, and ignores enemies without charge attacks", () => {
    const base = enemyInstance("enemy-w3-1");
    const full = createEnemyBattleInstance(
      RADIANT_ARM_OF_DAWN_SABER,
      { ...base.placement, instanceId: "enemy-full", charge: 4 },
    );
    const reserve = createEnemyBattleInstance(
      RADIANT_ARM_OF_DAWN_SABER,
      { ...base.placement, instanceId: "enemy-reserve", charge: 0 },
    );
    let state = createBattleState({
      ally: {
        frontline: [ally("ally-a"), ally("ally-b"), ally("ally-c")],
        reserve: [],
      },
      waves: [{ enemy: {
        frontline: [
          full.unit,
          unit("enemy-no-charge", "enemy", {
            enemyAction: {
              maxActions: 1,
              normalAttack: null,
              skills: [],
              noblePhantasm: null,
              charge: 0,
              chargeMax: 0,
            },
          }),
          null,
        ],
        reserve: [reserve.unit],
      } }],
      enemyFrontlineLimit: 3,
    });
    state = completeAllyTurnEnd(beginAllyTurnEnd(state));
    const result = resolveEnemyTurnEnd(
      { ...state, phase: "enemy_turn_end" },
      createEffectRuntimeCounters(),
      new BattleRng("charge-cap-reserve").stream("effects"),
    );
    expect(result.charge.changes).toEqual([{
      instanceId: "enemy-full",
      before: 4,
      after: 4,
    }]);
    expect(findUnitLocation(
      result.state.formation,
      "enemy-reserve",
    )?.unit.enemyAction?.charge).toBe(0);
    expect(findUnitLocation(
      result.state.formation,
      "enemy-no-charge",
    )?.unit.enemyAction).toMatchObject({ charge: 0, chargeMax: 0 });
  });
});

describe("initial enemy suspend and replay", () => {
  function initialSession(seed: string) {
    const allies = [ally("ally-a"), ally("ally-b"), ally("ally-c")];
    const allyData = allies.map((current) =>
      combatantData(current.instanceId, current.dataId, {
        attack: 1,
        starRatePermille: 0,
      })
    );
    return createBattleSession({
      state: createBattleState({
        ally: { frontline: allies, reserve: [] },
        waves: INITIAL_ENEMY_BATTLE_DATA.waves,
        enemyFrontlineLimit: EMBER_GATHERING_SABER_EXTREME.activeMode,
        enemyReplacementMode: EMBER_GATHERING_SABER_EXTREME.replacementMode,
      }),
      rng: new BattleRng(seed),
      registry: createBattleAttackDataRegistry([
        ...allyData,
        ...INITIAL_ENEMY_BATTLE_DATA.attackData,
      ]),
      actionEffectRegistry: createBattleActionEffectDataRegistry(
        INITIAL_ENEMY_BATTLE_DATA.actionEffectData,
      ),
    });
  }

  it("restores current enemy state directly and reproduces targets, criticals, and charge logs", () => {
    let session = initialSession("initial-enemy-session-replay");
    const cardIds = session.loop.state.commandDeck.currentHand
      .slice(0, 3)
      .map(({ cardId }) => cardId);
    const turn = resolveBattleSessionTurn(session, { cardIds });
    expect(turn.result.accepted).toBe(true);
    session = turn.session;
    const currentEnemies = session.loop.state.formation.enemy.frontline
      .filter((current) => current !== null);
    expect(currentEnemies.map(
      (current) => current.enemyAction?.charge,
    )).toEqual([1, 1, 1]);
    const saved = createBattleSuspendSave(session);
    const savedInitialAttack = saved.attackData.combatants.find(
      ({ instanceId }) => instanceId === "enemy-w1-1",
    );
    expect(savedInitialAttack?.enemyAttacks[0]).toMatchObject({
      targetPolicy: "random_living_ally_frontline",
      criticalChancePermille: 100,
    });
    const restored = restoreBattleSession(saved);
    const replayed = replayBattleSession(saved);
    expect(restored.loop.state).toEqual(session.loop.state);
    expect(restored.loop.rng.snapshot()).toEqual(session.loop.rng.snapshot());
    expect(restored.turnLogs).toEqual(session.turnLogs);
    expect(replayed.loop.state).toEqual(session.loop.state);
    expect(replayed.loop.rng.snapshot()).toEqual(session.loop.rng.snapshot());
    expect(replayed.turnLogs).toEqual(session.turnLogs);
    const enemyTurnEndRecord = session.turnLogs[0]?.records.find(
      (record) => record.recordType === "turn_end" && record.side === "enemy",
    );
    expect(enemyTurnEndRecord).toMatchObject({
      enemyChargeChanges: [
        { enemy: { instanceId: "enemy-w1-1" }, before: 0, after: 1 },
        { enemy: { instanceId: "enemy-w1-2" }, before: 0, after: 1 },
        { enemy: { instanceId: "enemy-w1-3" }, before: 0, after: 1 },
      ],
    });
  });

  it("directly restores and replays staged enemy NP context, logs, counters, and all six RNG streams", () => {
    const definition = {
      ...RADIANT_ARM_OF_DAWN_SABER,
      chargeAttack: {
        ...RADIANT_ARM_OF_DAWN_SABER.chargeAttack!,
        damageMultiplierPermille: {
          scaling: "overcharge" as const,
          values: [2_000, 3_000, 4_000, 5_000, 6_000] as const,
        },
        overchargeScaling: "overcharge" as const,
      },
    };
    const basePlacement = enemyInstance("enemy-w3-1").placement;
    const staged = createEnemyBattleInstance(definition, {
      ...basePlacement,
      instanceId: "enemy-staged-session",
      charge: 4,
      noblePhantasmContext: {
        actionStableId: definition.chargeAttack.stableId,
        overchargeStage: 3,
      },
    });
    const allies = [ally("ally-a"), ally("ally-b"), ally("ally-c")];
    let session = createBattleSession({
      state: createBattleState({
        ally: { frontline: allies, reserve: [] },
        waves: [{ enemy: {
          frontline: [staged.unit, null, null],
          reserve: [],
        } }],
        enemyFrontlineLimit: 3,
      }),
      rng: new BattleRng("staged-enemy-np-session"),
      registry: createBattleAttackDataRegistry([
        ...allies.map((current) => combatantData(
          current.instanceId,
          current.dataId,
          { attack: 1, starRatePermille: 0 },
        )),
        staged.attackData,
      ]),
      actionEffectRegistry: createBattleActionEffectDataRegistry([
        staged.actionEffectData,
      ]),
    });
    const cardIds = session.loop.state.commandDeck.currentHand
      .slice(0, 3)
      .map(({ cardId }) => cardId);
    const turn = resolveBattleSessionTurn(session, { cardIds });
    expect(turn.result.accepted).toBe(true);
    session = turn.session;

    const enemyBatch = session.turnLogs[0]?.records.find(
      (record) => record.recordType === "action_batch"
        && record.batch.kind === "enemy_turn",
    );
    if (!enemyBatch || enemyBatch.recordType !== "action_batch") {
      throw new Error("missing staged enemy NP action log");
    }
    expect(enemyBatch.batch.entries[0]).toMatchObject({
      action: { kind: "enemy_noble_phantasm" },
      overchargeStage: 3,
      calculation: { npDamageMultiplierPermille: 4_000 },
    });
    expect(enemyBatch.batch.entries[0]).not.toHaveProperty(
      "noblePhantasmLevel",
    );

    const save = createBattleSuspendSave(session);
    expect(save).toMatchObject({
      schemaVersion: 4,
      dataSchemaVersion: "1.38.0",
      battleLogSchemaVersion: 5,
      battleTurnLogSchemaVersion: 2,
    });
    expect(save.attackData.combatants.find(
      ({ instanceId }) => instanceId === staged.unit.instanceId,
    )?.enemyAttacks[1]).toMatchObject({
      noblePhantasmContext: {
        actionStableId: definition.chargeAttack.stableId,
        overchargeStage: 3,
      },
    });
    expect(save.actionEffectData?.combatants[0]?.actions[0])
      .toMatchObject({
        noblePhantasmContext: {
          actionStableId: definition.chargeAttack.stableId,
          overchargeStage: 3,
        },
      });

    const restored = restoreBattleSession(save);
    const replayed = replayBattleSession(save);
    expect(restored.loop.state).toEqual(session.loop.state);
    expect(restored.loop.counters).toEqual(session.loop.counters);
    expect(restored.loop.rng.snapshot()).toEqual(session.loop.rng.snapshot());
    expect(restored.turnLogs).toEqual(session.turnLogs);
    expect(createBattleSuspendSave(restored)).toEqual(save);
    expect(replayed.loop.state).toEqual(session.loop.state);
    expect(replayed.loop.counters).toEqual(session.loop.counters);
    expect(replayed.loop.rng.snapshot()).toEqual(session.loop.rng.snapshot());
    expect(Object.keys(replayed.loop.rng.snapshot().streams)).toHaveLength(6);
    expect(replayed.turnLogs).toEqual(session.turnLogs);
  });
});
