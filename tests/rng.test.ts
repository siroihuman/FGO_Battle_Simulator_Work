import { describe, expect, it } from "vitest";
import {
  BattleRng,
  DeterministicRng,
  RNG_STREAM_NAMES,
} from "../src/core/rng";

describe("deterministic named RNG streams", () => {
  it("replays identical values from the same seed", () => {
    const first = new BattleRng("battle-001");
    const second = new BattleRng("battle-001");
    expect(
      RNG_STREAM_NAMES.map((name) => first.stream(name).nextUint64()),
    ).toEqual(
      RNG_STREAM_NAMES.map((name) => second.stream(name).nextUint64()),
    );
  });

  it("keeps unrelated streams independent", () => {
    const first = new BattleRng("stream-isolation");
    first.stream("effects").nextUint64();
    first.stream("effects").nextUint64();

    const second = new BattleRng("stream-isolation");
    expect(first.stream("damage").nextUint64()).toBe(
      second.stream("damage").nextUint64(),
    );
  });

  it("restores stream positions exactly", () => {
    const original = new BattleRng(20260730);
    original.stream("cards").nextIntInclusive(0, 14);
    original.stream("damage").nextIntInclusive(900, 1099);
    const restored = BattleRng.restore(original.snapshot());

    expect(restored.stream("cards").nextUint64()).toBe(
      original.stream("cards").nextUint64(),
    );
    expect(restored.stream("damage").nextUint64()).toBe(
      original.stream("damage").nextUint64(),
    );
  });

  it("does not consume RNG for deterministic chances", () => {
    const rng = new DeterministicRng(123n);
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1000)).toBe(true);
    expect(rng.snapshot().drawCount).toBe(0);
  });
});
