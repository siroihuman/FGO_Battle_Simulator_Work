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

interface RngAuditBase {
  /** One-based underlying SplitMix64 draw numbers, or null for fixed results. */
  drawNumberStart: number | null;
  drawNumberEnd: number | null;
  drawsConsumed: number;
}

export type RngAuditEvent =
  | (RngAuditBase & {
      operation: "uint64";
      valueHex: string;
    })
  | (RngAuditBase & {
      operation: "integer";
      minimum: number;
      maximum: number;
      value: number;
    })
  | (RngAuditBase & {
      operation: "chance";
      ratePermille: number;
      roll: number | null;
      succeeded: boolean;
    })
  | (RngAuditBase & {
      operation: "chance_basis_points";
      rateBasisPoints: number;
      roll: number | null;
      succeeded: boolean;
    });

export type RngAuditListener = (event: RngAuditEvent) => void;

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
  private readonly auditListeners = new Set<RngAuditListener>();

  constructor(state: bigint, drawCount = 0) {
    this.state = state & UINT64_MASK;
    this.draws = drawCount;
  }

  private drawUint64(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & UINT64_MASK;
    let value = this.state;
    value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & UINT64_MASK;
    value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & UINT64_MASK;
    this.draws += 1;
    return (value ^ (value >> 31n)) & UINT64_MASK;
  }

  private emitAudit(event: RngAuditEvent): void {
    for (const listener of this.auditListeners) listener(event);
  }

  /**
   * Adds a synchronous observer without changing the generated sequence.
   * The returned function must be called when the audited operation ends.
   */
  addAuditListener(listener: RngAuditListener): () => void {
    this.auditListeners.add(listener);
    return () => {
      this.auditListeners.delete(listener);
    };
  }

  nextUint64(): bigint {
    const value = this.drawUint64();
    this.emitAudit({
      operation: "uint64",
      drawNumberStart: this.draws,
      drawNumberEnd: this.draws,
      drawsConsumed: 1,
      valueHex: value.toString(16).padStart(16, "0"),
    });
    return value;
  }

  private drawIntInclusive(
    minimum: number,
    maximum: number,
  ): {
    value: number;
    drawNumberStart: number;
    drawNumberEnd: number;
  } {
    const drawNumberStart = this.draws + 1;
    const range = BigInt(maximum - minimum + 1);
    const acceptanceLimit = UINT64_RANGE - (UINT64_RANGE % range);
    let draw: bigint;
    do {
      draw = this.drawUint64();
    } while (draw >= acceptanceLimit);
    return {
      value: minimum + Number(draw % range),
      drawNumberStart,
      drawNumberEnd: this.draws,
    };
  }

  nextIntInclusive(minimum: number, maximum: number): number {
    if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum)) {
      throw new RangeError("bounds must be safe integers");
    }
    if (minimum > maximum) {
      throw new RangeError("minimum must not exceed maximum");
    }

    const result = this.drawIntInclusive(minimum, maximum);
    this.emitAudit({
      operation: "integer",
      drawNumberStart: result.drawNumberStart,
      drawNumberEnd: result.drawNumberEnd,
      drawsConsumed:
        result.drawNumberEnd - result.drawNumberStart + 1,
      minimum,
      maximum,
      value: result.value,
    });
    return result.value;
  }

  chance(ratePermille: number): boolean {
    if (!Number.isInteger(ratePermille) || ratePermille < 0 || ratePermille > 1000) {
      throw new RangeError("ratePermille must be an integer from 0 to 1000");
    }
    if (ratePermille === 0 || ratePermille === 1000) {
      const succeeded = ratePermille === 1000;
      this.emitAudit({
        operation: "chance",
        drawNumberStart: null,
        drawNumberEnd: null,
        drawsConsumed: 0,
        ratePermille,
        roll: null,
        succeeded,
      });
      return succeeded;
    }
    const result = this.drawIntInclusive(1, 1000);
    const succeeded = result.value <= ratePermille;
    this.emitAudit({
      operation: "chance",
      drawNumberStart: result.drawNumberStart,
      drawNumberEnd: result.drawNumberEnd,
      drawsConsumed:
        result.drawNumberEnd - result.drawNumberStart + 1,
      ratePermille,
      roll: result.value,
      succeeded,
    });
    return succeeded;
  }

  /** Rolls a percentage rate expressed in 0.01%-point units. */
  chanceBasisPoints(rateBasisPoints: number): boolean {
    if (
      !Number.isInteger(rateBasisPoints)
      || rateBasisPoints < 0
      || rateBasisPoints > 10_000
    ) {
      throw new RangeError(
        "rateBasisPoints must be an integer from 0 to 10000",
      );
    }
    if (rateBasisPoints === 0 || rateBasisPoints === 10_000) {
      const succeeded = rateBasisPoints === 10_000;
      this.emitAudit({
        operation: "chance_basis_points",
        drawNumberStart: null,
        drawNumberEnd: null,
        drawsConsumed: 0,
        rateBasisPoints,
        roll: null,
        succeeded,
      });
      return succeeded;
    }
    const result = this.drawIntInclusive(1, 10_000);
    const succeeded = result.value <= rateBasisPoints;
    this.emitAudit({
      operation: "chance_basis_points",
      drawNumberStart: result.drawNumberStart,
      drawNumberEnd: result.drawNumberEnd,
      drawsConsumed:
        result.drawNumberEnd - result.drawNumberStart + 1,
      rateBasisPoints,
      roll: result.value,
      succeeded,
    });
    return succeeded;
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
