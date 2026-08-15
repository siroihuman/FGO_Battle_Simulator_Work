import { describe, expect, it } from "vitest";
import { BattleRng } from "../src/core/rng";
import {
  calculateEffectApplicationRate,
  resolveEffectApplication,
} from "../src/effects/application";
import { createTraitGrantEffect } from "../src/effects/classification";
import { COMMON_EFFECT_TYPES } from "../src/effects/modifiers";
import {
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import type {
  EffectRuntimeCounters,
  EffectTemplate,
} from "../src/effects/types";
import { unit } from "./helpers/battle";

const defenseDown: EffectTemplate = {
  stableId: "defense-down",
  name: "防御力ダウン",
  effectType: "defense_mod",
  category: "debuff",
  classifications: ["defense"],
  value: -300,
  remainingTurns: 3,
};

const stun: EffectTemplate = {
  stableId: "stun",
  name: "スタン",
  effectType: "stun",
  category: "debuff",
  classifications: ["mental", "immobilize"],
  remainingTurns: 1,
};

const attackUp: EffectTemplate = {
  stableId: "attack-up",
  name: "攻撃力アップ",
  effectType: "attack_mod",
  category: "buff",
  classifications: ["attack"],
  value: 300,
  remainingTurns: 3,
};

function register(
  target: ReturnType<typeof unit>,
  template: EffectTemplate,
  counters: EffectRuntimeCounters,
) {
  return applyEffect(target, template, null, counters);
}

describe("effect application rates", () => {
  it("adds source debuff success and subtracts matching target resistance", () => {
    let counters = createEffectRuntimeCounters();
    const sourceResult = register(
      unit("ally-a", "ally"),
      {
        stableId: "debuff-success",
        name: "弱体付与成功率アップ",
        effectType: COMMON_EFFECT_TYPES.debuffSuccess,
        category: "buff",
        classifications: ["defense"],
        value: 200,
      },
      counters,
    );
    counters = sourceResult.counters;
    const targetResult = register(
      unit("enemy-a", "enemy"),
      {
        stableId: "debuff-resistance",
        name: "弱体耐性アップ",
        effectType: COMMON_EFFECT_TYPES.debuffResistance,
        category: "buff",
        value: 300,
      },
      counters,
    );

    expect(
      calculateEffectApplicationRate(sourceResult.unit, targetResult.unit, {
        template: defenseDown,
        baseRatePermille: 800,
      }),
    ).toEqual({
      baseRatePermille: 800,
      sourceModifierPermille: 200,
      targetModifierPermille: -300,
      resolvedRatePermille: 700,
    });
  });

  it("preserves 0.01%-point debuff-success source values", () => {
    const sourceResult = register(
      unit("ally-a", "ally"),
      {
        stableId: "precise-debuff-success",
        name: "弱体付与成功率アップ",
        effectType: COMMON_EFFECT_TYPES.debuffSuccessBasisPoints,
        category: "buff",
        value: 1_175,
      },
      createEffectRuntimeCounters(),
    );

    expect(
      calculateEffectApplicationRate(sourceResult.unit, unit("enemy-a", "enemy"), {
        template: defenseDown,
        baseRatePermille: 800,
      }).resolvedRatePermille,
    ).toBe(917.5);
  });

  it("uses source buff success and the target's received-buff success", () => {
    let counters = createEffectRuntimeCounters();
    const sourceResult = register(
      unit("ally-a", "ally"),
      {
        stableId: "buff-success",
        name: "強化成功率アップ",
        effectType: COMMON_EFFECT_TYPES.buffSuccess,
        category: "buff",
        value: 200,
      },
      counters,
    );
    counters = sourceResult.counters;
    const targetResult = register(
      unit("ally-b", "ally"),
      {
        stableId: "received-buff-success-down",
        name: "被強化成功率ダウン",
        effectType: COMMON_EFFECT_TYPES.receivedBuffSuccess,
        category: "debuff",
        value: -300,
      },
      counters,
    );

    expect(
      calculateEffectApplicationRate(sourceResult.unit, targetResult.unit, {
        template: attackUp,
        baseRatePermille: 1100,
      }).resolvedRatePermille,
    ).toBe(1000);
  });

  it("applies self-debuff resistance unless the child state ignores it", () => {
    const resistance = register(
      unit("ally-a", "ally"),
      {
        stableId: "debuff-resistance",
        name: "弱体耐性アップ",
        effectType: COMMON_EFFECT_TYPES.debuffResistance,
        category: "buff",
        value: 1000,
      },
      createEffectRuntimeCounters(),
    );
    const rng = new BattleRng("self-debuff").stream("effects");
    const resisted = resolveEffectApplication(
      resistance.unit,
      resistance.unit,
      [{ template: defenseDown }],
      resistance.counters,
      rng,
    );
    expect(resisted.results[0].outcome).toBe("resisted");
    expect(resisted.unit?.effects).toHaveLength(1);

    const ignored = resolveEffectApplication(
      resistance.unit,
      resistance.unit,
      [{ template: defenseDown, ignoreResistance: true }],
      resistance.counters,
      rng,
    );
    expect(ignored.results[0].outcome).toBe("applied");
    expect(ignored.unit?.effects).toHaveLength(2);
    expect(rng.snapshot().drawCount).toBe(0);
  });

  it("keeps slip-kind resistance separate from the corresponding amplifier", () => {
    const pairs = [
      ["burn", "spread_of_fire"],
      ["poison", "toxic"],
      ["curse", "evil_curse"],
    ] as const;

    for (const [slipKind, amplifierKind] of pairs) {
      const resistance = register(
        unit("enemy-a", "enemy"),
        {
          stableId: `${slipKind}-resistance`,
          name: `${slipKind}-resistance`,
          effectType: COMMON_EFFECT_TYPES.debuffResistance,
          category: "buff",
          classifications: [slipKind],
          value: 1000,
        },
        createEffectRuntimeCounters(),
      );
      const rng = new BattleRng(`${slipKind}-resistance-separation`).stream(
        "effects",
      );
      const result = resolveEffectApplication(
        unit("ally-a", "ally"),
        resistance.unit,
        [
          {
            template: {
              stableId: slipKind,
              name: slipKind,
              effectType: slipKind,
              category: "debuff",
              classifications: [slipKind],
            },
          },
          {
            template: {
              stableId: amplifierKind,
              name: amplifierKind,
              effectType: amplifierKind,
              category: "debuff",
              classifications: [amplifierKind],
              value: 550,
              slipDamageAmplifierKind: amplifierKind,
            },
          },
        ],
        resistance.counters,
        rng,
      );

      expect(result.results.map(({ outcome }) => outcome)).toEqual([
        "resisted",
        "applied",
      ]);
      expect(result.unit?.effects.map(({ stableId }) => stableId)).toEqual([
        `${slipKind}-resistance`,
        amplifierKind,
      ]);
      expect(rng.snapshot().drawCount).toBe(0);
    }
  });

  it("replays non-certain child-state rolls from the same fixed seed", () => {
    const specs = [
      { template: defenseDown, baseRatePermille: 500 },
      { template: stun, baseRatePermille: 500 },
    ];
    const firstRng = new BattleRng("application-replay").stream("effects");
    const secondRng = new BattleRng("application-replay").stream("effects");
    const first = resolveEffectApplication(
      unit("ally-a", "ally"),
      unit("enemy-a", "enemy"),
      specs,
      createEffectRuntimeCounters(),
      firstRng,
    );
    const second = resolveEffectApplication(
      unit("ally-a", "ally"),
      unit("enemy-a", "enemy"),
      specs,
      createEffectRuntimeCounters(),
      secondRng,
    );

    expect(first.results.map(({ outcome }) => outcome)).toEqual(
      second.results.map(({ outcome }) => outcome),
    );
    expect(firstRng.snapshot()).toEqual(secondRng.snapshot());
    expect(firstRng.snapshot().drawCount).toBe(2);
  });
});

describe("count-based effect immunity", () => {
  it("blocks every matching child state in one action and consumes one use", () => {
    const immunity = register(
      unit("enemy-a", "enemy"),
      {
        stableId: "debuff-immunity",
        name: "弱体無効",
        effectType: COMMON_EFFECT_TYPES.debuffImmunity,
        category: "buff",
        remainingUses: 1,
      },
      createEffectRuntimeCounters(),
    );
    const result = resolveEffectApplication(
      unit("ally-a", "ally"),
      immunity.unit,
      [{ template: defenseDown }, { template: stun }],
      immunity.counters,
      new BattleRng("one-action-immunity").stream("effects"),
    );

    expect(result.results.map(({ outcome }) => outcome)).toEqual([
      "immune",
      "immune",
    ]);
    expect(result.results.map(({ consumedImmunityUse }) => consumedImmunityUse)).toEqual([
      true,
      false,
    ]);
    expect(result.unit?.effects).toEqual([]);
  });

  it("uses the oldest matching immunity before newer copies", () => {
    let target = unit("enemy-a", "enemy");
    let counters = createEffectRuntimeCounters();
    for (const stableId of ["old-immunity", "new-immunity"]) {
      const applied = register(
        target,
        {
          stableId,
          name: stableId,
          effectType: COMMON_EFFECT_TYPES.debuffImmunity,
          category: "buff",
          remainingUses: 1,
        },
        counters,
      );
      target = applied.unit;
      counters = applied.counters;
    }
    const result = resolveEffectApplication(
      unit("ally-a", "ally"),
      target,
      [{ template: defenseDown }],
      counters,
      new BattleRng("oldest-immunity").stream("effects"),
    );

    expect(result.results[0].immunityEffectInstanceId).toBe("effect-1");
    expect(result.unit?.effects.map(({ stableId }) => stableId)).toEqual([
      "new-immunity",
    ]);
  });

  it("applies the same one-action consumption rule to buff immunity", () => {
    const immunity = register(
      unit("ally-a", "ally"),
      {
        stableId: "buff-immunity",
        name: "強化無効",
        effectType: COMMON_EFFECT_TYPES.buffImmunity,
        category: "debuff",
        remainingUses: 1,
      },
      createEffectRuntimeCounters(),
    );
    const result = resolveEffectApplication(
      unit("ally-b", "ally"),
      immunity.unit,
      [
        { template: attackUp },
        {
          template: {
            ...attackUp,
            stableId: "defense-up",
            name: "防御力アップ",
            classifications: ["defense"],
          },
        },
      ],
      immunity.counters,
      new BattleRng("buff-immunity").stream("effects"),
    );

    expect(result.results.map(({ outcome }) => outcome)).toEqual([
      "immune",
      "immune",
    ]);
    expect(result.unit?.effects).toEqual([]);
  });

  it("lets a classification-limited immunity block only matching states", () => {
    const immunity = register(
      unit("enemy-a", "enemy"),
      {
        stableId: "mental-immunity",
        name: "精神異常無効",
        effectType: COMMON_EFFECT_TYPES.debuffImmunity,
        category: "buff",
        classifications: ["mental"],
        remainingUses: 1,
      },
      createEffectRuntimeCounters(),
    );
    const result = resolveEffectApplication(
      unit("ally-a", "ally"),
      immunity.unit,
      [{ template: defenseDown }, { template: stun }],
      immunity.counters,
      new BattleRng("limited-immunity").stream("effects"),
    );

    expect(result.results.map(({ outcome }) => outcome)).toEqual([
      "applied",
      "immune",
    ]);
    expect(result.unit?.effects.map(({ stableId }) => stableId)).toEqual([
      "defense-down",
    ]);
  });

  it("reports target absence without consuming randomness", () => {
    const rng = new BattleRng("no-target").stream("effects");
    const result = resolveEffectApplication(
      unit("ally-a", "ally"),
      null,
      [{ template: defenseDown }, { template: stun }],
      createEffectRuntimeCounters(),
      rng,
    );
    expect(result.results.map(({ outcome }) => outcome)).toEqual([
      "no_target",
      "no_target",
    ]);
    expect(rng.snapshot().drawCount).toBe(0);
  });

  it("does not apply buff/debuff immunity to non-Roma trait grants", () => {
    let target = unit("enemy-a", "enemy");
    let counters = createEffectRuntimeCounters();
    for (const effectType of [
      COMMON_EFFECT_TYPES.buffImmunity,
      COMMON_EFFECT_TYPES.debuffImmunity,
    ]) {
      const applied = register(
        target,
        {
          stableId: effectType,
          name: effectType,
          effectType,
          category: "buff",
          remainingUses: 1,
        },
        counters,
      );
      target = applied.unit;
      counters = applied.counters;
    }
    const result = resolveEffectApplication(
      unit("ally-a", "ally"),
      target,
      [{ template: createTraitGrantEffect("dragon", "竜") }],
      counters,
      new BattleRng("other-trait").stream("effects"),
    );

    expect(result.results[0].outcome).toBe("applied");
    expect(result.unit?.effects.map(({ stableId }) => stableId)).toEqual([
      "buff_immunity",
      "debuff_immunity",
      "trait-grant:dragon",
    ]);
  });
});
