import { describe, expect, it } from "vitest";
import { findUnitLocation } from "../src/core/battle/formation";
import { BattleRng } from "../src/core/rng";
import {
  AGRIPPA,
  createServantBattleInstance,
  ORIGINAL_SERVANT_DEFINITIONS,
} from "../src/data/servants";
import { createBattleActionEffectDataRegistry } from "../src/effects/actionData";
import { resolveAttackDefense } from "../src/effects/defense";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import { createEffectRuntimeCounters } from "../src/effects/runtime";
import { resolveAllySkillUse } from "../src/effects/skillExecution";
import { createBattleState } from "../src/core/battle/state";
import { registeredSkillIconPath, registeredStatusIconPath } from "../src/ui/iconRegistry";
import { initialAllySelectionForServant } from "../src/ui/initialBattle";
import { unit } from "./helpers/battle";

function agrippa(instanceId = "agrippa") {
  return createServantBattleInstance(AGRIPPA, {
    instanceId,
    level: 70,
    noblePhantasmLevel: 1,
  });
}

function stateWithAgrippa() {
  const source = agrippa();
  return {
    source,
    state: createBattleState({
      ally: {
        frontline: [
          source.unit,
          unit("emperor", "ally", { traits: ["初代ローマ皇帝"] }),
          unit("ordinary", "ally"),
        ],
        reserve: [],
      },
      waves: [{ enemy: { frontline: [unit("enemy-a", "enemy"), null, null], reserve: [] } }],
      enemyFrontlineLimit: 3,
    }),
  };
}

