import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { listCommandCardChoices } from "./core/cards/selection";
import {
  parseBattleSuspendSave,
  resolveBattleSessionTurn,
  restoreBattleSession,
  serializeBattleSuspendSave,
  type BattleSession,
} from "./core/battle/session";
import type { BattleUnitState } from "./core/battle/types";
import {
  EMBER_GATHERING_SABER_EXTREME,
} from "./data/enemies";
import {
  INITIAL_CRAFT_ESSENCE_DEFINITIONS,
} from "./data/craftEssences";
import {
  INITIAL_MYSTIC_CODE_DEFINITIONS,
} from "./data/mysticCodes";
import {
  INITIAL_SERVANT_DEFINITIONS,
  servantDefinition,
  type ServantLevel,
} from "./data/servants";
import type { NoblePhantasmLevel } from "./formulas/np";
import {
  presentBattleStatus,
  summarizeBattleTurnLogs,
} from "./ui/battlePresentation";
import {
  INITIAL_SERVANT_REGISTRY,
  createEmptyInitialBattleSetup,
  createInitialBattleSession,
  emptyInitialAllySlot,
  validateInitialBattleSetup,
  type InitialAllySlotSelection,
  type InitialBattleSetup,
} from "./ui/initialBattle";

const SETUP_STORAGE_KEY = "fgo-battle-simulator.initial-setup.v1";

const CARD_TYPE_LABELS = {
  quick: "Quick",
  arts: "Arts",
  buster: "Buster",
} as const;

const SELECTION_REASON_LABELS = {
  invalid_phase: "現在はカード入力を受け付けていません。",
  wrong_card_count: "カードを3枚選択してください。",
  duplicate_card: "同じカードが重複しています。",
  card_not_available: "現在使用できないカードが含まれています。",
  noble_phantasm_unavailable: "その宝具は現在使用できません。",
} as const;

function isInitialBattleSetup(value: unknown): value is InitialBattleSetup {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<InitialBattleSetup>;
  const isSlot = (slot: unknown): slot is InitialAllySlotSelection => {
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) return false;
    const current = slot as Partial<InitialAllySlotSelection>;
    return (current.servantDataId === null || typeof current.servantDataId === "string")
      && (current.level === null || typeof current.level === "number")
      && (current.noblePhantasmLevel === null
        || typeof current.noblePhantasmLevel === "number")
      && (current.craftEssenceDataId === null
        || typeof current.craftEssenceDataId === "string");
  };
  return Array.isArray(candidate.frontline)
    && candidate.frontline.length === 3
    && candidate.frontline.every(isSlot)
    && Array.isArray(candidate.reserve)
    && candidate.reserve.length === 3
    && candidate.reserve.every(isSlot)
    && (candidate.mysticCodeDataId === null
      || typeof candidate.mysticCodeDataId === "string")
    && typeof candidate.enemyEncounterDataId === "string"
    && typeof candidate.seed === "string";
}

function storedSetup(): InitialBattleSetup {
  if (typeof localStorage === "undefined") {
    return createEmptyInitialBattleSetup();
  }
  try {
    const serialized = localStorage.getItem(SETUP_STORAGE_KEY);
    if (!serialized) return createEmptyInitialBattleSetup();
    const parsed: unknown = JSON.parse(serialized);
    return isInitialBattleSetup(parsed)
      ? parsed
      : createEmptyInitialBattleSetup();
  } catch {
    return createEmptyInitialBattleSetup();
  }
}

function optionNumber(value: string): number | null {
  return value === "" ? null : Number(value);
}

