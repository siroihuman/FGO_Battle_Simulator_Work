import type { BattleSession } from "../core/battle/session";
import type { BattleUnitState } from "../core/battle/types";
import type { DeclaredActionEffect } from "../effects/declarations";
import type { AppliedEffect, EffectTemplate } from "../effects/types";
import { COMMON_EFFECT_TYPES } from "../effects/modifiers";
import { INITIAL_SERVANT_DEFINITIONS } from "../data/servants";
import { registeredStatusIconPath } from "./iconRegistry";

export type EffectSourceKind =
  | "class_skill"
  | "craft_essence"
  | "active_skill"
  | "noble_phantasm"
  | "enemy_action"
  | "other";

export type AllyEffectTab =
  | "class_skill"
  | "craft_essence"
  | "active"
  | "combined";
export type EnemyEffectTab = "normal" | "special" | "combined";

export interface PresentedEffect {
  key: string;
  applied: AppliedEffect;
  sourceKind: EffectSourceKind;
  sourceName: string;
  sourceRank: string | null;
  description: string;
  displayName: string;
  totalValue: number;
  iconPath: string | null;
  categoryLabel: "強化" | "弱体" | "状態";
  allyTab: AllyEffectTab;
  enemyTab: EnemyEffectTab;
  combinedMembers: readonly PresentedEffect[] | null;
}

const RATE_EFFECT_TYPES = new Set<string>([
  COMMON_EFFECT_TYPES.attack,
  COMMON_EFFECT_TYPES.buffRemovalResistance,
  COMMON_EFFECT_TYPES.buffSuccess,
  COMMON_EFFECT_TYPES.cardPerformance,
  COMMON_EFFECT_TYPES.cardResistance,
  COMMON_EFFECT_TYPES.criticalDamage,
  COMMON_EFFECT_TYPES.debuffRemovalResistance,
  COMMON_EFFECT_TYPES.debuffResistance,
  COMMON_EFFECT_TYPES.debuffSuccess,
  COMMON_EFFECT_TYPES.defense,
  COMMON_EFFECT_TYPES.givenHpRecovery,
  COMMON_EFFECT_TYPES.instantDeathResistance,
  COMMON_EFFECT_TYPES.instantDeathSuccess,
  COMMON_EFFECT_TYPES.noblePhantasmDamage,
  COMMON_EFFECT_TYPES.npGain,
  COMMON_EFFECT_TYPES.recurringNpGain,
  COMMON_EFFECT_TYPES.power,
  COMMON_EFFECT_TYPES.receivedBuffSuccess,
  COMMON_EFFECT_TYPES.receivedHpRecovery,
  COMMON_EFFECT_TYPES.receivedNpGain,
  COMMON_EFFECT_TYPES.specialDefense,
  COMMON_EFFECT_TYPES.starFocus,
  COMMON_EFFECT_TYPES.starGeneration,
  COMMON_EFFECT_TYPES.targetFocus,
  COMMON_EFFECT_TYPES.targetDamage,
  COMMON_EFFECT_TYPES.targetStarGeneration,
]);

const BASIS_POINT_RATE_EFFECT_TYPES = new Set<string>([
  COMMON_EFFECT_TYPES.debuffSuccessBasisPoints,
]);

function formattedNumber(value: number, maximumFractionDigits = 1): string {
  return value.toLocaleString("ja-JP", { maximumFractionDigits });
}

/** Converts only registered permille rate fields to their displayed percent. */
export function effectValueLabel(
  effect: Pick<AppliedEffect, "effectType">,
  value: number,
): string {
  if (BASIS_POINT_RATE_EFFECT_TYPES.has(effect.effectType)) {
    return `${formattedNumber(value / 100, 2)}%`;
  }
  return RATE_EFFECT_TYPES.has(effect.effectType)
    ? `${formattedNumber(value / 10)}%`
    : formattedNumber(value);
}

export function effectHasDisplayValue(
  effect: Pick<AppliedEffect, "effectType" | "value">,
): boolean {
  return RATE_EFFECT_TYPES.has(effect.effectType)
    || BASIS_POINT_RATE_EFFECT_TYPES.has(effect.effectType)
    || effect.value !== 0;
}

