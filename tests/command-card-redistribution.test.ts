import { describe, expect, it } from "vitest";
import { selectedCardsAfterCommandRedistribution } from "../src/App";
import {
  createBattleAttackDataRegistry,
} from "../src/core/battle/actionData";
import {
  createBattleSession,
  createBattleSuspendSave,
  parseBattleSuspendSave,
  replayBattleSession,
  resolveBattleSessionAllySkill,
  resolveBattleSessionMysticCodeSkill,
  restoreBattleSession,
  type BattleSession,
} from "../src/core/battle/session";
import { createBattleState } from "../src/core/battle/state";
import { BattleRng } from "../src/core/rng";
import { createCommandCardDeck } from "../src/core/cards/deck";
import {
  createMysticCodeDataRegistry,
  MYSTIC_CODE_DATA_SCHEMA_VERSION,
} from "../src/data/mysticCodes";
import {
  createBattleActionEffectDataRegistry,
  type CombatantActionEffectData,
} from "../src/effects/actionData";
import { unit } from "./helpers/battle";
import { combatantData } from "./helpers/attackData";

const REDISTRIBUTE_SKILL_ID = "test-redistribute-command-cards";

function redistributionEffect(stableId = "test-redistribution-effect") {
  return {
    kind: "effect" as const,
    stableId,
    order: 1,
    description: "テスト用カード再配布",
    target: {
      relation: "self" as const,
      selection: "single" as const,
      life: "alive" as const,
    },
    action: { kind: "redistribute_command_cards" as const },
  };
}

function testActionData(instanceId: string): CombatantActionEffectData {
  return {
    instanceId,
    dataId: instanceId,
    passives: [],
    actions: [{
      stableId: REDISTRIBUTE_SKILL_ID,
      name: "テスト用再配布",
      kind: "skill",
      skillSlot: 1,
      cooldownAtMax: 5,
      attackOrder: null,
      effects: [redistributionEffect()],
    }],
  };
}

function createSession(
  frontlineCount = 3,
  options: {
    seed?: string;
    legacy?: boolean;
    reserveCount?: number;
    withMysticCode?: boolean;
  } = {},
): BattleSession {
  const frontline = Array.from({ length: 3 }, (_, index) =>
    unit(`ally-${index + 1}`, "ally", {
      dataId: `ally-${index + 1}`,
      skillCooldowns: [0, 0, 0],
    })
  );
  const reserve = Array.from(
    { length: options.reserveCount ?? 0 },
    (_, index) => unit(`reserve-${index + 1}`, "ally", {
      dataId: `reserve-${index + 1}`,
      skillCooldowns: [0, 0, 0],
    }),
  );
  let state = createBattleState({
    ally: { frontline, reserve },
    waves: [{
      enemy: {
        frontline: [unit("enemy-1", "enemy"), null, null],
        reserve: [],
      },
    }],
    enemyFrontlineLimit: 3,
  });
  if (frontlineCount < 3) {
    const displaced = state.formation.ally.frontline.slice(frontlineCount)
      .filter((candidate): candidate is NonNullable<typeof candidate> =>
        candidate !== null
      );
    const reducedAlly = {
      ...state.formation.ally,
      frontline: state.formation.ally.frontline.map((candidate, index) =>
        candidate && index >= frontlineCount ? null : candidate
      ),
      reserve: [...state.formation.ally.reserve, ...displaced],
    };
    state = {
      ...state,
      formation: { ...state.formation, ally: reducedAlly },
      commandDeck: createCommandCardDeck(reducedAlly),
    };
  }
  state = {
    ...state,
    commandStars: 7,
    nextCommandStars: 4,
    ...(options.legacy
      ? {
          commandStarDistributionMode:
            "legacy_on_command_confirmation" as const,
          commandStarDistribution: null,
        }
      : {}),
  };
  const allAllies = [...frontline, ...reserve].filter(
    (candidate): candidate is NonNullable<typeof candidate> =>
      candidate !== null,
  );
  const attackRegistry = createBattleAttackDataRegistry(
    allAllies.map((ally) => combatantData(ally.instanceId, ally.dataId, {
      starWeight: 100 + allAllies.indexOf(ally),
    })),
  );
  const actionEffectRegistry = createBattleActionEffectDataRegistry(
    allAllies.map(({ instanceId }) => testActionData(instanceId)),
  );

  if (!options.withMysticCode) {
    return createBattleSession({
      state,
      rng: new BattleRng(options.seed ?? "redistribution"),
      registry: attackRegistry,
      actionEffectRegistry,
    });
  }

  const mysticCode = {
    schemaVersion: MYSTIC_CODE_DATA_SCHEMA_VERSION,
    dataId: "test-redistribution-code",
    name: "テスト用魔術礼装",
    levelPolicy: "max" as const,
    skills: [{
      stableId: "test-order-change",
      name: "テスト用オーダーチェンジ",
      slot: 1 as const,
      cooldownAtMax: 5,
      execution: "order_change" as const,
      effects: [],
    }, {
      stableId: "test-mystic-redistribution",
      name: "テスト用魔術礼装再配布",
      slot: 2 as const,
      cooldownAtMax: 5,
      execution: "effects" as const,
      effects: [redistributionEffect("test-mystic-redistribution-effect")],
    }, {
      stableId: "test-unused-skill",
      name: "テスト用未使用スキル",
      slot: 3 as const,
      cooldownAtMax: 5,
      execution: "effects" as const,
      effects: [redistributionEffect("test-unused-redistribution-effect")],
    }] as const,
    sources: [{ url: "https://example.com/test", checkedAt: "2026-08-10" }],
  };
  state = {
    ...state,
    loadout: {
      initialized: true,
      mysticCode: {
        dataId: mysticCode.dataId,
        name: mysticCode.name,
        levelPolicy: "max",
        skillStableIds: mysticCode.skills.map(({ stableId }) => stableId) as [
          string,
          string,
          string,
        ],
      },
      craftEssencesByInstanceId: {},
    },
  };
  return createBattleSession({
    state,
    rng: new BattleRng(options.seed ?? "redistribution"),
    registry: attackRegistry,
    actionEffectRegistry,
    mysticCodeRegistry: createMysticCodeDataRegistry([mysticCode]),
  });
}

