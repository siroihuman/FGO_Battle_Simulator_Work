import { describe, expect, it } from "vitest";
import { findUnitLocation, orderedLocations } from "../src/core/battle/formation";
import { createBattleState } from "../src/core/battle/state";
import { BattleRng } from "../src/core/rng";
import { resolveAttackModifierTotals } from "../src/core/battle/attackModifiers";
import { HERVOR, ORIGINAL_SERVANT_DEFINITIONS, createServantBattleInstance } from "../src/data/servants";
import { HERVOR_BOND } from "../src/data/craftEssences";
import { createBattleActionEffectDataRegistry } from "../src/effects/actionData";
import { resolveAllySkillUse } from "../src/effects/skillExecution";
import { createEffectRuntimeCounters } from "../src/effects/runtime";
import { resolveTriggerEvent } from "../src/effects/triggerExecution";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import { registeredSkillIconPath } from "../src/ui/iconRegistry";
import { unit } from "./helpers/battle";

function hervor(instanceId = "hervor") {
  return createServantBattleInstance(HERVOR, { instanceId, level: 80, noblePhantasmLevel: 5 });
}

function battle() {
  const source = hervor();
  return { source, state: createBattleState({ ally: { frontline: [source.unit, unit("ally-b", "ally"), unit("ally-c", "ally")], reserve: [] }, waves: [{ enemy: { frontline: [unit("enemy-a", "enemy"), unit("enemy-b", "enemy"), null], reserve: [] } }], enemyFrontlineLimit: 3 }) };
}

