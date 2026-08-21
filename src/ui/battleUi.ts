import type { SelectedCommandCard } from "../core/cards/selection";
import type { BattleSession } from "../core/battle/session";
import type { BattleLogBatch } from "../core/battle/log";
import type { BattleTurnLog } from "../core/battle/turnLog";
import type { CommandCardChainAnalysis } from "../core/cards/chain";
import type { AllyCommandAttackDetail } from "../core/cards/commandAttack";
import type { AllyCommandActionResolution } from "../core/cards/turnCoordinator";
import type { BattleState } from "../core/battle/state";
import { CRITICAL_RATE_CAP_PERMILLE } from "../core/cards/critical";
import { npCap } from "../formulas/np";
import { INITIAL_SERVANT_DEFINITIONS } from "../data/servants";
import {
  summarizeBattleInputLogs,
  summarizeBattleTurnLogs,
  type BattleLogSummary,
} from "./battlePresentation";

/** Returns only a registered primary Wiki URL; unknown content stays unlinked. */
export function registeredServantWikiUrl(dataId: string): string | null {
  const definition = INITIAL_SERVANT_DEFINITIONS.find(
    ({ dataId: registeredDataId }) => registeredDataId === dataId,
  );
  return definition?.sources.find(
    ({ url }) => url.startsWith("https://w.atwiki.jp/"),
  )?.url ?? null;
}

export function toggleSelectedCommandCard(
  selectedCardIds: readonly string[],
  cardId: string,
): string[] {
  if (selectedCardIds.includes(cardId)) {
    return selectedCardIds.filter((selected) => selected !== cardId);
  }
  return selectedCardIds.length >= 3
    ? [...selectedCardIds]
    : [...selectedCardIds, cardId];
}

/** This label is based only on the currently selected registered card types. */
export function selectedChainCriticalBonus(
  selectedCardIds: readonly string[],
  cards: readonly SelectedCommandCard[],
): boolean {
  const selected = selectedCardIds.map((cardId) =>
    cards.find((card) => card.cardId === cardId)
  );
  if (selected.length === 0 || selected.some((card) => !card)) return false;
  const types = selected.map((card) => card!.type);
  if (types[0] === "quick") return true;
  return selected.length === 3 && new Set(types).size === 3;
}

const SELECTION_CRITICAL_BONUS_PERMILLE = 200;

/**
 * Combines the persisted star allocation with the visible Quick/Mighty
 * selection bonus. This preview never resolves the actual critical roll.
 */
export function displayedCommandCardCriticalRatePermille(
  cardId: string,
  persistedRatePermille: number,
  selectedCardIds: readonly string[],
  cards: readonly SelectedCommandCard[],
): number {
  const selected = selectedCardIds.map((selectedId) =>
    cards.find((card) => card.cardId === selectedId)
  );
  const quickStart = selected[0]?.type === "quick";
  const mightyChain = selected.length === 3
    && selected.every((card) => card !== undefined)
    && new Set(selected.map((card) => card!.type)).size === 3;
  const receivesSelectionBonus = quickStart
    || (mightyChain && selectedCardIds.includes(cardId));
  return Math.min(
    CRITICAL_RATE_CAP_PERMILLE,
    persistedRatePermille
      + (receivesSelectionBonus ? SELECTION_CRITICAL_BONUS_PERMILLE : 0),
  );
}

export interface BattleSummary {
  wave: string;
  turn: number;
  seed: string;
  frontline: Array<{ slot: number; name: string; hp: number; maxHp: number }>;
}

export function presentBattleSummary(session: BattleSession): BattleSummary {
  const state = session.loop.state;
  return {
    wave: `${state.waveNumber} / ${state.totalWaves}`,
    turn: state.battleTurn,
    seed: session.loop.rng.seed,
    frontline: state.formation.ally.frontline.flatMap((unit, index) =>
      unit ? [{ slot: index + 1, name: unit.name, hp: unit.hp, maxHp: unit.maxHp }] : []
    ),
  };
}

export type BattleTurnSectionKind =
  | "ally_action"
  | "ally_turn_end"
  | "enemy_action"
  | "enemy_turn_end";

export interface BattleTurnSection {
  kind: BattleTurnSectionKind;
  label: string;
  entries: BattleLogSummary[];
}

export interface PresentedBattleTurn {
  id: string;
  waveNumber: number;
  battleTurn: number;
  sections: BattleTurnSection[];
}

const SECTION_LABELS: Record<BattleTurnSectionKind, string> = {
  ally_action: "スキル・味方行動",
  ally_turn_end: "味方ターン終了",
  enemy_action: "敵行動",
  enemy_turn_end: "敵ターン終了",
};

function inputLogsForTurn(
  inputLogs: readonly BattleLogBatch[],
  turnLog: BattleTurnLog,
): BattleLogSummary[] {
  return summarizeBattleInputLogs(inputLogs.filter(({ context }) =>
    context.waveNumber === turnLog.before.waveNumber
    && context.battleTurn === turnLog.before.battleTurn
  ));
}

