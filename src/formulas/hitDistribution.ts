import { assertSafeInteger, multiplyThenFloor } from "../core/numeric";

export function distributeDamageAcrossHits(
  totalDamage: number,
  hitWeights: readonly number[],
): number[] {
  assertSafeInteger(totalDamage, "totalDamage");
  if (totalDamage < 0) {
    throw new RangeError("totalDamage must not be negative");
  }
  if (hitWeights.length === 0) {
    throw new RangeError("hitWeights must not be empty");
  }

  hitWeights.forEach((weight, index) => {
    assertSafeInteger(weight, `hitWeights[${index}]`);
    if (weight <= 0) {
      throw new RangeError("all hit weights must be positive");
    }
  });

  const totalWeight = hitWeights.reduce((sum, weight) => sum + weight, 0);
  assertSafeInteger(totalWeight, "totalWeight");

  let distributed = 0;
  return hitWeights.map((weight, index) => {
    if (index === hitWeights.length - 1) {
      return totalDamage - distributed;
    }
    const damage = multiplyThenFloor([totalDamage, weight], totalWeight);
    distributed += damage;
    return damage;
  });
}
