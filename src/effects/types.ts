import type {
  BattleSide,
  CommandCardType,
} from "../core/battle/types";
import type { CommonAction } from "./actions";
import type { TargetSelector } from "./targeting";

export type EffectCategory = "buff" | "debuff" | "other";
export type EffectRemovalPolicy = "removable" | "id_only" | "unremovable";
export type EffectDurationTick = "owner_turn_end" | "manual";
export type EffectClassification = string;

export type TriggerTiming =
  | "on_apply"
  | "turn_start"
  | "turn_end"
  | "before_attack"
  | "after_attack"
  | "on_attack"
  | "on_hit"
  | "on_damage_taken"
  | "on_break"
  | "on_death"
  | "wave_start";

export type TriggerRelation = "owner" | "ally" | "enemy" | "any";

export type TriggerAttackKind =
  | "normal_command"
  | "noble_phantasm"
  | "extra_attack"
  | "enemy_normal_attack";

export type TriggerAttackCardType = CommandCardType | "extra";

export interface TriggerCondition {
  actor?: TriggerRelation;
  target?: TriggerRelation;
  requiresHit?: boolean;
  requiresDamage?: boolean;
  attackKinds?: readonly TriggerAttackKind[];
  cardTypes?: readonly TriggerAttackCardType[];
}

export interface EffectTrigger {
  timing: TriggerTiming;
  priority?: number;
  activationRatePermille?: number;
  consumeUseOnActivation?: boolean;
  condition?: TriggerCondition;
  actions?: readonly TriggerAction[];
}

export type TurnEndSettlementKind =
  | "recurring_hp_recovery"
  | "slip_damage";

export type SlipDamageKind = "burn" | "poison" | "curse";

export type SlipDamageAmplifierKind =
  | "spread_of_fire"
  | "toxic"
  | "evil_curse";

/**
 * One trigger action is resolved against all matching targets in formation
 * order before the next action is started.
 */
export interface TriggerAction {
  target: TargetSelector;
  action:
    | CommonAction
    | {
        kind: "gain_stars";
        amount: number;
        destination: "command" | "next_command";
      };
  /**
   * Standard recurring HP recovery and slip damage are collected per target
   * and settled together after all eligible turn-end triggers activate.
   */
  turnEndSettlement?: TurnEndSettlementKind;
  /**
   * Distinguishes the three standard nonlethal slip categories. An omitted
   * value remains ordinary, non-amplified slip damage.
   */
  slipDamageKind?: SlipDamageKind;
}

export type EffectFlagValue = boolean | number | string;

export interface EffectTemplate {
  stableId: string;
  name: string;
  effectType: string;
  category: EffectCategory;
  classifications?: readonly EffectClassification[];
  value?: number;
  remainingTurns?: number | null;
  remainingUses?: number | null;
  removalPolicy?: EffectRemovalPolicy;
  durationTick?: EffectDurationTick;
  trigger?: EffectTrigger;
  /** Marks a debuff whose value amplifies exactly one standard slip kind. */
  slipDamageAmplifierKind?: SlipDamageAmplifierKind;
  flags?: Record<string, EffectFlagValue>;
}

export interface AppliedEffect extends Required<
  Pick<
    EffectTemplate,
    | "stableId"
    | "name"
    | "effectType"
    | "category"
    | "removalPolicy"
    | "durationTick"
    | "flags"
  >
> {
  instanceId: string;
  sourceInstanceId: string | null;
  targetInstanceId: string;
  classifications: EffectClassification[];
  value: number;
  remainingTurns: number | null;
  remainingUses: number | null;
  trigger?: EffectTrigger;
  slipDamageAmplifierKind?: SlipDamageAmplifierKind;
  registrationOrder: number;
}

export interface EffectRuntimeCounters {
  nextInstanceNumber: number;
  nextRegistrationOrder: number;
}

export interface TriggerEvent {
  timing: TriggerTiming;
  actorInstanceId?: string;
  actorSide?: BattleSide;
  targetInstanceId?: string;
  targetSide?: BattleSide;
  hit?: boolean;
  damage?: number;
  attackKind?: TriggerAttackKind;
  cardType?: TriggerAttackCardType;
}

export interface TriggerActivation {
  ownerInstanceId: string;
  effect: AppliedEffect;
}

export type EffectRemovalReason =
  | "dispel"
  | "expired_turns"
  | "expired_uses"
  | "death"
  | "wave_end"
  | "forced";

export interface RemovedEffect {
  effect: AppliedEffect;
  reason: EffectRemovalReason;
}