function AllySlotEditor({
  label,
  required,
  selection,
  onChange,
}: {
  label: string;
  required: boolean;
  selection: InitialAllySlotSelection;
  onChange: (selection: InitialAllySlotSelection) => void;
}) {
  const definition = selection.servantDataId
    ? servantDefinition(INITIAL_SERVANT_REGISTRY, selection.servantDataId)
    : null;

  return (
    <fieldset className="setup-slot">
      <legend>{label}{required ? "（必須）" : "（任意）"}</legend>
      <label>
        サーヴァント
        <select
          aria-label={`${label} サーヴァント`}
          value={selection.servantDataId ?? ""}
          onChange={(event) => {
            const servantDataId = event.target.value || null;
            onChange(servantDataId
              ? {
                  ...selection,
                  servantDataId,
                  level: null,
                  noblePhantasmLevel: null,
                }
              : emptyInitialAllySlot());
          }}
        >
          <option value="">未選択</option>
          {INITIAL_SERVANT_DEFINITIONS.map((servant) => (
            <option key={servant.dataId} value={servant.dataId}>
              {servant.name}（★{servant.rarity}）
            </option>
          ))}
        </select>
      </label>
      <div className="inline-fields">
        <label>
          Lv
          <select
            aria-label={`${label} Lv`}
            disabled={!definition}
            value={selection.level ?? ""}
            onChange={(event) => onChange({
              ...selection,
              level: optionNumber(event.target.value) as ServantLevel | null,
            })}
          >
            <option value="">選択</option>
            {definition?.levelStats.map(({ level }) => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
        </label>
        <label>
          宝具Lv
          <select
            aria-label={`${label} 宝具Lv`}
            disabled={!definition}
            value={selection.noblePhantasmLevel ?? ""}
            onChange={(event) => onChange({
              ...selection,
              noblePhantasmLevel: optionNumber(event.target.value) as
                NoblePhantasmLevel | null,
            })}
          >
            <option value="">選択</option>
            {[1, 2, 3, 4, 5].map((level) => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        概念礼装
        <select
          aria-label={`${label} 概念礼装`}
          disabled={!definition}
          value={selection.craftEssenceDataId ?? ""}
          onChange={(event) => onChange({
            ...selection,
            craftEssenceDataId: event.target.value || null,
          })}
        >
          <option value="">未選択</option>
          {INITIAL_CRAFT_ESSENCE_DEFINITIONS.map((craftEssence) => (
            <option key={craftEssence.dataId} value={craftEssence.dataId}>
              {craftEssence.name}（最大解放・Lv{craftEssence.level}）
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}

function SetupScreen({
  setup,
  onSetupChange,
  onStart,
  onRestore,
}: {
  setup: InitialBattleSetup;
  onSetupChange: (setup: InitialBattleSetup) => void;
  onStart: () => void;
  onRestore: (session: BattleSession) => void;
}) {
  const validation = validateInitialBattleSetup(setup);
  const [resumeJson, setResumeJson] = useState("");
  const [resumeMessage, setResumeMessage] = useState("");

  function updateSlot(
    area: "frontline" | "reserve",
    index: number,
    selection: InitialAllySlotSelection,
  ) {
    onSetupChange({
      ...setup,
      [area]: setup[area].map((current, currentIndex) =>
        currentIndex === index ? selection : current
      ),
    });
  }

  function restoreFromSetup() {
    try {
      onRestore(restoreBattleSession(parseBattleSuspendSave(resumeJson)));
      setResumeMessage("保存済み状態を直接再開しました。");
    } catch (error) {
      setResumeMessage(error instanceof Error ? error.message : "再開に失敗しました。");
    }
  }

  async function readResumeFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setResumeJson(await file.text());
    setResumeMessage("ファイルを読み込みました。内容を確認して再開してください。");
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">FGO Battle Simulator Work</p>
        <h1>初期戦闘設定</h1>
        <p>
          登録済みデータだけを使い、固定シードで極級3 Waveを開始します。
          同じサーヴァントや概念礼装も個体ごとに独立して選択できます。
        </p>
      </header>

      <section className="panel" aria-labelledby="frontline-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">ALLY</p>
            <h2 id="frontline-heading">味方編成</h2>
          </div>
          <span className="badge">前衛3騎必須</span>
        </div>
        <div className="slot-grid">
          {setup.frontline.map((selection, index) => (
            <AllySlotEditor
              key={`frontline-${index + 1}`}
              label={`前衛${index + 1}`}
              required
              selection={selection}
              onChange={(next) => updateSlot("frontline", index, next)}
            />
          ))}
        </div>
        <h3>控え（0～3騎）</h3>
        <div className="slot-grid">
          {setup.reserve.map((selection, index) => (
            <AllySlotEditor
              key={`reserve-${index + 1}`}
              label={`控え${index + 1}`}
              required={false}
              selection={selection}
              onChange={(next) => updateSlot("reserve", index, next)}
            />
          ))}
        </div>
      </section>

      <section className="panel setup-options" aria-labelledby="battle-options-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">BATTLE</p>
            <h2 id="battle-options-heading">戦闘設定</h2>
          </div>
          <span className="badge">固定シード</span>
        </div>
        <label>
          魔術礼装（Lv最大）
          <select
            value={setup.mysticCodeDataId ?? ""}
            onChange={(event) => onSetupChange({
              ...setup,
              mysticCodeDataId: event.target.value || null,
            })}
          >
            <option value="">選択してください</option>
            {INITIAL_MYSTIC_CODE_DEFINITIONS.map((mysticCode) => (
              <option key={mysticCode.dataId} value={mysticCode.dataId}>
                {mysticCode.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          敵設定
          <input value={EMBER_GATHERING_SABER_EXTREME.name} readOnly />
        </label>
        <label>
          固定シード
          <input
            value={setup.seed}
            placeholder="例: initial-battle-001"
            onChange={(event) => onSetupChange({
              ...setup,
              seed: event.target.value,
            })}
          />
        </label>
      </section>

      {!validation.valid && (
        <section className="validation-box" aria-live="polite">
          <h2>開始前に確認してください</h2>
          <ul>
            {validation.errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        </section>
      )}
      <details className="panel suspend-panel">
        <summary>中断保存JSONから再開</summary>
        <p className="muted">
          新しい戦闘を開始せず、保存済みの現在状態と乱数位置を直接復元します。
        </p>
        <label>
          JSONファイルを読み込む
          <input type="file" accept="application/json,.json" onChange={readResumeFile} />
        </label>
        <label>
          中断保存JSON
          <textarea
            rows={8}
            value={resumeJson}
            onChange={(event) => setResumeJson(event.target.value)}
            placeholder="ここへ中断保存JSONを貼り付けてください"
          />
        </label>
        <button type="button" onClick={restoreFromSetup}>
          このJSONから直接再開する
        </button>
        {resumeMessage && (
          <p className="operation-message" aria-live="polite">{resumeMessage}</p>
        )}
      </details>
      <div className="sticky-actions">
        <button
          className="primary-button"
          type="button"
          disabled={!validation.valid}
          onClick={onStart}
        >
          戦闘を開始する
        </button>
      </div>
    </main>
  );
}

function formatNp(np: number): string {
  return `${(np / 100).toFixed(2)}%`;
}

function EffectList({ unit }: { unit: BattleUnitState }) {
  if (unit.effects.length === 0) {
    return <p className="muted compact">状態なし</p>;
  }
  return (
    <ul className="effect-list">
      {unit.effects.map((effect) => (
        <li key={effect.instanceId}>
          {effect.name}
          {effect.remainingTurns !== null ? ` ${effect.remainingTurns}T` : ""}
          {effect.remainingUses !== null ? ` ${effect.remainingUses}回` : ""}
        </li>
      ))}
    </ul>
  );
}

function UnitPanel({
  unit,
  session,
  reserve = false,
}: {
  unit: BattleUnitState;
  session: BattleSession;
  reserve?: boolean;
}) {
  const attackData = session.registry.byInstanceId[unit.instanceId];
  const craftEssence =
    session.loop.state.loadout.craftEssencesByInstanceId[unit.instanceId];
  return (
    <article className={`unit-card ${unit.alive ? "" : "unit-defeated"}`}>
      <div className="unit-title">
        <div>
          <p className="unit-meta">
            {reserve ? "控え" : "前衛"} · {attackData?.classKey ?? "class未設定"}
          </p>
          <h3>{unit.name}</h3>
        </div>
        <span className={`status-pill ${unit.alive ? "alive" : "defeated"}`}>
          {unit.alive ? "生存" : "退場"}
        </span>
      </div>
      <dl className="stat-list">
        <div><dt>HP</dt><dd>{unit.hp.toLocaleString()} / {unit.maxHp.toLocaleString()}</dd></div>
        <div><dt>ATK</dt><dd>{attackData?.attack.toLocaleString() ?? "—"}</dd></div>
        {unit.side === "ally" ? (
          <div><dt>NP</dt><dd>{formatNp(unit.np)}</dd></div>
        ) : (
          <div>
            <dt>チャージ</dt>
            <dd>{unit.enemyAction?.charge ?? 0} / {unit.enemyAction?.chargeMax ?? 0}</dd>
          </div>
        )}
      </dl>
      <progress value={unit.hp} max={unit.maxHp} aria-label={`${unit.name} HP`} />
      {unit.side === "ally" && (
        <p className="equipment-line">
          概念礼装：{craftEssence?.name ?? "未選択"}
        </p>
      )}
      {unit.skillCooldowns.length > 0 && (
        <p className="muted compact">CT: {unit.skillCooldowns.join(" / ")}</p>
      )}
      <EffectList unit={unit} />
    </article>
  );
}

function firstLivingEnemyId(session: BattleSession): string {
  return session.loop.state.formation.enemy.frontline.find(
    (unit) => unit?.alive,
  )?.instanceId ?? "";
}

function BattleLogs({ session }: { session: BattleSession }) {
  const [newestFirst, setNewestFirst] = useState(true);
  const summaries = useMemo(
    () => summarizeBattleTurnLogs(session.turnLogs),
    [session.turnLogs],
  );
  const displayed = newestFirst ? [...summaries].reverse() : summaries;

  return (
    <section className="panel" aria-labelledby="battle-log-heading">
      <div className="section-heading">
        <div>
          <p className="section-kicker">LOG</p>
          <h2 id="battle-log-heading">戦闘ログ</h2>
        </div>
        <label className="switch-label">
          <input
            type="checkbox"
            checked={newestFirst}
            onChange={(event) => setNewestFirst(event.target.checked)}
          />
          新しい順
        </label>
      </div>
      {displayed.length === 0 ? (
        <p className="muted">成立したターンのログはまだありません。</p>
      ) : (
        <div className="log-list">
          {displayed.map((summary) => (
            <details key={summary.id} className="log-entry">
              <summary>
                <span>
                  <strong>{summary.title}</strong>
                  <small>{summary.status}</small>
                </span>
                <span className="log-facts">
                  {summary.targetNames.length > 0
                    ? `対象: ${summary.targetNames.join("、")}`
                    : "対象なし"}
                  {summary.actualHpLoss !== null
                    ? ` · 実HP減少 ${summary.actualHpLoss.toLocaleString()}`
                    : ""}
                  {summary.critical !== null
                    ? ` · ${summary.critical ? "クリティカル" : "非クリティカル"}`
                    : ""}
                </span>
                {summary.changes.length > 0 && (
                  <span className="log-changes">{summary.changes.join(" / ")}</span>
                )}
              </summary>
              <div className="log-detail">
                <p>保存済み確定結果（詳細）</p>
                <pre>{JSON.stringify(summary.detail, null, 2)}</pre>
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function SuspendControls({
  session,
  saveJson,
  onSaveJsonChange,
  onRestore,
}: {
  session: BattleSession;
  saveJson: string;
  onSaveJsonChange: (value: string) => void;
  onRestore: (session: BattleSession) => void;
}) {
  const [message, setMessage] = useState("");

  function generateSave() {
    try {
      onSaveJsonChange(serializeBattleSuspendSave(session));
      setMessage("現在の入力境界をJSONへ書き出しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存に失敗しました。");
    }
  }

  function downloadSave() {
    try {
      const serialized = serializeBattleSuspendSave(session);
      onSaveJsonChange(serialized);
      const url = URL.createObjectURL(
        new Blob([serialized], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `fgo-battle-suspend-${session.loop.rng.seed}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("中断保存ファイルを書き出しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存に失敗しました。");
    }
  }

  function restoreSave() {
    try {
      const restored = restoreBattleSession(parseBattleSuspendSave(saveJson));
      onRestore(restored);
      setMessage("保存済み状態を直接再開しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "再開に失敗しました。");
    }
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    onSaveJsonChange(await file.text());
    setMessage("ファイルを読み込みました。内容を確認して再開してください。");
  }

  return (
    <details className="panel suspend-panel">
      <summary>中断保存／再開</summary>
      <p className="muted">
        保存済みのHP・NP・状態・敵チャージ・乱数位置を直接復元します。
      </p>
      <div className="button-row">
        <button type="button" onClick={generateSave}>JSONを生成</button>
        <button type="button" onClick={downloadSave}>JSONファイルを書き出す</button>
      </div>
      <label>
        JSONファイルを読み込む
        <input type="file" accept="application/json,.json" onChange={readFile} />
      </label>
      <label>
        中断保存JSON
        <textarea
          rows={10}
          value={saveJson}
          onChange={(event) => onSaveJsonChange(event.target.value)}
          placeholder="ここへ中断保存JSONを貼り付けてください"
        />
      </label>
      <button type="button" onClick={restoreSave}>このJSONから直接再開する</button>
      {message && <p className="operation-message" aria-live="polite">{message}</p>}
    </details>
  );
}

function BattleScreen({
  session,
  onSessionChange,
  onReturnToSetup,
}: {
  session: BattleSession;
  onSessionChange: (session: BattleSession) => void;
  onReturnToSetup: () => void;
}) {
  const state = session.loop.state;
  const battleStatus = presentBattleStatus(state, session.loop.rng.seed);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [targetInstanceId, setTargetInstanceId] = useState(
    () => firstLivingEnemyId(session),
  );
  const [operationMessage, setOperationMessage] = useState("");
  const [saveJson, setSaveJson] = useState("");
  const choices = state.outcome === "ongoing"
    ? listCommandCardChoices(state)
    : [];
  const unitsById = new Map(
    [
      ...state.formation.ally.frontline,
      ...state.formation.ally.reserve,
      ...state.formation.enemy.frontline,
      ...state.formation.enemy.reserve,
    ].flatMap((unit) => unit ? [[unit.instanceId, unit] as const] : []),
  );

  function toggleCard(cardId: string) {
    setSelectedCardIds((current) => current.includes(cardId)
      ? current.filter((selected) => selected !== cardId)
      : [...current, cardId]);
  }

  function executeTurn() {
    const result = resolveBattleSessionTurn(session, {
      cardIds: selectedCardIds,
      ...(targetInstanceId
        ? { ally: { requestedTargetInstanceId: targetInstanceId } }
        : {}),
    });
    onSessionChange(result.session);
    if (!result.result.accepted) {
      setOperationMessage(
        SELECTION_REASON_LABELS[result.result.selection.reason],
      );
      return;
    }
    setSelectedCardIds([]);
    const nextTargetIds = result.session.loop.state.formation.enemy.frontline
      .flatMap((unit) => unit?.alive ? [unit.instanceId] : []);
    setTargetInstanceId((current) =>
      nextTargetIds.includes(current) ? current : (nextTargetIds[0] ?? "")
    );
    setOperationMessage(`1ターン実行: ${result.result.resolution.stopReason}`);
  }

  return (
    <main className="app-shell battle-shell">
      <header className="battle-header">
        <div>
          <p className="eyebrow">{EMBER_GATHERING_SABER_EXTREME.name}</p>
          <h1>Wave {battleStatus.wave}</h1>
        </div>
        <dl className="battle-meta">
          <div><dt>戦闘ターン</dt><dd>{battleStatus.battleTurn}</dd></div>
          <div><dt>Waveターン</dt><dd>{battleStatus.waveTurn}</dd></div>
          <div><dt>シード</dt><dd>{battleStatus.seed}</dd></div>
          <div><dt>結果</dt><dd>{battleStatus.outcome}</dd></div>
        </dl>
      </header>

      <section className="panel" aria-labelledby="enemy-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">ENEMY</p>
            <h2 id="enemy-heading">敵前衛</h2>
          </div>
          <span className="badge">チャージは状態値を表示</span>
        </div>
        <div className="unit-grid">
          {state.formation.enemy.frontline.map((unit, index) => unit ? (
            <div key={unit.instanceId} className="target-unit">
              {state.outcome === "ongoing" && unit.alive && (
                <label className="target-selector">
                  <input
                    type="radio"
                    name="enemy-target"
                    checked={targetInstanceId === unit.instanceId}
                    onChange={() => setTargetInstanceId(unit.instanceId)}
                  />
                  攻撃対象にする（敵枠{index + 1}）
                </label>
              )}
              <UnitPanel unit={unit} session={session} />
            </div>
          ) : (
            <div key={`empty-enemy-${index}`} className="empty-slot">敵枠{index + 1}：空き</div>
          ))}
        </div>
      </section>

      <section className="panel" aria-labelledby="ally-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">ALLY</p>
            <h2 id="ally-heading">味方</h2>
          </div>
          <span className="badge">スター {state.commandStars}</span>
        </div>
        <div className="unit-grid">
          {state.formation.ally.frontline.map((unit, index) => unit ? (
            <UnitPanel key={unit.instanceId} unit={unit} session={session} />
          ) : (
            <div key={`empty-ally-${index}`} className="empty-slot">味方枠{index + 1}：空き</div>
          ))}
        </div>
        {state.formation.ally.reserve.length > 0 && (
          <details className="reserve-section">
            <summary>控え {state.formation.ally.reserve.length}騎を表示</summary>
            <div className="unit-grid">
              {state.formation.ally.reserve.map((unit) => (
                <UnitPanel
                  key={unit.instanceId}
                  unit={unit}
                  session={session}
                  reserve
                />
              ))}
            </div>
          </details>
        )}
        <p className="equipment-line">
          魔術礼装：{state.loadout.mysticCode?.name ?? "未選択"}
          {state.loadout.mysticCode
            ? `（CT ${state.mysticCodeCooldowns.join(" / ")}）`
            : ""}
        </p>
      </section>

      {state.outcome === "ongoing" ? (
        <section className="panel command-panel" aria-labelledby="command-heading">
          <div className="section-heading">
            <div>
              <p className="section-kicker">COMMAND</p>
              <h2 id="command-heading">カード選択</h2>
            </div>
            <span className="badge">選択 {selectedCardIds.length}枚</span>
          </div>
          <p className="muted">
            現在手札と使用可能な宝具から実行順に3枚選びます。
            枚数不成立はBattleSessionの結果を表示します。
          </p>
          <div className="card-grid">
            {choices.map((choice) => {
              const card = choice.card;
              const owner = unitsById.get(card.ownerInstanceId);
              const selectedIndex = selectedCardIds.indexOf(card.cardId);
              const label = card.kind === "noble_phantasm"
                ? card.noblePhantasmName
                : `${CARD_TYPE_LABELS[card.type]} ${card.cardIndex + 1}`;
              return (
                <button
                  key={card.cardId}
                  type="button"
                  className={`command-card ${card.type} ${selectedIndex >= 0 ? "selected" : ""}`}
                  disabled={!choice.selectable}
                  onClick={() => toggleCard(card.cardId)}
                  aria-pressed={selectedIndex >= 0}
                >
                  <span className="card-order">
                    {selectedIndex >= 0 ? `${selectedIndex + 1}枚目` : "未選択"}
                  </span>
                  <strong>{label}</strong>
                  <small>{owner?.name ?? card.ownerInstanceId}</small>
                  {!choice.selectable && (
                    <small>{choice.executionRestrictions.join(" / ")}</small>
                  )}
                </button>
              );
            })}
          </div>
          {operationMessage && (
            <p className="operation-message" aria-live="polite">{operationMessage}</p>
          )}
          <div className="sticky-actions battle-actions">
            <button type="button" onClick={() => setSelectedCardIds([])}>
              カード選択を解除
            </button>
            <button className="primary-button" type="button" onClick={executeTurn}>
              選択カードで1ターン実行
            </button>
          </div>
        </section>
      ) : (
        <section className={`outcome-banner ${state.outcome}`}>
          <p>戦闘終了</p>
          <h2>{battleStatus.outcome}</h2>
          <button type="button" onClick={onReturnToSetup}>設定画面へ戻る</button>
        </section>
      )}

      <BattleLogs session={session} />
      <SuspendControls
        session={session}
        saveJson={saveJson}
        onSaveJsonChange={setSaveJson}
        onRestore={(restored) => {
          onSessionChange(restored);
          setSelectedCardIds([]);
          setTargetInstanceId(firstLivingEnemyId(restored));
          setOperationMessage("中断保存から直接再開しました。");
        }}
      />
      <button className="text-button" type="button" onClick={onReturnToSetup}>
        現在の戦闘を閉じて設定画面へ戻る
      </button>
    </main>
  );
}

export function App() {
  const [setup, setSetup] = useState<InitialBattleSetup>(storedSetup);
  const [session, setSession] = useState<BattleSession | null>(null);
  const [startError, setStartError] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(setup));
    } catch {
      // The setup remains usable even when browser storage is unavailable.
    }
  }, [setup]);

  function startBattle() {
    try {
      setSession(createInitialBattleSession(setup));
      setStartError("");
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "戦闘開始に失敗しました。");
    }
  }

  if (session) {
    return (
      <BattleScreen
        session={session}
        onSessionChange={setSession}
        onReturnToSetup={() => setSession(null)}
      />
    );
  }

  return (
    <>
      <SetupScreen
        setup={setup}
        onSetupChange={setSetup}
        onStart={startBattle}
        onRestore={(restored) => {
          setSession(restored);
          setStartError("");
        }}
      />
      {startError && <p className="fatal-message" role="alert">{startError}</p>}
    </>
  );
}