export function presentBattleTurns(
  turnLogs: readonly BattleTurnLog[],
  inputLogs: readonly BattleLogBatch[],
): PresentedBattleTurn[] {
  return turnLogs.map((turnLog) => {
    const sections: Record<BattleTurnSectionKind, BattleLogSummary[]> = {
      ally_action: inputLogsForTurn(inputLogs, turnLog),
      ally_turn_end: [],
      enemy_action: [],
      enemy_turn_end: [],
    };
    for (const record of turnLog.records) {
      const summaries = summarizeBattleTurnLogs([{ ...turnLog, records: [record] }]);
      if (record.recordType === "action_batch") {
        sections[record.batch.kind === "enemy_turn" ? "enemy_action" : "ally_action"]
          .push(...summaries);
      } else {
        sections[record.side === "enemy" ? "enemy_turn_end" : "ally_turn_end"]
          .push(...summaries);
      }
    }
    return {
      id: turnLog.turnId,
      waveNumber: turnLog.before.waveNumber,
      battleTurn: turnLog.before.battleTurn,
      sections: (Object.keys(SECTION_LABELS) as BattleTurnSectionKind[]).map(
        (kind) => ({ kind, label: SECTION_LABELS[kind], entries: sections[kind] }),
      ),
    };
  });
}

export function confirmedPlaybackNotices(turnLog: BattleTurnLog): string[] {
  const notices: string[] = [];
  for (const record of turnLog.records) {
    if (record.recordType !== "turn_end") continue;
    notices.push(record.side === "ally" ? "味方ターン終了" : "敵ターン終了");
    if (record.checkpoint.waveTransition) notices.push("Wave突破");
  }
  return notices;
}

export type ConfirmedChainFacts = Pick<
  CommandCardChainAnalysis,
  "chainError" | "colorChain" | "mightyChain" | "braveChain"
>;

/** Uses the engine-confirmed chain result rather than re-analyzing cards. */
export function confirmedChainNotices(
  chain: ConfirmedChainFacts,
): string[] {
  if (chain.chainError) return [];
  const notices: string[] = [];
  if (chain.colorChain) {
    const label = {
      quick: "Quick Chain成立",
      arts: "Arts Chain成立",
      buster: "Buster Chain成立",
    }[chain.colorChain];
    notices.push(label);
  }
  if (chain.mightyChain) notices.push("Mighty Chain成立");
  if (chain.braveChain) notices.push("Brave Chain成立");
  return notices;
}

export interface ConfirmedHpTransition {
  instanceId: string;
  name: string;
  side: "ally" | "enemy";
  hpBefore: number;
  hpAfter: number;
  maxHp: number;
}

export interface ConfirmedNpTransition {
  instanceId: string;
  name: string;
  npBefore: number;
  npAfter: number;
  maxNp: number;
}

export interface ConfirmedAttackDamage {
  instanceId: string;
  name: string;
  damage: number;
}

export interface ConfirmedAllyActionPlayback {
  state: BattleState;
  keepsDefeatedTargetVisible: boolean;
  continuedTargetHp: ConfirmedHpTransition | null;
}

function isResolvedAllyCommandAttackDetail(
  detail: unknown,
): detail is Extract<AllyCommandAttackDetail, { outcome: "resolved" }> {
  if (typeof detail !== "object" || detail === null) return false;
  const candidate = detail as {
    outcome?: unknown;
    resolution?: unknown;
  };
  return candidate.outcome === "resolved"
    && typeof candidate.resolution === "object"
    && candidate.resolution !== null;
}

/**
 * Selects only an engine-confirmed playback snapshot. A resolved continuation
 * keeps its HP-0 target visible until that attack has been presented; every
 * other action uses the completed action-boundary state.
 */
export function confirmedAllyActionPlayback(
  action: AllyCommandActionResolution,
): ConfirmedAllyActionPlayback {
  if (
    action.defeatedTargetContinuation
    && action.resolverCalled
    && isResolvedAllyCommandAttackDetail(action.resolverDetail)
  ) {
    const state = action.resolverDetail.resolution.state;
    const target = unitsByInstanceId(state).get(
      action.targetAtStart.instanceId,
    );
    return {
      state,
      keepsDefeatedTargetVisible: true,
      continuedTargetHp:
        target?.side === "enemy"
          ? {
              instanceId: target.instanceId,
              name: target.name,
              side: "enemy",
              hpBefore: target.hp,
              hpAfter: target.hp,
              maxHp: target.maxHp,
            }
          : null,
    };
  }
  return {
    state: action.boundary.state,
    keepsDefeatedTargetVisible: false,
    continuedTargetHp: null,
  };
}

export interface NoblePhantasmDetailPresentation {
  title: string;
  rank: string | null;
  level: number;
  descriptions: string[];
}

