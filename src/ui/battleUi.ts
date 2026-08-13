import type { SelectedCommandCard } from "../core/cards/selection";
import type { BattleSession } from "../core/battle/session";
import type { BattleLogBatch } from "../core/battle/log";
import type { BattleTurnLog } from "../core/battle/turnLog";
import type { CommandCardChainAnalysis } from "../core/cards/chain";
import type { BattleState } from "../core/battle/state";
import {
  summarizeBattleInputLogs,
  summarizeBattleTurnLogs,
  type BattleLogSummary,
} from "./battlePresentation";

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
  if (selectedCardIds.length !== 3) return false;
  const selected = selectedCardIds.map((cardId) =>
    cards.find((card) => card.cardId === cardId)
  );
  if (selected.some((card) => !card)) return false;
  const types = selected.map((card) => card!.type);
  return types[0] === "quick"
    || new Set(types).size === 3;
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
