import { describe, expect, it } from "vitest";
import {
  replaceUnit,
} from "../src/core/battle/formation";
import {
  createTraitGrantEffect,
} from "../src/effects/classification";
import {
  removeEffects,
} from "../src/effects/removal";
import {
  applyEffect,
  createEffectRuntimeCounters,
} from "../src/effects/runtime";
import {
  resolveTargets,
} from "../src/effects/targeting";
import {
  effectiveBattleTraits,
  hasAllBattleTraits,
  hasBattleTrait,
} from "../src/effects/traits";
import { formation, unit } from "./helpers/battle";

describe("effective battle traits", () => {
  it("combines base and active grants without merging their lifetimes", () => {
    let target = unit("enemy-a", "enemy", {
      traits: ["human", "evil"],
    });
    let counters = createEffectRuntimeCounters();
    for (const traitId of ["evil", "dragon"] as const) {
      const applied = applyEffect(
        target,
        createTraitGrantEffect(traitId, traitId, {
          remainingTurns: 3,
        }),
        "ally-a",
        counters,
      );
      target = applied.unit;
      counters = applied.counters;
    }

    expect(effectiveBattleTraits(target)).toEqual([
      "human",
      "evil",
      "dragon",
    ]);
    expect(hasBattleTrait(target, "dragon")).toBe(true);
    expect(hasAllBattleTraits(target, ["evil", "dragon"])).toBe(true);

    const removed = removeEffects(target, {
      mode: "by_id",
      stableId: "trait-grant:dragon",
    }).unit;
    expect(hasBattleTrait(removed, "dragon")).toBe(false);
    expect(hasBattleTrait(removed, "evil")).toBe(true);
  });

  it("uses granted traits in common target filters", () => {
    const base = formation();
    const enemyC = base.enemy.frontline[2]!;
    const granted = applyEffect(
      enemyC,
      createTraitGrantEffect("evil", "悪", {
        remainingTurns: 3,
      }),
      "ally-a",
      createEffectRuntimeCounters(),
    ).unit;
    const updated = replaceUnit(base, granted);

    expect(resolveTargets(updated, "ally-a", {
      relation: "enemies",
      selection: "all",
      requiredTraits: ["evil"],
    }).map(({ instanceId }) => instanceId)).toEqual(["enemy-c"]);
  });

  it("rejects malformed trait-grant state when it is evaluated", () => {
    const malformed = applyEffect(
      unit("enemy-a", "enemy"),
      {
        stableId: "malformed-trait",
        name: "不正な特性付与",
        effectType: "trait_grant",
        category: "other",
      },
      null,
      createEffectRuntimeCounters(),
    ).unit;
    expect(() => effectiveBattleTraits(malformed)).toThrow(
      /traitId.*non-empty string/,
    );
  });
});