function unitsByInstanceId(state: BattleState) {
  return new Map([
    ...state.formation.ally.frontline,
    ...state.formation.ally.reserve,
    ...state.formation.enemy.frontline,
    ...state.formation.enemy.reserve,
  ].flatMap((unit) => unit ? [[unit.instanceId, unit] as const] : []));
}

/** Reads two engine-confirmed snapshots and exposes only their saved HP values. */
export function confirmedHpTransitions(
  before: BattleState,
  after: BattleState,
): ConfirmedHpTransition[] {
  const beforeUnits = unitsByInstanceId(before);
  const afterUnits = unitsByInstanceId(after);
  return [...new Set([...beforeUnits.keys(), ...afterUnits.keys()])]
    .flatMap((instanceId) => {
      const beforeUnit = beforeUnits.get(instanceId);
      const afterUnit = afterUnits.get(instanceId);
      if (!beforeUnit) return [];
      const hpAfter = afterUnit?.hp ?? 0;
      if (beforeUnit.hp === hpAfter) return [];
      return [{
        instanceId,
        name: afterUnit?.name ?? beforeUnit.name,
        side: afterUnit?.side ?? beforeUnit.side,
        hpBefore: beforeUnit.hp,
        hpAfter,
        maxHp: afterUnit?.maxHp ?? beforeUnit.maxHp,
      }];
    });
}

/** Reads only the saved NP fields of two engine-confirmed snapshots. */
export function confirmedNpTransitions(
  before: BattleState,
  after: BattleState,
): ConfirmedNpTransition[] {
  const beforeUnits = unitsByInstanceId(before);
  const afterUnits = unitsByInstanceId(after);
  return [...beforeUnits.entries()].flatMap(([instanceId, beforeUnit]) => {
    const afterUnit = afterUnits.get(instanceId);
    if (
      beforeUnit.side !== "ally"
      || !beforeUnit.noblePhantasm
      || !afterUnit
      || beforeUnit.np === afterUnit.np
    ) return [];
    return [{
      instanceId,
      name: afterUnit.name,
      npBefore: beforeUnit.np,
      npAfter: afterUnit.np,
      maxNp: npCap(afterUnit.noblePhantasm?.level ?? beforeUnit.noblePhantasm.level),
    }];
  });
}

/** Uses the attack log's calculated damage, not an HP-difference surrogate. */
export function confirmedAttackDamageAmounts(
  summaries: readonly BattleLogSummary[],
): ConfirmedAttackDamage[] {
  const totals = new Map<string, ConfirmedAttackDamage>();
  for (const summary of summaries) {
    if (!("attack" in summary.detail) || !summary.detail.attack) continue;
    for (const target of summary.detail.attack.targets) {
      const current = totals.get(target.target.instanceId);
      totals.set(target.target.instanceId, {
        instanceId: target.target.instanceId,
        name: target.target.name ?? target.target.instanceId,
        damage: (current?.damage ?? 0) + target.totalDamage,
      });
    }
  }
  return [...totals.values()];
}

/** Presents the registered NP effects in source order without resolving them. */
export function presentNoblePhantasmDetail(
  unit: BattleState["formation"]["ally"]["frontline"][number],
): NoblePhantasmDetailPresentation | null {
  if (!unit?.noblePhantasm) return null;
  const definition = INITIAL_SERVANT_DEFINITIONS.find(
    ({ dataId }) => dataId === unit.dataId,
  );
  if (
    !definition
    || definition.noblePhantasm.stableId !== unit.noblePhantasm.stableId
  ) return null;
  const rateSeries = (values: readonly number[]) =>
    values.map((value) => `${value / 10}%`).join(" / ");
  const descriptions = [...definition.noblePhantasm.effects]
    .sort((left, right) => left.order - right.order)
    .flatMap((effect) => {
      if (effect.kind === "effect") return effect.description.split("\n");
      const target = effect.targetScope === "all" ? "敵全体" : "敵単体";
      const attack = effect.specialAttack
        ? `＆強力な攻撃[Lv]：${rateSeries(effect.damageMultiplierPermilleByLevel)}`
        : `＋${target}に強力な攻撃[Lv]：${rateSeries(effect.damageMultiplierPermilleByLevel)}`;
      if (!effect.specialAttack) return [attack];
      const traits = effect.specialAttack.requiredTargetTraits
        ?.map((trait) =>
          trait.endsWith("の力")
            ? `〔${trait}を持つ敵〕`
            : `〔${trait}〕`
        )
        .join("・") ?? "条件付き";
      return [
        attack,
        effect.specialAttack.multiplierPermille !== undefined
          ? `＆${traits}特攻：${effect.specialAttack.multiplierPermille / 10}%`
          : `＆${traits}特攻<OC:特攻威力UP>：${rateSeries(effect.specialAttack.multiplierPermilleByOvercharge ?? [])}`,
      ];
    });
  return {
    title: definition.noblePhantasm.name,
    rank: definition.noblePhantasm.rank,
    level: unit.noblePhantasm.level,
    descriptions,
  };
}
