import { describe, expect, it } from "vitest";
import { findUnitLocation } from "../src/core/battle/formation";
import { createBattleState } from "../src/core/battle/state";
import { BattleRng } from "../src/core/rng";
import { SIGMUND, ORIGINAL_SERVANT_DEFINITIONS, createServantBattleInstance } from "../src/data/servants";
import { SIGMUND_BOND } from "../src/data/craftEssences";
import { createBattleActionEffectDataRegistry } from "../src/effects/actionData";
import { initializeBattlePassives } from "../src/effects/actionExecution";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import { createEffectRuntimeCounters } from "../src/effects/runtime";
import { resolveAllySkillUse } from "../src/effects/skillExecution";
import { resolveAttackModifierTotals } from "../src/core/battle/attackModifiers";
import { registeredSkillIconPath, registeredStatusIconPath } from "../src/ui/iconRegistry";
import type { AppliedEffect } from "../src/effects/types";
import { unit } from "./helpers/battle";

function sigmund(instanceId = "sigmund") {
  return createServantBattleInstance(SIGMUND, { instanceId, level: 80, noblePhantasmLevel: 5 });
}

function battle() {
  const source = sigmund();
  return {
    source,
    state: createBattleState({
      ally: { frontline: [source.unit, unit("ally-b", "ally"), unit("ally-c", "ally")], reserve: [unit("ally-d", "ally")] },
      waves: [{ enemy: { frontline: [unit("enemy-a", "enemy"), unit("enemy-b", "enemy"), null], reserve: [] } }],
      enemyFrontlineLimit: 3,
    }),
  };
}

