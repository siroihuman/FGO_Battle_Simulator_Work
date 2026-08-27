import { describe, expect, it } from "vitest";
import { findUnitLocation } from "../src/core/battle/formation";
import { createBattleState } from "../src/core/battle/state";
import { BattleRng } from "../src/core/rng";
import {
  OCTAVIANUS,
  ORIGINAL_SERVANT_DEFINITIONS,
  createServantBattleInstance,
} from "../src/data/servants";
import { OCTAVIANUS_BOND } from "../src/data/craftEssences";
import { createBattleActionEffectDataRegistry } from "../src/effects/actionData";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import {
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import { resolveAllySkillUse } from "../src/effects/skillExecution";
import { resolveSideTurnEnd } from "../src/effects/turnEnd";
import {
  registeredSkillIconPath,
  registeredStatusIconPath,
} from "../src/ui/iconRegistry";
import { unit } from "./helpers/battle";

function setup() {
  const source = createServantBattleInstance(OCTAVIANUS, {
    instanceId: "octavianus",
    level: 80,
    noblePhantasmLevel: 1,
  });
  return {
    source,
    state: createBattleState({
      ally: {
        frontline: [source.unit, unit("target", "ally"), unit("ally-c", "ally")],
        reserve: [],
      },
      waves: [{ enemy: { frontline: [unit("enemy-a", "enemy"), null, null], reserve: [] } }],
      enemyFrontlineLimit: 3,
    }),
  };
}

describe("No.054 オクタウィアヌス", () => {
  it("registers current upgraded data, the source order, exact bond restriction, and existing icons", () => {
    expect(OCTAVIANUS).toMatchObject({
      dataId: "octavianus",
      collectionNo: 54,
      collectionLabel: "054",
      name: "オクタウィアヌス",
      classDisplayName: "セイバー",
      rarity: 4,
      commandCards: ["quick", "arts", "arts", "buster", "buster"],
      battleRates: { attackNpUnits: 83, starRatePermille: 98, deathRatePermille: 280 },
      traits: expect.arrayContaining(["初代ローマ皇帝", "ローマ", "夏モード（サマーロマーナ）"]),
    });
    expect(OCTAVIANUS.levelStats.at(-1)).toEqual({ level: 120, hp: 18_323, attack: 11_847 });
    expect(OCTAVIANUS.noblePhantasm.effects.every(({ kind }) => kind === "effect")).toBe(true);
    expect(ORIGINAL_SERVANT_DEFINITIONS.map(({ collectionNo }) => collectionNo))
      .toEqual([7, 24, 25, 54, 56, 57, 58, 62, 70, 94, 105, 107]);
    expect(OCTAVIANUS_BOND).toMatchObject({
      name: "父から継いだ名",
      eligibleServantDataIds: ["octavianus"],
    });
    expect(registeredSkillIconPath("華麗の皇帝"))
      .toContain("skill-unique-looks-of-loveliness.png");
    expect(registeredSkillIconPath("神人となる者")).toContain("skill-defense-up.png");
    expect(registeredSkillIconPath("荘厳なるや我が王剣")).toContain("skill-attack-up.png");
  });

  it("uses DelayedBuff for the on-damage trigger state", () => {
    const trigger = OCTAVIANUS.activeSkills[1]?.effects[5];
    if (trigger?.kind !== "effect" || trigger.action.kind !== "apply_effects") {
      throw new Error("被ダメージ時スター獲得状態がありません");
    }
    const applied = trigger.action.effects[0]?.template;
    if (!applied) throw new Error("被ダメージ時スター獲得テンプレートがありません");
    const state = applyEffect(
      unit("target", "ally"),
      {
        stableId: applied.stableId,
        name: applied.name,
        effectType: applied.effectType,
        category: applied.category,
        trigger: applied.trigger,
      },
      "octavianus",
      createEffectRuntimeCounters(),
    ).effect;
    expect(registeredStatusIconPath(state)).toContain("DelayedBuff.webp");
  });

  it("applies the party defense and selected-target effects without making the support NP an attack", () => {
    const { source, state } = setup();
    const registry = createBattleActionEffectDataRegistry([source.actionEffectData]);
    const skill2 = resolveAllySkillUse({
      state,
      registry,
      sourceInstanceId: "octavianus",
      selectedTargetInstanceId: "target",
      skillStableId: "octavianus-the-one-who-becomes-a-god",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("octavianus-skill-two").stream("effects"),
    });
    expect(skill2).toMatchObject({ accepted: true });
    if (!skill2.accepted) return;
    expect(findUnitLocation(skill2.state.formation, "target")?.unit).toMatchObject({ np: 3_000 });
    expect(findUnitLocation(skill2.state.formation, "octavianus")?.unit.effects)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.defense, value: 200 }),
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.damageCut, value: 1_000, remainingUses: 3 }),
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.guts, value: 1, remainingUses: 1 }),
      ]));
    expect(findUnitLocation(skill2.state.formation, "target")?.unit.effects)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.targetFocus, value: 3_000 }),
        expect.objectContaining({ stableId: "octavianus-the-one-who-becomes-a-god-target-stars-on-damage-state" }),
      ]));
    expect(OCTAVIANUS.noblePhantasm.effects.map(({ stableId }) => stableId)).toEqual([
      "octavianus-np-invincibility",
      "octavianus-np-attack",
      "octavianus-np-critical",
      "octavianus-np-defense",
      "octavianus-np-recurring-stars",
    ]);
  });

  it("adds recurring stars at the owner turn end from Skill 3", () => {
    const { source, state } = setup();
    const registry = createBattleActionEffectDataRegistry([source.actionEffectData]);
    const skill3 = resolveAllySkillUse({
      state,
      registry,
      sourceInstanceId: "octavianus",
      selectedTargetInstanceId: "target",
      skillStableId: "octavianus-majestic-my-king-sword",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("octavianus-skill-three").stream("effects"),
    });
    expect(skill3).toMatchObject({ accepted: true });
    if (!skill3.accepted) return;
    const settled = resolveSideTurnEnd(
      skill3.state.formation,
      "ally",
      skill3.counters,
      new BattleRng("octavianus-skill-three-end").stream("effects"),
      {
        resolveStarGain: ({ requested }) => ({
          bucket: "next_command",
          requested,
          before: 0,
          added: requested,
          after: requested,
          overflow: 0,
        }),
      },
    );
    expect(settled.activations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        effectStableId: "octavianus-majestic-my-king-sword-recurring-stars-state",
        outcome: "activated",
        actions: expect.arrayContaining([
          expect.objectContaining({
            action: expect.objectContaining({
              action: expect.objectContaining({ kind: "gain_stars", amount: 10 }),
            }),
          }),
        ]),
      }),
    ]));
  });
});
