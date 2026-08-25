import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  listCommandCardChoices,
  type CommandCardChoice,
} from "./core/cards/selection";
import {
  parseBattleSuspendSave,
  resolveBattleSessionAllySkill,
  resolveBattleSessionMysticCodeSkill,
  resolveBattleSessionTurn,
  restartBattleSession,
  restartBattleSessionWithSeed,
  restoreBattleSession,
  serializeBattleSuspendSave,
  type BattleSession,
} from "./core/battle/session";
import type { BattleUnitState } from "./core/battle/types";
import type { BattleState } from "./core/battle/state";
import type { BattleActionEffectSequence } from "./effects/actionData";
import { isActionDisabled } from "./effects/classification";
import { EMBER_GATHERING_SABER_EXTREME } from "./data/enemies";
import { INITIAL_CRAFT_ESSENCE_DEFINITIONS } from "./data/craftEssences";
import {
  INITIAL_MYSTIC_CODE_DEFINITIONS,
  type MysticCodeSkillDefinition,
} from "./data/mysticCodes";
import {
  INITIAL_SERVANT_DEFINITIONS,
  OFFICIAL_SERVANT_DEFINITIONS,
  ORIGINAL_SERVANT_DEFINITIONS,
  servantDefinition,
  type ServantDefinition,
  type ServantLevel,
} from "./data/servants";
import type { NoblePhantasmLevel } from "./formulas/np";
import {
  presentBattleStatus,
  type BattleLogSummary,
} from "./ui/battlePresentation";
import {
  confirmedAttackDamageAmounts,
  confirmedAllyActionPlayback,
  confirmedPlaybackNotices,
  confirmedChainNotices,
  confirmedHpTransitions,
  confirmedNpTransitions,
  displayedCommandCardCriticalRatePermille,
  presentNoblePhantasmDetail,
  presentBattleSummary,
  presentBattleTurns,
  registeredServantWikiUrl,
  selectedChainCriticalBonus,
  toggleSelectedCommandCard,
  type ConfirmedAttackDamage,
  type ConfirmedHpTransition,
  type ConfirmedNpTransition,
} from "./ui/battleUi";
import {
  effectExpiryLabel,
  effectHasDisplayValue,
  effectValueLabel,
  presentCombinedEffects,
  presentUnitEffects,
  type PresentedEffect,
} from "./ui/effectPresentation";
import { registeredSkillIconPath } from "./ui/iconRegistry";
import {
  INITIAL_SERVANT_REGISTRY,
  createEmptyInitialBattleSetup,
  createInitialBattleSession,
  emptyInitialAllySlot,
  generateReplayableSeed,
  initialAllySelectionForServant,
  SERVANT_FOU_MAX,
  SERVANT_FOU_MIN,
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

const ALLY_SKILL_REASON_LABELS = {
  invalid_phase: "現在はサーヴァントスキルを使用できません。",
  source_unavailable: "使用者が生存する前衛ではありません。",
  source_action_disabled: "使用者が行動不能です。",
  action_data_missing: "スキルの実行データが見つかりません。",
  not_a_skill: "選択した行動はサーヴァントスキルではありません。",
  skill_on_cooldown: "スキルのCTが残っています。",
  selected_target_required: "対象を選択してください。",
  selected_target_invalid: "選択した対象には使用できません。",
  unresolved_effects: "未対応効果を含むため、何も変更せず不発になりました。",
  command_card_redistribution_unavailable: "現在の入力境界ではカードを再配布できません。",
  command_card_redistribution_invalid: "カード再配布データが不正なため、何も変更せず不発になりました。",
} as const;

const MYSTIC_CODE_REASON_LABELS = {
  invalid_phase: "現在は魔術礼装スキルを使用できません。",
  mystic_code_unselected: "魔術礼装が選択されていません。",
  action_data_missing: "魔術礼装スキルの実行データが見つかりません。",
  skill_on_cooldown: "魔術礼装スキルのCTが残っています。",
  selected_target_required: "対象を選択してください。",
  selected_target_invalid: "選択した対象には使用できません。",
  order_change_targets_required: "交換する前衛と控えを選択してください。",
  order_change_targets_invalid: "選択した前衛と控えは交換できません。",
  unresolved_effects: "未対応効果を含むため、何も変更せず不発になりました。",
  command_card_redistribution_unavailable: "現在の入力境界ではカードを再配布できません。",
  command_card_redistribution_invalid: "カード再配布データが不正なため、何も変更せず不発になりました。",
} as const;

function effectsRedistributedCommandCards(
  effects: { effects: Array<{ commandCardRedistribution?: unknown }> },
): boolean {
  return effects.effects.some(({ commandCardRedistribution }) =>
    commandCardRedistribution !== undefined
  );
}

export function selectedCardsAfterCommandRedistribution(
  selectedCardIds: readonly string[],
  redistributed: boolean,
): string[] {
  return redistributed ? [] : [...selectedCardIds];
}

export function mysticCodeSkillUsesSelectedUnitInput(
  skill: MysticCodeSkillDefinition,
): boolean {
  return skill.execution === "effects" && skill.effects.some(
    ({ target }) => target.relation !== "self" && target.selection === "single",
  );
}

export function normalizeStoredSetup(value: unknown): InitialBattleSetup | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<InitialBattleSetup>;
  type StoredAllySlot = Omit<
    InitialAllySlotSelection,
    "hpFou" | "attackFou"
  > & Partial<Pick<InitialAllySlotSelection, "hpFou" | "attackFou">>;
  const isSlot = (slot: unknown): slot is StoredAllySlot => {
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) return false;
    const current = slot as Partial<InitialAllySlotSelection>;
    return (current.servantDataId === null || typeof current.servantDataId === "string")
      && (current.level === null || typeof current.level === "number")
      && (current.noblePhantasmLevel === null || typeof current.noblePhantasmLevel === "number")
      && (current.hpFou === undefined || typeof current.hpFou === "number")
      && (current.attackFou === undefined || typeof current.attackFou === "number")
      && (current.craftEssenceDataId === null || typeof current.craftEssenceDataId === "string");
  };
  if (
    !Array.isArray(candidate.frontline)
    || candidate.frontline.length !== 3
    || !candidate.frontline.every(isSlot)
    || !Array.isArray(candidate.reserve)
    || candidate.reserve.length !== 3
    || !candidate.reserve.every(isSlot)
    || (candidate.mysticCodeDataId !== null && typeof candidate.mysticCodeDataId !== "string")
    || typeof candidate.enemyEncounterDataId !== "string"
    || typeof candidate.seed !== "string"
  ) return null;
  const normalizeSlot = (slot: StoredAllySlot): InitialAllySlotSelection => ({
    ...slot,
    hpFou: slot.hpFou ?? SERVANT_FOU_MIN,
    attackFou: slot.attackFou ?? SERVANT_FOU_MIN,
  });
  return {
    frontline: candidate.frontline.map(normalizeSlot),
    reserve: candidate.reserve.map(normalizeSlot),
    mysticCodeDataId: candidate.mysticCodeDataId ?? null,
    enemyEncounterDataId: candidate.enemyEncounterDataId,
    seedMode: candidate.seedMode === "random" || candidate.seedMode === "fixed"
      ? candidate.seedMode
      : candidate.seed.trim() ? "fixed" : "random",
    seed: candidate.seed,
  };
}

function storedSetup(): InitialBattleSetup {
  if (typeof localStorage === "undefined") return createEmptyInitialBattleSetup();
  try {
    const serialized = localStorage.getItem(SETUP_STORAGE_KEY);
    if (!serialized) return createEmptyInitialBattleSetup();
    return normalizeStoredSetup(JSON.parse(serialized))
      ?? createEmptyInitialBattleSetup();
  } catch {
    return createEmptyInitialBattleSetup();
  }
}

function optionNumber(value: string): number | null {
  return value === "" ? null : Number(value);
}

/** Keeps free-form Fou input within the supported integer range immediately. */
export function normalizeFouValue(value: number): number {
  if (!Number.isFinite(value)) return SERVANT_FOU_MIN;
  return Math.min(
    SERVANT_FOU_MAX,
    Math.max(SERVANT_FOU_MIN, Math.trunc(value)),
  );
}

function allyName(selection: InitialAllySlotSelection): string {
  return selection.servantDataId
    ? servantDefinition(INITIAL_SERVANT_REGISTRY, selection.servantDataId)?.name
      ?? selection.servantDataId
    : "未選択";
}

type ServantOriginTab = "official" | "original";

function servantOrigin(definition: ServantDefinition): ServantOriginTab {
  return ORIGINAL_SERVANT_DEFINITIONS.some(
    ({ dataId }) => dataId === definition.dataId,
  ) ? "original" : "official";
}

function servantCollectionLabel(definition: ServantDefinition): string {
  return definition.collectionLabel
    ?? (definition.collectionNo === undefined
      ? "番号未登録"
      : String(definition.collectionNo).padStart(3, "0"));
}

