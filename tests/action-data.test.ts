import { describe, expect, it } from "vitest";
import {
  affinityPermille,
  combatantAttackData,
  createBattleAttackDataRegistry,
  enemyAttackActionData,
  noblePhantasmAttackData,
  noblePhantasmDamageMultiplier,
} from "../src/core/battle/actionData";
import { combatantData } from "./helpers/attackData";
import { unit } from "./helpers/battle";

describe("battle-instance attack data", () => {
  it("allows duplicate servant data with different instance-specific stats", () => {
    const registry = createBattleAttackDataRegistry([
      combatantData("ally-a", "same-servant", {
        attack: 10_000,
      }),
      combatantData("ally-b", "same-servant", {
        attack: 15_000,
      }),
    ]);

    expect(
      combatantAttackData(
        registry,
        unit("ally-a", "ally", {
          dataId: "same-servant",
        }),
      )?.attack,
    ).toBe(10_000);
    expect(
      combatantAttackData(
        registry,
        unit("ally-b", "ally", {
          dataId: "same-servant",
        }),
      )?.attack,
    ).toBe(15_000);
  });

  it("rejects duplicate instance IDs and malformed Hit data before battle", () => {
    const profile = combatantData("ally-a", "servant");
    expect(() =>
      createBattleAttackDataRegistry([profile, profile])
    ).toThrow(/duplicate attack-data instanceId/);
    expect(() =>
      createBattleAttackDataRegistry([
        combatantData("ally-a", "servant", {
          commandCardHitWeights: [
            [1],
            [1],
            [],
            [1],
            [1],
          ],
        }),
      ])
    ).toThrow(/must not be empty/);
    expect(() =>
      createBattleAttackDataRegistry([
        combatantData("enemy-a", "enemy", {
          enemyAttacks: [
            {
              actionStableId: "attack",
              kind: "normal_attack",
              targetScope: "single",
              cardType: "buster",
              hitWeights: [0, 0],
              cardDamageValuePermille: 1_000,
            },
          ],
        }),
      ])
    ).toThrow(/total must be positive/);
    expect(() =>
      createBattleAttackDataRegistry([
        combatantData("ally-a", "servant", {
          starWeight: -1,
        }),
      ])
    ).toThrow(/starWeight must be a non-negative safe integer/);
  });

  it("rejects stale instance data when a formation instance changes dataId", () => {
    const registry = createBattleAttackDataRegistry([
      combatantData("ally-a", "servant-a"),
    ]);
    expect(() =>
      combatantAttackData(
        registry,
        unit("ally-a", "ally", {
          dataId: "servant-b",
        }),
      )
    ).toThrow(/stale attack data/);
  });

  it("uses explicit affinities and neutral defaults", () => {
    const registry = createBattleAttackDataRegistry([], {
      class: {
        saber: { lancer: 2_000 },
      },
      attribute: {
        man: { sky: 1_100 },
      },
    });
    expect(
      affinityPermille(
        registry.affinities.class,
        "saber",
        "lancer",
      ),
    ).toBe(2_000);
    expect(
      affinityPermille(
        registry.affinities.class,
        "saber",
        "saber",
      ),
    ).toBe(1_000);
    expect(
      affinityPermille(
        registry.affinities.attribute,
        "man",
        "sky",
      ),
    ).toBe(1_100);
  });

  it("accepts negative target star-rate corrections", () => {
    expect(() =>
      createBattleAttackDataRegistry([
        combatantData("enemy-a", "assassin-enemy", {
          targetStarRatePermille: -100,
        }),
      ])
    ).not.toThrow();
  });

  it("looks up NP and enemy action profiles by stable ID and kind", () => {
    const combatant = combatantData("unit-a", "unit", {
      noblePhantasms: [
        {
          stableId: "np-a",
          targetScope: "all",
          hitWeights: [1, 2],
          damageMultiplierPermilleByLevel: [
            3_000,
            4_000,
            4_500,
            4_750,
            5_000,
          ],
        },
      ],
      enemyAttacks: [
        {
          actionStableId: "enemy-np",
          kind: "noble_phantasm",
          targetScope: "all",
          cardType: "buster",
          hitWeights: [1],
          cardDamageValuePermille: 1_500,
        },
      ],
    });
    const np = noblePhantasmAttackData(combatant, "np-a");
    if (!np) throw new Error("missing NP data");
    expect(noblePhantasmDamageMultiplier(np, 3)).toBe(4_500);
    expect(
      enemyAttackActionData(
        combatant,
        "enemy-np",
        "noble_phantasm",
      )?.targetScope,
    ).toBe("all");
    expect(
      enemyAttackActionData(
        combatant,
        "enemy-np",
        "normal_attack",
      ),
    ).toBeNull();
  });

  it("validates conditional NP special-attack trait requirements", () => {
    expect(() => createBattleAttackDataRegistry([
      combatantData("ally-a", "servant", {
        noblePhantasms: [{
          stableId: "conditional-np",
          targetScope: "all",
          hitWeights: [1],
          damageMultiplierPermilleByLevel: [
            3_000,
            4_000,
            4_500,
            4_750,
            5_000,
          ],
          specialAttackPermilleByOvercharge: [
            1_500,
            1_625,
            1_750,
            1_875,
            2_000,
          ],
          specialAttackRequiredTargetTraits: ["evil"],
        }],
      }),
    ])).not.toThrow();

    expect(() => createBattleAttackDataRegistry([
      combatantData("ally-a", "servant", {
        noblePhantasms: [{
          stableId: "broken-conditional-np",
          targetScope: "all",
          hitWeights: [1],
          damageMultiplierPermilleByLevel: [
            3_000,
            4_000,
            4_500,
            4_750,
            5_000,
          ],
          specialAttackRequiredTargetTraits: ["evil"],
        }],
      }),
    ])).toThrow(/requires special-attack multipliers/);
  });
});