describe("No.030 ヘルヴォール", () => {
  it("registers the current strengthened data and exact bond restriction", () => {
    expect(HERVOR).toMatchObject({ collectionNo: 30, name: "ヘルヴォール", rarity: 4, classKey: "berserker", attributeKey: "earth", classAttackCoefficientPermille: 1_100, commandCards: ["quick", "arts", "buster", "buster", "buster"], battleRates: { attackNpUnits: 68, receivedNpUnits: 500, starRatePermille: 49, starWeight: 10, deathRatePermille: 585 } });
    expect(HERVOR.levelStats.at(-1)).toEqual({ level: 120, hp: 14_428, attack: 14_279 });
    expect(HERVOR.commandCardHitWeights.map(({ length }) => length)).toEqual([5, 3, 3, 3, 3]);
    expect(HERVOR.extraAttackHitWeights).toHaveLength(6);
    expect(HERVOR.activeSkills.map(({ name, rank, cooldownAtMax }) => ({ name, rank, cooldownAtMax }))).toEqual([
      { name: "戦闘続行", rank: "C", cooldownAtMax: 7 },
      { name: "運命の克服者", rank: "A++", cooldownAtMax: 6 },
      { name: "怨念模りし炎の鎧", rank: "B", cooldownAtMax: 6 },
    ]);
    expect(HERVOR.noblePhantasm.effects).toMatchObject([
      { kind: "effect", order: 1 }, { kind: "effect", order: 2 },
      { kind: "attack", order: 3, hitWeights: [1, 1, 1], damageMultiplierPermilleByLevel: [4_000, 5_000, 5_500, 5_750, 6_000] },
      { kind: "effect", order: 4 },
    ]);
    expect(HERVOR_BOND).toMatchObject({ name: "炎を越えた先に", rarity: 4, level: 80, attack: 100, hp: 100, eligibleServantDataIds: ["hervor"] });
    expect(ORIGINAL_SERVANT_DEFINITIONS.map(({ collectionNo }) => collectionNo)).toEqual([7, 10, 24, 25, 29, 30, 54, 55, 56, 57, 58, 62, 70, 94, 105, 107]);
    expect(hervor().unresolvedEffectStableIds).toEqual([]);
  });

  it("applies skill values and sends the on-damage evil curse only to the attacker", () => {
    const { source, state } = battle();
    const registry = createBattleActionEffectDataRegistry([source.actionEffectData]);
    const used = resolveAllySkillUse({ state, registry, sourceInstanceId: "hervor", skillStableId: "hervor-armor-of-grudge-fire", counters: createEffectRuntimeCounters(), rng: new BattleRng("hervor-s3").stream("effects") });
    expect(used).toMatchObject({ accepted: true });
    if (!used.accepted) return;
    expect(findUnitLocation(used.state.formation, "hervor")?.unit.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.defense, value: 500 }),
      expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.noblePhantasmDamage, value: 200 }),
      expect.objectContaining({ effectType: "trigger" }),
    ]));
    const resolved = resolveTriggerEvent(used.state, orderedLocations(used.state.formation, "ally", true), { timing: "on_damage_taken", actorInstanceId: "enemy-a", actorSide: "enemy", targetInstanceId: "hervor", targetInstanceIds: ["hervor"], targetSide: "ally", attackKind: "enemy_normal_attack", hit: true, damage: 100 }, used.counters, new BattleRng("hervor-retaliation").stream("effects"));
    expect(findUnitLocation(resolved.state.formation, "enemy-a")?.unit.effects).toContainEqual(expect.objectContaining({ name: "呪厄", classifications: ["evil_curse"], value: 1_000 }));
    expect(findUnitLocation(resolved.state.formation, "enemy-b")?.unit.effects).toEqual([]);
  });

  it("activates curse-conditioned power and both independent bond critical bonuses", () => {
    const source = unit("source", "ally", { effects: [
      { ...unit("x", "ally").effects[0], instanceId: "power", stableId: "power", name: "curse power", effectType: COMMON_EFFECT_TYPES.power, category: "buff", value: 300, sourceInstanceId: "source", targetInstanceId: "source", classifications: [], remainingTurns: 3, remainingUses: null, removalPolicy: "removable", durationTick: "owner_turn_end", flags: { requiredTargetEffectClassification: "curse" }, registrationOrder: 1 },
      ...HERVOR_BOND.startEffects.map((declared, index) => ({ instanceId: `bond-${index}`, stableId: declared.stableId, name: declared.description, effectType: index === 0 ? COMMON_EFFECT_TYPES.noblePhantasmDamage : COMMON_EFFECT_TYPES.criticalDamage, category: "buff" as const, value: index === 0 ? 100 : 200, sourceInstanceId: "source", targetInstanceId: "source", classifications: [], remainingTurns: null, remainingUses: null, removalPolicy: "unremovable" as const, durationTick: "manual" as const, flags: (index === 1 ? { requiredTargetEffectClassification: "curse" } : index === 2 ? { requiredTargetEffectClassification: "evil_curse" } : { passive: true }) as Record<string, string | boolean>, registrationOrder: index + 2 })),
    ] });
    const target = unit("target", "enemy", { effects: [
      { instanceId: "curse", stableId: "curse", name: "呪い", effectType: "slip_damage", category: "debuff", value: 1_000, sourceInstanceId: "source", targetInstanceId: "target", classifications: ["curse"], remainingTurns: 5, remainingUses: null, removalPolicy: "removable", durationTick: "owner_turn_end", flags: {}, registrationOrder: 1 },
      { instanceId: "evil", stableId: "evil", name: "呪厄", effectType: "evil_curse", category: "debuff", value: 1_000, sourceInstanceId: "source", targetInstanceId: "target", classifications: ["evil_curse"], remainingTurns: 5, remainingUses: null, removalPolicy: "removable", durationTick: "owner_turn_end", flags: {}, registrationOrder: 2 },
    ] });
    const totals = resolveAttackModifierTotals({ source, target, cardType: "buster", isNoblePhantasm: false, isCritical: true });
    expect(totals.source.powerModPermille).toBe(300);
    expect(totals.source.criticalDamageModPermille).toBe(400);
  });

  it("uses the source-confirmed skill icon families", () => {
    expect(registeredSkillIconPath("戦闘続行")).toContain("skill-guts.png");
    expect(registeredSkillIconPath("運命の克服者")).toContain("skill-np-charge.png");
    expect(registeredSkillIconPath("怨念模りし炎の鎧")).toContain("skill-defense-up.png");
    expect(registeredSkillIconPath("狂化")).toContain("class-mad-enhancement.png");
  });
});
