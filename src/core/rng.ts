export const RNG_ALGORITHM_VERSION = 1 as const;

export const RNG_STREAM_NAMES = [
  "cards",
  "ai",
  "effects",
  "critical",
  "damage",
  "stars",
] as const;

export type RngStreamName = (typeof RNG_STREAM_NAMES)[number];

const UINT64_MASK = (1n << 64n) - 1n;
const UINT64_RANGE = 1n << 64n;

export interface RngStreamSnapshot {
  algorithmVersion: typeof RNG_ALGORITHM_VERSION;
  stateHex: string;
  drawCount: number;
}

export interface BattleRngSnapshot {
  algorithmVersion: typeof RNG_ALGORITHM_VERSION;
  seed: string;
  streams: Record<RngStreamName, RngStreamSnapshot>;
}

function fnv1a64(value: string): bigint {
  let hash = 0xcbf29ce484222325n;
  for (const character of new TextEncoder().encode(value)) {
    hash ^= BigInt(character);
    hash = (hash * 0x100000001b3n) & UINT64_MASK;
  }
  return hash;
}

function normalizeSeed(seed: string | number): string {
  if (typeof seed === "number") {
    if (!Number.isSafeInteger(seed)) {
      throw new RangeError("numeric seed must be a safe integer");
    }
    return String(seed);
  }
  if (seed.length === 0) {
    throw new RangeError("seed must not be empty");
  }
  return seed;
}

export class DeterministicRng {
  private state: bigint;
  private draws: number;

  constructor(state: bigint, drawCount = 0) {
    this.state = state & UINT64_MASK;
    this.draws = drawCount;
  }

  nextUint64(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & UINT64_MASK;
    let value = this.state;
    value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & UINT64_MASK;
    value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & UINT64_MASK;
    this.draws += 1;
    return (value ^ (value >> 31n)) & UINT64_MASK;
  }

  nextIntInclusive(minimum: number, maximum: number): number {
    if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum)) {
      throw new RangeError("bounds must be safe integers");
    }
    if (minimum > maximum) {
      throw new RangeError("minimum must not exceed maximum");
    }

    const range = BigInt(maximum - minimum + 1);
    const acceptanceLimit = UINT64_RANGE - (UINT64_RANGE % range);
    let draw: bigint;
    do {
      draw = this.nextUint64();
    } while (draw >= acceptanceLimit);
    return minimum + Number(draw % range);
  }

  chance(ratePermille: number): boolean {
    if (!Number.isInteger(ratePermille) || ratePermille < 0 || ratePermille > 1000) {
      throw new RangeError("ratePermille must be an integer from 0 to 1000");
    }
    if (ratePermille === 0) return false;
    if (ratePermille === 1000) return true;
    return this.nextIntInclusive(1, 1000) <= ratePermille;
  }

  snapshot(): RngStreamSnapshot {
    return {
      algorithmVersion: RNG_ALGORITHM_VERSION,
      stateHex: this.state.toString(16).padStart(16, "0"),
      drawCount: this.draws,
    };
  }

  static restore(snapshot: RngStreamSnapshot): DeterministicRng {
    if (snapshot.algorithmVersion !== RNG_ALGORITHM_VERSION) {
      throw new RangeError(`unsupported RNG algorithm: ${snapshot.algorithmVersion}`);
    }
    if (!/^[0-9a-f]{16}$/i.test(snapshot.stateHex)) {
      throw new RangeError("stateHex must contain exactly 16 hexadecimal digits");
    }
    if (!Number.isSafeInteger(snapshot.drawCount) || snapshot.drawCount < 0) {
      throw new RangeError("drawCount must be a non-negative safe integer");
    }
    return new DeterministicRng(BigInt(`0x${snapshot.stateHex}`), snapshot.drawCount);
  }
}

export class BattleRng {
  readonly seed: string;
  private readonly streams: Record<RngStreamName, DeterministicRng>;

  constructor(seed: string | number) {
    this.seed = normalizeSeed(seed);
    this.streams = Object.fromEntries(
      RNG_STREAM_NAMES.map((name) => [
        name,
        new DeterministicRng(
          fnv1a64(`${RNG_ALGORITHM_VERSION}\u0000${this.seed}\u0000${name}`),
        ),
      ]),
    ) as Record<RngStreamName, DeterministicRng>;
  }

  stream(name: RngStreamName): DeterministicRng {
    return this.streams[name];
  }

  snapshot(): BattleRngSnapshot {
    return {
      algorithmVersion: RNG_ALGORITHM_VERSION,
      seed: this.seed,
      streams: Object.fromEntries(
        RNG_STREAM_NAMES.map((name) => [name, this.streams[name].snapshot()]),
      ) as Record<RngStreamName, RngStreamSnapshot>,
    };
  }

  static restore(snapshot: BattleRngSnapshot): BattleRng {
    if (snapshot.algorithmVersion !== RNG_ALGORITHM_VERSION) {
      throw new RangeError(`unsupported RNG algorithm: ${snapshot.algorithmVersion}`);
    }
    const battleRng = new BattleRng(snapshot.seed);
    for (const name of RNG_STREAM_NAMES) {
      battleRng.streams[name] = DeterministicRng.restore(snapshot.streams[name]);
    }
    return battleRng;
  }
}

export function createRandomSeed(): string {
  const values = new Uint32Array(4);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(8, "0")).join("");
}
