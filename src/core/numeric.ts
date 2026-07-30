const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

export function assertSafeInteger(value: number, name = "value"): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer: ${value}`);
  }
}

export function toSafeNumber(value: bigint, name = "result"): number {
  if (value > MAX_SAFE_BIGINT || value < MIN_SAFE_BIGINT) {
    throw new RangeError(`${name} exceeds the safe integer range`);
  }
  return Number(value);
}

export function floorDiv(numerator: number, denominator: number): number {
  assertSafeInteger(numerator, "numerator");
  assertSafeInteger(denominator, "denominator");
  if (denominator <= 0) {
    throw new RangeError("denominator must be positive");
  }

  const n = BigInt(numerator);
  const d = BigInt(denominator);
  const quotient = n / d;
  const remainder = n % d;
  return toSafeNumber(remainder < 0n ? quotient - 1n : quotient);
}

export function multiplyThenFloor(
  factors: readonly number[],
  denominator: number,
): number {
  assertSafeInteger(denominator, "denominator");
  if (denominator <= 0) {
    throw new RangeError("denominator must be positive");
  }

  const product = factors.reduce((result, factor, index) => {
    assertSafeInteger(factor, `factors[${index}]`);
    return result * BigInt(factor);
  }, 1n);

  const divisor = BigInt(denominator);
  const quotient = product / divisor;
  const remainder = product % divisor;
  return toSafeNumber(remainder < 0n ? quotient - 1n : quotient);
}

export function clampInteger(value: number, minimum: number, maximum: number): number {
  assertSafeInteger(value);
  assertSafeInteger(minimum, "minimum");
  assertSafeInteger(maximum, "maximum");
  if (minimum > maximum) {
    throw new RangeError("minimum must not exceed maximum");
  }
  return Math.min(maximum, Math.max(minimum, value));
}
