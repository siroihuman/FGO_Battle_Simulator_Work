import type {
  BattleActionLogEntry,
  BattleLogBatch,
  BattleLogCommonActionResult,
} from "../core/battle/log";
import type {
  BattleLogTurnEndRecord,
  BattleTurnLog,
} from "../core/battle/turnLog";
import type { BattleState } from "../core/battle/state";

export type BattleLogSummaryKind = "action" | "turn_end";

export interface BattleLogSummary {
  id: string;
  kind: BattleLogSummaryKind;
  title: string;
  status: string;
  targetNames: string[];
  actualHpLoss: number | null;
  critical: boolean | null;
  changes: string[];
  detail: BattleActionLogEntry | BattleLogTurnEndRecord;
}

export interface BattleStatusPresentation {
  wave: string;
  battleTurn: number;
  waveTurn: number;
  seed: string;
  outcome: "戦闘中" | "勝利" | "敗北" | "撤退";
}

const OUTCOME_LABELS: Record<BattleState["outcome"], BattleStatusPresentation["outcome"]> = {
  ongoing: "戦闘中",
  victory: "勝利",
  defeat: "敗北",
  retreat: "撤退",
};

/** Presents BattleState fields without deriving any battle transition. */
export function presentBattleStatus(
  state: BattleState,
  seed: string,
): BattleStatusPresentation {
  return {
    wave: `${state.waveNumber} / ${state.totalWaves}`,
    battleTurn: state.battleTurn,
    waveTurn: state.waveTurn,
    seed,
    outcome: OUTCOME_LABELS[state.outcome],
  };
}

function unitName(name: string | null, instanceId: string): string {
  return name ?? instanceId;
}

function actionTargetNames(entry: BattleActionLogEntry): string[] {
  const attackTargets = entry.attack?.targets.map(({ target }) =>
    unitName(target.name, target.instanceId)
  ) ?? [];
  if (attackTargets.length > 0) return attackTargets;
  return entry.targetsAtStart.map((target) =>
    unitName(target.name, target.instanceId)
  );
}

function actionChanges(entry: BattleActionLogEntry): string[] {
  const changes: string[] = [];
  const knownUnits = [
    entry.actor,
    ...entry.targetsAtStart,
    ...(entry.attack?.targets.map(({ target }) => target) ?? []),
  ];
  const displayTarget = (instanceId: string | null): string => {
    if (!instanceId) return "対象なし";
    const unit = knownUnits.find((candidate) =>
      candidate.instanceId === instanceId
    );
    return unitName(unit?.name ?? null, instanceId);
  };
  const appendCommonResult = (result: BattleLogCommonActionResult) => {
    const target = displayTarget(result.targetInstanceId);
    if (result.hpChange !== null && result.hpChange !== 0) {
      changes.push(`${target}：HP ${result.hpChange > 0 ? "+" : ""}${result.hpChange.toLocaleString()}`);
    }
    if (result.npChange !== null && result.npChange !== 0) {
      changes.push(`${target}：NP ${result.npChange > 0 ? "+" : ""}${(result.npChange / 100).toFixed(2)}%`);
    }
    if (result.enemyChargeChange !== null && result.enemyChargeChange !== 0) {
      changes.push(`${target}：チャージ ${result.enemyChargeChange > 0 ? "+" : ""}${result.enemyChargeChange}`);
    }
    if (result.skillCooldownsBefore && result.skillCooldownsAfter) {
      changes.push(`${target}：CT ${result.skillCooldownsBefore.join("/")}→${result.skillCooldownsAfter.join("/")}`);
    }
  };
  for (const target of entry.attack?.targets ?? []) {
    if (target.hpBefore !== target.hpAfter) {
      changes.push(`${unitName(target.target.name, target.target.instanceId)}：HP ${target.hpBefore.toLocaleString()}→${target.hpAfter.toLocaleString()}`);
    }
    if (target.receivedNp && target.receivedNp.totalUnits !== 0) {
      changes.push(`${unitName(target.target.name, target.target.instanceId)}：NP +${(target.receivedNp.totalUnits / 100).toFixed(2)}%`);
    }
  }
  if (entry.attack && entry.attack.attackNpTotalUnits !== 0) {
    changes.push(`${unitName(entry.actor.name, entry.actor.instanceId)}：NP +${(entry.attack.attackNpTotalUnits / 100).toFixed(2)}%`);
  }
  for (const group of entry.declaredEffects) {
    for (const effect of group.effects) {
      effect.results.forEach(appendCommonResult);
    }
  }
  for (const trigger of entry.attack?.triggerStages ?? []) {
    for (const activation of trigger.activations) {
      for (const action of activation.actions) {
        action.results.forEach(appendCommonResult);
      }
    }
  }
  for (const replacement of entry.boundary.allyReplacements) {
    const defeated = unitName(
      replacement.defeated.name,
      replacement.defeated.instanceId,
    );
    const arrived = replacement.replacement
      ? unitName(
          replacement.replacement.name,
          replacement.replacement.instanceId,
        )
      : "交代なし";
    changes.push(`${defeated}退場 → ${arrived}`);
  }
  for (const departure of entry.boundary.enemyDepartures) {
    changes.push(
      `${unitName(departure.unit.name, departure.unit.instanceId)}退場`,
    );
  }
  for (const arrival of entry.boundary.enemyArrivals) {
    changes.push(
      `${unitName(arrival.unit.name, arrival.unit.instanceId)}登場`,
    );
  }
  if (entry.boundary.targetTransition.outcome === "retargeted") {
    changes.push("対象変更");
  }
  if (entry.boundary.directAllyExchange) {
    changes.push(
      `${unitName(
        entry.boundary.directAllyExchange.frontline.name,
        entry.boundary.directAllyExchange.frontline.instanceId,
      )} ↔ ${unitName(
        entry.boundary.directAllyExchange.reserve.name,
        entry.boundary.directAllyExchange.reserve.instanceId,
      )}`,
    );
  }
  return changes;
}

