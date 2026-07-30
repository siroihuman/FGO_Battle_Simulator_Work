import { describe, expect, it } from "vitest";
import {
  assertValidFormation,
  orderedLocations,
} from "../src/core/battle/formation";
import { resolveTargets } from "../src/effects/targeting";
import { formation, unit } from "./helpers/battle";

describe("battle formation and target resolution", () => {
  it("allows duplicate data while keeping unique battle instances", () => {
    const state = formation();
    expect(state.ally.frontline[0]?.dataId).toBe(
      state.ally.frontline[1]?.dataId,
    );
    expect(state.ally.frontline[0]?.instanceId).not.toBe(
      state.ally.frontline[1]?.instanceId,
    );
    expect(() => assertValidFormation(state)).not.toThrow();
  });

  it("rejects duplicate instance IDs", () => {
    const state = formation();
    state.ally.reserve.push(unit("ally-a", "ally"));
    expect(() => assertValidFormation(state)).toThrow(/duplicate instanceId/);
  });

  it("orders frontline slots before reserves and skips empty slots", () => {
    expect(
      orderedLocations(formation(), "enemy", true).map(
        ({ unit: target }) => target.instanceId,
      ),
    ).toEqual(["enemy-a", "enemy-c", "enemy-d"]);
  });

  it("resolves all allies including reserves in formation order", () => {
    expect(
      resolveTargets(formation(), "ally-a", {
        relation: "allies",
        selection: "all",
        includeReserve: true,
      }).map(({ instanceId }) => instanceId),
    ).toEqual(["ally-a", "ally-b", "ally-c", "ally-d", "ally-e", "ally-f"]);
  });

  it("resolves the frontmost ally other than self", () => {
    expect(
      resolveTargets(formation(), "ally-a", {
        relation: "allies",
        selection: "frontmost",
        excludeSource: true,
      }).map(({ instanceId }) => instanceId),
    ).toEqual(["ally-b"]);
  });

  it("supports selected, rearmost and trait-filtered targets", () => {
    const state = formation();
    expect(
      resolveTargets(state, "ally-a", {
        relation: "enemies",
        selection: "single",
        selectedInstanceId: "enemy-c",
      }).map(({ instanceId }) => instanceId),
    ).toEqual(["enemy-c"]);
    expect(
      resolveTargets(state, "ally-a", {
        relation: "enemies",
        selection: "rearmost",
        includeReserve: true,
        requiredTraits: ["dragon"],
      }).map(({ instanceId }) => instanceId),
    ).toEqual(["enemy-d"]);
  });

  it("returns no target when a selected unit is outside the allowed scope", () => {
    expect(
      resolveTargets(formation(), "ally-a", {
        relation: "enemies",
        selection: "single",
        selectedInstanceId: "enemy-d",
        includeReserve: false,
      }),
    ).toEqual([]);
  });
});
