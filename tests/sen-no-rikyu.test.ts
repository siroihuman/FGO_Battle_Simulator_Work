import { describe, expect, it } from "vitest";
import {
  findUnitLocation,
} from "../src/core/battle/formation";
import {
  resolveBattleAttackSequence,
} from "../src/core/battle/attackSequence";
import {
  createBattleSuspendSave,
  replayBattleSession,
  resolveBattleSessionAllySkill,
  restoreBattleSession,
} from "../src/core/battle/session";
import { createBattleState } from "../src/core/battle/state";
import { BattleRng } from "../src/core/rng";
import {
  LIGHT_KOYANSKAYA,
  SEN_NO_RIKYU,
  createServantBattleInstance,
} from "../src/data/servants";
import {
  createBattleActionEffectDataRegistry,
} from "../src/effects/actionData";
import {
  executeDeclaredActionEffects,
  initializeBattlePassives,
} from "../src/effects/actionExecution";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import { createEffectRuntimeCounters } from "../src/effects/runtime";
import type { AppliedEffect } from "../src/effects/types";
import { resolveAllySkillUse } from "../src/effects/skillExecution";
import { resolveSideTurnEnd } from "../src/effects/turnEnd";
import {
  registeredServantWikiUrl,
} from "../src/ui/battleUi";
import {
  registeredSkillIconPath,
  registeredStatusIconPath,
  unspecifiedEffectNames,
} from "../src/ui/iconRegistry";
import {
  createEmptyInitialBattleSetup,
  createInitialBattleSession,
  emptyInitialAllySlot,
  initialAllySelectionForServant,
} from "../src/ui/initialBattle";
import { unit } from "./helpers/battle";

function rikyu(instanceId = "rikyu", initialNp = 0) {
  return createServantBattleInstance(SEN_NO_RIKYU, {
    instanceId,
    level: 90,
    noblePhantasmLevel: 1,
    initialNp,
  });
}

function battle() {
  const source = rikyu();
  const state = createBattleState({
    ally: {
      frontline: [
        source.unit,
        unit("ally-b", "ally"),
        unit("ally-c", "ally"),
      ],
      reserve: [unit("ally-reserve", "ally")],
    },
    waves: [{
      enemy: {
        frontline: [
          unit("enemy-a", "enemy", { traits: ["人の力"] }),
          unit("enemy-b", "enemy"),
          unit("enemy-c", "enemy", { traits: ["人の力"] }),
        ],
        reserve: [],
      },
    }],
    enemyFrontlineLimit: 3,
  });
  return {
    source,
    state,
    registry: createBattleActionEffectDataRegistry([
      source.actionEffectData,
    ]),
  };
}

function effectIds(
  state: ReturnType<typeof createBattleState>,
  instanceId: string,
): string[] {
  return findUnitLocation(state.formation, instanceId)?.unit.effects.map(
    ({ stableId }) => stableId,
  ) ?? [];
}

function attackStreams(seed: string) {
  const rng = new BattleRng(seed);
  return {
    effects: rng.stream("effects"),
    damage: rng.stream("damage"),
    stars: rng.stream("stars"),
  };
}

function iconTestEffect(
  effectType: string,
  name: string,
  flags: Record<string, boolean | number | string> = {},
): AppliedEffect {
  return {
    stableId: `icon-${effectType}`,
    instanceId: `icon-${effectType}-1`,
    name,
    effectType,
    category: "buff",
    removalPolicy: "removable",
    durationTick: "owner_turn_end",
    flags,
    sourceInstanceId: "source",
    targetInstanceId: "target",
    classifications: [],
    value: 100,
    remainingTurns: 3,
    remainingUses: null,
    registrationOrder: 1,
  };
}

