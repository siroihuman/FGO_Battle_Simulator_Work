import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import {
  parseBattleSuspendSave,
  resolveBattleSessionTurn,
  restoreBattleSession,
  serializeBattleSuspendSave,
} from "../src/core/battle/session";
import { findUnitLocation } from "../src/core/battle/formation";
import {
  INITIAL_CRAFT_ESSENCE_REGISTRY,
} from "../src/data/craftEssences";
import {
  INITIAL_MYSTIC_CODE_REGISTRY,
} from "../src/data/mysticCodes";
import {
  DOMINATION_FOREIGNER,
  LIGHT_KOYANSKAYA,
  LUCIFERA,
  type ServantLevel,
} from "../src/data/servants";
import type { NoblePhantasmLevel } from "../src/formulas/np";
import {
  presentBattleStatus,
  summarizeBattleTurnLogs,
} from "../src/ui/battlePresentation";
import {
  createEmptyInitialBattleSetup,
  createInitialBattleSession,
  emptyInitialAllySlot,
  initialAllySelectionForServant,
  resolveInitialBattleSeed,
  validateInitialBattleSetup,
  type InitialAllySlotSelection,
  type InitialBattleSetup,
} from "../src/ui/initialBattle";

function ally(
  servantDataId = LIGHT_KOYANSKAYA.dataId,
  level: ServantLevel = 120,
  noblePhantasmLevel: NoblePhantasmLevel = 1,
  craftEssenceDataId: string | null = null,
): InitialAllySlotSelection {
  return {
    servantDataId,
    level,
    noblePhantasmLevel,
    craftEssenceDataId,
  };
}

function completeSetup(seed = "initial-ui-seed"): InitialBattleSetup {
  const setup = createEmptyInitialBattleSetup();
  return {
    ...setup,
    frontline: [ally(), ally(LUCIFERA.dataId), ally()],
    reserve: [
      emptyInitialAllySlot(),
      emptyInitialAllySlot(),
      emptyInitialAllySlot(),
    ],
    mysticCodeDataId: "atlas-academy-uniform",
    seedMode: "fixed",
    seed,
  };
}

function firstThreeCardIds(
  session: ReturnType<typeof createInitialBattleSession>,
): string[] {
  return session.loop.state.commandDeck.currentHand
    .slice(0, 3)
    .map(({ cardId }) => cardId);
}

function listedEnemyCount(session: ReturnType<typeof createInitialBattleSession>) {
  const current = session.loop.state.formation.enemy.frontline.filter(Boolean).length
    + session.loop.state.formation.enemy.reserve.length;
  const future = session.loop.state.remainingWaves.reduce(
    (total, wave) => total
      + wave.enemy.frontline.filter(Boolean).length
      + wave.enemy.reserve.length,
    0,
  );
  return current + future;
}

