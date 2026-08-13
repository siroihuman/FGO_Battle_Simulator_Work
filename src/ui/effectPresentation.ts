import type { BattleSession } from "../core/battle/session";
import type { BattleUnitState } from "../core/battle/types";
import type { DeclaredActionEffect } from "../effects/declarations";
import type { AppliedEffect, EffectTemplate } from "../effects/types";
import { INITIAL_SERVANT_DEFINITIONS } from "../data/servants";
import { registeredStatusIconPath } from "./iconRegistry";

export type EffectSourceKind =
  | "class_skill"
  | "craft_essence"
  | "active_skill"
  | "noble_phantasm"
  | "enemy_action"
  | "other";

export type AllyEffectTab = "class_skill" | "craft_essence" | "active";
export type EnemyEffectTab = "enemy_action" | "other";

export interface PresentedEffect {
  key: string;
  applied: AppliedEffect;
  sourceKind: EffectSourceKind;
  sourceName: string;
  sourceRank: string | null;
  description: string;
  totalValue: number;
  iconPath: string | null;
  categoryLabel: "強化" | "弱体" | "状態";
  allyTab: AllyEffectTab;
  enemyTab: EnemyEffectTab;
}

interface EffectSourceMetadata {
  sourceInstanceId: string;
  sourceStableId: string;
  sourceKind: EffectSourceKind;
  sourceName: string;
  sourceRank: string | null;
  description: string;
}

function nestedTemplates(effect: DeclaredActionEffect): EffectTemplate[] {
  if (effect.action.kind !== "apply_effects") return [];
  const templates: EffectTemplate[] = [];
  const visit = (template: EffectTemplate) => {
    templates.push(template);
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

/** Builds display-only effect rows from applied state and registered declarations. */
export function presentUnitEffects(
  session: BattleSession,
  unit: BattleUnitState,
): PresentedEffect[] {
  const index = metadataIndex(session);
  return unit.effects.map((effect) => {
    const source = metadataForEffect(index, effect);
    const sameSourceValues = unit.effects.filter((candidate) => {
      const candidateSource = metadataForEffect(index, candidate);
      return candidate.name === effect.name
        && candidate.effectType === effect.effectType
        && candidateSource?.sourceInstanceId === source?.sourceInstanceId
        && candidateSource?.sourceStableId === source?.sourceStableId;
    }).reduce((total, candidate) => total + candidate.value, 0);
    const sourceKind = source?.sourceKind ?? "other";
    return {
      key: effect.instanceId,
      applied: effect,
      sourceKind,
      sourceName: source?.sourceName ?? "登録外の状態",
      sourceRank: source?.sourceRank ?? null,
      description: source?.description ?? "登録済み説明なし",
      totalValue: sameSourceValues,
      iconPath: registeredStatusIconPath(effect),
      categoryLabel: categoryLabel(effect.category),
      allyTab: sourceKind === "class_skill"
        ? "class_skill"
        : sourceKind === "craft_essence" ? "craft_essence" : "active",
      enemyTab: sourceKind === "enemy_action" ? "enemy_action" : "other",
    };
  });
}