export function AllySlotEditor({
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
  const wikiUrl = definition
    ? registeredServantWikiUrl(definition.dataId)
    : null;
  const [originTab, setOriginTab] = useState<ServantOriginTab>(
    definition ? servantOrigin(definition) : "official",
  );
  useEffect(() => {
    if (definition) setOriginTab(servantOrigin(definition));
  }, [definition?.dataId]);
  const visibleDefinitions = originTab === "official"
    ? OFFICIAL_SERVANT_DEFINITIONS
    : ORIGINAL_SERVANT_DEFINITIONS;
  const selectedIsVisible = definition
    ? visibleDefinitions.some(({ dataId }) => dataId === definition.dataId)
    : false;
  return (
    <fieldset className="setup-slot">
      <legend>{label}{required ? "（必須）" : "（任意）"}</legend>
      <div
        className="tab-list servant-origin-tabs"
        role="tablist"
        aria-label={`${label} サーヴァント区分`}
      >
        {([
          ["official", "公式"],
          ["original", "オリジナル"],
        ] as const).map(([tab, tabLabel]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={originTab === tab}
            onClick={() => setOriginTab(tab)}
          >
            {tabLabel}
          </button>
        ))}
      </div>
      <p className="current-servant-selection" aria-live="polite">
        選択中：{definition
          ? `No.${servantCollectionLabel(definition)} ${definition.name}`
          : "未選択"}
      </p>
      <label>
        サーヴァント
        <select
          aria-label={`${label} サーヴァント`}
          value={selectedIsVisible ? selection.servantDataId ?? "" : ""}
          onChange={(event) => {
            const servantDataId = event.target.value || null;
            onChange(servantDataId
              ? initialAllySelectionForServant(servantDataId)
              : emptyInitialAllySlot());
          }}
        >
          <option value="">未選択</option>
          {visibleDefinitions.map((servant) => (
            <option key={servant.dataId} value={servant.dataId}>
              No.{servantCollectionLabel(servant)} {servant.name}（★{servant.rarity}）
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
              noblePhantasmLevel: optionNumber(event.target.value) as NoblePhantasmLevel | null,
            })}
          >
            {[1, 2, 3, 4, 5].map((level) => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="inline-fields fou-fields">
        <label>
          HPフォウ
          <input
            aria-label={`${label} HPフォウ`}
            type="number"
            inputMode="numeric"
            min={SERVANT_FOU_MIN}
            max={SERVANT_FOU_MAX}
            step={1}
            disabled={!definition}
            value={selection.hpFou}
            onChange={(event) => onChange({
              ...selection,
              hpFou: event.target.value === ""
                ? SERVANT_FOU_MIN
                : normalizeFouValue(Number(event.target.value)),
            })}
          />
          <span className="fou-preset-buttons" aria-label={`${label} HPフォウ定型値`}>
            {[0, 1_000, 2_000, 3_000].map((value) => (
              <button key={value} type="button" disabled={!definition} onClick={() => onChange({ ...selection, hpFou: value })}>
                {value.toLocaleString()}
              </button>
            ))}
          </span>
        </label>
        <label>
          ATKフォウ
          <input
            aria-label={`${label} ATKフォウ`}
            type="number"
            inputMode="numeric"
            min={SERVANT_FOU_MIN}
            max={SERVANT_FOU_MAX}
            step={1}
            disabled={!definition}
            value={selection.attackFou}
            onChange={(event) => onChange({
              ...selection,
              attackFou: event.target.value === ""
                ? SERVANT_FOU_MIN
                : normalizeFouValue(Number(event.target.value)),
            })}
          />
          <span className="fou-preset-buttons" aria-label={`${label} ATKフォウ定型値`}>
            {[0, 1_000, 2_000, 3_000].map((value) => (
              <button key={value} type="button" disabled={!definition} onClick={() => onChange({ ...selection, attackFou: value })}>
                {value.toLocaleString()}
              </button>
            ))}
          </span>
        </label>
      </div>
      <p className="setup-field-note">各0～3000の整数で指定します。</p>
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
          {INITIAL_CRAFT_ESSENCE_DEFINITIONS.filter((craftEssence) =>
            !definition
            || craftEssence.eligibleServantDataIds === undefined
            || craftEssence.eligibleServantDataIds.includes(definition.dataId)
          ).map((craftEssence) => (
            <option key={craftEssence.dataId} value={craftEssence.dataId}>
              {craftEssence.name}（最大解放・Lv{craftEssence.level}）
            </option>
          ))}
        </select>
      </label>
      {wikiUrl && (
        <a
          className="wiki-button"
          href={wikiUrl}
          target="_blank"
          rel="noreferrer noopener"
        >
          wikiを開く
        </a>
      )}
    </fieldset>
  );
}

function BattleSummaryView({ session }: { session: BattleSession }) {
  const summary = presentBattleSummary(session);
  return (
    <div className="save-summary" aria-label="戦闘状態要約">
      <dl>
        <div><dt>Wave</dt><dd>{summary.wave}</dd></div>
        <div><dt>ターン</dt><dd>{summary.turn}</dd></div>
        <div><dt>シード</dt><dd>{summary.seed}</dd></div>
      </dl>
      <ul>
        {summary.frontline.map((unit) => (
          <li key={unit.slot}>前衛{unit.slot} {unit.name}：HP {unit.hp.toLocaleString()} / {unit.maxHp.toLocaleString()}</li>
        ))}
      </ul>
    </div>
  );
}

function ResumeFromJson({ onRestore }: { onRestore: (session: BattleSession) => void }) {
  const [resumeJson, setResumeJson] = useState("");
  const [preview, setPreview] = useState<BattleSession | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  function inspectSave() {
    try {
      setPreview(restoreBattleSession(parseBattleSuspendSave(resumeJson)));
      setMessage("保存内容を確認しました。要約を確認して再開してください。");
      setFailed(false);
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof Error ? error.message : "再開データを確認できませんでした。");
      setFailed(true);
    }
  }

  async function readResumeFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setResumeJson(await file.text());
    setPreview(null);
    setMessage("ファイルを読み込みました。内容を確認してください。");
    setFailed(false);
  }

  return (
    <details className="suspend-panel">
      <summary>中断保存JSONから再開</summary>
      <p className="muted">失敗したJSONは自動削除・自動上書きしません。</p>
      <label>
        JSONファイルを読み込む
        <input type="file" accept="application/json,.json" onChange={readResumeFile} />
      </label>
      <label>
        中断保存JSON
        <textarea
          rows={8}
          value={resumeJson}
          onChange={(event) => {
            setResumeJson(event.target.value);
            setPreview(null);
          }}
          placeholder="ここへ中断保存JSONを貼り付けてください"
        />
      </label>
      <div className="button-row">
        <button type="button" onClick={inspectSave}>保存内容を確認する</button>
        {preview && (
          <button className="primary-button" type="button" onClick={() => onRestore(preview)}>
            この保存から再開する
          </button>
        )}
        {failed && (
          <button type="button" onClick={() => {
            setMessage("");
            setFailed(false);
          }}>戻る</button>
        )}
      </div>
      {preview && <BattleSummaryView session={preview} />}
      {message && <p className="operation-message" aria-live="polite">{message}</p>}
    </details>
  );
}

const SETUP_TABS = ["味方編成", "Wave・敵設定", "戦闘設定", "最終確認"] as const;

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
  const [activeTab, setActiveTab] = useState(0);
  function updateSlot(area: "frontline" | "reserve", index: number, selection: InitialAllySlotSelection) {
    onSetupChange({
      ...setup,
      [area]: setup[area].map((current, currentIndex) =>
        currentIndex === index ? selection : current
      ),
    });
  }
  return (
    <main className="app-shell setup-shell">
      <header className="hero">
        <p className="eyebrow">FGO Battle Simulator Work</p>
        <h1>初期戦闘設定</h1>
        <p>4つのタブを順に確認します。ランダムシードは空欄のまま開始でき、開始前に再現可能な文字列へ確定します。</p>
      </header>
      <nav className="tab-list setup-tabs" role="tablist" aria-label="初期戦闘設定">
        {SETUP_TABS.map((label, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={activeTab === index}
            aria-controls={`setup-panel-${index}`}
            onClick={() => setActiveTab(index)}
          >
            <span>{index + 1}</span>{label}
          </button>
        ))}
      </nav>

      <section className="panel setup-tab-panel" role="tabpanel" id={`setup-panel-${activeTab}`}>
        {activeTab === 0 && (
          <>
            <div className="section-heading"><div><p className="section-kicker">ALLY</p><h2>味方編成</h2></div><span className="badge">前衛3騎必須</span></div>
            <div className="slot-grid">
              {setup.frontline.map((selection, index) => (
                <AllySlotEditor key={`frontline-${index}`} label={`前衛${index + 1}`} required selection={selection} onChange={(next) => updateSlot("frontline", index, next)} />
              ))}
            </div>
            <h3>控え（0～3騎）</h3>
            <div className="slot-grid">
              {setup.reserve.map((selection, index) => (
                <AllySlotEditor key={`reserve-${index}`} label={`控え${index + 1}`} required={false} selection={selection} onChange={(next) => updateSlot("reserve", index, next)} />
              ))}
            </div>
          </>
        )}
        {activeTab === 1 && (
          <>
            <div className="section-heading"><div><p className="section-kicker">WAVE</p><h2>Wave・敵設定</h2></div><span className="badge">登録済み3 Wave</span></div>
            <label>敵設定<input value={EMBER_GATHERING_SABER_EXTREME.name} readOnly /></label>
            <p className="muted">今回のUI完成確認では、登録済みの初期敵データのみを使用します。</p>
          </>
        )}
        {activeTab === 2 && (
          <div className="setup-options">
            <div className="section-heading"><div><p className="section-kicker">BATTLE</p><h2>戦闘設定</h2></div><span className="badge">スキルLv最大</span></div>
            <label>
              魔術礼装（Lv最大）
              <select value={setup.mysticCodeDataId ?? ""} onChange={(event) => onSetupChange({ ...setup, mysticCodeDataId: event.target.value || null })}>
                <option value="">選択してください</option>
                {INITIAL_MYSTIC_CODE_DEFINITIONS.map((mysticCode) => <option key={mysticCode.dataId} value={mysticCode.dataId}>{mysticCode.name}</option>)}
              </select>
            </label>
            <fieldset className="seed-fieldset">
              <legend>シード</legend>
              <label className="radio-control"><input type="radio" name="seed-mode" checked={setup.seedMode === "random"} onChange={() => onSetupChange({ ...setup, seedMode: "random" })} />ランダム</label>
              <label className="radio-control"><input type="radio" name="seed-mode" checked={setup.seedMode === "fixed"} onChange={() => onSetupChange({ ...setup, seedMode: "fixed" })} />固定シード</label>
              <label>
                シード文字列
                <input value={setup.seed} disabled={setup.seedMode === "random"} placeholder={setup.seedMode === "random" ? "空欄で開始できます" : "固定シードを入力"} onChange={(event) => onSetupChange({ ...setup, seed: event.target.value })} />
              </label>
            </fieldset>
          </div>
        )}
        {activeTab === 3 && (
          <>
            <div className="section-heading"><div><p className="section-kicker">CONFIRM</p><h2>最終確認</h2></div><span className="badge">開始前入力</span></div>
            <dl className="confirmation-grid">
              <div><dt>前衛</dt><dd>{setup.frontline.map(allyName).join(" / ")}</dd></div>
              <div><dt>控え</dt><dd>{setup.reserve.filter(({ servantDataId }) => servantDataId).map(allyName).join(" / ") || "なし"}</dd></div>
              <div><dt>敵</dt><dd>{EMBER_GATHERING_SABER_EXTREME.name}</dd></div>
              <div><dt>魔術礼装</dt><dd>{INITIAL_MYSTIC_CODE_DEFINITIONS.find(({ dataId }) => dataId === setup.mysticCodeDataId)?.name ?? "未選択"}</dd></div>
              <div><dt>シード</dt><dd>{setup.seedMode === "random" ? "ランダム（開始時に確定）" : setup.seed || "未入力"}</dd></div>
            </dl>
            {!validation.valid && (
              <div className="validation-box" aria-live="polite"><h2>開始前に確認してください</h2><ul>{validation.errors.map((error) => <li key={error}>{error}</li>)}</ul></div>
            )}
            <ResumeFromJson onRestore={onRestore} />
          </>
        )}
      </section>
      <div className="sticky-actions setup-actions">
        <button type="button" disabled={activeTab === 0} onClick={() => setActiveTab((tab) => Math.max(0, tab - 1))}>前へ</button>
        {activeTab < 3 ? (
          <button className="primary-button" type="button" onClick={() => setActiveTab((tab) => Math.min(3, tab + 1))}>次へ</button>
        ) : (
          <button className="primary-button" type="button" disabled={!validation.valid} onClick={onStart}>戦闘を開始する</button>
        )}
      </div>
    </main>
  );
}

