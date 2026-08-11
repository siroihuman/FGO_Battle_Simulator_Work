import type { BattleUnitState } from "../core/battle/types";
import { assertSafeInteger, toSafeNumber } from "../core/numeric";
import type {
  SlipDamageAmplifierKind,
  SlipDamageKind,
} from "./types";

export const SLIP_DAMAGE_AMPLIFIER_BY_KIND: Readonly<
  Record<SlipDamageKind, SlipDamageAmplifierKind>
> = {
  burn: "spread_of_fire",
  poison: "toxic",
  curse: "evil_curse",
};

/**
 * Reads the currently active matching amplifier debuffs without consuming a
 * use or RNG. Callers retain the returned value as the activation snapshot.
 */
export function slipDamageAmplifierPermille(
  target: BattleUnitState,
  kind: SlipDamageKind | null,
): number {
  if (kind === null) return 0;
  const amplifierKind = SLIP_DAMAGE_AMPLIFIER_BY_KIND[kind];
  const sum = target.effects.reduce((total, effect) => {
    if (effect.slipDamageAmplifierKind !== amplifierKind) return total;
    assertSafeInteger(effect.value, "slip damage amplifier value");
    return total + BigInt(effect.value);
  }, 0n);
  return toSafeNumber(sum, "slip damage amplifier total");
}