describe("No.056 アグリッパ", () => {
  it("registers upgraded data, all skills, class skills, and the Arts NP", () => {
    expect(AGRIPPA).toMatchObject({
      collectionNo: 56,
      name: "アグリッパ",
      rarity: 3,
      classDisplayName: "キャスター",
      growthTendency: "平均",
      attackType: "物理",
      classKey: "caster",
      attributeKey: "human",
      classAttackCoefficientPermille: 900,
      commandCards: ["quick", "arts", "arts", "buster", "buster"],
      battleRates: {
        attackNpUnits: 49,
        receivedNpUnits: 300,
        starRatePermille: 110,
        starWeight: 51,
        deathRatePermille: 570,
      },
    });
    expect(AGRIPPA.levelStats.at(-1)).toEqual({ level: 120, hp: 16_399, attack: 9_911 });
    expect(AGRIPPA.levelStats.find(({ level }) => level === 100)).toEqual({ level: 100, hp: 13_952, attack: 8_438 });
    expect(AGRIPPA.commandCardHitWeights.map(({ length }) => length)).toEqual([3, 3, 3, 1, 1]);
    expect(AGRIPPA.extraAttackHitWeights).toHaveLength(5);
    expect(AGRIPPA.activeSkills.map(({ name, rank, cooldownAtMax }) => ({ name, rank, cooldownAtMax }))).toEqual([
      { name: "御身のために", rank: "EX", cooldownAtMax: 8 },
      { name: "尽くす事こそ我が喜び", rank: "A++", cooldownAtMax: 9 },
      { name: "共に、安寧と平和で護られた国を", rank: "EX", cooldownAtMax: 9 },
    ]);
    expect(AGRIPPA.classSkills.map(({ name, rank }) => ({ name, rank }))).toEqual([
      { name: "対魔力", rank: "A+" },
      { name: "陣地作成", rank: "B+" },
    ]);
    expect(AGRIPPA.noblePhantasm.effects).toMatchObject([
      { kind: "effect", order: 1 },
      { kind: "attack", order: 2, targetScope: "all", hitWeights: [1, 1, 1, 1], damageMultiplierPermilleByLevel: [4_500, 6_000, 6_750, 7_125, 7_500] },
      { kind: "effect", order: 3 },
    ]);
    expect(ORIGINAL_SERVANT_DEFINITIONS.map(({ collectionNo }) => collectionNo))
      .toEqual([7, 24, 56, 57, 58, 62, 70, 94, 105, 107]);
    expect(initialAllySelectionForServant(AGRIPPA.dataId)).toMatchObject({ level: 70, noblePhantasmLevel: 1 });
    expect(agrippa().unresolvedEffectStableIds).toEqual([]);
  });

  it("uses the specified icons and applies first-emperor-only additions", () => {
    expect(registeredSkillIconPath("御身のために")).toContain("skill-attack-defense-up.png");
    expect(registeredSkillIconPath("尽くす事こそ我が喜び")).toContain("skill-card-arts-up.png");
    expect(registeredSkillIconPath("共に、安寧と平和で護られた国を")).toContain("skill-defense-up.png");
    const { source, state } = stateWithAgrippa();
    const registry = createBattleActionEffectDataRegistry([source.actionEffectData]);
    const skill1 = resolveAllySkillUse({
      state,
      registry,
      sourceInstanceId: "agrippa",
      skillStableId: "agrippa-for-your-sake",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("agrippa-skill-one").stream("effects"),
    });
    expect(skill1).toMatchObject({ accepted: true });
    if (!skill1.accepted) return;
    expect(findUnitLocation(skill1.state.formation, "ordinary")?.unit).toMatchObject({
      np: 1_000,
      effects: expect.arrayContaining([
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.attack, value: 200 }),
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.defense, value: 200 }),
      ]),
    });
    expect(findUnitLocation(skill1.state.formation, "emperor")?.unit.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ stableId: "agrippa-for-your-sake-first-emperor-attack-state", value: 200 }),
    ]));

    const skill2 = resolveAllySkillUse({
      state,
      registry,
      sourceInstanceId: "agrippa",
      selectedTargetInstanceId: "emperor",
      skillStableId: "agrippa-joy-of-service",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("agrippa-skill-two").stream("effects"),
    });
    expect(skill2).toMatchObject({ accepted: true });
    if (!skill2.accepted) return;
    expect(findUnitLocation(skill2.state.formation, "emperor")?.unit).toMatchObject({
      np: 2_000,
      effects: expect.arrayContaining([
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 200, flags: { cardType: "arts" } }),
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 500, flags: { cardType: "arts" } }),
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.noblePhantasmDamage, value: 300 }),
      ]),
    });
  });

  it("applies the anti-person special defense only to attacks from a matching trait", () => {
    const { source, state } = stateWithAgrippa();
    const registry = createBattleActionEffectDataRegistry([source.actionEffectData]);
    const skill3 = resolveAllySkillUse({
      state,
      registry,
      sourceInstanceId: "agrippa",
      selectedTargetInstanceId: "emperor",
      skillStableId: "agrippa-country-of-peace",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("agrippa-skill-three").stream("effects"),
    });
    expect(skill3).toMatchObject({ accepted: true });
    if (!skill3.accepted) return;
    const emperor = findUnitLocation(skill3.state.formation, "emperor")?.unit;
    if (!emperor) throw new Error("missing emperor");
    const specialDefense = emperor.effects.find(
      ({ stableId }) => stableId === "agrippa-country-of-peace-anti-person-state",
    );
    expect(specialDefense).toMatchObject({
      effectType: COMMON_EFFECT_TYPES.specialDefense,
      value: 300,
      flags: { requiredAttackerTrait: "対人" },
    });
    expect(registeredStatusIconPath(specialDefense!)).toContain("Defenseup.webp");
    const targetWithoutInvincibility = {
      ...emperor,
      effects: emperor.effects.filter(
        ({ effectType }) => effectType !== COMMON_EFFECT_TYPES.invincibility,
      ),
    };
    expect(resolveAttackDefense(
      unit("person", "enemy", { traits: ["対人"] }), targetWithoutInvincibility, { phase: "attack" }, new BattleRng("agrippa-person").stream("effects"),
    ).specialDefenseModPermille).toBe(300);
    expect(resolveAttackDefense(
      unit("non-person", "enemy"), targetWithoutInvincibility, { phase: "attack" }, new BattleRng("agrippa-non-person").stream("effects"),
    ).specialDefenseModPermille).toBe(0);
    expect(emperor).toMatchObject({ np: 2_000, effects: expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.npGain, value: 300 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.invincibility, remainingUses: 1 }),
    ]) });
  });
});