/** Creates compact action rows from the engine-produced batch only. */
export function summarizeBattleLogBatch(
  batch: BattleLogBatch,
): BattleLogSummary[] {
  return batch.entries.map((entry) => ({
    id: entry.entryId,
    kind: "action",
    title: `${unitName(entry.actor.name, entry.actor.instanceId)}：${entry.action.name ?? entry.action.kind}`,
    status: entry.outcome.status,
    targetNames: actionTargetNames(entry),
    actualHpLoss: entry.attack?.totalActualHpLoss ?? null,
    critical: entry.critical?.isCritical ?? null,
    changes: actionChanges(entry),
    detail: entry,
  }));
}

function turnEndChanges(record: BattleLogTurnEndRecord): string[] {
  const changes: string[] = [];
  const slipLabels = {
    burn: "やけど",
    poison: "毒",
    curse: "呪い",
  } as const;
  for (const activation of record.activations) {
    for (const action of activation.actions) {
      if (!action.starAddition) continue;
      changes.push(
        `${unitName(activation.owner.name, activation.owner.instanceId)}：次回用スター ${action.starAddition.before}→${action.starAddition.after}（要求${action.starAddition.requested}・獲得${action.starAddition.added}・上限超過${action.starAddition.overflow}）`,
      );
    }
  }
  for (const settlement of record.hpSettlements) {
    for (const contribution of settlement.slipDamageContributions) {
      if (!contribution.slipDamageKind) continue;
      changes.push(
        `${unitName(settlement.target.name, settlement.target.instanceId)}：${slipLabels[contribution.slipDamageKind]} 基礎${contribution.amount}・発動時倍加${contribution.amplifierPermille ?? "記録なし"}permille・種類別基礎合計${contribution.categoryBaseAmount ?? "記録なし"}・確定${contribution.categoryResolvedDamage ?? "記録なし"}`,
      );
    }
    if (settlement.slipDamageContributions.length > 0) {
      changes.push(
        `${unitName(settlement.target.name, settlement.target.instanceId)}：スリップ合計${settlement.result.totalSlipDamage}・HP ${settlement.result.hpBefore ?? "-"}→${settlement.result.hpAfter ?? "-"}`,
      );
    }
  }
  for (const change of record.enemyChargeChanges) {
    changes.push(
      `${unitName(change.enemy.name, change.enemy.instanceId)}チャージ ${change.before}→${change.after}`,
    );
  }
  for (const event of record.allyReplacement.events) {
    const defeated = unitName(event.defeated.name, event.defeated.instanceId);
    const arrived = event.replacement
      ? unitName(event.replacement.name, event.replacement.instanceId)
      : "交代なし";
    changes.push(`${defeated}退場 → ${arrived}`);
  }
  for (const replacement of record.enemyReplacements) {
    for (const departure of replacement.departures) {
      changes.push(
        `${unitName(departure.unit.name, departure.unit.instanceId)}退場`,
      );
    }
    for (const arrival of replacement.arrivals) {
      changes.push(
        `${unitName(arrival.unit.name, arrival.unit.instanceId)}登場`,
      );
    }
  }
  if (record.checkpoint.waveTransition) {
    changes.push(
      `Wave ${record.checkpoint.waveTransition.fromWaveNumber}→${record.checkpoint.waveTransition.toWaveNumber}`,
    );
  }
  if (record.checkpoint.battleOutcome !== "ongoing") {
    changes.push(`戦闘結果：${record.checkpoint.battleOutcome}`);
  }
  return changes;
}

function summarizeTurnEnd(
  record: BattleLogTurnEndRecord,
): BattleLogSummary {
  return {
    id: record.recordId,
    kind: "turn_end",
    title: record.side === "ally" ? "味方ターン終了" : "敵ターン終了",
    status: record.checkpoint.kind,
    targetNames: record.activations.map(({ owner }) =>
      unitName(owner.name, owner.instanceId)
    ),
    actualHpLoss: null,
    critical: null,
    changes: turnEndChanges(record),
    detail: record,
  };
}

/**
 * Flattens accumulated turn logs in their saved execution order. No action,
 * targeting, damage, critical, charge, or replacement rule is re-run here.
 */
export function summarizeBattleTurnLogs(
  turnLogs: readonly BattleTurnLog[],
): BattleLogSummary[] {
  return turnLogs.flatMap((turnLog) =>
    turnLog.records.flatMap((record) =>
      record.recordType === "action_batch"
        ? summarizeBattleLogBatch(record.batch)
        : [summarizeTurnEnd(record)]
    )
  );
}

/** Presents input-boundary skill batches in their saved operation order. */
export function summarizeBattleInputLogs(
  inputLogs: readonly BattleLogBatch[],
): BattleLogSummary[] {
  return inputLogs.flatMap(summarizeBattleLogBatch);
}