describe("No.362 千利休", () => {
  it("registers exact stats, rates, hit weights, traits, and the Human-force NP", () => {
    expect(SEN_NO_RIKYU).toMatchObject({
      collectionNo: 362,
      name: "千利休",
      rarity: 5,
      classDisplayName: "バーサーカー",
      growthTendency: "ATK偏重",
      classKey: "berserker",
      attributeKey: "human",
      classAttackCoefficientPermille: 1_100,
      commandCards: ["quick", "quick", "quick", "arts", "buster"],
      battleRates: {
        attackNpUnits: 70,
        receivedNpUnits: 500,
        starRatePermille: 49,
        starWeight: 9,
        deathRatePermille: 455,
      },
    });
    expect(SEN_NO_RIKYU.levelStats).toEqual([
      { level: 1, hp: 1_764, attack: 1_926 },
      { level: 50, hp: 6_957, attack: 7_257 },
      { level: 60, hp: 7_552, attack: 7_868 },
      { level: 70, hp: 8_692, attack: 9_038 },
      { level: 80, hp: 10_252, attack: 10_640 },
      { level: 90, hp: 12_028, attack: 12_463 },
      { level: 100, hp: 13_177, attack: 13_643 },
      { level: 120, hp: 15_486, attack: 16_013 },
    ]);
    expect(SEN_NO_RIKYU.commandCardHitWeights).toEqual([
      [6, 13, 20, 26, 35],
      [6, 13, 20, 26, 35],
      [6, 13, 20, 26, 35],
      [16, 33, 51],
      [16, 33, 51],
    ]);
    expect(SEN_NO_RIKYU.extraAttackHitWeights).toEqual([6, 13, 20, 26, 35]);
    expect(SEN_NO_RIKYU.traits).toEqual(expect.arrayContaining([
      "サーヴァント",
      "人型",
      "女性",
      "混沌",
      "悪",
      "人の力",
      "ヒト科",
      "浮遊している",
    ]));
    const instance = rikyu();
    expect(instance.unresolvedEffectStableIds).toEqual([]);
    expect(instance.attackData.noblePhantasms[0]).toMatchObject({
      targetScope: "all",
      hitWeights: [4, 9, 14, 19, 23, 31],
      damageMultiplierPermilleByLevel: [
        6_000,
        8_000,
        9_000,
        9_500,
        10_000,
      ],
      specialAttackPermilleByOvercharge: [
        1_500,
        1_625,
        1_750,
        1_875,
        2_000,
      ],
      specialAttackRequiredTargetTraits: ["人の力"],
    });
    expect(initialAllySelectionForServant(SEN_NO_RIKYU.dataId))
      .toMatchObject({ level: 90, noblePhantasmLevel: 1 });
    expect(SEN_NO_RIKYU.activeSkills.flatMap(({ effects }) => effects)
      .every(({ description }) => !description.includes(" / "))).toBe(true);
  });

  it("applies four class skills and resolves Skill 1 and Skill 2 at level 10", () => {
    const { source, state, registry } = battle();
    const initialized = initializeBattlePassives(
      state,
      registry,
      createEffectRuntimeCounters(),
      new BattleRng("rikyu-passives").stream("effects"),
    );
    expect(effectIds(initialized.state, "rikyu")).toEqual([
      "sen-no-rikyu-mad-enhancement-buster-state",
      "sen-no-rikyu-mad-enhancement-critical-state",
      "sen-no-rikyu-territory-arts-state",
      "sen-no-rikyu-territory-mental-resistance-state",
      "sen-no-rikyu-art-appreciation-debuff-success-state",
      "sen-no-rikyu-free-quick-np-gain-state",
    ]);

    const first = resolveAllySkillUse({
      state,
      registry,
      sourceInstanceId: "rikyu",
      skillStableId: "sen-no-rikyu-wabi-essence",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("rikyu-skill-one").stream("effects"),
    });
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    expect(first.state.commandStars).toBe(15);
    expect(first.effects.effects.map(({ targetInstanceIds }) => targetInstanceIds))
      .toEqual([
        ["rikyu", "ally-b", "ally-c"],
        ["rikyu", "ally-b", "ally-c"],
        ["rikyu"],
      ]);
    expect(effectIds(first.state, "ally-reserve")).toEqual([]);

    const second = resolveAllySkillUse({
      state,
      registry,
      sourceInstanceId: "rikyu",
      skillStableId: "sen-no-rikyu-single-flower",
      selectedTargetInstanceId: "ally-b",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("rikyu-skill-two").stream("effects"),
    });
    expect(second.accepted).toBe(true);
    if (!second.accepted) return;
    expect(findUnitLocation(second.state.formation, "ally-b")?.unit)
      .toMatchObject({
        np: 3_000,
        effects: expect.arrayContaining([
          expect.objectContaining({
            stableId: "sen-no-rikyu-flower-overcharge-state",
            value: 2,
            remainingTurns: 3,
            remainingUses: 1,
          }),
          expect.objectContaining({
            stableId: "sen-no-rikyu-flower-invincibility-state",
            remainingTurns: 3,
            remainingUses: 1,
            durationTick: "opponent_turn_end",
          }),
        ]),
      });
    expect(source.actionEffectData.actions.map(({ cooldownAtMax }) => cooldownAtMax))
      .toEqual([6, 6, 6, undefined]);
  });

  it("limits the pre-damage Quick defense debuff to the actual attack targets", () => {
    const { state, registry } = battle();
    const skill = resolveAllySkillUse({
      state,
      registry,
      sourceInstanceId: "rikyu",
      skillStableId: "sen-no-rikyu-yugen-black",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("rikyu-skill-three").stream("effects"),
    });
    expect(skill.accepted).toBe(true);
    if (!skill.accepted) return;

    let targetHadDebuffBeforeDamage = false;
    const single = resolveBattleAttackSequence(
      skill.state,
      {
        sourceInstanceId: "rikyu",
        targetInstanceIds: ["enemy-b"],
        triggerContext: { attackKind: "normal_command", cardType: "quick" },
        rng: attackStreams("rikyu-single-quick"),
        prepareAttack: (preparedState, targetInstanceIds) => {
          targetHadDebuffBeforeDamage = effectIds(preparedState, "enemy-b")
            .includes("sen-no-rikyu-yugen-defense-down-state");
          return {
            targets: targetInstanceIds.map((targetInstanceId) => ({
              targetInstanceId,
              damage: {
                attack: 10_000,
                cardDamageValuePermille: 1_000,
                classAttackCoefficientPermille: 1_000,
                classAffinityPermille: 1_000,
                attributeAffinityPermille: 1_000,
              },
            })),
            hitWeights: [1],
            defense: {},
          };
        },
      },
      skill.counters,
    );
    expect(targetHadDebuffBeforeDamage).toBe(true);
    expect(single.beforeAttack?.activations[0]?.actions[0]?.targetInstanceIds)
      .toEqual(["enemy-b"]);
    expect(effectIds(single.state, "enemy-a")).not.toContain(
      "sen-no-rikyu-yugen-defense-down-state",
    );
    expect(effectIds(single.state, "enemy-c")).not.toContain(
      "sen-no-rikyu-yugen-defense-down-state",
    );

    const fresh = resolveAllySkillUse({
      state,
      registry,
      sourceInstanceId: "rikyu",
      skillStableId: "sen-no-rikyu-yugen-black",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("rikyu-skill-three-aoe").stream("effects"),
    });
    if (!fresh.accepted) throw new Error("Skill 3 must be accepted");
    const all = resolveBattleAttackSequence(
      fresh.state,
      {
        sourceInstanceId: "rikyu",
        targetInstanceIds: ["enemy-c", "enemy-a", "enemy-b"],
        triggerContext: { attackKind: "noble_phantasm", cardType: "quick" },
        rng: attackStreams("rikyu-aoe-quick"),
        prepareAttack: (_preparedState, targetInstanceIds) => ({
          targets: targetInstanceIds.map((targetInstanceId) => ({
            targetInstanceId,
            damage: {
              attack: 10_000,
              cardDamageValuePermille: 1_000,
              classAttackCoefficientPermille: 1_000,
              classAffinityPermille: 1_000,
              attributeAffinityPermille: 1_000,
            },
          })),
          hitWeights: [1],
          defense: {},
        }),
      },
      fresh.counters,
    );
    expect(all.beforeAttack?.activations[0]?.actions[0]?.targetInstanceIds)
      .toEqual(["enemy-a", "enemy-b", "enemy-c"]);
  });

  it("applies NP seal and five-turn curse after the NP attack in source order", () => {
    const { source, state } = battle();
    const postAttackEffects = SEN_NO_RIKYU.noblePhantasm.effects.filter(
      (effect) => effect.kind === "effect",
    );
    const result = executeDeclaredActionEffects(
      state,
      "rikyu",
      postAttackEffects,
      { noblePhantasmLevel: 1, overchargeStage: 3 },
      createEffectRuntimeCounters(),
      new BattleRng("rikyu-np-effects").stream("effects"),
    );
    expect(result.effects.map(({ effectStableId, order, targetInstanceIds }) => ({
      effectStableId,
      order,
      targetInstanceIds,
    }))).toEqual([
      {
        effectStableId: "sen-no-rikyu-np-seal",
        order: 2,
        targetInstanceIds: ["enemy-a", "enemy-b", "enemy-c"],
      },
      {
        effectStableId: "sen-no-rikyu-np-curse",
        order: 3,
        targetInstanceIds: ["enemy-a", "enemy-b", "enemy-c"],
      },
    ]);
    expect(findUnitLocation(result.state.formation, "enemy-a")?.unit.effects)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          stableId: "sen-no-rikyu-np-seal-state",
          remainingTurns: 1,
        }),
        expect.objectContaining({
          stableId: "sen-no-rikyu-np-curse-state",
          value: 1_000,
          remainingTurns: 5,
        }),
      ]));
    const ended = resolveSideTurnEnd(
      result.state.formation,
      "enemy",
      result.counters,
      new BattleRng("rikyu-curse-end").stream("effects"),
    );
    expect(findUnitLocation(ended.formation, "enemy-a")?.unit.hp).toBe(9_000);
    expect(findUnitLocation(ended.formation, "enemy-b")?.unit.hp).toBe(9_000);
    expect(findUnitLocation(ended.formation, "enemy-c")?.unit.hp).toBe(9_000);
    expect(source.attackData.noblePhantasms[0]
      ?.specialAttackPermilleByOvercharge?.[2]).toBe(1_750);
  });

  it("preserves Skill 2 OC state through save/replay and maps only formal icons", () => {
    const setup = createEmptyInitialBattleSetup();
    setup.frontline = [
      initialAllySelectionForServant(SEN_NO_RIKYU.dataId),
      initialAllySelectionForServant(LIGHT_KOYANSKAYA.dataId),
      initialAllySelectionForServant(LIGHT_KOYANSKAYA.dataId),
    ];
    setup.reserve = [
      emptyInitialAllySlot(),
      emptyInitialAllySlot(),
      emptyInitialAllySlot(),
    ];
    setup.mysticCodeDataId = "normal-chaldea-uniform";
    setup.seedMode = "fixed";
    setup.seed = "rikyu-save-replay";
    const started = createInitialBattleSession(setup);
    const used = resolveBattleSessionAllySkill(started, {
      kind: "ally_skill",
      sourceInstanceId: "ally-frontline-1",
      skillStableId: "sen-no-rikyu-single-flower",
      selectedTargetInstanceId: "ally-frontline-2",
    });
    expect(used.result.accepted).toBe(true);
    const save = createBattleSuspendSave(used.session);
    const restored = restoreBattleSession(save);
    const replayed = replayBattleSession(save);
    expect(save).toMatchObject({
      schemaVersion: 4,
      dataSchemaVersion: "1.38.0",
    });
    expect(replayed.loop.state).toEqual(restored.loop.state);
    expect(replayed.loop.rng.snapshot()).toEqual(restored.loop.rng.snapshot());
    expect(findUnitLocation(restored.loop.state.formation, "ally-frontline-2")
      ?.unit.effects).toContainEqual(expect.objectContaining({
        stableId: "sen-no-rikyu-flower-overcharge-state",
        value: 2,
        remainingUses: 1,
      }));

    expect(registeredSkillIconPath("侘びの極み"))
      .toContain("skill-card-quick-up.png");
    expect(registeredSkillIconPath("一輪の花"))
      .toContain("skill-np-charge.png");
    expect(registeredSkillIconPath("幽玄たる黒"))
      .toContain("skill-crit-damage-up.png");
    expect(registeredServantWikiUrl(SEN_NO_RIKYU.dataId))
      .toBe("https://w.atwiki.jp/f_go/pages/5723.html");

    const targetEffects = findUnitLocation(
      restored.loop.state.formation,
      "ally-frontline-2",
    )?.unit.effects ?? [];
    expect(unspecifiedEffectNames(targetEffects)).toEqual([]);
    expect(registeredStatusIconPath(targetEffects.find(
      ({ stableId }) => stableId === "sen-no-rikyu-flower-overcharge-state",
    )!)).toContain("NPOvercharge.webp");
    expect(registeredStatusIconPath(targetEffects.find(
      ({ stableId }) => stableId === "sen-no-rikyu-flower-invincibility-state",
    )!)).toContain("Invincible.webp");

    const npEffects = SEN_NO_RIKYU.noblePhantasm.effects.filter(
      (effect) => effect.kind === "effect",
    );
    expect(npEffects.map(({ action }) => action.kind)).toEqual([
      "apply_effects",
      "apply_effects",
    ]);
    expect(COMMON_EFFECT_TYPES.noblePhantasmSeal).toBe("noble_phantasm_seal");
    expect(registeredStatusIconPath(iconTestEffect(
      COMMON_EFFECT_TYPES.npGain,
      "NP獲得量アップ",
    ))).toContain("Npchargeup.webp");
    expect(registeredStatusIconPath(iconTestEffect(
      COMMON_EFFECT_TYPES.npGain,
      "被ダメージ時NP獲得量アップ",
    ))).toContain("NPGainUpDmg.webp");
    expect(registeredStatusIconPath(iconTestEffect(
      COMMON_EFFECT_TYPES.criticalDamage,
      "Quickクリティカル威力アップ",
      { cardType: "quick" },
    ))).toContain("Critdmgup.webp");
    expect(registeredStatusIconPath(iconTestEffect(
      COMMON_EFFECT_TYPES.starFocus,
      "Quickスター集中度アップ",
      { cardType: "quick" },
    ))).toContain("Critabsup.webp");
    expect(registeredStatusIconPath(iconTestEffect(
      COMMON_EFFECT_TYPES.power,
      "Quickカードの威力アップ",
      { cardType: "quick" },
    ))).toContain("Quickdamageup.webp");
  });
});