function formatNp(np: number): string {
  return `${(np / 100).toFixed(2)}%`;
}

type DetailContent =
  | { kind: "effect"; effect: PresentedEffect }
  | { kind: "skill"; title: string; rank: string | null; cooldown: number; descriptions: string[] }
  | { kind: "noble_phantasm"; title: string; rank: string | null; level: number; descriptions: string[] };

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeHandler.current();
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) return;
      const focusable = [...modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )].filter((element) => !element.hasAttribute("aria-hidden"));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={(event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.currentTarget === event.target) closeHandler.current();
    }}>
      <section ref={modalRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="section-heading"><h2 id="modal-title">{title}</h2><button ref={closeRef} type="button" onClick={onClose}>閉じる</button></div>
        {children}
      </section>
    </div>
  );
}

function DetailModal({ detail, onClose }: { detail: DetailContent; onClose: () => void }) {
  if (detail.kind === "skill" || detail.kind === "noble_phantasm") {
    return (
      <Modal title={detail.title} onClose={onClose}>
        <dl className="detail-list">
          <div><dt>ランク</dt><dd>{detail.rank ?? "—"}</dd></div>
          {detail.kind === "skill"
            ? <div><dt>使用時CT</dt><dd>{detail.cooldown}</dd></div>
            : <div><dt>宝具Lv</dt><dd>{detail.level}</dd></div>}
          <div><dt>登録済み説明</dt><dd>{detail.descriptions.length > 0 ? <ul className="action-description-list">{detail.descriptions.map((description, index) => <li key={`${index}:${description}`}>{description}</li>)}</ul> : "登録済み説明なし"}</dd></div>
        </dl>
      </Modal>
    );
  }
  const { effect } = detail;
  if (effect.combinedMembers) {
    return (
      <Modal title={`${effect.displayName}（合算）`} onClose={onClose}>
        <dl className="detail-list">
          <div><dt>合算値</dt><dd>{effectValueLabel(effect.applied, effect.totalValue)}</dd></div>
          <div><dt>合算方法</dt><dd>発生元、残りターン、残り回数が異なる付与中の同種効果を合算しています。</dd></div>
          <div><dt>内訳</dt><dd><ul className="combined-detail-list">{effect.combinedMembers.map((member) => <li key={member.key}><strong>{member.sourceName}</strong>：{member.applied.name} {effectValueLabel(member.applied, member.applied.value)}（{member.applied.remainingTurns === null ? "ターン制限なし" : `${member.applied.remainingTurns}T`} / {member.applied.remainingUses === null ? "回数制限なし" : `${member.applied.remainingUses}回`}）</li>)}</ul></dd></div>
          <div><dt>注意</dt><dd>合算は表示専用です。戦闘計算、各状態の期限・回数・解除可否は変更しません。</dd></div>
        </dl>
      </Modal>
    );
  }
  return (
    <Modal title={effect.displayName} onClose={onClose}>
      <dl className="detail-list">
        <div><dt>発生元</dt><dd>{effect.sourceName}</dd></div>
        <div><dt>名称・ランク</dt><dd>{effect.applied.name} / {effect.sourceRank ?? "—"}</dd></div>
        <div><dt>登録済み説明</dt><dd className="registered-description">{effect.description}</dd></div>
        <div><dt>効果量</dt><dd>{effectValueLabel(effect.applied, effect.applied.value)}（同一発生元の同種合計 {effectValueLabel(effect.applied, effect.totalValue)}）</dd></div>
        <div><dt>残り</dt><dd>{effect.applied.remainingTurns === null ? "ターン制限なし" : `${effect.applied.remainingTurns}T`} / {effect.applied.remainingUses === null ? "回数制限なし" : `${effect.applied.remainingUses}回`}</dd></div>
        <div><dt>解除可否</dt><dd>{effect.applied.removalPolicy === "removable" ? "解除可能" : effect.applied.removalPolicy === "unremovable" ? "解除不可" : "ID指定時のみ"}</dd></div>
      </dl>
    </Modal>
  );
}

