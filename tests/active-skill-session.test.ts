import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SkillControls } from "../src/App";
import { findUnitLocation } from "../src/core/battle/formation";
import {
  createBattleSuspendSave,
  parseBattleSuspendSave,
  replayBattleSession,
  resolveBattleSessionAllySkill,
  resolveBattleSessionMysticCodeSkill,
  resolveBattleSessionTurn,
  restoreBattleSession,
  serializeBattleSuspendSave,
} from "../src/core/battle/session";
import {
  LIGHT_KOYANSKAYA,
  LUCIFERA,
} from "../src/data/servants";
import {
  summarizeBattleInputLogs,
} from "../src/ui/battlePresentation";
import {
  createEmptyInitialBattleSetup,
  createInitialBattleSession,
  emptyInitialAllySlot,
  type InitialAllySlotSelection,
  type InitialBattleSetup,
} from "../src/ui/initialBattle";

function ally(
  servantDataId: string,
): InitialAllySlotSelection {
  return {
    servantDataId,
    level: 120,
    noblePhantasmLevel: 1,
    craftEssenceDataId: null,
  };
}

function setup(seed = "active-skill-session"): InitialBattleSetup {
  return {
    ...createEmptyInitialBattleSetup(),
    frontline: [
      ally(LUCIFERA.dataId),
      ally(LIGHT_KOYANSKAYA.dataId),
      ally(LIGHT_KOYANSKAYA.dataId),
    ],
    reserve: [
      ally(LIGHT_KOYANSKAYA.dataId),
      emptyInitialAllySlot(),
      emptyInitialAllySlot(),
    ],
    mysticCodeDataId: "normal-chaldea-uniform",
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

describe("active skill BattleSession integration", () => {
  it("records registered Servant skill effects for all, selected, and self targets", () => {
    const started = createInitialBattleSession(setup("servant-skill-targets"));
    const resolved = resolveBattleSessionAllySkill(started, {
      kind: "ally_skill",
      sourceInstanceId: "ally-frontline-1",
      skillStableId: "lucifera-sin-source-chariot",
      selectedTargetInstanceId: "ally-frontline-2",
    });

    expect(resolved.result.accepted).toBe(true);
    expect(findUnitLocation(
      resolved.session.loop.state.formation,
      "ally-frontline-1",
    )?.unit).toMatchObject({ np: 4_000, skillCooldowns: [0, 7, 0] });
    expect(findUnitLocation(
      resolved.session.loop.state.formation,
      "ally-frontline-2",
    )?.unit.np).toBe(5_000);
    expect(findUnitLocation(
      resolved.session.loop.state.formation,
      "ally-frontline-3",
    )?.unit.np).toBe(3_000);
    expect(resolved.session.operationHistory).toEqual([{
      kind: "ally_skill",
      sourceInstanceId: "ally-frontline-1",
      skillStableId: "lucifera-sin-source-chariot",
      selectedTargetInstanceId: "ally-frontline-2",
    }]);
    expect(resolved.session.inputLogs[0]).toMatchObject({
      schemaVersion: 5,
      kind: "ally_input",
      status: "completed",
      entries: [{
        schemaVersion: 5,
        action: { kind: "ally_skill", name: "罪源業車" },
        outcome: { status: "resolved" },
        declaredEffects: [{
          phase: "non_damaging",
          effects: [
            { targetInstanceIds: [
              "ally-frontline-1",
              "ally-frontline-2",
              "ally-frontline-3",
            ] },
            { targetInstanceIds: ["ally-frontline-2"] },
            { targetInstanceIds: ["ally-frontline-1"] },
          ],
        }],
      }],
    });
  });

  it("logs a cooldown rejection without changing state, counters, or RNG", () => {
    let session = createInitialBattleSession(setup("skill-rejection-log"));
    const invalidTargetState = session.loop.state;
    const invalidTargetRng = session.loop.rng.snapshot();
    const invalidTarget = resolveBattleSessionAllySkill(session, {
      kind: "ally_skill",
      sourceInstanceId: "ally-frontline-1",
      skillStableId: "lucifera-sin-source-chariot",
    });
    expect(invalidTarget.result).toMatchObject({
      accepted: false,
      reason: "selected_target_required",
    });
    expect(invalidTarget.session.loop.state).toBe(invalidTargetState);
    expect(invalidTarget.session.loop.rng.snapshot()).toEqual(invalidTargetRng);
    session = invalidTarget.session;
    session = resolveBattleSessionAllySkill(session, {
      kind: "ally_skill",
      sourceInstanceId: "ally-frontline-1",
      skillStableId: "lucifera-sin-source-chariot",
      selectedTargetInstanceId: "ally-frontline-2",
    }).session;
    const beforeState = session.loop.state;
    const beforeCounters = session.loop.counters;
    const beforeRng = session.loop.rng.snapshot();
    const rejected = resolveBattleSessionAllySkill(session, {
      kind: "ally_skill",
      sourceInstanceId: "ally-frontline-1",
      skillStableId: "lucifera-sin-source-chariot",
      selectedTargetInstanceId: "ally-frontline-2",
    });

    expect(rejected.result).toMatchObject({
      accepted: false,
      reason: "skill_on_cooldown",
    });
    expect(rejected.session.loop.state).toBe(beforeState);
    expect(rejected.session.loop.counters).toBe(beforeCounters);
    expect(rejected.session.loop.rng.snapshot()).toEqual(beforeRng);
    expect(rejected.session.inputLogs).toHaveLength(3);
    expect(rejected.session.inputLogs.at(-1)).toMatchObject({
      status: "rejected",
      stopReason: "skill_on_cooldown",
      entries: [{
        outcome: {
          status: "fizzled",
          reasons: ["skill_on_cooldown"],
          resolverCalled: false,
        },
        rngEvents: [],
      }],
    });
  });

  it("uses registered Mystic Code effects and logs direct Order Change targets", () => {
    let session = createInitialBattleSession(setup("mystic-code-input-log"));
    const enhancement = resolveBattleSessionMysticCodeSkill(session, {
      kind: "mystic_code_skill",
      skillStableId: "normal-chaldea-magic-enhancement",
      selectedTargetInstanceId: "ally-frontline-2",
    });
    expect(enhancement.result.accepted).toBe(true);
    session = enhancement.session;
    expect(session.loop.state.mysticCodeCooldowns).toEqual([0, 15, 0]);
    expect(findUnitLocation(
      session.loop.state.formation,
      "ally-frontline-2",
    )?.unit.np).toBe(1_000);

    const exchanged = resolveBattleSessionMysticCodeSkill(session, {
      kind: "mystic_code_skill",
      skillStableId: "normal-chaldea-order-change",
      orderChange: {
        frontlineInstanceId: "ally-frontline-1",
        reserveInstanceId: "ally-reserve-1",
      },
    });
    expect(exchanged.result.accepted).toBe(true);
    expect(exchanged.session.loop.state.formation.ally.frontline[0]?.instanceId)
      .toBe("ally-reserve-1");
    expect(exchanged.session.loop.state.formation.ally.reserve[0]?.instanceId)
      .toBe("ally-frontline-1");
    expect(exchanged.session.inputLogs.at(-1)).toMatchObject({
      entries: [{
        action: { kind: "mystic_code_skill", name: "オーダーチェンジ" },
        targetsAtStart: [
          { instanceId: "ally-frontline-1", name: "ルシフェラ" },
          { instanceId: "ally-reserve-1", name: "光のコヤンスカヤ" },
        ],
        boundary: {
          directAllyExchange: {
            frontline: { instanceId: "ally-frontline-1" },
            reserve: { instanceId: "ally-reserve-1" },
            cardDeckRebuilt: false,
          },
        },
      }],
    });
    expect(summarizeBattleInputLogs(exchanged.session.inputLogs).at(-1)?.changes)
      .toContain("ルシフェラ ↔ 光のコヤンスカヤ");
  });

  it("pauses a reserve Servant CT while advancing active and Mystic Code CT", () => {
    let session = createInitialBattleSession(setup("reserve-cooldown-pause"));
    session = resolveBattleSessionAllySkill(session, {
      kind: "ally_skill",
      sourceInstanceId: "ally-frontline-1",
      skillStableId: "lucifera-sin-source-chariot",
      selectedTargetInstanceId: "ally-frontline-2",
    }).session;
    session = resolveBattleSessionMysticCodeSkill(session, {
      kind: "mystic_code_skill",
      skillStableId: "normal-chaldea-order-change",
      orderChange: {
        frontlineInstanceId: "ally-frontline-1",
        reserveInstanceId: "ally-reserve-1",
      },
    }).session;
    const turn = resolveBattleSessionTurn(session, {
      cardIds: firstThreeCardIds(session),
      ally: { requestedTargetInstanceId: "enemy-w1-1" },
    });
    expect(turn.result.accepted).toBe(true);
    expect(findUnitLocation(
      turn.session.loop.state.formation,
      "ally-frontline-1",
    )?.unit.skillCooldowns).toEqual([0, 7, 0]);
    expect(turn.session.loop.state.mysticCodeCooldowns).toEqual([0, 0, 14]);
  });

  it("directly restores and fixed-seed replays skill state, history, and exact logs", () => {
    let session = createInitialBattleSession(setup("skill-save-replay"));
    session = resolveBattleSessionAllySkill(session, {
      kind: "ally_skill",
      sourceInstanceId: "ally-frontline-1",
      skillStableId: "lucifera-sin-source-chariot",
      selectedTargetInstanceId: "ally-frontline-2",
    }).session;
    session = resolveBattleSessionMysticCodeSkill(session, {
      kind: "mystic_code_skill",
      skillStableId: "normal-chaldea-magic-enhancement",
      selectedTargetInstanceId: "ally-frontline-3",
    }).session;

    const serialized = serializeBattleSuspendSave(session);
    const save = parseBattleSuspendSave(serialized);
    const restored = restoreBattleSession(save);
    const replayed = replayBattleSession(save);

    expect(save).toMatchObject({
      schemaVersion: 4,
      dataSchemaVersion: "1.38.0",
      battleLogSchemaVersion: 5,
      inputLogsComplete: true,
    });
    expect(restored.loop.state).toEqual(save.current.state);
    expect(restored.loop.rng.snapshot()).toEqual(session.loop.rng.snapshot());
    expect(restored.operationHistory).toEqual(session.operationHistory);
    expect(restored.inputLogs).toEqual(session.inputLogs);
    expect(replayed.loop.state).toEqual(session.loop.state);
    expect(replayed.loop.rng.snapshot()).toEqual(session.loop.rng.snapshot());
    expect(replayed.operationHistory).toEqual(session.operationHistory);
    expect(replayed.inputLogs).toEqual(session.inputLogs);
  });

  it("migrates format 3 directly and marks unavailable historical skill logs", () => {
    let session = createInitialBattleSession(setup("legacy-format-three"));
    session = resolveBattleSessionMysticCodeSkill(session, {
      kind: "mystic_code_skill",
      skillStableId: "normal-chaldea-magic-enhancement",
      selectedTargetInstanceId: "ally-frontline-2",
    }).session;
    session = resolveBattleSessionTurn(session, {
      cardIds: firstThreeCardIds(session),
      ally: { requestedTargetInstanceId: "enemy-w1-1" },
    }).session;
    const current = createBattleSuspendSave(session);
    const legacy = JSON.parse(JSON.stringify(current)) as Record<string, unknown>;
    legacy.schemaVersion = 3;
    legacy.dataSchemaVersion = "1.36.0";
    legacy.battleLogSchemaVersion = 4;
    delete legacy.inputLogs;
    delete legacy.inputLogsComplete;
    const legacyTurnLogs = legacy.turnLogs as Array<{
      records: Array<{
        recordType: string;
        batch?: {
          schemaVersion: number;
          entries: Array<{
            schemaVersion: number;
            boundary: Record<string, unknown>;
          }>;
        };
      }>;
    }>;
    for (const turnLog of legacyTurnLogs) {
      for (const record of turnLog.records) {
        if (record.recordType !== "action_batch" || !record.batch) continue;
        record.batch.schemaVersion = 4;
        for (const entry of record.batch.entries) {
          entry.schemaVersion = 4;
          delete entry.boundary.directAllyExchange;
        }
      }
    }

    const migrated = parseBattleSuspendSave(JSON.stringify(legacy));
    const restored = restoreBattleSession(migrated);
    expect(migrated).toMatchObject({
      schemaVersion: 4,
      dataSchemaVersion: "1.38.0",
      battleLogSchemaVersion: 5,
      inputLogs: [],
      inputLogsComplete: false,
    });
    expect(restored.loop.state).toEqual({
      ...migrated.current.state,
      commandStarDistributionMode: "legacy_on_command_confirmation",
      commandStarDistribution: null,
    });
    expect(restored.loop.rng.snapshot()).toEqual(session.loop.rng.snapshot());
    expect(restored.inputLogsComplete).toBe(false);
    const migratedActionBatch = migrated.turnLogs[0]?.records.find(
      (record) => record.recordType === "action_batch",
    );
    expect(migratedActionBatch?.recordType).toBe("action_batch");
    if (migratedActionBatch?.recordType === "action_batch") {
      expect(migratedActionBatch.batch.schemaVersion).toBe(5);
      expect(migratedActionBatch.batch.entries[0]?.boundary.directAllyExchange)
        .toBeNull();
    }
  });

  it("rejects malformed input-action logs before direct restore", () => {
    const session = createInitialBattleSession(setup("invalid-input-log"));
    const invalid = createBattleSuspendSave(session) as unknown as {
      inputLogsComplete: unknown;
    };
    invalid.inputLogsComplete = "yes";

    expect(() => restoreBattleSession(invalid as never)).toThrow(
      "battle input-action logs are invalid",
    );
  });

  it("renders explicit mobile-safe Servant, Mystic Code, target, and Order Change controls", () => {
    const session = createInitialBattleSession(setup("skill-ui-controls"));
    const markup = renderToStaticMarkup(createElement(SkillControls, {
      session,
      onSessionChange: () => undefined,
      onMessage: () => undefined,
    }));

    expect(markup).toContain("スキル操作");
    expect(markup).toContain("味方単体の選択対象");
    expect(markup).toContain("罪源業車");
    expect(markup).toContain("応急支援");
    expect(markup).toContain("交換する前衛");
    expect(markup).toContain("交換する控え");
    expect(markup).toContain("オーダーチェンジ");
  });
});
