import { describe, expect, it } from "vitest";
import { findUnitLocation } from "../src/core/battle/formation";
import { createBattleState } from "../src/core/battle/state";
import {
  createBattleSuspendSave,
  replayBattleSession,
  resolveBattleSessionAllySkill,
  resolveBattleSessionTurn,
} from "../src/core/battle/session";
import { listCommandCardChoices } from "../src/core/cards/selection";
import { BattleRng } from "../src/core/rng";
import {
  JULIA_FARNESE_RIDER,
  createServantBattleInstance,
} from "../src/data/servants";
import {
  JULIA_FARNESE_RIDER_BOND,
} from "../src/data/craftEssences";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import { createBattleActionEffectDataRegistry } from "../src/effects/actionData";
import { createEffectRuntimeCounters } from "../src/effects/runtime";
import { resolveAllySkillUse } from "../src/effects/skillExecution";
import { calculateDamage, type DamageInput } from "../src/formulas/damage";
import { presentNoblePhantasmDetail } from "../src/ui/battleUi";
import {
  createEmptyInitialBattleSetup,
  createInitialBattleSession,
  initialAllySelectionForServant,
} from "../src/ui/initialBattle";
import { registeredSkillIconPath } from "../src/ui/iconRegistry";
import { unit } from "./helpers/battle";

// Wiki percentages checked 2026-09-04: https://w.atwiki.jp/siroi_human/pages/31.html
// Lv120 + ATK Fou3000 + bond ATK100; total Quick170%, attack40%, NP40%,
// enemy defense-20%, Rider/Saber neutral, Human/Sky 1.1, no Evil special attack.
const reportedDamageInput: Omit<DamageInput, "randomModifierPermille"> = {
  attack: 14_157,
  isNoblePhantasm: true,
  npDamageMultiplierPermille: 12_000,
  cardDamageValuePermille: 800,
  cardPerformanceModPermille: 1_700,
  classAttackCoefficientPermille: 1_000,
  classAffinityPermille: 1_000,
  attributeAffinityPermille: 1_100,
  attackModPermille: 400,
  defenseModPermille: -200,
  npDamageModPermille: 400,
};