describe("No.010 シグムンド", () => {
  it("registers all source values, strengthened skills, class skills and NP levels", () => {
    expect(SIGMUND).toMatchObject({
      collectionNo: 10, collectionLabel: "010", name: "シグムンド", rarity: 4,
      classDisplayName: "セイバー", growthTendency: "凸型弱", attackType: "物理",
      classKey: "saber", attributeKey: "earth", commandCards: ["quick", "arts", "arts", "buster", "buster"],
      battleRates: { attackNpUnits: 56, receivedNpUnits: 300, starRatePermille: 99, starWeight: 97, deathRatePermille: 245 },
    });
    expect(SIGMUND.levelStats).toEqual([
      { level: 1, hp: 1_928, attack: 1_582 }, { level: 40, hp: 6_870, attack: 5_412 },
      { level: 50, hp: 8_437, attack: 6_647 }, { level: 60, hp: 10_003, attack: 7_881 },
      { level: 70, hp: 11_209, attack: 8_831 }, { level: 80, hp: 12_053, attack: 9_496 },
      { level: 100, hp: 14_614, attack: 11_498 }, { level: 120, hp: 17_176, attack: 13_500 },
    ]);
    expect(SIGMUND.commandCardHitWeights.map(({ length }) => length)).toEqual([2, 3, 3, 2, 2]);
    expect(SIGMUND.extraAttackHitWeights).toHaveLength(3);
    expect(SIGMUND.activeSkills.map(({ name, rank, cooldownAtMax }) => ({ name, rank, cooldownAtMax }))).toEqual([
      { name: "神々の加護", rank: "A+", cooldownAtMax: 6 },
      { name: "人の理を脱ぎ、王は狼へと還る", rank: "A+", cooldownAtMax: 5 },
      { name: "戦王のカリスマ", rank: "A+", cooldownAtMax: 6 },
    ]);
    expect(SIGMUND.classSkills.map(({ name, rank }) => ({ name, rank }))).toEqual([
      { name: "対魔力", rank: "A" }, { name: "騎乗", rank: "C" },
      { name: "復讐者", rank: "B" }, { name: "抗毒", rank: "A++" },
    ]);
    expect(SIGMUND.noblePhantasm.effects).toMatchObject([
      { kind: "attack", order: 1, hitWeights: [1, 1, 1], damageMultiplierPermilleByLevel: [3_000, 4_000, 4_500, 4_750, 5_000] },
      { kind: "effect", order: 2 }, { kind: "effect", order: 3 },
    ]);
    expect(ORIGINAL_SERVANT_DEFINITIONS.map(({ collectionNo }) => collectionNo)).toEqual([7, 10, 24, 25, 29, 54, 55, 56, 57, 58, 62, 70, 94, 105, 107]);
    expect(sigmund().unresolvedEffectStableIds).toEqual([]);
  });

  it("resolves the three skills with their distinct target ranges", () => {
    const { source, state } = battle();
    const registry = createBattleActionEffectDataRegistry([source.actionEffectData]);
    const first = resolveAllySkillUse({ state, registry, sourceInstanceId: "sigmund", skillStableId: "sigmund-protection-of-the-gods", counters: createEffectRuntimeCounters(), rng: new BattleRng("sigmund-s1").stream("effects") });
    expect(first).toMatchObject({ accepted: true });
    if (!first.accepted) return;
    expect(first.state.commandStars).toBe(25);
    expect(findUnitLocation(first.state.formation, "sigmund")?.unit).toMatchObject({ np: 3_000, effects: expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.criticalDamage, value: 500 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.starFocus, value: 6_000 }),
    ]) });

    const second = resolveAllySkillUse({ state, registry, sourceInstanceId: "sigmund", skillStableId: "sigmund-return-to-the-wolf", counters: createEffectRuntimeCounters(), rng: new BattleRng("sigmund-s2").stream("effects") });
    expect(second).toMatchObject({ accepted: true });
    if (!second.accepted) return;
    expect(findUnitLocation(second.state.formation, "sigmund")?.unit.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 550, remainingUses: 3, flags: { cardType: "buster" } }),
      expect.objectContaining({ effectType: "trigger", trigger: expect.objectContaining({ timing: "on_attack", condition: expect.objectContaining({ cardTypes: ["buster"] }) }) }),
    ]));

    const third = resolveAllySkillUse({ state, registry, sourceInstanceId: "sigmund", skillStableId: "sigmund-war-kings-charisma", counters: createEffectRuntimeCounters(), rng: new BattleRng("sigmund-s3").stream("effects") });
    expect(third).toMatchObject({ accepted: true });
    if (!third.accepted) return;
    expect(findUnitLocation(third.state.formation, "sigmund")?.unit.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.attack, value: 200 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.criticalDamage, value: 200 }),
    ]));
    expect(findUnitLocation(third.state.formation, "ally-b")?.unit.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.attack, value: 200 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.attack, value: 300 }),
    ]));
    expect(findUnitLocation(third.state.formation, "enemy-a")?.unit.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.targetDamage, value: 500, flags: { criticalOnly: true } }),
    ]));
  });

  it("initializes Avenger and poison immunity passives and applies critical resistance down only to critical attacks", () => {
    const { source, state } = battle();
    const initialized = initializeBattlePassives(state, createBattleActionEffectDataRegistry([source.actionEffectData]), createEffectRuntimeCounters(), new BattleRng("sigmund-passives").stream("effects"));
    expect(initialized.unresolvedEffectStableIds).toEqual([]);
    const owner = findUnitLocation(initialized.state.formation, "sigmund")!.unit;
    const ally = findUnitLocation(initialized.state.formation, "ally-b")!.unit;
    expect(owner.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.debuffResistance, value: 200 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.receivedNpGain, value: 180 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.debuffImmunity, classifications: ["poison"] }),
    ]));
    expect(ally.effects).toContainEqual(expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.debuffResistance, value: -80, removalPolicy: "unremovable" }));
    const target = { ...unit("target", "enemy"), effects: [{ ...owner.effects[0]!, instanceId: "crit-resist", stableId: "crit-resist", name: "クリティカル攻撃耐性ダウン", effectType: COMMON_EFFECT_TYPES.targetDamage, category: "debuff" as const, value: 500, flags: { criticalOnly: true } }] };
    expect(resolveAttackModifierTotals({ source: owner, target, cardType: "buster", isNoblePhantasm: false, isCritical: false }).target.targetDamageModPermille).toBe(0);
    expect(resolveAttackModifierTotals({ source: owner, target, cardType: "buster", isNoblePhantasm: false, isCritical: true }).target.targetDamageModPermille).toBe(500);
  });

  it("registers the exact bond Craft Essence restriction and source-confirmed skill icons", () => {
    expect(SIGMUND_BOND).toMatchObject({ name: "二つに折れた選定", rarity: 4, level: 80, attack: 100, hp: 100, eligibleServantDataIds: ["sigmund"] });
    expect(SIGMUND_BOND.startEffects).toMatchObject([
      { order: 1, action: { effects: [{ template: { effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 200, flags: { cardType: "buster" } } }] } },
      { order: 2, action: { effects: [{ template: { effectType: COMMON_EFFECT_TYPES.criticalDamage, value: 100 } }] } },
    ]);
    expect(registeredSkillIconPath("神々の加護")).toContain("skill-crit-damage-up.png");
    expect(registeredSkillIconPath("人の理を脱ぎ、王は狼へと還る")).toContain("skill-card-buster-up.png");
    expect(registeredSkillIconPath("戦王のカリスマ")).toContain("skill-attack-up.png");
    expect(registeredSkillIconPath("復讐者")).toContain("class-avenger.png");
    expect(registeredSkillIconPath("抗毒")).toContain("skill-debuff-immunity.png");
  });

  it("uses Stunstatus only for the specified incapacitating states", () => {
    const effect = (name: string): AppliedEffect => ({
      instanceId: `status-${name}`,
      stableId: `status-${name}`,
      name,
      effectType: "status-icon-test",
      category: "debuff",
      value: 0,
      sourceInstanceId: "sigmund",
      targetInstanceId: "enemy-a",
      classifications: [],
      remainingTurns: 1,
      remainingUses: null,
      removalPolicy: "removable",
      durationTick: "owner_turn_end",
      flags: {},
      registrationOrder: 1,
    });

    for (const name of ["スタン", "拘束", "待機", "石化", "行動不能"]) {
      expect(registeredStatusIconPath(effect(name))).toContain("Stunstatus.webp");
    }
    for (const name of ["魅了", "睡眠", "豚化"]) {
      expect(registeredStatusIconPath(effect(name)) ?? "").not.toContain("Stunstatus.webp");
    }
  });
});