function EffectTabs({ unit, session, onDetail }: { unit: BattleUnitState; session: BattleSession; onDetail: (effect: PresentedEffect) => void }) {
  const effects = useMemo(() => presentUnitEffects(session, unit), [session, unit]);
  const combinedEffects = useMemo(() => presentCombinedEffects(effects), [effects]);
  const allyTabs = [
    ["class_skill", "クラススキル"],
    ["craft_essence", "概念礼装"],
    ["active", "その他"],
    ["combined", "合算"],
  ] as const;
  const enemyTabs = [
    ["normal", "通常"],
    ["special", "特殊"],
    ["combined", "合算"],
  ] as const;
  const tabs = unit.side === "ally" ? allyTabs : enemyTabs;
  const [activeTab, setActiveTab] = useState<string>(
    unit.side === "ally" ? "active" : "normal",
  );
  const displayed = activeTab === "combined"
    ? combinedEffects
    : effects.filter((effect) => unit.side === "ally"
      ? effect.allyTab === activeTab
      : effect.enemyTab === activeTab);
  return (
    <div className="effect-area">
      <div className="tab-list effect-tabs" role="tablist" aria-label={`${unit.name} 効果分類`}>
        {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={activeTab === id} onClick={() => setActiveTab(id)}>{label}</button>)}
      </div>
      {displayed.length === 0 ? <p className="muted compact">該当する効果なし</p> : (
        <ul className="effect-list">
          {displayed.map((effect) => {
            const expiry = activeTab === "active"
              ? effectExpiryLabel(effect.applied)
              : null;
            return (
              <li key={effect.key}>
                <button type="button" className={`effect-chip ${effect.combinedMembers ? "combined-effect" : ""}`} aria-label={`${effect.displayName}の詳細を表示`} title={`${effect.displayName}の詳細`} onClick={() => onDetail(effect)}>
                  {effect.iconPath ? <img src={effect.iconPath} alt="" /> : <span className="unspecified-icon">未指定</span>}
                  {effect.combinedMembers && effectHasDisplayValue({ effectType: effect.applied.effectType, value: effect.totalValue }) && <span className="effect-value-badge">{effectValueLabel(effect.applied, effect.totalValue)}</span>}
                  {expiry && <span className="effect-expiry-badge">{expiry}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface SkillDescriptor {
  kind: "ally" | "mystic";
  sourceInstanceId?: string;
  stableId: string;
  name: string;
  rank: string | null;
  slot: number;
  currentCooldown: number;
  cooldownAtMax: number;
  descriptions: string[];
  targetMode: "none" | "ally" | "order_change";
  disabledReason: string | null;
}

function SkillButton({ skill, onUse, onDetail }: { skill: SkillDescriptor; onUse: () => void; onDetail: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  function startLongPress(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      onDetail();
    }, 550);
  }
  function clearLongPress() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  const icon = registeredSkillIconPath(skill.name);
  return (
    <div className={`skill-control ${skill.disabledReason ? "control-disabled" : ""}`}>
      <button
        type="button"
        className="skill-icon-button"
        aria-disabled={Boolean(skill.disabledReason)}
        onPointerDown={startLongPress}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        onPointerLeave={clearLongPress}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          if (!skill.disabledReason) onUse();
        }}
      >
        {icon ? <img src={icon} alt="" /> : <span className="unspecified-icon">未指定</span>}
        <strong>{skill.name}</strong>
        <small>CT {skill.currentCooldown} / 使用時 {skill.cooldownAtMax}</small>
      </button>
      <button type="button" className="skill-detail-button" onClick={onDetail}>詳細</button>
      {skill.disabledReason && <span className="disabled-reason">{skill.disabledReason}</span>}
    </div>
  );
}

function CommandCardControl({
  choice,
  ownerLabel,
  selectedIndex,
  selectionBlocked,
  starAllocation,
  displayedCriticalRatePermille,
  includesSelectionBonus,
  detailBlocked,
  onToggle,
  onDetail,
}: {
  choice: CommandCardChoice;
  ownerLabel: string;
  selectedIndex: number;
  selectionBlocked: boolean;
  starAllocation: { stars: number; criticalRatePermille: number } | null;
  displayedCriticalRatePermille: number | null;
  includesSelectionBonus: boolean;
  detailBlocked: boolean;
  onToggle: () => void;
  onDetail?: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const card = choice.card;
  const label = card.kind === "noble_phantasm"
    ? card.noblePhantasmName
    : `${CARD_TYPE_LABELS[card.type]} ${card.cardIndex + 1}`;
  function startLongPress(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!onDetail || detailBlocked || (event.pointerType === "mouse" && event.button !== 0)) return;
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      onDetail();
    }, 550);
  }
  function clearLongPress() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  return (
    <div className={`command-card-control ${selectionBlocked ? "control-disabled" : ""}`}>
      <button
        type="button"
        className={`command-card ${card.type} ${selectedIndex >= 0 ? "selected" : ""}`}
        aria-disabled={selectionBlocked}
        aria-pressed={selectedIndex >= 0}
        title={onDetail ? `${label}（550ms以上の長押しで詳細）` : undefined}
        onPointerDown={startLongPress}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        onPointerLeave={clearLongPress}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          if (!selectionBlocked) onToggle();
        }}
      >
        <span className="card-order">{selectedIndex >= 0 ? `${selectedIndex + 1}枚目` : "未選択"}</span>
        <strong>{label}</strong>
        <small>{ownerLabel}</small>
        {starAllocation && displayedCriticalRatePermille !== null && <small className="chain-bonus">スター {starAllocation.stars}個・確定表示率 {displayedCriticalRatePermille / 10}%{includesSelectionBonus ? "（+20%込み）" : ""}</small>}
        {!choice.selectable && <small>{choice.executionRestrictions.join(" / ")}</small>}
        {selectionBlocked && choice.selectable && selectedIndex < 0 && <small>3枚選択中または演出中</small>}
      </button>
      {onDetail && <button type="button" className="card-detail-button" disabled={detailBlocked} onClick={onDetail}>詳細</button>}
    </div>
  );
}

function UnitPanel({
  unit,
  session,
  slotLabel,
  skills = [],
  onSkill,
  onDetail,
}: {
  unit: BattleUnitState;
  session: BattleSession;
  slotLabel: string;
  skills?: SkillDescriptor[];
  onSkill?: (skill: SkillDescriptor) => void;
  onDetail: (detail: DetailContent) => void;
}) {
  const attackData = session.registry.byInstanceId[unit.instanceId];
  const servantData = unit.side === "ally"
    ? servantDefinition(INITIAL_SERVANT_REGISTRY, unit.dataId)
    : null;
  const craftEssence = session.loop.state.loadout.craftEssencesByInstanceId[unit.instanceId];
  const wikiUrl = unit.side === "ally"
    ? registeredServantWikiUrl(unit.dataId)
    : null;
  return (
    <article className={`unit-card ${unit.alive ? "" : "unit-defeated"}`}>
      <div className="unit-title"><div><p className="unit-meta">{slotLabel} · {servantData?.classDisplayName ?? attackData?.classKey ?? "class未設定"}</p><h3>{wikiUrl ? <a className="servant-wiki-link" href={wikiUrl} target="_blank" rel="noreferrer noopener">{unit.name}</a> : unit.name}</h3></div><span className={`status-pill ${unit.alive ? "alive" : "defeated"}`}>{unit.alive ? "生存" : "退場"}</span></div>
      <dl className="stat-list">
        <div><dt>HP</dt><dd>{unit.hp.toLocaleString()} / {unit.maxHp.toLocaleString()}</dd></div>
        <div><dt>ATK</dt><dd>{attackData?.attack.toLocaleString() ?? "—"}</dd></div>
        {unit.side === "ally" ? <div><dt>NP</dt><dd>{formatNp(unit.np)}</dd></div> : <div><dt>チャージ</dt><dd>{unit.enemyAction?.charge ?? 0} / {unit.enemyAction?.chargeMax ?? 0}</dd></div>}
      </dl>
      <progress value={unit.hp} max={unit.maxHp} aria-label={`${unit.name} HP`} />
      {unit.side === "ally" && <p className="equipment-line">概念礼装：{craftEssence?.name ?? "未選択"}</p>}
      {skills.length > 0 && (
        <div className="unit-skill-row" aria-label={`${unit.name} 保有スキル`}>
          {skills.map((skill) => <SkillButton key={skill.stableId} skill={skill} onUse={() => onSkill?.(skill)} onDetail={() => onDetail({ kind: "skill", title: skill.name, rank: skill.rank, cooldown: skill.cooldownAtMax, descriptions: skill.descriptions })} />)}
        </div>
      )}
      <EffectTabs unit={unit} session={session} onDetail={(effect) => onDetail({ kind: "effect", effect })} />
    </article>
  );
}

function servantSkillRank(dataId: string, stableId: string): string | null {
  return INITIAL_SERVANT_DEFINITIONS.find(({ dataId: current }) => current === dataId)
    ?.activeSkills.find((skill) => skill.stableId === stableId)?.rank ?? null;
}

function actionUsesSingleTarget(action: BattleActionEffectSequence): boolean {
  return action.effects.some(({ target }) => target.relation !== "self" && target.selection === "single");
}

function firstLivingEnemyId(session: BattleSession): string {
  return session.loop.state.formation.enemy.frontline.find((unit) => unit?.alive)?.instanceId ?? "";
}

function LogEntry({ summary }: { summary: BattleLogSummary }) {
  return (
    <details className="log-entry">
      <summary><span><strong>{summary.title}</strong><small>{summary.status}</small></span><span className="log-facts">{summary.targetNames.length ? `対象: ${summary.targetNames.join("、")}` : "対象なし"}{summary.actualHpLoss !== null ? ` · 実HP減少 ${summary.actualHpLoss.toLocaleString()}` : ""}{summary.critical !== null ? ` · ${summary.critical ? "クリティカル" : "非クリティカル"}` : ""}</span>{summary.changes.length > 0 && <span className="log-changes">{summary.changes.join(" / ")}</span>}</summary>
      <div className="log-detail"><p>保存済み確定結果（詳細）</p><pre>{JSON.stringify(summary.detail, null, 2)}</pre></div>
    </details>
  );
}

function BattleLogs({ session }: { session: BattleSession }) {
  const [newestFirst, setNewestFirst] = useState(true);
  const turns = useMemo(() => presentBattleTurns(session.turnLogs, session.inputLogs), [session.turnLogs, session.inputLogs]);
  const displayed = newestFirst ? [...turns].reverse() : turns;
  return (
    <section className="panel" aria-labelledby="battle-log-heading">
      <div className="section-heading"><div><p className="section-kicker">LOG</p><h2 id="battle-log-heading">戦闘ログ</h2><p className="log-seed">今回のシード：<code>{session.loop.rng.seed}</code></p></div><label className="switch-label"><input type="checkbox" checked={newestFirst} onChange={(event) => setNewestFirst(event.target.checked)} />新しい順</label></div>
      {!session.inputLogsComplete && <p className="legacy-log-note">旧形式3から移行した保存には、移行前のスキル確定ログがありません。</p>}
      {displayed.length === 0 ? <p className="muted">成立したターンのログはまだありません。</p> : displayed.map((turn) => (
        <article className="turn-log" key={turn.id}>
          <h3>Wave {turn.waveNumber}・戦闘ターン {turn.battleTurn}</h3>
          {turn.sections.map((section) => (
            <details key={section.kind} className="turn-log-section" open={section.kind === "ally_action"}>
              <summary>{section.label}<span>{section.entries.length}件</span></summary>
              {section.entries.length ? <div className="log-list">{section.entries.map((entry) => <LogEntry key={entry.id} summary={entry} />)}</div> : <p className="muted compact">確定ログなし</p>}
            </details>
          ))}
        </article>
      ))}
    </section>
  );
}

function SuspendControls({
  session,
  lockedReason,
  onRestore,
}: {
  session: BattleSession;
  lockedReason: string | null;
  onRestore: (session: BattleSession) => void;
}) {
  const [saveJson, setSaveJson] = useState("");
  const [preview, setPreview] = useState<BattleSession | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  function generateSave(download: boolean) {
    if (lockedReason) return;
    try {
      const serialized = serializeBattleSuspendSave(session);
      setSaveJson(serialized);
      if (download) {
        const url = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `fgo-battle-suspend-${session.loop.rng.seed}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
      }
      setMessage(download ? "中断保存ファイルを書き出しました。" : "現在の入力境界をJSONへ書き出しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存に失敗しました。");
    }
  }
  function inspectSave() {
    if (lockedReason) return;
    try {
      setPreview(restoreBattleSession(parseBattleSuspendSave(saveJson)));
      setMessage("保存内容を確認しました。要約を確認して再開してください。");
      setFailed(false);
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof Error ? error.message : "再開に失敗しました。");
      setFailed(true);
    }
  }
  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSaveJson(await file.text());
    setPreview(null);
    setMessage("ファイルを読み込みました。内容を確認してください。");
  }
  return (
    <section className="panel suspend-panel" aria-labelledby="suspend-heading">
      <div className="section-heading"><div><p className="section-kicker">SAVE</p><h2 id="suspend-heading">保存・再開</h2></div></div>
      <BattleSummaryView session={session} />
      {lockedReason && <p className="disabled-notice">保存不可：{lockedReason}</p>}
      <div className="button-row"><button type="button" disabled={Boolean(lockedReason)} onClick={() => generateSave(false)}>JSONを生成</button><button type="button" disabled={Boolean(lockedReason)} onClick={() => generateSave(true)}>JSONファイルを書き出す</button></div>
      <label>JSONファイルを読み込む<input type="file" accept="application/json,.json" disabled={Boolean(lockedReason)} onChange={readFile} /></label>
      <label>中断保存JSON<textarea rows={9} value={saveJson} disabled={Boolean(lockedReason)} onChange={(event) => { setSaveJson(event.target.value); setPreview(null); }} placeholder="ここへ中断保存JSONを貼り付けてください" /></label>
      <div className="button-row"><button type="button" disabled={Boolean(lockedReason)} onClick={inspectSave}>保存内容を確認する</button>{preview && <button className="primary-button" type="button" onClick={() => onRestore(preview)}>この保存から再開する</button>}{failed && <button type="button" onClick={() => { setFailed(false); setMessage(""); }}>戻る</button>}</div>
      {preview && <BattleSummaryView session={preview} />}
      {message && <p className="operation-message" aria-live="polite">{message}</p>}
    </section>
  );
}

interface PendingSkillModal {
  skill: SkillDescriptor;
}

function SkillTargetModal({
  pending,
  session,
  onConfirm,
  onClose,
}: {
  pending: PendingSkillModal;
  session: BattleSession;
  onConfirm: (targetId?: string, orderChange?: { frontlineInstanceId: string; reserveInstanceId: string }) => void;
  onClose: () => void;
}) {
  const livingFrontline = session.loop.state.formation.ally.frontline.flatMap((unit, index) => unit?.alive ? [{ unit, index }] : []);
  const livingReserve = session.loop.state.formation.ally.reserve.flatMap((unit, index) => unit.alive ? [{ unit, index }] : []);
  const [targetId, setTargetId] = useState(livingFrontline[0]?.unit.instanceId ?? "");
  const [frontlineId, setFrontlineId] = useState(livingFrontline[0]?.unit.instanceId ?? "");
  const [reserveId, setReserveId] = useState(livingReserve[0]?.unit.instanceId ?? "");
  return (
    <Modal title={`${pending.skill.name}：対象選択`} onClose={onClose}>
      {pending.skill.targetMode === "ally" ? (
        <fieldset className="target-options"><legend>味方単体</legend>{livingFrontline.map(({ unit, index }) => <label className="radio-control" key={unit.instanceId}><input type="radio" name="skill-target" checked={targetId === unit.instanceId} onChange={() => setTargetId(unit.instanceId)} />前衛{index + 1}：{unit.name}</label>)}</fieldset>
      ) : (
        <div className="order-change-fields"><label>交換する前衛<select value={frontlineId} onChange={(event) => setFrontlineId(event.target.value)}>{livingFrontline.map(({ unit, index }) => <option key={unit.instanceId} value={unit.instanceId}>前衛{index + 1}：{unit.name}</option>)}</select></label><label>交換する控え<select value={reserveId} onChange={(event) => setReserveId(event.target.value)}>{livingReserve.map(({ unit, index }) => <option key={unit.instanceId} value={unit.instanceId}>控え{index + 1}：{unit.name}</option>)}</select></label></div>
      )}
      <div className="modal-actions"><button type="button" onClick={onClose}>キャンセル</button><button className="primary-button" type="button" disabled={pending.skill.targetMode === "ally" ? !targetId : !frontlineId || !reserveId} onClick={() => pending.skill.targetMode === "ally" ? onConfirm(targetId) : onConfirm(undefined, { frontlineInstanceId: frontlineId, reserveInstanceId: reserveId })}>決定</button></div>
    </Modal>
  );
}

function copySeed(seed: string, onMessage: (message: string) => void) {
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(seed).then(
      () => onMessage("今回のシードをコピーしました。"),
      () => onMessage(`コピーできませんでした。シード: ${seed}`),
    );
  } else {
    onMessage(`シード: ${seed}`);
  }
}

function ResultOverlay({ session, onReturn, onFixedSeed, onCopy, onRestartSameSeed, onRestartDifferentSeed }: { session: BattleSession; onReturn: () => void; onFixedSeed: () => void; onCopy: () => void; onRestartSameSeed: () => void; onRestartDifferentSeed: () => void }) {
  const state = session.loop.state;
  const status = presentBattleStatus(state, session.loop.rng.seed);
  const allies = [...state.formation.ally.frontline.filter((unit): unit is BattleUnitState => unit !== null), ...state.formation.ally.reserve];
  return (
    <div className="result-backdrop" role="presentation">
      <section className={`result-card ${state.outcome}`} role="dialog" aria-modal="true" aria-labelledby="result-heading" onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
        if (buttons.length === 0) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}>
        <p className="section-kicker">RESULT</p><h2 id="result-heading">{status.outcome}</h2>
        <dl className="detail-list"><div><dt>最終Wave</dt><dd>{status.wave}</dd></div><div><dt>ターン</dt><dd>{status.battleTurn}</dd></div><div><dt>今回のシード</dt><dd>{status.seed}</dd></div><div><dt>生存状況</dt><dd>{allies.map((unit) => `${unit.name}：${unit.alive ? `生存 HP ${unit.hp.toLocaleString()}` : "退場"}`).join(" / ")}</dd></div></dl>
        <div className="result-actions"><button className="primary-button" type="button" autoFocus onClick={onRestartSameSeed}>同じシードで戦闘をやり直す</button><button type="button" onClick={onRestartDifferentSeed}>違うシードで戦闘をやり直す</button><button type="button" onClick={onReturn}>設定へ戻る</button><button type="button" onClick={onCopy}>今回のシードをコピー</button><button type="button" onClick={onFixedSeed}>固定シードとして設定へ戻す</button></div>
      </section>
    </div>
  );
}

function ResourceTransitionBars({
  hpTransitions,
  npTransitions,
  damageAmounts,
}: {
  hpTransitions: ConfirmedHpTransition[];
  npTransitions: ConfirmedNpTransition[];
  damageAmounts: ConfirmedAttackDamage[];
}) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => setAnimated(true));
    return () => window.cancelAnimationFrame(animationFrame);
  }, []);
  if (hpTransitions.length === 0 && npTransitions.length === 0) return null;
  const damageByInstanceId = new Map(
    damageAmounts.map((damage) => [damage.instanceId, damage.damage]),
  );
  return (
    <div className="hp-transition-groups">
      {(["ally", "enemy"] as const).map((side) => {
        const sideTransitions = hpTransitions.filter((transition) => transition.side === side);
        if (sideTransitions.length === 0) return null;
        return (
          <section key={side} className="hp-transition-group" aria-label={side === "ally" ? "味方HP増減" : "敵HP増減"}>
            <h3>{side === "ally" ? "味方" : "敵"}</h3>
            {sideTransitions.map((transition) => {
              const displayedHp = animated ? transition.hpAfter : transition.hpBefore;
              const width = transition.maxHp <= 0
                ? 0
                : Math.max(0, Math.min(100, displayedHp / transition.maxHp * 100));
              const attackDamage = damageByInstanceId.get(transition.instanceId);
              return (
                <div key={transition.instanceId} className="hp-transition-row">
                  <div><strong>{transition.name}</strong>{attackDamage !== undefined && <span className="attack-damage">ダメージ {attackDamage.toLocaleString()}</span>}</div>
                  <div className="animated-hp-track" role="progressbar" aria-label={`${transition.name} HP`} aria-valuemin={0} aria-valuemax={transition.maxHp} aria-valuenow={displayedHp}><span style={{ width: `${width}%` }} /></div>
                  <small>{transition.hpBefore.toLocaleString()} → {transition.hpAfter.toLocaleString()} / {transition.maxHp.toLocaleString()}</small>
                </div>
              );
            })}
          </section>
        );
      })}
      {npTransitions.length > 0 && (
        <section className="np-transition-group" aria-label="味方NP増減">
          <h3>味方NP</h3>
          {npTransitions.map((transition) => {
            const displayedNp = animated ? transition.npAfter : transition.npBefore;
            const width = transition.maxNp <= 0
              ? 0
              : Math.max(0, Math.min(100, displayedNp / transition.maxNp * 100));
            const delta = transition.npAfter - transition.npBefore;
            return (
              <div key={transition.instanceId} className="np-transition-row">
                <div><strong>{transition.name}</strong><span className={delta < 0 ? "np-loss" : "np-gain"}>NP {delta > 0 ? "+" : ""}{formatNp(delta)}</span></div>
                <div className="animated-np-track" role="progressbar" aria-label={`${transition.name} NP`} aria-valuemin={0} aria-valuemax={transition.maxNp} aria-valuenow={displayedNp}><span style={{ width: `${width}%` }} /></div>
                <small>{formatNp(transition.npBefore)} → {formatNp(transition.npAfter)}</small>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

export function PlaybackOverlay({ notice, summaries, hpTransitions, npTransitions, damageAmounts, index, total, onPrevious, onNext, onSkip }: { notice: string; summaries: BattleLogSummary[]; hpTransitions: ConfirmedHpTransition[]; npTransitions: ConfirmedNpTransition[]; damageAmounts: ConfirmedAttackDamage[]; index: number; total: number; onPrevious: () => void; onNext: () => void; onSkip: () => void }) {
  return (
    <div className="playback-blocker" role="presentation">
      <section className="playback-notice" role="dialog" aria-modal="true" aria-labelledby="playback-heading" onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
        if (buttons.length === 0) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}>
        <div className="playback-heading-row">
          <p className="playback-counter">{index + 1} / {total}</p>
          <button className="playback-skip-button" type="button" aria-label="確定結果演出をスキップ" onClick={onSkip}>スキップ</button>
        </div>
        <strong id="playback-heading" aria-live="polite">{notice}</strong>
        <ResourceTransitionBars hpTransitions={hpTransitions} npTransitions={npTransitions} damageAmounts={damageAmounts} />
        {summaries.slice(0, 4).map((summary) => <span key={summary.id}>{summary.title}{summary.changes.length ? `：${summary.changes.join(" / ")}` : summary.actualHpLoss !== null ? `：HP -${summary.actualHpLoss.toLocaleString()}` : ""}</span>)}
        <div className="playback-actions"><button type="button" disabled={index === 0} onClick={onPrevious}>前へ</button><button className="primary-button" type="button" autoFocus onClick={onNext}>{index + 1 === total ? "次へ（操作へ戻る）" : "次へ"}</button></div>
      </section>
    </div>
  );
}

export function BattleScreen({
  session,
  onSessionChange,
  onReturnToSetup,
  onFixedSeedToSetup,
}: {
  session: BattleSession;
  onSessionChange: (session: BattleSession) => void;
  onReturnToSetup: () => void;
  onFixedSeedToSetup: (seed: string) => void;
}) {
  const canonicalState = session.loop.state;
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [targetInstanceId, setTargetInstanceId] = useState(() => firstLivingEnemyId(session));
  const [operationMessage, setOperationMessage] = useState("");
  const [allyTab, setAllyTab] = useState<"frontline" | "reserve" | "mystic">("frontline");
  const [detail, setDetail] = useState<DetailContent | null>(null);
  const [pendingSkill, setPendingSkill] = useState<PendingSkillModal | null>(null);
  const [playback, setPlayback] = useState<{
    finalSession: BattleSession;
    frames: Array<{
      notice: string;
      state: BattleState;
      summaries: BattleLogSummary[];
      hpTransitions: ConfirmedHpTransition[];
      npTransitions: ConfirmedNpTransition[];
      damageAmounts: ConfirmedAttackDamage[];
    }>;
    index: number;
  } | null>(null);
  const playbackFrame = playback?.frames[playback.index] ?? null;
  const state = playbackFrame?.state ?? canonicalState;
  const commandState = playback ? canonicalState : state;
  const battleStatus = presentBattleStatus(state, session.loop.rng.seed);
  const choices = commandState.outcome === "ongoing"
    ? listCommandCardChoices(commandState)
    : [];
  const threeSelected = selectedCardIds.length === 3;
  const interactionLock = playback ? "確定結果を再生中です。" : threeSelected ? "カードを3枚選択中です。選択解除または実行してください。" : null;

  useEffect(() => {
    if (!playback) return;
    const blockKeyboardInput = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest(".playback-notice")) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", blockKeyboardInput, true);
    return () => window.removeEventListener("keydown", blockKeyboardInput, true);
  }, [playback]);

  const unitsById = new Map([
    ...state.formation.ally.frontline,
    ...state.formation.ally.reserve,
    ...state.formation.enemy.frontline,
    ...state.formation.enemy.reserve,
  ].flatMap((unit) => unit ? [[unit.instanceId, unit] as const] : []));
  const frontlineSlotById = new Map(state.formation.ally.frontline.flatMap((unit, index) => unit ? [[unit.instanceId, index + 1] as const] : []));
  const selectedHasCriticalBonus = selectedChainCriticalBonus(selectedCardIds, choices.map(({ card }) => card));
  const quickSelectionBonusActive = choices.find(({ card }) => card.cardId === selectedCardIds[0])?.card.type === "quick";
  const noblePhantasmChoices = choices.filter(({ card }) => card.kind === "noble_phantasm");
  const normalCommandChoices = choices.filter(({ card }) => card.kind === "normal");

  function allySkills(unit: BattleUnitState): SkillDescriptor[] {
    const skills = session.actionEffectRegistry?.byInstanceId[unit.instanceId]?.actions
      .filter((action) => action.kind === "skill")
      .sort((left, right) => (left.skillSlot ?? 0) - (right.skillSlot ?? 0)) ?? [];
    return skills.map((skill) => {
      const slot = skill.skillSlot ?? 1;
      const cooldown = unit.skillCooldowns[slot - 1] ?? 0;
      const targetMode = actionUsesSingleTarget(skill) ? "ally" as const : "none" as const;
      const livingTargets = state.formation.ally.frontline.some((target) => target?.alive);
      const disabledReason = interactionLock
        ?? (!unit.alive ? "使用済み・退場中" : null)
        ?? (isActionDisabled(unit) ? "行動不能" : null)
        ?? (cooldown > 0 ? `CT中（残り${cooldown}）` : null)
        ?? (targetMode === "ally" && !livingTargets ? "対象不在" : null);
      return {
        kind: "ally" as const,
        sourceInstanceId: unit.instanceId,
        stableId: skill.stableId,
        name: skill.name,
        rank: servantSkillRank(unit.dataId, skill.stableId),
        slot,
        currentCooldown: cooldown,
        cooldownAtMax: skill.cooldownAtMax ?? 0,
        descriptions: skill.effects.flatMap(({ description }) => description.split("\n")),
        targetMode,
        disabledReason,
      };
    });
  }

  const selectedMystic = state.loadout.mysticCode;
  const mysticDefinition = selectedMystic && session.mysticCodeRegistry
    ? session.mysticCodeRegistry.byDataId[selectedMystic.dataId]
    : null;
  const mysticSkills: SkillDescriptor[] = (mysticDefinition?.skills ?? []).map((skill) => {
    const cooldown = state.mysticCodeCooldowns[skill.slot - 1] ?? 0;
    const targetMode = skill.execution === "order_change"
      ? "order_change" as const
      : mysticCodeSkillUsesSelectedUnitInput(skill) ? "ally" as const : "none" as const;
    const noTarget = targetMode === "ally"
      ? !state.formation.ally.frontline.some((unit) => unit?.alive)
      : targetMode === "order_change"
        ? !state.formation.ally.frontline.some((unit) => unit?.alive) || !state.formation.ally.reserve.some((unit) => unit.alive)
        : false;
    return {
      kind: "mystic",
      stableId: skill.stableId,
      name: skill.name,
      rank: null,
      slot: skill.slot,
      currentCooldown: cooldown,
      cooldownAtMax: skill.cooldownAtMax,
      descriptions: skill.effects.flatMap(({ description }) => description.split("\n")),
      targetMode,
      disabledReason: interactionLock ?? (cooldown > 0 ? `CT中（残り${cooldown}）` : null) ?? (noTarget ? "対象不在" : null),
    };
  });

  function resolveSkill(skill: SkillDescriptor, targetId?: string, orderChange?: { frontlineInstanceId: string; reserveInstanceId: string }) {
    if (skill.disabledReason) return;
    if (skill.kind === "ally") {
      const resolved = resolveBattleSessionAllySkill(session, {
        kind: "ally_skill",
        sourceInstanceId: skill.sourceInstanceId!,
        skillStableId: skill.stableId,
        ...(targetId ? { selectedTargetInstanceId: targetId } : {}),
      });
      onSessionChange(resolved.session);
      if (resolved.result.accepted && effectsRedistributedCommandCards(resolved.result.effects)) setSelectedCardIds((current) => selectedCardsAfterCommandRedistribution(current, true));
      setOperationMessage(resolved.result.accepted ? `${skill.name}が成立しました。` : ALLY_SKILL_REASON_LABELS[resolved.result.reason]);
    } else {
      const resolved = resolveBattleSessionMysticCodeSkill(session, {
        kind: "mystic_code_skill",
        skillStableId: skill.stableId,
        ...(targetId ? { selectedTargetInstanceId: targetId } : {}),
        ...(orderChange ? { orderChange } : {}),
      });
      onSessionChange(resolved.session);
      if (resolved.result.accepted && resolved.result.execution === "effects" && effectsRedistributedCommandCards(resolved.result.effects)) setSelectedCardIds((current) => selectedCardsAfterCommandRedistribution(current, true));
      setOperationMessage(resolved.result.accepted ? `${skill.name}が成立しました。` : MYSTIC_CODE_REASON_LABELS[resolved.result.reason]);
    }
    setPendingSkill(null);
  }

  function beginSkill(skill: SkillDescriptor) {
    if (skill.disabledReason) return;
    if (skill.targetMode === "none") resolveSkill(skill);
    else setPendingSkill({ skill });
  }

  function showPreviousPlaybackFrame() {
    if (!playback || playback.index === 0) return;
    setPlayback({ ...playback, index: playback.index - 1 });
  }

  function showNextPlaybackFrame() {
    if (!playback) return;
    if (playback.index + 1 < playback.frames.length) {
      setPlayback({ ...playback, index: playback.index + 1 });
      return;
    }
    finishPlayback("確定結果の確認が完了しました。");
  }

  function finishPlayback(message: string) {
    if (!playback) return;
    onSessionChange(playback.finalSession);
    setSelectedCardIds([]);
    setTargetInstanceId(firstLivingEnemyId(playback.finalSession));
    setOperationMessage(message);
    setPlayback(null);
  }

  function skipPlayback() {
    finishPlayback("確定結果の演出をスキップしました。");
  }

  function restartBattle(sameSeed: boolean) {
    if (playback) return;
    const restarted = sameSeed
      ? restartBattleSession(session)
      : restartBattleSessionWithSeed(session, generateReplayableSeed());
    onSessionChange(restarted);
    setSelectedCardIds([]);
    setTargetInstanceId(firstLivingEnemyId(restarted));
    setPendingSkill(null);
    setDetail(null);
    setAllyTab("frontline");
    setOperationMessage(sameSeed
      ? "同じシードで戦闘を最初からやり直しました。"
      : "違うシードで戦闘を最初からやり直しました。");
  }

  function executeTurn() {
    if (playback) return;
    const result = resolveBattleSessionTurn(session, {
      cardIds: selectedCardIds,
      ...(targetInstanceId ? { ally: { requestedTargetInstanceId: targetInstanceId } } : {}),
    });
    if (!result.result.accepted) {
      setOperationMessage(SELECTION_REASON_LABELS[result.result.selection.reason]);
      return;
    }
    const newLog = result.session.turnLogs[result.session.turnLogs.length - 1];
    const resolution = result.result.resolution;
    const presented = newLog ? presentBattleTurns([newLog], [])[0] : null;
    const section = (kind: "ally_action" | "ally_turn_end" | "enemy_action" | "enemy_turn_end") =>
      presented?.sections.find((candidate) => candidate.kind === kind)?.entries ?? [];
    type PlaybackFrame = { notice: string; state: BattleState; summaries: BattleLogSummary[]; hpTransitions: ConfirmedHpTransition[]; npTransitions: ConfirmedNpTransition[]; damageAmounts: ConfirmedAttackDamage[] };
    const chainFrames: PlaybackFrame[] = [];
    const hpFrames: PlaybackFrame[] = [];
    const turnEndFrames: PlaybackFrame[] = [];
    const waveFrames: PlaybackFrame[] = [];
    let previousState = canonicalState;
    const pushNotice = (
      target: PlaybackFrame[],
      notice: string,
      state: BattleState,
      summaries: BattleLogSummary[] = [],
    ) => target.push({ notice, state, summaries, hpTransitions: [], npTransitions: [], damageAmounts: [] });
    const pushResourceChanges = (
      nextState: BattleState,
      summaries: BattleLogSummary[] = [],
      options: {
        displayState?: BattleState;
        forceFrame?: boolean;
        notice?: string;
        persistentHpTransition?: ConfirmedHpTransition | null;
      } = {},
    ) => {
      const hpTransitions = confirmedHpTransitions(previousState, nextState);
      if (
        options.persistentHpTransition
        && !hpTransitions.some(({ instanceId }) =>
          instanceId === options.persistentHpTransition?.instanceId
        )
      ) {
        hpTransitions.push(options.persistentHpTransition);
      }
      const npTransitions = confirmedNpTransitions(previousState, nextState);
      if (
        hpTransitions.length > 0
        || npTransitions.length > 0
        || options.forceFrame
      ) {
        hpFrames.push({
          notice: options.notice ?? "敵・味方HP・NP増減",
          state: options.displayState ?? nextState,
          summaries,
          hpTransitions,
          npTransitions,
          damageAmounts: confirmedAttackDamageAmounts(summaries),
        });
      }
      previousState = nextState;
    };
    if (resolution.allyAttacks.sequence.accepted) {
      const sequence = resolution.allyAttacks.sequence.result;
      for (const notice of confirmedChainNotices(sequence.chain)) {
        pushNotice(chainFrames, notice, canonicalState);
      }
      const allySummaries = section("ally_action");
      sequence.actions.forEach((action, index) => {
        const actionPlayback = confirmedAllyActionPlayback(action);
        pushResourceChanges(
          action.boundary.state,
          allySummaries[index] ? [allySummaries[index]] : [],
          {
            displayState: actionPlayback.state,
            forceFrame: actionPlayback.keepsDefeatedTargetVisible,
            persistentHpTransition: actionPlayback.continuedTargetHp,
            notice: actionPlayback.keepsDefeatedTargetVisible
              ? "連続攻撃中"
              : undefined,
          },
        );
      });
    }
    if (resolution.allyTurnEnd) {
      pushResourceChanges(resolution.allyTurnEnd.state);
      pushNotice(turnEndFrames, "味方ターン終了", result.session.loop.state, section("ally_turn_end"));
      const allyEndRecord = newLog?.records.find((record) => record.recordType === "turn_end" && record.side === "ally");
      if (allyEndRecord?.recordType === "turn_end" && allyEndRecord.checkpoint.waveTransition) {
        pushNotice(waveFrames, "Wave突破", result.session.loop.state, section("ally_turn_end"));
      }
    }
    if (resolution.enemyAttacks) {
      const enemySummaries = section("enemy_action");
      resolution.enemyAttacks.sequence.actions.forEach((action, index) => {
        pushResourceChanges(
          action.boundary.state,
          enemySummaries[index] ? [enemySummaries[index]] : [],
        );
      });
    }
    if (resolution.enemyTurnEnd) {
      pushResourceChanges(resolution.enemyTurnEnd.state);
      pushNotice(turnEndFrames, "敵ターン終了", result.session.loop.state, section("enemy_turn_end"));
      const enemyEndRecord = newLog?.records.find((record) => record.recordType === "turn_end" && record.side === "enemy");
      if (enemyEndRecord?.recordType === "turn_end" && enemyEndRecord.checkpoint.waveTransition) {
        pushNotice(waveFrames, "Wave突破", result.session.loop.state, section("enemy_turn_end"));
      }
    }
    const frames = [
      ...chainFrames,
      ...hpFrames,
      ...turnEndFrames,
      ...waveFrames,
    ];
    if (frames.length === 0) {
      frames.push({
        notice: newLog ? confirmedPlaybackNotices(newLog)[0] ?? "確定結果を再生中" : "確定結果を再生中",
        state: result.session.loop.state,
        summaries: [],
        hpTransitions: [],
        npTransitions: [],
        damageAmounts: [],
      });
    }
    setPlayback({ finalSession: result.session, frames, index: 0 });
  }

  function renderCommandCard(choice: CommandCardChoice) {
    const card = choice.card;
    const owner = unitsById.get(card.ownerInstanceId);
    const selectedIndex = selectedCardIds.indexOf(card.cardId);
    const unselectedLock = threeSelected && selectedIndex < 0;
    const starAllocation = card.kind === "normal"
      ? commandState.commandStarDistribution?.cards.find(({ cardId }) => cardId === card.cardId) ?? null
      : null;
    const includesSelectionBonus = Boolean(
      starAllocation
      && (quickSelectionBonusActive || (selectedHasCriticalBonus && selectedIndex >= 0)),
    );
    const displayedCriticalRate = starAllocation
      ? displayedCommandCardCriticalRatePermille(
          card.cardId,
          starAllocation.criticalRatePermille,
          selectedCardIds,
          choices.map(({ card: candidate }) => candidate),
        )
      : null;
    const noblePhantasmDetail = card.kind === "noble_phantasm"
      ? presentNoblePhantasmDetail(owner ?? null)
      : null;
    return (
      <CommandCardControl
        key={card.cardId}
        choice={choice}
        ownerLabel={`前衛${frontlineSlotById.get(card.ownerInstanceId) ?? "—"}・${owner?.name ?? card.ownerInstanceId}`}
        selectedIndex={selectedIndex}
        selectionBlocked={!choice.selectable || unselectedLock || Boolean(playback)}
        starAllocation={starAllocation}
        displayedCriticalRatePermille={displayedCriticalRate}
        includesSelectionBonus={includesSelectionBonus}
        detailBlocked={threeSelected || Boolean(playback)}
        onToggle={() => setSelectedCardIds((current) => toggleSelectedCommandCard(current, card.cardId))}
        {...(noblePhantasmDetail ? { onDetail: () => setDetail({ kind: "noble_phantasm", ...noblePhantasmDetail }) } : {})}
      />
    );
  }

  return (
    <main className="app-shell battle-shell">
      <section className="battle-header panel" aria-labelledby="status-heading">
        <div><p className="eyebrow">{EMBER_GATHERING_SABER_EXTREME.name}</p><h1 id="status-heading">戦闘状況</h1></div>
        <dl className="battle-meta"><div><dt>Wave</dt><dd>{battleStatus.wave}</dd></div><div><dt>戦闘ターン</dt><dd>{battleStatus.battleTurn}</dd></div><div><dt>Waveターン</dt><dd>{battleStatus.waveTurn}</dd></div><div><dt>結果</dt><dd>{battleStatus.outcome}</dd></div><div className="seed-meta"><dt>今回のシード</dt><dd>{battleStatus.seed}</dd></div></dl>
        <div className="button-row seed-actions"><button type="button" disabled={Boolean(playback)} onClick={() => restartBattle(true)}>同じシードで戦闘をやり直す</button><button type="button" disabled={Boolean(playback)} onClick={() => restartBattle(false)}>違うシードで戦闘をやり直す</button><button type="button" disabled={Boolean(playback)} onClick={() => copySeed(battleStatus.seed, setOperationMessage)}>今回のシードをコピー</button><button type="button" disabled={threeSelected || Boolean(playback)} onClick={() => onFixedSeedToSetup(battleStatus.seed)}>固定シードとして設定へ戻す</button></div>
      </section>

      <section className="panel" aria-labelledby="enemy-heading">
        <div className="section-heading"><div><p className="section-kicker">ENEMY</p><h2 id="enemy-heading">敵前衛</h2></div><span className="badge">3列表示</span></div>
        <div className="unit-grid enemy-grid">{state.formation.enemy.frontline.map((unit, index) => unit ? <div key={unit.instanceId} className="target-unit">{state.outcome === "ongoing" && unit.alive && <label className={`target-selector ${threeSelected ? "control-disabled" : ""}`}><input type="radio" name="enemy-target" disabled={threeSelected} checked={targetInstanceId === unit.instanceId} onChange={() => setTargetInstanceId(unit.instanceId)} />攻撃対象（敵前衛{index + 1}）</label>}<UnitPanel unit={unit} session={session} slotLabel={`敵前衛${index + 1}`} onDetail={setDetail} /></div> : <div key={`empty-enemy-${index}`} className="empty-slot">敵前衛{index + 1}：空き</div>)}</div>
      </section>

      <section className="panel" aria-labelledby="ally-heading">
        <div className="section-heading"><div><p className="section-kicker">ALLY</p><h2 id="ally-heading">味方前衛・控え・魔術礼装</h2></div><span className="badge">スター {state.commandStars}</span></div>
        <div className="tab-list ally-tabs" role="tablist" aria-label="味方領域">{(["frontline", "reserve", "mystic"] as const).map((tab, index) => <button key={tab} type="button" role="tab" aria-selected={allyTab === tab} onClick={() => setAllyTab(tab)}>{["前衛", "控え", "魔術礼装"][index]}</button>)}</div>
        {allyTab === "frontline" && <><div className="unit-grid">{state.formation.ally.frontline.map((unit, index) => unit ? <UnitPanel key={unit.instanceId} unit={unit} session={session} slotLabel={`前衛${index + 1}`} skills={state.outcome === "ongoing" ? allySkills(unit) : []} onSkill={beginSkill} onDetail={setDetail} /> : <div key={`empty-ally-${index}`} className="empty-slot">前衛{index + 1}：空き</div>)}</div>{state.outcome === "ongoing" && mysticSkills.length > 0 && <article className="mystic-skills"><h3>魔術礼装スキル</h3><div className="unit-skill-row">{mysticSkills.map((skill) => <SkillButton key={skill.stableId} skill={skill} onUse={() => beginSkill(skill)} onDetail={() => setDetail({ kind: "skill", title: skill.name, rank: null, cooldown: skill.cooldownAtMax, descriptions: skill.descriptions })} />)}</div></article>}</>}
        {allyTab === "reserve" && <div className="unit-grid">{state.formation.ally.reserve.length ? state.formation.ally.reserve.map((unit, index) => <UnitPanel key={unit.instanceId} unit={unit} session={session} slotLabel={`控え${index + 1}`} onDetail={setDetail} />) : <div className="empty-slot">控えなし</div>}</div>}
        {allyTab === "mystic" && <article className="mystic-overview"><h3>{state.loadout.mysticCode?.name ?? "未選択"}</h3><p>スキルLv最大</p><p>現在CT：{state.mysticCodeCooldowns.join(" / ") || "—"}</p><p className="muted">魔術礼装スキルの操作は「前衛」タブの最下部に表示します。</p></article>}
      </section>

      <section className="panel command-panel" aria-labelledby="command-heading">
        <div className="section-heading"><div><p className="section-kicker">COMMAND</p><h2 id="command-heading">コマンドカード・実行</h2></div><span className="badge">選択 {selectedCardIds.length} / 3枚</span></div>
        {state.outcome === "ongoing" ? <><p className="muted">3枚選択中は、未選択カード・対象変更・スキル・保存・設定復帰をロックします。宝具カードは550ms以上の長押しまたは詳細ボタンで登録済み効果を確認できます。</p>{noblePhantasmChoices.length > 0 && <section className="card-row" aria-labelledby="noble-card-heading"><h3 id="noble-card-heading">宝具カード</h3><div className="card-grid noble-phantasm-card-grid">{noblePhantasmChoices.map(renderCommandCard)}</div></section>}<section className="card-row" aria-labelledby="normal-card-heading"><h3 id="normal-card-heading">コマンドカード</h3><div className="card-grid normal-command-card-grid">{normalCommandChoices.map(renderCommandCard)}</div></section><div className="sticky-actions battle-actions"><button type="button" disabled={selectedCardIds.length === 0 || Boolean(playback)} onClick={() => setSelectedCardIds([])}>カード選択を解除</button><button className="primary-button" type="button" disabled={selectedCardIds.length !== 3 || Boolean(playback)} onClick={executeTurn}>選択カードで1ターン実行</button></div></> : <p className="muted">戦闘は終了しました。確定した戦闘画面を保持しています。</p>}
        {operationMessage && <p className="operation-message" aria-live="polite">{operationMessage}</p>}
      </section>

      <BattleLogs session={session} />
      <SuspendControls session={session} lockedReason={interactionLock} onRestore={(restored) => { onSessionChange(restored); setSelectedCardIds([]); setTargetInstanceId(firstLivingEnemyId(restored)); setOperationMessage("中断保存から直接再開しました。"); }} />
      <button className="text-button" type="button" disabled={threeSelected || Boolean(playback)} onClick={onReturnToSetup}>現在の戦闘を閉じて設定画面へ戻る</button>

      {detail && <DetailModal detail={detail} onClose={() => setDetail(null)} />}
      {pendingSkill && <SkillTargetModal pending={pendingSkill} session={session} onConfirm={(targetId, orderChange) => resolveSkill(pendingSkill.skill, targetId, orderChange)} onClose={() => setPendingSkill(null)} />}
      {playbackFrame && playback && <PlaybackOverlay key={playback.index} notice={playbackFrame.notice} summaries={playbackFrame.summaries} hpTransitions={playbackFrame.hpTransitions} npTransitions={playbackFrame.npTransitions} damageAmounts={playbackFrame.damageAmounts} index={playback.index} total={playback.frames.length} onPrevious={showPreviousPlaybackFrame} onNext={showNextPlaybackFrame} onSkip={skipPlayback} />}
      {state.outcome !== "ongoing" && !playback && <ResultOverlay session={session} onReturn={onReturnToSetup} onFixedSeed={() => onFixedSeedToSetup(session.loop.rng.seed)} onCopy={() => copySeed(session.loop.rng.seed, setOperationMessage)} onRestartSameSeed={() => restartBattle(true)} onRestartDifferentSeed={() => restartBattle(false)} />}
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
      // Browser storage is optional; current input remains usable.
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
    return <BattleScreen session={session} onSessionChange={setSession} onReturnToSetup={() => setSession(null)} onFixedSeedToSetup={(seed) => {
      setSetup((current) => ({ ...current, seedMode: "fixed", seed }));
      setSession(null);
    }} />;
  }
  return <><SetupScreen setup={setup} onSetupChange={setSetup} onStart={startBattle} onRestore={(restored) => { setSession(restored); setStartError(""); }} />{startError && <p className="fatal-message" role="alert">{startError}</p>}</>;
}