/** Compact remaining-duration label for the icon list. */
export function effectExpiryLabel(
  effect: Pick<AppliedEffect, "remainingTurns" | "remainingUses">,
): string | null {
  const parts = [
    effect.remainingTurns === null ? null : `${effect.remainingTurns}T`,
    effect.remainingUses === null ? null : `${effect.remainingUses}回`,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join("・") : null;
}

interface EffectSourceMetadata {
  sourceInstanceId: string;
  sourceStableId: string;
  sourceKind: EffectSourceKind;
  sourceName: string;
  sourceRank: string | null;
  description: string;
}

function nestedTemplates(
  effect: DeclaredActionEffect,
): Array<Pick<EffectTemplate, "stableId">> {
  if (effect.action.kind !== "apply_effects") return [];
  const templates: Array<Pick<EffectTemplate, "stableId">> = [];
  const visit = (
    template: Pick<EffectTemplate, "stableId" | "trigger">,
  ) => {
    templates.push({ stableId: template.stableId });
    for (const triggerAction of template.trigger?.actions ?? []) {
      if (triggerAction.action.kind === "apply_effects") {
        for (const spec of triggerAction.action.effects) visit(spec.template);
      }
    }
  };
  for (const spec of effect.action.effects) visit(spec.template);
  return templates;
}

function servantRank(
  dataId: string,
  stableId: string,
): string | null {
  const definition = INITIAL_SERVANT_DEFINITIONS.find(
    (servant) => servant.dataId === dataId,
  );
  if (!definition) return null;
  return definition.classSkills.find((skill) => skill.stableId === stableId)?.rank
    ?? definition.activeSkills.find((skill) => skill.stableId === stableId)?.rank
    ?? (definition.noblePhantasm.stableId === stableId
      ? definition.noblePhantasm.rank
      : null);
}

function metadataIndex(
  session: BattleSession,
): Map<string, EffectSourceMetadata> {
  const index = new Map<string, EffectSourceMetadata>();
  for (const data of Object.values(
    session.actionEffectRegistry?.byInstanceId ?? {},
  )) {
    for (const passive of data.passives) {
      const craftEssence = passive.stableId.startsWith("craft-essence-");
      for (const declared of passive.effects) {
        for (const template of nestedTemplates(declared)) {
          index.set(`${data.instanceId}:${template.stableId}`, {
            sourceInstanceId: data.instanceId,
            sourceStableId: passive.stableId,
            sourceKind: craftEssence ? "craft_essence" : "class_skill",
            sourceName: passive.name,
            sourceRank: craftEssence
              ? null
              : servantRank(data.dataId, passive.stableId),
            description: declared.description,
          });
        }
      }
    }
    for (const action of data.actions) {
      for (const declared of action.effects) {
        for (const template of nestedTemplates(declared)) {
          const isRegisteredServant = INITIAL_SERVANT_DEFINITIONS.some(
            ({ dataId }) => dataId === data.dataId,
          );
          index.set(`${data.instanceId}:${template.stableId}`, {
            sourceInstanceId: data.instanceId,
            sourceStableId: action.stableId,
            sourceKind: isRegisteredServant
              ? action.kind === "skill" ? "active_skill" : "noble_phantasm"
              : "enemy_action",
            sourceName: action.name,
            sourceRank: servantRank(data.dataId, action.stableId),
            description: declared.description,
          });
        }
      }
    }
  }
  const mysticCode = session.loop.state.loadout.mysticCode;
  const definition = mysticCode && session.mysticCodeRegistry
    ? session.mysticCodeRegistry.byDataId[mysticCode.dataId]
    : null;
  for (const skill of definition?.skills ?? []) {
    for (const declared of skill.effects) {
      for (const template of nestedTemplates(declared)) {
        index.set(`mystic-code:${template.stableId}`, {
          sourceInstanceId: "mystic-code",
          sourceStableId: skill.stableId,
          sourceKind: "active_skill",
          sourceName: skill.name,
          sourceRank: null,
          description: declared.description,
        });
      }
    }
  }
  return index;
}

function metadataForEffect(
  index: Map<string, EffectSourceMetadata>,
  effect: AppliedEffect,
): EffectSourceMetadata | null {
  if (effect.sourceInstanceId) {
    const exact = index.get(`${effect.sourceInstanceId}:${effect.stableId}`);
    if (exact) return exact;
  }
  const mystic = index.get(`mystic-code:${effect.stableId}`);
  if (mystic) return mystic;
  const candidates = [...index.entries()].filter(([key]) =>
    key.endsWith(`:${effect.stableId}`)
  );
  return candidates.length === 1 ? candidates[0][1] : null;
}

function categoryLabel(
  category: AppliedEffect["category"],
): PresentedEffect["categoryLabel"] {
  if (category === "buff") return "強化";
  if (category === "debuff") return "弱体";
  return "状態";
}

function enemyTabForEffect(
  effect: AppliedEffect,
): EnemyEffectTab {
  return effect.flags.questSpecial === true ? "special" : "normal";
}

function combinedDisplayName(effect: AppliedEffect): string {
  return effect.name.replace(/(?:アップ|ダウン)$/u, "");
}

function combinedEffectKey(effect: AppliedEffect): string {
  const flags = Object.entries(effect.flags)
    .filter(([name]) => name !== "questSpecial")
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify({
    effectType: effect.effectType,
    classifications: [...effect.classifications].sort(),
    flags,
    trigger: effect.trigger ?? null,
    slipDamageAmplifierKind: effect.slipDamageAmplifierKind ?? null,
  });
}

/** Builds display-only effect rows from applied state and registered declarations. */
export function presentUnitEffects(
  session: BattleSession,
  unit: BattleUnitState,
): PresentedEffect[] {
  const index = metadataIndex(session);
  return unit.effects.map((effect) => {
    const source = metadataForEffect(index, effect);
    const sourceIdentity = source
      ? `${source.sourceInstanceId}:${source.sourceStableId}`
      : `${effect.sourceInstanceId ?? "no-source"}:${effect.stableId}`;
    const sameSourceValues = unit.effects.filter((candidate) => {
      const candidateSource = metadataForEffect(index, candidate);
      const candidateSourceIdentity = candidateSource
        ? `${candidateSource.sourceInstanceId}:${candidateSource.sourceStableId}`
        : `${candidate.sourceInstanceId ?? "no-source"}:${candidate.stableId}`;
      return candidate.name === effect.name
        && candidate.effectType === effect.effectType
        && candidateSourceIdentity === sourceIdentity;
    }).reduce((total, candidate) => total + candidate.value, 0);
    const sourceKind = source?.sourceKind ?? "other";
    return {
      key: effect.instanceId,
      applied: effect,
      sourceKind,
      sourceName: source?.sourceName ?? "登録外の状態",
      sourceRank: source?.sourceRank ?? null,
      description: source?.description ?? "登録済み説明なし",
      displayName: effect.name,
      totalValue: sameSourceValues,
      iconPath: registeredStatusIconPath(effect),
      categoryLabel: categoryLabel(effect.category),
      allyTab: sourceKind === "class_skill"
        ? "class_skill"
        : sourceKind === "craft_essence" ? "craft_essence" : "active",
      enemyTab: enemyTabForEffect(effect),
      combinedMembers: null,
    };
  });
}

/**
 * Nets every currently applied effect with the same mechanical kind and
 * conditions. Remaining turns, uses, and sources do not split the display
 * group, but stay available in combinedMembers for the detail dialog.
 */
export function presentCombinedEffects(
  effects: readonly PresentedEffect[],
): PresentedEffect[] {
  const groups = new Map<string, PresentedEffect[]>();
  for (const effect of effects) {
    const key = combinedEffectKey(effect.applied);
    const group = groups.get(key);
    if (group) group.push(effect);
    else groups.set(key, [effect]);
  }
  return [...groups.entries()].map(([aggregationKey, members]) => {
    const totalValue = members.reduce(
      (total, member) => total + member.applied.value,
      0,
    );
    const totalSign = Math.sign(totalValue);
    const representative = members.find((member) =>
      member.iconPath && (
        totalSign === 0 || Math.sign(member.applied.value) === totalSign
      )
    ) ?? members.find(({ iconPath }) => iconPath) ?? members[0];
    return {
      ...representative,
      key: `combined:${aggregationKey}`,
      sourceKind: "other",
      sourceName: "全発生元の合算",
      sourceRank: null,
      description: "現在付与されている同種効果を、発生元・残りターン・残り回数にかかわらず合算した表示です。",
      displayName: combinedDisplayName(representative.applied),
      totalValue,
      categoryLabel: "状態",
      allyTab: "combined",
      enemyTab: "combined",
      combinedMembers: members,
    };
  });
}