describe("Julia Farnese (Rider)", () => {
  it.each([
    [1, 8_000], [2, 10_000], [3, 11_000], [4, 11_500], [5, 12_000],
  ] as const)("loads NP level %i with the correct permille multiplier", (level, expected) => {
    const source = createServantBattleInstance(JULIA_FARNESE_RIDER, {
      instanceId: "julia", level: 120, noblePhantasmLevel: level,
    });
    expect(source.attackData.noblePhantasms[0]?.damageMultiplierPermilleByLevel[level - 1])
      .toBe(expected);
  });

  it("matches the reported minimum, standard and maximum damage and percentage display", () => {
    const source = createServantBattleInstance(JULIA_FARNESE_RIDER, {
      instanceId: "julia", level: 120, noblePhantasmLevel: 5, attackAdjustment: 3_000,
    });
    expect([900, 1_000, 1_099].map((randomModifierPermille) => calculateDamage({
      ...reportedDamageInput,
      attack: source.attackData.attack + 100,
      npDamageMultiplierPermille: source.attackData.noblePhantasms[0]?.damageMultiplierPermilleByLevel[4],
      randomModifierPermille,
    }).damage)).toEqual([187_161, 207_957, 228_545]);
    expect(presentNoblePhantasmDetail(source.unit)?.descriptions)
      .toContain("＆強力な攻撃[Lv]：800% / 1000% / 1100% / 1150% / 1200%");
  });

  it("uses the corrected multiplier through real support skills, NP execution and replay", () => {
    let session = createInitialBattleSession({
      ...createEmptyInitialBattleSetup(),
      frontline: [
        {
          ...initialAllySelectionForServant(JULIA_FARNESE_RIDER.dataId),
          level: 120, noblePhantasmLevel: 5, attackFou: 3_000,
          craftEssenceDataId: JULIA_FARNESE_RIDER_BOND.dataId,
        },
        initialAllySelectionForServant("domination-foreigner"),
        initialAllySelectionForServant("domination-foreigner"),
      ],
      mysticCodeDataId: "normal-chaldea-uniform",
      seedMode: "fixed",
      seed: "julia-correct-np-multiplier",
    });
    for (const [sourceInstanceId, skills] of [
      ["ally-frontline-1", JULIA_FARNESE_RIDER.activeSkills.map(({ stableId }) => stableId)],
      ["ally-frontline-2", ["domination-foreigner-eternal-search", "domination-foreigner-picture-in-the-house", "domination-foreigner-at-the-mountains-of-madness"]],
      ["ally-frontline-3", ["domination-foreigner-eternal-search", "domination-foreigner-picture-in-the-house", "domination-foreigner-at-the-mountains-of-madness"]],
    ] as const) {
      for (const skillStableId of skills) {
        const used = resolveBattleSessionAllySkill(session, {
          kind: "ally_skill", sourceInstanceId, skillStableId,
          ...(sourceInstanceId === "ally-frontline-1" ? {} : { selectedTargetInstanceId: "ally-frontline-1" }),
        });
        expect(used.result.accepted).toBe(true);
        session = used.session;
      }
    }
    const np = listCommandCardChoices(session.loop.state).find(({ card }) =>
      card.kind === "noble_phantasm" && card.ownerInstanceId === "ally-frontline-1"
    )?.card;
    if (!np) throw new Error("Julia's NP card is missing");
    const resolved = resolveBattleSessionTurn(session, {
      cardIds: [np.cardId, ...session.loop.state.commandDeck.currentHand.slice(0, 2).map(({ cardId }) => cardId)],
      ally: { requestedTargetInstanceId: "enemy-w1-1" },
    });
    expect(resolved.result.accepted).toBe(true);
    const entry = resolved.session.turnLogs[0]?.records
      .flatMap((record) => record.recordType === "action_batch" ? record.batch.entries : [])
      .find(({ action }) => action.kind === "noble_phantasm");
    expect(entry?.overchargeStage).toBe(5);
    expect(entry?.calculation?.npDamageMultiplierPermille).toBe(12_000);
    expect(entry?.attack?.targets).toHaveLength(3);
    if (!entry?.attack) throw new Error("Julia's NP attack log is missing");
    for (const target of entry.attack.targets) {
      expect(target.damageBreakdown).toMatchObject({
        cardFactorPermille: 2_700, attackDefenseFactorPermille: 1_600, powerFactorPermille: 1_400,
      });
      expect(target.attackDefense.defenseModPermille).toBe(-200);
      expect(target.totalDamage).toBe(calculateDamage({
        ...reportedDamageInput,
        randomModifierPermille: target.damageRandomModifierPermille!,
      }).damage);
      expect(target.totalDamage).toBeGreaterThanOrEqual(187_161);
      expect(target.totalDamage).toBeLessThanOrEqual(228_545);
    }
    expect(replayBattleSession(createBattleSuspendSave(resolved.session)).turnLogs)
      .toEqual(resolved.session.turnLogs);
  });

  it.each([true, false])("restricts only charm to males, with a male enemy present: %s", (hasMale) => {
    const source = createServantBattleInstance(JULIA_FARNESE_RIDER, {
      instanceId: "julia", level: 80, noblePhantasmLevel: 1,
    });
    const state = createBattleState({
      ally: {
        frontline: [source.unit, unit("ally-b", "ally"), unit("ally-c", "ally")],
        reserve: [],
      },
      waves: [{ enemy: {
        frontline: [
          unit("enemy-a", "enemy", { traits: hasMale ? ["男性"] : ["女性"] }),
          unit("enemy-b", "enemy", { traits: ["女性"] }),
          unit("enemy-c", "enemy", { traits: [] }),
        ],
        reserve: [unit("enemy-reserve", "enemy", { traits: ["男性"] })],
      } }],
      enemyFrontlineLimit: 3,
    });
    const result = resolveAllySkillUse({
      state,
      registry: createBattleActionEffectDataRegistry([source.actionEffectData]),
      sourceInstanceId: "julia",
      skillStableId: "julia-farnese-beautiful-julia",
      counters: createEffectRuntimeCounters(),
      rng: new BattleRng("julia-skill-one-targets").stream("effects"),
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) throw new Error("Julia's first skill was rejected");
    for (const id of ["enemy-a", "enemy-b", "enemy-c"]) {
      const effects = findUnitLocation(result.state.formation, id)?.unit.effects;
      expect(effects).toEqual(expect.arrayContaining([
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.debuffResistance, value: -300, remainingTurns: 3 }),
        expect.objectContaining({ effectType: COMMON_EFFECT_TYPES.defense, value: -200, remainingTurns: 3 }),
      ]));
      const shouldCharm = hasMale && id === "enemy-a";
      expect(effects).toHaveLength(shouldCharm ? 3 : 2);
      expect(effects?.filter(({ effectType }) => effectType === "charm"))
        .toHaveLength(shouldCharm ? 1 : 0);
      if (shouldCharm) {
        expect(effects).toContainEqual(expect.objectContaining({ effectType: "charm", remainingTurns: 1 }));
      }
    }
    for (const id of ["julia", "ally-b", "ally-c", "enemy-reserve"]) {
      expect(findUnitLocation(result.state.formation, id)?.unit.effects).toEqual([]);
    }
    expect(findUnitLocation(result.state.formation, "julia")?.unit.skillCooldowns).toEqual([7, 0, 0]);
  });

  it.each([
    ["麗しのジュリア", "skill-stun-charm"],
    ["無垢なる一角馬", "skill-star-per-turn"],
    ["白百合の獣", "skill-hp-heal"],
  ])("uses the specified icon for %s", (name, icon) => {
    expect(registeredSkillIconPath(name)).toContain(`/assets/skill-icons/${icon}.png`);
  });

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
        damageMultiplierPermilleByLevel: [8_000, 10_000, 11_000, 11_500, 12_000],
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
