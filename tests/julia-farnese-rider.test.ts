import { describe, expect, it } from "vitest";
import {
  JULIA_FARNESE_RIDER,
} from "../src/data/servants";
import {
  JULIA_FARNESE_RIDER_BOND,
} from "../src/data/craftEssences";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";

describe("Julia Farnese (Rider)", () => {
  it("keeps the upgraded skill and Noble Phantasm effect order from the source", () => {
    expect(JULIA_FARNESE_RIDER.activeSkills.map(({ name, cooldownAtMax }) => [name, cooldownAtMax]))
      .toEqual([
        ["麗しのジュリア", 7],
        ["無垢なる一角馬", 7],
        ["白百合の獣", 8],
      ]);
    expect(JULIA_FARNESE_RIDER.activeSkills[0]?.effects.map(({ description }) => description))
      .toEqual([
        "敵全体〔男性〕に高確率で魅了付与[Lv](1T)：150%",
        "＆弱体耐性をダウン(3T)：30%",
        "＆防御力をダウン[Lv](3T)：20%",
      ]);
    expect(JULIA_FARNESE_RIDER.activeSkills[1]?.effects.map(({ description }) => description))
      .toEqual([
        "自身に毎ターンスター獲得状態を付与[Lv](3T)：15",
        "＆NPを少し増やす：10%",
        "＋味方全体の〔女性〕のクリティカル威力をアップ[Lv](3T)：50%",
        "＆NPを少し増やす：10%",
      ]);
    expect(JULIA_FARNESE_RIDER.noblePhantasm.effects).toMatchObject([
      { kind: "effect", order: 1 },
      { kind: "effect", order: 2 },
      {
        kind: "attack",
        order: 3,
        hitWeights: [1, 1, 1, 1, 1],
        damageMultiplierPermilleByLevel: [800, 1_000, 1_100, 1_150, 1_200],
        specialAttack: { requiredTargetTraits: ["悪"], multiplierPermille: 1_500 },
      },
      { kind: "effect", order: 4 },
    ]);
  });

  it("defines her party recovery, recurring effects, class skills, and bond aura", () => {
    const lilyBeast = JULIA_FARNESE_RIDER.activeSkills[2];
    expect(lilyBeast?.effects.map(({ description }) => description)).toEqual([
      "味方全体のHPを回復[Lv]：3000",
      "＆弱体状態を解除",
      "＆毎ターンHP回復状態を付与[Lv](5T)：1000",
      "＆毎ターンNP獲得状態を付与[Lv](5T)：10%",
    ]);
    expect(lilyBeast?.effects[2]?.action).toMatchObject({
      kind: "apply_effects",
      effects: [{ template: { effectType: COMMON_EFFECT_TYPES.recurringHpRecovery, value: 1_000 } }],
    });
    expect(lilyBeast?.effects[3]?.action).toMatchObject({
      kind: "apply_effects",
      effects: [{ template: { effectType: COMMON_EFFECT_TYPES.recurringNpGain, value: 1_000 } }],
    });
    expect(JULIA_FARNESE_RIDER.classSkills.map(({ name, rank }) => [name, rank])).toEqual([
      ["対魔力", "D"],
      ["騎乗", "A"],
    ]);
    expect(JULIA_FARNESE_RIDER_BOND.fieldEffects).toMatchObject([
      { target: { requiredTraits: ["女性"] }, action: { kind: "apply_effects", effects: [{ template: { effectType: COMMON_EFFECT_TYPES.cardPerformance, value: 100, flags: { cardType: "quick" } } }] } },
      { target: { requiredTraits: ["女性"] }, action: { kind: "apply_effects", effects: [{ template: { effectType: COMMON_EFFECT_TYPES.criticalDamage, value: 200 } }] } },
    ]);
  });
});