function useRedistribution(session: BattleSession) {
  return resolveBattleSessionAllySkill(session, {
    kind: "ally_skill",
    sourceInstanceId: session.loop.state.formation.ally.frontline.find(
      (candidate) => candidate?.alive,
    )!.instanceId,
    skillStableId: REDISTRIBUTE_SKILL_ID,
  });
}

describe("redistribute_command_cards common battlefield action", () => {
  it.each([
    [1, 5],
    [2, 10],
    [3, 15],
  ])("rebuilds a %i-unit frontline as a %i-card cycle", (units, cards) => {
    const session = createSession(units, { seed: `frontline-${units}` });
    const previousHand = session.loop.state.commandDeck.currentHand.map(
      ({ cardId }) => cardId,
    );
    const before = session.loop.rng.snapshot();
    const resolved = useRedistribution(session);

    expect(resolved.result.accepted).toBe(true);
    expect(resolved.session.loop.state.commandDeck).toMatchObject({
      cycle: 2,
      drawsInCycle: 1,
      lastRebuildReason: "card_redistribution",
    });
    expect(resolved.session.loop.state.commandDeck.sourceCards).toHaveLength(cards);
    expect(resolved.session.loop.state.commandDeck.remainingCards)
      .toHaveLength(cards - 5);
    expect(resolved.session.loop.state.commandDeck.currentHand).toHaveLength(5);
    expect(resolved.session.loop.state.commandStars).toBe(7);
    expect(resolved.session.loop.state.nextCommandStars).toBe(4);
    expect(resolved.session.loop.state.commandStarDistribution).toMatchObject({
      outcome: "resolved",
      commandStars: 7,
    });
    expect(resolved.session.loop.state.commandStarDistribution?.cards)
      .toHaveLength(5);
    expect(resolved.session.loop.rng.snapshot().streams.cards.drawCount)
      .toBe(before.streams.cards.drawCount + 5);
    expect(resolved.session.loop.rng.snapshot().streams.critical.drawCount)
      .toBe(before.streams.critical.drawCount + 11);
    expect(resolved.session.loop.state.commandDeck.currentHand.every(
      (card) => !card.cardId.includes("noble_phantasm"),
    )).toBe(true);
    if (units === 1) {
      expect(new Set(
        resolved.session.loop.state.commandDeck.currentHand.map(
          ({ cardId }) => cardId,
        ),
      )).toEqual(new Set(previousHand));
    }
  });

  it("records cooldown, history, ally_input result, card draws, and star allocation", () => {
    const resolved = useRedistribution(createSession(3, {
      seed: "redistribution-log",
    }));
    expect(resolved.result.accepted).toBe(true);
    expect(resolved.session.loop.state.formation.ally.frontline[0])
      .toMatchObject({ skillCooldowns: [5, 0, 0] });
    expect(resolved.session.operationHistory).toEqual([{
      kind: "ally_skill",
      sourceInstanceId: "ally-1",
      skillStableId: REDISTRIBUTE_SKILL_ID,
    }]);
    expect(resolved.session.inputLogs[0]?.setupRngEvents.filter(
      ({ stream }) => stream === "cards",
    )).toHaveLength(5);
    expect(resolved.session.inputLogs[0]?.setupRngEvents.filter(
      ({ stream }) => stream === "critical",
    )).toHaveLength(11);
    expect(resolved.session.inputLogs[0]).toMatchObject({
      kind: "ally_input",
      status: "completed",
      entries: [{
        action: { kind: "ally_skill", stableId: REDISTRIBUTE_SKILL_ID },
        outcome: { status: "resolved" },
        declaredEffects: [{
          effects: [{
            commandCardRedistribution: {
              cycleBefore: 1,
              cycleAfter: 2,
              sourceCardCount: 15,
              remainingCardCount: 10,
              commandStarsBefore: 7,
              commandStarsAfter: 7,
              nextCommandStarsBefore: 4,
              nextCommandStarsAfter: 4,
              starDistribution: { commandStars: 7 },
            },
          }],
        }],
      }],
    });
  });

  it("rejects invalid boundaries and corrupt candidates without any mutation", () => {
    const original = createSession(3, { seed: "atomic-rejection" });
    const corrupt: BattleSession = {
      ...original,
      loop: {
        ...original.loop,
        state: {
          ...original.loop.state,
          commandDeck: {
            ...original.loop.state.commandDeck,
            currentHand: original.loop.state.commandDeck.currentHand.slice(0, 4),
          },
        },
      },
    };
    const before = JSON.stringify(createBattleSuspendSave(original));
    const rejected = useRedistribution(corrupt);
    expect(rejected.result).toMatchObject({
      accepted: false,
      reason: "command_card_redistribution_invalid",
    });
    expect(rejected.session).toBe(corrupt);
    expect(JSON.stringify(createBattleSuspendSave(original))).toBe(before);

    const wrongPhase = {
      ...original,
      loop: {
        ...original.loop,
        state: { ...original.loop.state, phase: "enemy_action" as const },
      },
    };
    const boundaryRejected = useRedistribution(wrongPhase);
    expect(boundaryRejected.result).toMatchObject({
      accepted: false,
      reason: "invalid_phase",
    });
    expect(boundaryRejected.session).toBe(wrongPhase);

    const unsupported = {
      ...original,
      registry: createBattleAttackDataRegistry([]),
    };
    const unsupportedRejected = useRedistribution(unsupported);
    expect(unsupportedRejected.result).toMatchObject({
      accepted: false,
      reason: "command_card_redistribution_invalid",
    });
    expect(unsupportedRejected.session).toBe(unsupported);
  });

  it("rebuilds from the current frontline after Order Change", () => {
    let session = createSession(3, {
      seed: "order-change-redistribution",
      reserveCount: 1,
      withMysticCode: true,
    });
    const exchanged = resolveBattleSessionMysticCodeSkill(session, {
      kind: "mystic_code_skill",
      skillStableId: "test-order-change",
      orderChange: {
        frontlineInstanceId: "ally-1",
        reserveInstanceId: "reserve-1",
      },
    });
    expect(exchanged.result.accepted).toBe(true);
    session = exchanged.session;
    const redistributed = resolveBattleSessionMysticCodeSkill(session, {
      kind: "mystic_code_skill",
      skillStableId: "test-mystic-redistribution",
    });
    expect(redistributed.result.accepted).toBe(true);
    const owners = new Set(
      redistributed.session.loop.state.commandDeck.sourceCards.map(
        ({ ownerInstanceId }) => ownerInstanceId,
      ),
    );
    expect(owners).toEqual(new Set(["reserve-1", "ally-2", "ally-3"]));
    expect(owners.has("ally-1")).toBe(false);
  });

  it("migrates format 4 data 1.37 and format 3 without RNG, then transitions on first success", () => {
    for (const format of ["format4", "format3"] as const) {
      const legacySession = createSession(3, {
        seed: `legacy-${format}`,
        legacy: true,
      });
      const old = structuredClone(createBattleSuspendSave(legacySession)) as
        unknown as Record<string, unknown>;
      const initial = old.initial as { state: Record<string, unknown> };
      const current = old.current as { state: Record<string, unknown> };
      delete initial.state.commandStarDistributionMode;
      delete initial.state.commandStarDistribution;
      delete current.state.commandStarDistributionMode;
      delete current.state.commandStarDistribution;
      if (format === "format4") {
        old.dataSchemaVersion = "1.37.0";
      } else {
        old.schemaVersion = 3;
        old.dataSchemaVersion = "1.36.0";
        old.battleLogSchemaVersion = 4;
        delete old.inputLogs;
        delete old.inputLogsComplete;
      }
      const beforeRng = structuredClone(
        (old.current as { rng: unknown }).rng,
      );
      const migrated = parseBattleSuspendSave(JSON.stringify(old));
      expect(migrated.dataSchemaVersion).toBe("1.38.0");
      expect(migrated.current.rng).toEqual(beforeRng);
      expect(migrated.current.state).toMatchObject({
        commandStarDistributionMode: "legacy_on_command_confirmation",
        commandStarDistribution: null,
      });
      const restored = restoreBattleSession(migrated);
      expect(replayBattleSession(migrated).loop.rng.snapshot())
        .toEqual(restored.loop.rng.snapshot());
      const redistributed = useRedistribution(restored);
      expect(redistributed.result.accepted).toBe(true);
      expect(redistributed.session.loop.state).toMatchObject({
        commandStarDistributionMode: "input_boundary_persisted",
        commandStarDistribution: { outcome: "resolved", commandStars: 7 },
      });
    }
  });

  it("directly resumes and fixed-seed replays every state, log, history, and RNG stream", () => {
    const first = useRedistribution(createSession(3, {
      seed: "save-replay-redistribution",
    })).session;
    const second = useRedistribution(createSession(3, {
      seed: "save-replay-redistribution",
    })).session;
    expect(createBattleSuspendSave(first)).toEqual(createBattleSuspendSave(second));

    const save = createBattleSuspendSave(first);
    const restored = restoreBattleSession(save);
    const replayed = replayBattleSession(save);
    expect(createBattleSuspendSave(restored)).toEqual(save);
    expect(replayed.loop.state).toEqual(restored.loop.state);
    expect(replayed.loop.rng.snapshot()).toEqual(restored.loop.rng.snapshot());
    expect(replayed.operationHistory).toEqual(restored.operationHistory);
    expect(replayed.inputLogs).toEqual(restored.inputLogs);
  });

  it("rejects a tampered persisted star allocation instead of recalculating it", () => {
    const save = createBattleSuspendSave(createSession(3, {
      seed: "tampered-star-allocation",
    }));
    const allocation = save.current.state.commandStarDistribution;
    expect(allocation?.outcome).toBe("resolved");
    if (!allocation || allocation.outcome !== "resolved") return;
    allocation.cards[0]!.stars += 1;
    expect(() => restoreBattleSession(save)).toThrow(
      "input-boundary command star distribution is missing or inconsistent",
    );
  });

  it.each([0, 1, 2, 3])(
    "lets the UI clear %i temporary selections only after engine success",
    (count) => {
      const selected = Array.from({ length: count }, (_, index) => `card-${index}`);
      expect(selectedCardsAfterCommandRedistribution(selected, true)).toEqual([]);
      expect(selectedCardsAfterCommandRedistribution(selected, false))
        .toEqual(selected);
    },
  );
});
