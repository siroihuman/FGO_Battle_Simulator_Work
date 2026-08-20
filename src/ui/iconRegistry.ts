import type { AppliedEffect } from "../effects/types";
import { COMMON_EFFECT_TYPES } from "../effects/modifiers";
import { TRAIT_GRANT_EFFECT_TYPE } from "../effects/traits";

const SKILL_ICON_IDS: Readonly<Record<string, string>> = {
  "イノベイター・バニー": "skill-np-charge",
  "殺戮技巧（人）": "skill-damage-up",
  "ＮＦＦスペシャル": "skill-card-buster-up",
  "使い魔（六罪）": "skill-card-buster-up",
  "罪源業車": "skill-np-charge",
  "虚栄の女王": "skill-cooldown",
  "永劫の探求": "skill-np-damafe-up",
  "家のなかの絵": "skill-card-quick-up",
  "狂気の山脈にて": "skill-np-charge",
  "聖霊の加護": "skill-immune-invincibility",
  "身籠る聖処女": "skill-np-charge",
  "外道の知識（姉なるもの）": "skill-hp-heal-per-turn",
  "侘びの極み": "skill-card-quick-up",
  "一輪の花": "skill-np-charge",
  "幽玄たる黒": "skill-crit-damage-up",
  "オシリスの塵": "skill-immune-invincibility",
  "イシスの雨": "skill-clear-debuff",
  "メジェドの眼": "skill-cooldown",
  "応急支援": "skill-hp-heal",
  "魔力強化": "skill-attack-up",
  "オーダーチェンジ": "skill-unique-order-change",
  "全体回復": "skill-hp-heal",
  "霊子譲渡": "skill-np-charge",
  "コマンドシャッフル": "skill-unique-command-shuffle",
};

const STATUS_ICON_IDS: Readonly<Record<string, string>> = {
  "Artsカード性能アップ": "Artsupstatus",
  "Quickカード性能アップ": "Quickupstatus",
  "スター発生率アップ": "Stargainup",
  "精神異常耐性アップ": "Resistanceup",
  "与ダメージプラス": "Powerup",
  "毎ターンNP獲得": "Npgainturn",
  "毎ターンスター獲得": "Stargainturn",
  "宝具OC段階アップ": "NPOvercharge",
  "NP獲得量アップ": "Npchargeup",
  "被ダメージ時NP獲得量アップ": "NPGainUpDmg",
  "QuickカードNP獲得量アップ": "QuickNpGainUp",
  "Quickカードの威力アップ": "Quickdamageup",
  "Quick攻撃時防御力ダウン": "Buffatk",
  "呪い": "Curse",
  "毎ターンHP回復": "Hpregen",
  "最大HPアップ": "Maxhpup",
  "ターゲット集中": "Enemyfocus",
  "対粛清防御": "Specialinvincible",
};

function publicAssetPath(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}${path.replace(/^\/+/, "")}`;
}

export function registeredSkillIconPath(name: string): string | null {
  const id = SKILL_ICON_IDS[name];
  return id ? publicAssetPath(`assets/skill-icons/${id}.png`) : null;
}

function statusIconId(effect: AppliedEffect): string | null {
  const explicitId = STATUS_ICON_IDS[effect.name];
  if (explicitId) return explicitId;
  if (effect.effectType === COMMON_EFFECT_TYPES.power) return "Powerup";
  if (effect.effectType === COMMON_EFFECT_TYPES.attack) {
    return effect.value < 0 ? "Attackdown" : "Attackup";
  }
  if (effect.effectType === COMMON_EFFECT_TYPES.defense) {
    return effect.value < 0 ? "Defensedown" : "Defenseup";
  }
  if (
    effect.effectType === COMMON_EFFECT_TYPES.cardPerformance
    && effect.flags.cardType === "buster"
    && effect.value >= 0
  ) return "Busterupstatus";
  if (effect.effectType === COMMON_EFFECT_TYPES.criticalDamage && effect.value >= 0) {
    return "Critdmgup";
  }
  if (effect.effectType === COMMON_EFFECT_TYPES.starFocus) {
    return effect.value < 0 ? "Starabsoprtdown" : "Critabsup";
  }
  if (effect.effectType === COMMON_EFFECT_TYPES.noblePhantasmCardTypeChange) {
    return "Npcardtypechange";
  }
  if (effect.effectType === COMMON_EFFECT_TYPES.noblePhantasmSeal) {
    return "Npseal";
  }
  if (effect.effectType === COMMON_EFFECT_TYPES.buffRemovalResistance) {
    return effect.value < 0 ? "Removalresistdown" : "Removalresistup";
  }
  if (effect.effectType === COMMON_EFFECT_TYPES.noblePhantasmDamage) {
    return effect.value < 0 ? "Nppowerdown" : "Nppowerup";
  }
  if (
    effect.name === "弱体耐性アップ"
    || effect.name === "即死耐性アップ"
  ) return "Resistanceup";
  if (
    effect.name === "弱体耐性ダウン"
    || effect.name === "即死耐性ダウン"
  ) return "Resistancedown";
  if (
    effect.effectType === COMMON_EFFECT_TYPES.debuffSuccess
    || effect.effectType === COMMON_EFFECT_TYPES.debuffSuccessBasisPoints
  ) {
    return effect.value < 0 ? "Statusdown" : "Statusup";
  }
  if (effect.effectType === TRAIT_GRANT_EFFECT_TYPE) return "Dragontrait";
  if (effect.effectType === "recurring_hp_reduction") return "Debuffregen";
  if (effect.effectType === COMMON_EFFECT_TYPES.invincibility) {
    return "Invincible";
  }
  if (effect.effectType === "trigger") {
    if (
      effect.trigger?.timing === "on_attack"
      || effect.trigger?.timing === "before_attack"
      || effect.trigger?.timing === "after_attack"
    ) {
      return effect.category === "debuff" ? "Debuffatk" : "Buffatk";
    }
    if (effect.trigger?.timing === "turn_end") {
      return effect.category === "debuff" ? "DelayedDebuff" : "DelayedBuff";
    }
  }
  return null;
}

export function registeredStatusIconPath(effect: AppliedEffect): string | null {
  const id = statusIconId(effect);
  return id ? publicAssetPath(`assets/status-icons/${id}.webp`) : null;
}

export function unspecifiedEffectNames(
  effects: readonly AppliedEffect[],
): string[] {
  return [...new Set(
    effects.filter((effect) => !registeredStatusIconPath(effect))
      .map(({ name }) => name),
  )].sort((left, right) => left.localeCompare(right, "ja"));
}