describe("minimum initial battle UI adapter", () => {
  it("requires three frontline selections while accepting an empty reserve", () => {
    const empty = createEmptyInitialBattleSetup();
    const invalid = validateInitialBattleSetup(empty);

    expect(invalid.valid).toBe(false);
    expect(invalid.errors.filter((error) => error.includes("前衛"))).toHaveLength(3);
    expect(invalid.errors).toContain("登録済み魔術礼装を1着選択してください。");
    expect(invalid.errors).not.toContain("固定シードを入力してください。");

    const fixedWithoutSeed = { ...empty, seedMode: "fixed" as const };
    expect(validateInitialBattleSetup(fixedWithoutSeed).errors)
      .toContain("固定シードを入力してください。");

    const complete = completeSetup();
    expect(validateInitialBattleSetup(complete)).toEqual({
      valid: true,
      errors: [],
    });
    const session = createInitialBattleSession(complete);
    expect(session.loop.state.formation.ally.frontline).toHaveLength(3);
    expect(session.loop.state.formation.ally.reserve).toEqual([]);
  });

  it("defaults a selected Servant to final-ascension Lv and NP1, and resolves a random seed before BattleRng", () => {
    expect(initialAllySelectionForServant(LIGHT_KOYANSKAYA.dataId)).toMatchObject({
      servantDataId: LIGHT_KOYANSKAYA.dataId,
      level: 90,
      noblePhantasmLevel: 1,
    });
    const random = completeSetup();
    random.seedMode = "random";
    random.seed = "stale-fixed-seed";
    expect(resolveInitialBattleSeed(random, () => "generated-replay-seed"))
      .toBe("generated-replay-seed");
    const session = createInitialBattleSession(
      random,
      () => "generated-replay-seed",
    );
    expect(session.loop.rng.seed).toBe("generated-replay-seed");
  });

  it("rejects incomplete or unregistered setup before constructing a session", () => {
    const setup = completeSetup("invalid-setup");
    setup.frontline[1] = {
      ...setup.frontline[1],
      servantDataId: "missing-servant",
    };
    setup.mysticCodeDataId = "missing-mystic-code";

    const validation = validateInitialBattleSetup(setup);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain("前衛2のサーヴァントが登録されていません。");
    expect(validation.errors).toContain("登録済み魔術礼装を1着選択してください。");
    expect(() => createInitialBattleSession(setup)).toThrow(
      "前衛2のサーヴァントが登録されていません。",
    );
  });

  it("keeps duplicate servant instances and each Lv, NP level, and Craft Essence independent", () => {
    const setup = completeSetup("duplicate-instances");
    setup.frontline = [
      ally(LIGHT_KOYANSKAYA.dataId, 90, 1, null),
      ally(LIGHT_KOYANSKAYA.dataId, 100, 3, "kaleidoscope"),
      ally(LIGHT_KOYANSKAYA.dataId, 120, 5, "kaleidoscope"),
    ];
    const session = createInitialBattleSession(setup);
    const units = session.loop.state.formation.ally.frontline;

    expect(units.map((unit) => unit?.instanceId)).toEqual([
      "ally-frontline-1",
      "ally-frontline-2",
      "ally-frontline-3",
    ]);
    expect(new Set(units.map((unit) => unit?.dataId))).toEqual(
      new Set([LIGHT_KOYANSKAYA.dataId]),
    );
    expect(units.map((unit) => unit?.noblePhantasm?.level)).toEqual([1, 3, 5]);
    expect(units.map((unit) => unit?.np)).toEqual([0, 10_000, 10_000]);
    expect(session.registry.byInstanceId["ally-frontline-1"].attack).toBe(11_616);
    expect(session.registry.byInstanceId["ally-frontline-2"].attack).toBe(14_715);
    expect(session.registry.byInstanceId["ally-frontline-3"].attack).toBe(16_925);
    expect(session.loop.state.loadout.craftEssencesByInstanceId).toMatchObject({
      "ally-frontline-2": { dataId: "kaleidoscope" },
      "ally-frontline-3": { dataId: "kaleidoscope" },
    });
    expect(session.loop.state.loadout.craftEssencesByInstanceId)
      .not.toHaveProperty("ally-frontline-1");
  });

  it("loads the fixed extreme encounter as three Waves and seven independent enemies", () => {
    const setup = completeSetup("three-waves-seven-enemies");
    setup.reserve = [
      ally(LUCIFERA.dataId, 90, 2, "black-grail"),
      ally(LUCIFERA.dataId, 100, 3, "black-grail"),
      ally(LIGHT_KOYANSKAYA.dataId, 120, 5, null),
    ];
    const session = createInitialBattleSession(setup);

    expect(session.loop.state.totalWaves).toBe(3);
    expect(session.loop.state.remainingWaves).toHaveLength(2);
    expect(listedEnemyCount(session)).toBe(7);
    expect(Object.keys(session.registry.byInstanceId).filter((instanceId) =>
      instanceId.startsWith("enemy-w")
    )).toHaveLength(7);
    expect(session.loop.state.formation.ally.reserve).toHaveLength(3);
    expect(session.loop.state.loadout.craftEssencesByInstanceId).toMatchObject({
      "ally-reserve-1": { dataId: "black-grail" },
      "ally-reserve-2": { dataId: "black-grail" },
    });
  });

  it("initializes the loadout once before the initial five-card draw", () => {
    const setup = completeSetup("loadout-before-draw");
    setup.frontline[0] = ally(
      LIGHT_KOYANSKAYA.dataId,
      120,
      1,
      "kaleidoscope",
    );
    const session = createInitialBattleSession(setup);

    expect(session.initial.state.loadout.initialized).toBe(true);
    expect(session.initial.state.commandDeck.currentHand).toEqual([]);
    expect(session.loop.state.commandDeck.currentHand).toHaveLength(5);
    expect(session.loop.rng.snapshot().streams.cards.drawCount).toBe(5);
    expect(findUnitLocation(
      session.initial.state.formation,
      "ally-frontline-1",
    )?.unit.np).toBe(10_000);
    expect(findUnitLocation(
      session.loop.state.formation,
      "ally-frontline-1",
    )?.unit.np).toBe(10_000);
  });

  it("reproduces the initial hand and a completed card turn from the same fixed seed", () => {
    const first = createInitialBattleSession(completeSetup("fixed-ui-replay"));
    const second = createInitialBattleSession(completeSetup("fixed-ui-replay"));
    expect(first.loop.state.commandDeck.currentHand).toEqual(
      second.loop.state.commandDeck.currentHand,
    );

    const target = first.loop.state.formation.enemy.frontline[0]?.instanceId;
    expect(target).toBe("enemy-w1-1");
    const firstTurn = resolveBattleSessionTurn(first, {
      cardIds: firstThreeCardIds(first),
      ally: { requestedTargetInstanceId: target },
    });
    const secondTurn = resolveBattleSessionTurn(second, {
      cardIds: firstThreeCardIds(second),
      ally: { requestedTargetInstanceId: target },
    });

    expect(firstTurn.result.accepted).toBe(true);
    expect(secondTurn.result.accepted).toBe(true);
    expect(firstTurn.session.loop.state).toEqual(secondTurn.session.loop.state);
    expect(firstTurn.session.loop.rng.snapshot()).toEqual(
      secondTurn.session.loop.rng.snapshot(),
    );
    expect(firstTurn.session.turnLogs).toEqual(secondTurn.session.turnLogs);
    expect(firstTurn.session.turnLogs).toHaveLength(1);
  });

  it("returns an invalid card count through the existing BattleSession result without advancing", () => {
    const session = createInitialBattleSession(completeSetup("invalid-cards"));
    const beforeState = session.loop.state;
    const beforeRng = session.loop.rng.snapshot();
    const rejected = resolveBattleSessionTurn(session, {
      cardIds: firstThreeCardIds(session).slice(0, 2),
      ally: { requestedTargetInstanceId: "enemy-w1-1" },
    });

    expect(rejected.result).toMatchObject({
      accepted: false,
      selection: { reason: "wrong_card_count" },
    });
    expect(rejected.session.loop.state).toBe(beforeState);
    expect(rejected.session.loop.rng.snapshot()).toEqual(beforeRng);
    expect(rejected.session.turnLogs).toEqual([]);
  });

  it("presents Wave, victory, defeat, damage, critical, and charge from saved engine values", () => {
    const session = createInitialBattleSession(completeSetup("log-presentation"));
    const result = resolveBattleSessionTurn(session, {
      cardIds: firstThreeCardIds(session),
      ally: { requestedTargetInstanceId: "enemy-w1-1" },
    });
    expect(result.result.accepted).toBe(true);
    const summaries = summarizeBattleTurnLogs(result.session.turnLogs);
    const action = summaries.find((summary) => summary.kind === "action");
    const enemyEnd = summaries.find((summary) =>
      summary.title === "敵ターン終了"
    );
    expect(action).toBeDefined();
    expect(action?.actualHpLoss).toBe(
      action?.kind === "action" && "attack" in action.detail
        ? action.detail.attack?.totalActualHpLoss ?? null
        : null,
    );
    expect(action?.critical).toBe(
      action?.kind === "action" && "critical" in action.detail
        ? action.detail.critical?.isCritical ?? null
        : null,
    );
    expect(enemyEnd?.changes.some((change) => change.includes("チャージ 0→1")))
      .toBe(true);
    const enemyTurnEndRecord = result.session.turnLogs[0]?.records.find(
      (record) => record.recordType === "turn_end" && record.side === "enemy",
    );
    expect(enemyTurnEndRecord?.recordType).toBe("turn_end");
    if (enemyTurnEndRecord?.recordType === "turn_end") {
      for (const change of enemyTurnEndRecord.enemyChargeChanges) {
        expect(findUnitLocation(
          result.session.loop.state.formation,
          change.enemy.instanceId,
        )?.unit.enemyAction?.charge).toBe(change.after);
      }
    }

    const ongoing = presentBattleStatus(result.session.loop.state, "shown-seed");
    expect(ongoing).toMatchObject({
      wave: `${result.session.loop.state.waveNumber} / 3`,
      seed: "shown-seed",
    });
    expect(presentBattleStatus({
      ...result.session.loop.state,
      waveNumber: 3,
      outcome: "victory",
      phase: "finished",
    }, "shown-seed")).toMatchObject({ wave: "3 / 3", outcome: "勝利" });
    expect(presentBattleStatus({
      ...result.session.loop.state,
      outcome: "defeat",
      phase: "finished",
    }, "shown-seed").outcome).toBe("敗北");
  });

  it("serializes and directly restores without reapplying stats, effects, or charge", () => {
    const setup = completeSetup("ui-suspend-resume");
    setup.frontline[0] = ally(
      LIGHT_KOYANSKAYA.dataId,
      120,
      1,
      "kaleidoscope",
    );
    const started = createInitialBattleSession(setup);
    const progressed = resolveBattleSessionTurn(started, {
      cardIds: firstThreeCardIds(started),
      ally: { requestedTargetInstanceId: "enemy-w1-1" },
    }).session;
    const serialized = serializeBattleSuspendSave(progressed);
    const restored = restoreBattleSession(parseBattleSuspendSave(serialized));

    expect(restored.loop.state).toEqual(progressed.loop.state);
    expect(restored.registry).toEqual(progressed.registry);
    expect(restored.loop.rng.snapshot()).toEqual(progressed.loop.rng.snapshot());
    expect(restored.turnLogs).toEqual(progressed.turnLogs);
    expect(findUnitLocation(
      restored.loop.state.formation,
      "ally-frontline-1",
    )?.unit.np).toBe(findUnitLocation(
      progressed.loop.state.formation,
      "ally-frontline-1",
    )?.unit.np);

    expect(() => parseBattleSuspendSave("not-json")).toThrow(
      "battle suspend save is not valid JSON",
    );
    expect(() => restoreBattleSession({
      ...parseBattleSuspendSave(serialized),
      dataSchemaVersion: "0.0.0",
    } as never)).toThrow("unsupported battle suspend data schema version");
  });

  it("uses only registered initial selection sources and renders labeled mobile-safe controls", () => {
    expect(Object.keys(INITIAL_MYSTIC_CODE_REGISTRY.byDataId)).toHaveLength(3);
    expect(Object.keys(INITIAL_CRAFT_ESSENCE_REGISTRY.byDataId)).toHaveLength(2);
    const markup = renderToStaticMarkup(createElement(App));

    expect(markup).toContain("初期戦闘設定");
    expect(markup).toContain(DOMINATION_FOREIGNER.name);
    expect(markup).toContain("前衛3騎必須");
    expect(markup).toContain("Wave・敵設定");
    expect(markup).toContain("戦闘設定");
    expect(markup).toContain("最終確認");
    expect(markup).toContain("ランダムシード");
    expect(markup).toContain("次へ");
    expect(markup).toContain("disabled");
  });
});
