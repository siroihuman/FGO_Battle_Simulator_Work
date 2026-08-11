import { describe, expect, it } from "vitest";
import {
  createBattleAttackDataRegistry,
} from "../src/core/battle/actionData";
import {
  findUnitLocation,
  replaceUnit,
} from "../src/core/battle/formation";
import {
  createBattleState,
  type BattleState,
} from "../src/core/battle/state";
import type {
  NoblePhantasmState,
} from "../src/core/battle/types";
import { BattleRng } from "../src/core/rng";
import {
  resolveAllyCommandAttacks,
  type AllyCommandAttackDetail,
} from "../src/core/cards/commandAttack";
import {
  createBattleActionEffectDataRegistry,
  type CombatantActionEffectData,
} from "../src/effects/actionData";
import { createTraitGrantEffect } from "../src/effects/classification";
import {
  createNoblePhantasmCardTypeChangeEffect,
} from "../src/effects/noblePhantasmCardType";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import {
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import {
  listCommandCardChoices,
  selectCommandCards,
  type CommandCardSelection,
} from "../src/core/cards/selection";
import { combatantData } from "./helpers/attackData";
import { unit } from "./helpers/battle";

function noblePhantasm(
  cardType: NoblePhantasmState["cardType"] = "arts",
): NoblePhantasmState {
  return {
    stableId: "np-a",
    name: "NP A",
    cardType,
    level: 2,
  };
}

function battle(): BattleState {
  return createBattleState({
    ally: {
      frontline: [
        unit("ally-a", "ally", {
          dataId: "same-servant",
          np: 20_000,
          noblePhantasm: noblePhantasm(),
          commandCards: [
            "buster",
            "buster",
            "buster",
            "arts",
            "quick",
          ],
        }),
        unit("ally-b", "ally", {
          dataId: "same-servant",
        }),
        unit("ally-c", "ally"),
      ],
      reserve: [],
    },
    waves: [
      {
        enemy: {
          frontline: [
            unit("enemy-a", "enemy", {
              hp: 1_000_000,
              maxHp: 1_000_000,
              baseMaxHp: 1_000_000,
            }),
            unit("enemy-b", "enemy", {
              hp: 1_000_000,
              maxHp: 1_000_000,
              baseMaxHp: 1_000_000,
            }),
            null,
          ],
          reserve: [],
        },
      },
    ],
    enemyFrontlineLimit: 3,
  });
}

function withHand(
  state: BattleState,
  requested: readonly [string, number][],
): BattleState {
  const selected = requested.map(([ownerInstanceId, cardIndex]) => {
    const card = state.commandDeck.sourceCards.find(
      (candidate) =>
        candidate.ownerInstanceId === ownerInstanceId
        && candidate.cardIndex === cardIndex,
    );
    if (!card) throw new Error("missing requested card");
    return card;
  });
  const fillers = state.commandDeck.sourceCards
    .filter(
      (candidate) =>
        !selected.some(
          ({ cardId }) => cardId === candidate.cardId,
        ),
    )
    .slice(0, 5 - selected.length);
  return {
    ...state,
    commandStarDistributionMode: "legacy_on_command_confirmation",
    commandStarDistribution: null,
    commandDeck: {
      ...state.commandDeck,
      currentHand: [...selected, ...fillers],
    },
  };
}

function cardId(
  state: BattleState,
  ownerInstanceId: string,
  cardIndex?: number,
): string {
  const choice = listCommandCardChoices(state).find(({ card }) =>
    card.ownerInstanceId === ownerInstanceId
    && (
      cardIndex === undefined
        ? card.kind === "noble_phantasm"
        : card.kind === "normal"
          && card.cardIndex === cardIndex
    )
  );
  if (!choice) throw new Error("missing card choice");
  return choice.card.cardId;
}

function selection(
  state: BattleState,
  cardIds: readonly string[],
): CommandCardSelection {
  const selected = selectCommandCards(state, cardIds);
  if (!selected.accepted) {
    throw new Error(`selection rejected: ${selected.reason}`);
  }
  return selected.selection;
}

function registry(
  specialAttackRequiredTargetTraits?: readonly string[],
) {
  return createBattleAttackDataRegistry([
    combatantData("ally-a", "same-servant", {
      attack: 10_000,
      attackNpUnits: 100,
      starRatePermille: 1_000,
      commandCardHitWeights: [
        [1],
        [1, 1],
        [1, 1, 1],
        [1],
        [1],
      ],
      extraAttackHitWeights: [1, 1, 1, 1],
      noblePhantasms: [
        {
          stableId: "np-a",
          targetScope: "all",
          hitWeights: [1, 1],
          damageMultiplierPermilleByLevel: [
            3_000,
            4_000,
            4_500,
            4_750,
            5_000,
          ],
          specialAttackPermilleByOvercharge: [
            1_000,
            1_100,
            1_200,
            1_300,
            1_400,
          ],
          ...(specialAttackRequiredTargetTraits
            ? { specialAttackRequiredTargetTraits }
            : {}),
        },
      ],
    }),
    combatantData("ally-b", "same-servant", {
      attack: 20_000,
    }),
    combatantData("ally-c", "ally-c"),
  ]);
}

function npEffectData(
  effects: CombatantActionEffectData["actions"][number]["effects"] = [
    {
      kind: "effect",
      stableId: "np-a-attack-up",
      order: 1,
      description: "攻撃前に自身の攻撃力を上げる",
      target: { relation: "self", selection: "single" },
      action: {
        kind: "apply_effects",
        effects: [{
          template: {
            stableId: "np-a-attack-up-state",
            name: "攻撃力アップ",
            effectType: "attack",
            category: "buff",
            value: 1_000,
            removalPolicy: "removable",
            durationTick: "owner_turn_end",
            remainingTurns: 1,
          },
        }],
      },
    },
    {
      kind: "effect",
      stableId: "np-a-refund",
      order: 3,
      description: "攻撃後にOCでNPを増やす",
      target: { relation: "self", selection: "single" },
      action: {
        kind: "change_np",
        amount: {
          scaling: "overcharge",
          values: [1_000, 1_500, 2_000, 2_500, 3_000],
        },
      },
    },
  ],
) {
  return createBattleActionEffectDataRegistry([{
    instanceId: "ally-a",
    dataId: "same-servant",
    passives: [],
    actions: [{
      stableId: "np-a",
      name: "NP A",
      kind: "noble_phantasm",
      attackOrder: 2,
      effects,
    }],
  }]);
}

function streams(seed: string) {
  const rng = new BattleRng(seed);
  return {
    rng,
    streams: {
      effects: rng.stream("effects"),
      critical: rng.stream("critical"),
      damage: rng.stream("damage"),
      stars: rng.stream("stars"),
    },
  };
}

describe("ally command data-to-attack integration", () => {
  it("uses card-specific Hits, critical input, and Extra data through one full Brave chain", () => {
    const state = {
      ...withHand(battle(), [
        ["ally-a", 0],
        ["ally-a", 1],
        ["ally-a", 2],
      ]),
      commandStars: 50,
    };
    const selected = selection(state, [
      cardId(state, "ally-a", 0),
      cardId(state, "ally-a", 1),
      cardId(state, "ally-a", 2),
    ]);
    const random = streams("command-attack-brave");
    const resolved = resolveAllyCommandAttacks({
      state,
      selection: selected,
      registry: registry(),
      rng: random.streams,
    });

    expect(resolved.sequence.accepted).toBe(true);
    if (!resolved.sequence.accepted) return;
    const actions = resolved.sequence.result.actions;
    expect(actions).toHaveLength(4);
    const details = actions.map(
      ({ resolverDetail }) =>
        resolverDetail as AllyCommandAttackDetail,
    );
    expect(details.every(({ outcome }) => outcome === "resolved"))
      .toBe(true);
    expect(resolved.starDistribution).toMatchObject({
      outcome: "resolved",
      commandStars: 50,
      distributed: 50,
      unassigned: 0,
    });
    if (resolved.starDistribution.outcome === "resolved") {
      expect(
        resolved.starDistribution.cards.every(
          ({ stars }) => stars === 10,
        ),
      ).toBe(true);
    }
    expect(
      details.map((detail) =>
        detail.outcome === "resolved"
          ? detail.resolution.attack?.attack.hits.length
          : 0
      ),
    ).toEqual([1, 2, 3, 4]);
    expect(
      details[0]?.outcome === "resolved"
        ? details[0].critical
        : null,
    ).toMatchObject({
      assignedStars: 10,
      ratePermille: 1_000,
      rolled: false,
      isCritical: true,
    });
    expect(
      details[3]?.outcome === "resolved"
        ? details[3].calculation.extraCardModifierPermille
        : null,
    ).toBe(3_500);
    expect(resolved.sequence.result.state.phase).toBe(
      "ally_turn_end",
    );
  });

  it("uses NP level and OC for an all-target NP, then refunds NP from every target", () => {
    const state = withHand(battle(), [
      ["ally-b", 0],
      ["ally-c", 0],
    ]);
    const npCardId = cardId(state, "ally-a");
    const selected = selection(state, [
      npCardId,
      cardId(state, "ally-b", 0),
      cardId(state, "ally-c", 0),
    ]);
    const random = streams("command-attack-np");
    const resolved = resolveAllyCommandAttacks({
      state,
      selection: selected,
      registry: registry(),
      rng: random.streams,
      additionalOverchargeStagesByCardId: {
        [npCardId]: 1,
      },
    });

    expect(resolved.sequence.accepted).toBe(true);
    if (!resolved.sequence.accepted) return;
    const detail = resolved.sequence.result.actions[0]
      ?.resolverDetail as AllyCommandAttackDetail;
    expect(detail).toMatchObject({
      outcome: "resolved",
      targetScope: "all",
      targetInstanceIds: ["enemy-a", "enemy-b"],
      overchargeStage: 3,
      calculation: {
        npDamageMultiplierPermille: 4_000,
        npSpecialAttackPermille: 1_200,
      },
    });
    if (detail.outcome !== "resolved") return;
    expect(detail.resolution.attack?.attack.hits).toHaveLength(4);
    expect(
      findUnitLocation(
        resolved.sequence.result.state.formation,
        "ally-a",
      )?.unit.np,
    ).toBeGreaterThan(0);
  });

  it("runs declared NP effects around damage and writes their resolved results to the action log", () => {
    const state = withHand(battle(), [
      ["ally-b", 0],
      ["ally-c", 0],
    ]);
    const npCardId = cardId(state, "ally-a");
    const selected = selection(state, [
      npCardId,
      cardId(state, "ally-b", 0),
      cardId(state, "ally-c", 0),
    ]);
    const baselineRandom = streams("declared-np-order");
    const baseline = resolveAllyCommandAttacks({
      state,
      selection: selected,
      registry: registry(),
      rng: baselineRandom.streams,
      additionalOverchargeStagesByCardId: { [npCardId]: 1 },
    });
    const effectRandom = streams("declared-np-order");
    const resolved = resolveAllyCommandAttacks({
      state,
      selection: selected,
      registry: registry(),
      actionEffectRegistry: npEffectData(),
      rng: effectRandom.streams,
      additionalOverchargeStagesByCardId: { [npCardId]: 1 },
    });
    const replayRandom = streams("declared-np-order");
    const replay = resolveAllyCommandAttacks({
      state,
      selection: selected,
      registry: registry(),
      actionEffectRegistry: npEffectData(),
      rng: replayRandom.streams,
      additionalOverchargeStagesByCardId: { [npCardId]: 1 },
    });
    expect(resolved.sequence.accepted).toBe(true);
    expect(baseline.sequence.accepted).toBe(true);
    if (!resolved.sequence.accepted || !baseline.sequence.accepted) return;
    const detail = resolved.sequence.result.actions[0]
      ?.resolverDetail as AllyCommandAttackDetail;
    const baselineDetail = baseline.sequence.result.actions[0]
      ?.resolverDetail as AllyCommandAttackDetail;
    expect(detail.outcome).toBe("resolved");
    expect(baselineDetail.outcome).toBe("resolved");
    if (detail.outcome !== "resolved" || baselineDetail.outcome !== "resolved") {
      return;
    }
    expect(detail.declaredEffects.map(({ phase }) => phase)).toEqual([
      "before_attack",
      "after_attack",
    ]);
    expect(detail.declaredEffects[1]?.result.effects[0]).toMatchObject({
      effectStableId: "np-a-refund",
      resolvedAmount: 2_000,
      targetInstanceIds: ["ally-a"],
    });
    expect(
      detail.resolution.attack?.attack.targets.reduce(
        (total, target) => total + target.totalDamage,
        0,
      ),
    ).toBeGreaterThan(
      baselineDetail.resolution.attack?.attack.targets.reduce(
        (total, target) => total + target.totalDamage,
        0,
      ) ?? 0,
    );
    expect(resolved.battleLog.entries[0]?.declaredEffects).toMatchObject([
      {
        phase: "before_attack",
        effects: [{ effectStableId: "np-a-attack-up" }],
      },
      {
        phase: "after_attack",
        effects: [{
          effectStableId: "np-a-refund",
          resolvedAmount: 2_000,
          results: [{ npChange: 2_000 }],
        }],
      },
    ]);
    expect(replay.battleLog).toEqual(resolved.battleLog);
    expect(replay.sequence).toEqual(resolved.sequence);
  });

  it("logs declared NP star gain and signed enemy charge reduction", () => {
    const baseState = battle();
    const chargedState = {
      ...baseState,
      formation: {
        ...baseState.formation,
        enemy: {
          ...baseState.formation.enemy,
          frontline: baseState.formation.enemy.frontline.map((target) =>
            target
              ? {
                  ...target,
                  enemyAction: {
                    maxActions: "auto" as const,
                    normalAttack: null,
                    skills: [],
                    noblePhantasm: {
                      stableId: `${target.instanceId}-np`,
                      name: "敵宝具",
                    },
                    charge: 3,
                    chargeMax: 5,
                  },
                }
              : null
          ),
        },
      },
    };
    const state = withHand(chargedState, [
      ["ally-b", 0],
      ["ally-c", 0],
    ]);
    const selected = selection(state, [
      cardId(state, "ally-a"),
      cardId(state, "ally-b", 0),
      cardId(state, "ally-c", 0),
    ]);
    const actionEffects = npEffectData([
      {
        kind: "effect",
        stableId: "np-a-stars",
        order: 1,
        description: "次回用スターを獲得する",
        target: { relation: "self", selection: "single" },
        action: {
          kind: "gain_stars",
          amount: 7,
          destination: "next_command",
        },
      },
      {
        kind: "effect",
        stableId: "np-a-charge-down",
        order: 3,
        description: "敵全体のチャージを1減らす",
        target: { relation: "enemies", selection: "all" },
        action: { kind: "change_enemy_charge", amount: -1 },
      },
    ]);
    const random = streams("np-state-actions");
    const resolved = resolveAllyCommandAttacks({
      state,
      selection: selected,
      registry: registry(),
      actionEffectRegistry: actionEffects,
      rng: random.streams,
    });
    expect(resolved.sequence.accepted).toBe(true);
    if (!resolved.sequence.accepted) return;
    for (const instanceId of ["enemy-a", "enemy-b"]) {
      expect(findUnitLocation(
        resolved.sequence.result.state.formation,
        instanceId,
      )?.unit.enemyAction?.charge).toBe(2);
    }
    expect(resolved.battleLog.entries[0]?.declaredEffects).toMatchObject([
      {
        phase: "before_attack",
        effects: [{
          effectStableId: "np-a-stars",
          starAddition: {
            bucket: "next_command",
            requested: 7,
            before: 0,
            added: 7,
            after: 7,
          },
        }],
      },
      {
        phase: "after_attack",
        effects: [{
          effectStableId: "np-a-charge-down",
          results: [
            { targetInstanceId: "enemy-a", enemyChargeChange: -1 },
            { targetInstanceId: "enemy-b", enemyChargeChange: -1 },
          ],
        }],
      },
    ]);
  });

  it("passes NP trigger context through command execution and logs triggered stars", () => {
    const baseState = battle();
    const registered = applyEffect(
      {
        ...baseState.formation.ally.frontline[0]!,
        skillCooldowns: [4, 2, 0],
      },
      {
        stableId: "np-use-trigger",
        name: "宝具使用時発動",
        effectType: "np_use_trigger",
        category: "buff",
        remainingTurns: 1,
        remainingUses: 1,
        trigger: {
          timing: "after_attack",
          consumeUseOnActivation: true,
          condition: {
            actor: "owner",
            attackKinds: ["noble_phantasm"],
          },
          actions: [
            {
              target: { relation: "self", selection: "single" },
              action: { kind: "advance_skill_cooldowns", amount: 1 },
            },
            {
              target: { relation: "self", selection: "single" },
              action: {
                kind: "apply_effects",
                effects: [{
                  template: {
                    stableId: "np-use-critical-up",
                    name: "クリティカル威力アップ",
                    effectType: COMMON_EFFECT_TYPES.criticalDamage,
                    category: "buff",
                    value: 300,
                    remainingTurns: 3,
                  },
                }],
              },
            },
            {
              target: { relation: "self", selection: "single" },
              action: {
                kind: "gain_stars",
                amount: 15,
                destination: "next_command",
              },
            },
          ],
        },
      },
      null,
      createEffectRuntimeCounters(),
    );
    const state = withHand({
      ...baseState,
      formation: replaceUnit(baseState.formation, registered.unit),
    }, [
      ["ally-b", 0],
      ["ally-c", 0],
    ]);
    const selected = selection(state, [
      cardId(state, "ally-a"),
      cardId(state, "ally-b", 0),
      cardId(state, "ally-c", 0),
    ]);
    const random = streams("command-np-use-trigger");
    const resolved = resolveAllyCommandAttacks({
      state,
      selection: selected,
      registry: registry(),
      counters: registered.counters,
      rng: random.streams,
    });
    const replayRandom = streams("command-np-use-trigger");
    const replay = resolveAllyCommandAttacks({
      state,
      selection: selected,
      registry: registry(),
      counters: registered.counters,
      rng: replayRandom.streams,
    });
    expect(resolved.sequence.accepted).toBe(true);
    if (!resolved.sequence.accepted) return;
    expect(findUnitLocation(
      resolved.sequence.result.state.formation,
      "ally-a",
    )?.unit).toMatchObject({
      skillCooldowns: [3, 1, 0],
      effects: [{ stableId: "np-use-critical-up", value: 300 }],
    });
    const afterAttack = resolved.battleLog.entries[0]?.attack?.triggerStages
      .find(({ timing }) => timing === "after_attack");
    expect(afterAttack).toMatchObject({
      attackKind: "noble_phantasm",
      cardType: "arts",
      activations: [{
        effectStableId: "np-use-trigger",
        outcome: "activated",
        consumedUse: true,
        actions: [
          { actionKind: "advance_skill_cooldowns" },
          { actionKind: "apply_effects" },
          {
            actionKind: "gain_stars",
            starAddition: {
              bucket: "next_command",
              requested: 15,
              added: 15,
            },
          },
        ],
      }],
    });
    expect(resolved.battleLog.schemaVersion).toBe(5);
    expect(replay.battleLog).toEqual(resolved.battleLog);
    expect(replay.sequence).toEqual(resolved.sequence);
  });

  it("activates a normal-Buster-only state without matching NP or other colors", () => {
    const baseState = battle();
    const registered = applyEffect(
      {
        ...baseState.formation.ally.frontline[0]!,
        np: 0,
      },
      {
        stableId: "normal-buster-np-state",
        name: "Buster通常攻撃時NP獲得",
        effectType: "normal_buster_np_state",
        category: "buff",
        remainingTurns: 3,
        trigger: {
          timing: "after_attack",
          condition: {
            actor: "owner",
            attackKinds: ["normal_command"],
            cardTypes: ["buster"],
          },
          actions: [{
            target: { relation: "self", selection: "single" },
            action: { kind: "change_np", amount: 1_000 },
          }],
        },
      },
      null,
      createEffectRuntimeCounters(),
    );
    const state = withHand({
      ...baseState,
      formation: replaceUnit(baseState.formation, registered.unit),
    }, [
      ["ally-a", 0],
      ["ally-b", 0],
      ["ally-c", 0],
    ]);
    const selected = selection(state, [
      cardId(state, "ally-a", 0),
      cardId(state, "ally-b", 0),
      cardId(state, "ally-c", 0),
    ]);
    const random = streams("normal-buster-trigger");
    const resolved = resolveAllyCommandAttacks({
      state,
      selection: selected,
      registry: registry(),
      counters: registered.counters,
      rng: random.streams,
    });
    expect(resolved.sequence.accepted).toBe(true);
    if (!resolved.sequence.accepted) return;
    expect(findUnitLocation(
      resolved.sequence.result.state.formation,
      "ally-a",
    )?.unit.np).toBe(1_000);
    expect(
      resolved.battleLog.entries[0]?.attack?.triggerStages
        .find(({ timing }) => timing === "after_attack"),
    ).toMatchObject({
      attackKind: "normal_command",
      cardType: "buster",
      activations: [{
        effectStableId: "normal-buster-np-state",
        actions: [{
          actionKind: "change_np",
          results: [{ npChange: 1_000 }],
        }],
      }],
    });
    expect(random.rng.stream("effects").snapshot().drawCount).toBe(0);
  });

  it("uses a temporary Buster NP type through chain, attack input, triggers, and logs", () => {
    const baseState = battle();
    const changed = applyEffect(
      baseState.formation.ally.frontline[0]!,
      createNoblePhantasmCardTypeChangeEffect(
        "buster",
        "宝具タイプをBusterに変更",
        { remainingTurns: 1 },
      ),
      "ally-b",
      createEffectRuntimeCounters(),
    );
    const state = withHand({
      ...baseState,
      formation: replaceUnit(baseState.formation, changed.unit),
    }, [
      ["ally-a", 0],
      ["ally-a", 1],
    ]);
    const selected = selection(state, [
      cardId(state, "ally-a"),
      cardId(state, "ally-a", 0),
      cardId(state, "ally-a", 1),
    ]);
    expect(selected.cards[0]).toMatchObject({
      kind: "noble_phantasm",
      type: "buster",
      noblePhantasmLevel: 2,
    });
    expect(state.formation.ally.frontline[0]?.noblePhantasm)
      .toMatchObject({ cardType: "arts", level: 2 });

    const random = streams("temporary-buster-np");
    const resolved = resolveAllyCommandAttacks({
      state,
      selection: selected,
      registry: registry(),
      counters: changed.counters,
      rng: random.streams,
    });
    const replayRandom = streams("temporary-buster-np");
    const replay = resolveAllyCommandAttacks({
      state,
      selection: selected,
      registry: registry(),
      counters: changed.counters,
      rng: replayRandom.streams,
    });
    expect(resolved.sequence.accepted).toBe(true);
    if (!resolved.sequence.accepted) return;
    expect(resolved.sequence.result.chain).toMatchObject({
      colorChain: "buster",
      braveChain: true,
      quickChainStars: 0,
      artsChainNpUnits: 0,
      extraAttack: { extraCardModifierPermille: 3_500 },
    });
    expect(resolved.battleLog.entries[0]).toMatchObject({
      action: {
        kind: "noble_phantasm",
        cardType: "buster",
      },
      calculation: {
        cardType: "buster",
        hitWeights: [1, 1],
        npDamageMultiplierPermille: 4_000,
      },
    });
    expect(
      resolved.battleLog.entries[0]?.attack?.triggerStages
        .find(({ timing }) => timing === "after_attack"),
    ).toMatchObject({
      attackKind: "noble_phantasm",
      cardType: "buster",
    });
    expect(findUnitLocation(
      resolved.sequence.result.state.formation,
      "ally-a",
    )?.unit.noblePhantasm).toMatchObject({
      cardType: "arts",
      level: 2,
    });
    expect(replay.sequence).toEqual(resolved.sequence);
    expect(replay.battleLog).toEqual(resolved.battleLog);
  });

  it("uses a declared pre-attack trait grant for the same NP's conditional special attack", () => {
    const state = withHand(battle(), [
      ["ally-b", 0],
      ["ally-c", 0],
    ]);
    const npCardId = cardId(state, "ally-a");
    const selected = selection(state, [
      npCardId,
      cardId(state, "ally-b", 0),
      cardId(state, "ally-c", 0),
    ]);
    const conditionalRegistry = registry(["evil"]);
    const baselineRandom = streams("conditional-special-attack");
    const baseline = resolveAllyCommandAttacks({
      state,
      selection: selected,
      registry: conditionalRegistry,
      rng: baselineRandom.streams,
    });
    const effectRegistry = npEffectData([{
      kind: "effect",
      stableId: "np-a-grant-evil",
      order: 1,
      description: "攻撃前に敵全体へ悪特性を付与する",
      target: { relation: "enemies", selection: "all" },
      action: {
        kind: "apply_effects",
        effects: [{
          template: createTraitGrantEffect("evil", "悪", {
            remainingTurns: 3,
          }),
        }],
      },
    }]);
    const grantedRandom = streams("conditional-special-attack");
    const granted = resolveAllyCommandAttacks({
      state,
      selection: selected,
      registry: conditionalRegistry,
      actionEffectRegistry: effectRegistry,
      rng: grantedRandom.streams,
    });

    expect(baseline.sequence.accepted).toBe(true);
    expect(granted.sequence.accepted).toBe(true);
    if (!baseline.sequence.accepted || !granted.sequence.accepted) return;
    const baselineDetail = baseline.sequence.result.actions[0]
      ?.resolverDetail as AllyCommandAttackDetail;
    const grantedDetail = granted.sequence.result.actions[0]
      ?.resolverDetail as AllyCommandAttackDetail;
    expect(baselineDetail.outcome).toBe("resolved");
    expect(grantedDetail.outcome).toBe("resolved");
    if (
      baselineDetail.outcome !== "resolved"
      || grantedDetail.outcome !== "resolved"
    ) return;
    expect(grantedDetail.calculation).toMatchObject({
      npSpecialAttackPermille: 1_100,
      npSpecialAttackRequiredTargetTraits: ["evil"],
    });
    const baselineDamage = baselineDetail.resolution.attack?.attack.targets
      .map(({ totalDamage }) => totalDamage) ?? [];
    const grantedDamage = grantedDetail.resolution.attack?.attack.targets
      .map(({ totalDamage }) => totalDamage) ?? [];
    expect(grantedDamage).toHaveLength(2);
    expect(grantedDamage.every((damage, index) =>
      damage > (baselineDamage[index] ?? damage)
    )).toBe(true);
    expect(grantedDetail.declaredEffects[0]).toMatchObject({
      phase: "before_attack",
      result: {
        effects: [{
          effectStableId: "np-a-grant-evil",
          targetInstanceIds: ["enemy-a", "enemy-b"],
        }],
      },
    });
    expect(findUnitLocation(
      granted.sequence.result.state.formation,
      "enemy-a",
    )?.unit.effects.some(
      ({ stableId }) => stableId === "trait-grant:evil",
    )).toBe(true);
  });

  it("fizzles an NP with unresolved declared effects before NP or action RNG is consumed", () => {
    const state = withHand(battle(), [
      ["ally-b", 0],
      ["ally-c", 0],
    ]);
    const selected = selection(state, [
      cardId(state, "ally-a"),
      cardId(state, "ally-b", 0),
      cardId(state, "ally-c", 0),
    ]);
    const unsupported = npEffectData([{
      kind: "effect",
      stableId: "np-a-future-effect",
      order: 1,
      description: "未対応効果",
      target: { relation: "self", selection: "single" },
      action: {
        kind: "unsupported",
        mechanicId: "future_np_effect",
      },
    }]);
    const random = streams("unresolved-np");
    const resolved = resolveAllyCommandAttacks({
      state,
      selection: selected,
      registry: registry(),
      actionEffectRegistry: unsupported,
      rng: random.streams,
    });
    expect(resolved.sequence.accepted).toBe(true);
    if (!resolved.sequence.accepted) return;
    expect(resolved.sequence.result.actions[0]?.preflight).toMatchObject({
      outcome: "fizzled",
      restrictions: ["action_effects_unresolved"],
      npConsumed: 0,
    });
    expect(resolved.sequence.result.actions[0]?.resolverCalled).toBe(false);
    expect(findUnitLocation(
      resolved.sequence.result.state.formation,
      "ally-a",
    )?.unit.np).toBe(20_000);
    expect(resolved.battleLog.entries[0]).toMatchObject({
      outcome: {
        status: "fizzled",
        reasons: ["action_effects_unresolved"],
      },
      declaredEffects: [],
      attack: null,
      rngEvents: [],
    });
  });

  it("rebuilds active all-target attack inputs after a lethal pre-attack NP effect", () => {
    const state = withHand(battle(), [
      ["ally-b", 0],
      ["ally-c", 0],
    ]);
    const selected = selection(state, [
      cardId(state, "ally-a"),
      cardId(state, "ally-b", 0),
      cardId(state, "ally-c", 0),
    ]);
    const actionEffects = npEffectData([
      {
        kind: "effect",
        stableId: "np-a-pre-defeat",
        order: 1,
        description: "攻撃前に選択対象のHPを0にする",
        target: { relation: "enemies", selection: "single" },
        action: {
          kind: "reduce_hp",
          amount: 1_000_000,
          canDefeat: true,
        },
      },
      {
        kind: "effect",
        stableId: "np-a-post-refund",
        order: 3,
        description: "攻撃後にNPを増やす",
        target: { relation: "self", selection: "single" },
        action: { kind: "change_np", amount: 500 },
      },
    ]);
    const random = streams("np-pre-effect-defeat");
    const resolved = resolveAllyCommandAttacks({
      state,
      selection: selected,
      registry: registry(),
      actionEffectRegistry: actionEffects,
      rng: random.streams,
      requestedTargetInstanceId: "enemy-a",
    });
    expect(resolved.sequence.accepted).toBe(true);
    if (!resolved.sequence.accepted) return;
    const first = resolved.sequence.result.actions[0];
    const detail = first?.resolverDetail as AllyCommandAttackDetail;
    expect(detail.outcome).toBe("resolved");
    if (detail.outcome !== "resolved") return;
    expect(detail.targetInstanceIds).toEqual(["enemy-a", "enemy-b"]);
    expect(
      detail.resolution.attack?.attack.targets.map(
        ({ targetInstanceId }) => targetInstanceId,
      ),
    ).toEqual(["enemy-b"]);
    expect(
      detail.resolution.attack?.attack.hits.every(
        ({ targetInstanceId }) => targetInstanceId === "enemy-b",
      ),
    ).toBe(true);
    expect(detail.resolution.deaths).toHaveLength(1);
    expect(first?.boundary.enemyReplacement.departures).toMatchObject([
      { instanceId: "enemy-a", area: "frontline", index: 0 },
    ]);
    expect(first?.boundary.nextEnemyTarget?.instanceId).toBe("enemy-b");
    expect(
      resolved.battleLog.entries[0]?.rngEvents.filter(
        ({ stream, operation }) =>
          stream === "damage" && operation === "integer",
      ),
    ).toHaveLength(1);
  });

  it("logs missing command data as safe no-ops without attack RNG", () => {
    const state = withHand(battle(), [
      ["ally-a", 0],
      ["ally-b", 0],
      ["ally-c", 0],
    ]);
    const selected = selection(state, [
      cardId(state, "ally-a", 0),
      cardId(state, "ally-b", 0),
      cardId(state, "ally-c", 0),
    ]);
    const random = streams("missing-command-data");
    const resolved = resolveAllyCommandAttacks({
      state,
      selection: selected,
      registry: createBattleAttackDataRegistry([]),
      rng: random.streams,
    });

    expect(resolved.sequence.accepted).toBe(true);
    if (!resolved.sequence.accepted) return;
    expect(
      resolved.sequence.result.actions.map(
        ({ resolverDetail }) => resolverDetail,
      ),
    ).toEqual([
      {
        outcome: "skipped",
        reason: "source_attack_data_missing",
      },
      {
        outcome: "skipped",
        reason: "source_attack_data_missing",
      },
      {
        outcome: "skipped",
        reason: "source_attack_data_missing",
      },
    ]);
    expect(
      Object.values(random.rng.snapshot().streams).every(
        ({ drawCount }) => drawCount === 0,
      ),
    ).toBe(true);
    expect(resolved.starDistribution).toMatchObject({
      outcome: "skipped",
      reason: "owner_attack_data_missing",
    });
  });
});
