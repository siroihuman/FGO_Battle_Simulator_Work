import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import process from "node:process";

const errors = [];

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readText(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    errors.push(`${path} を読み込めません: ${error.message}`);
    return "";
  }
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const manifestText = await readText("project-manifest.json");
let manifest;

try {
  manifest = JSON.parse(manifestText);
} catch (error) {
  errors.push(`project-manifest.json が正しいJSONではありません: ${error.message}`);
}

if (manifest) {
  assert(/^\d+\.\d+\.\d+$/.test(manifest.specVersion), "specVersion は x.y.z 形式である必要があります");
  assert(manifest.coreRules.battleType === "annihilation_only", "戦闘形式は全滅戦だけでなければなりません");
  assert(manifest.coreRules.specialVictoryConditions === false, "特殊勝利条件は無効でなければなりません");
  assert(manifest.coreRules.specialDefeatConditions === false, "特殊敗北条件は無効でなければなりません");
  assert(manifest.coreRules.maxWaves === 3, "最大Wave数は3でなければなりません");
  assert(manifest.coreRules.allyFrontlineRequired === 3, "味方前衛必須数は3でなければなりません");
  assert(manifest.coreRules.allyReserveMax === 3, "味方控え上限は3でなければなりません");
  assert(manifest.coreRules.enemyTotalMax === 99, "敵参加上限は99でなければなりません");
  assert(
    JSON.stringify(manifest.coreRules.enemyActiveModes) === JSON.stringify([3, 6]),
    "敵同時出現モードは3体と6体でなければなりません"
  );
  assert(manifest.coreRules.enemyNormalActionBudget === 3, "敵の通常行動予算は3でなければなりません");
  assert(
    JSON.stringify(manifest.coreRules.enemyIndividualMaxActions) === JSON.stringify(["auto", 1, 2, 3]),
    "敵個別行動上限は自動・1・2・3でなければなりません"
  );
  assert(
    manifest.coreRules.enemyPrioritySkillsConsumeNormalActions === false,
    "敵優先スキルは通常行動回数を消費してはいけません"
  );
  assert(
    manifest.coreRules.completedActionBoundary === true,
    "死亡・補充は完了済み行動の境界で処理しなければなりません"
  );
  assert(
    manifest.coreRules.enemyRetargetOrder === "rear_then_wrap",
    "対象消滅後は後方枠から前方へ回り込まなければなりません"
  );
  assert(
    manifest.coreRules.immediateReplacementUnconditionalTargetPriority === false,
    "即時補充された敵を無条件に優先してはいけません"
  );
  assert(
    manifest.coreRules.allySelectedCommandActionCount === 3,
    "味方の選択コマンド行動数は3でなければなりません"
  );
  assert(
    manifest.coreRules.extraAttackAfterBraveChain === true,
    "Braveチェイン後はExtra Attackを予定しなければなりません"
  );
  assert(
    manifest.coreRules.commandExecutionRecheckedPerAction === true,
    "各コマンド行動は実行直前に再確認しなければなりません"
  );
  assert(
    manifest.coreRules.stopCommandSequenceWithoutEnemyTarget === true,
    "敵対象が尽きた後は残りコマンド行動を開始してはいけません"
  );
  assert(
    manifest.coreRules.enemyPriorityBeforeNormalPlan === true,
    "敵優先スキル完了後に通常行動予定を作らなければなりません"
  );
  assert(
    manifest.coreRules.enemyDefaultActionPolicy === "full_np_else_normal_attack",
    "敵の最小既定行動はフルチャージ宝具、それ以外は通常攻撃でなければなりません"
  );
  assert(
    manifest.coreRules.enemyReplacementInheritsPlannedSlots === false,
    "途中登場した敵は退場者の予定済み行動枠を引き継いではいけません"
  );
  assert(
    manifest.coreRules.stopEnemySequenceOnAllyAnnihilation === true,
    "味方全滅後は残り敵行動を開始してはいけません"
  );
  assert(
    manifest.coreRules.damageRandomDrawsPerAllowedTarget === 1,
    "ダメージを許可された対象ごとのダメージ乱数は1回でなければなりません"
  );
  assert(
    manifest.coreRules.multiTargetHitOrder === "hit_then_frontline",
    "複数対象攻撃はHit番号、前衛枠順で処理しなければなりません"
  );
  assert(
    manifest.coreRules.sourceAttackStateConsumesPerTarget === false,
    "攻撃側状態を全体攻撃の対象ごとに消費してはいけません"
  );
  assert(
    manifest.coreRules.protectionAllowsNpAndStarWork === true,
    "防御によるダメージ無効後もNP・スター処理を継続しなければなりません"
  );
  assert(
    JSON.stringify(manifest.coreRules.attackTriggerOrder) === JSON.stringify([
      "before_attack",
      "on_hit_per_hit_batch",
      "on_attack",
      "on_damage_taken_per_target",
      "after_attack",
      "on_death"
    ]),
    "攻撃トリガーは攻撃前、Hit、攻撃時、被ダメージ時、攻撃後、死亡時の順でなければなりません"
  );
  assert(
    manifest.coreRules.damageTakenTriggerAfterProtectionBlock === true,
    "ダメージ無効時も無条件の被ダメージ時トリガーを処理しなければなりません"
  );
  assert(
    manifest.coreRules.gutsSuppressesDeathTrigger === true,
    "ガッツ復活時に死亡時トリガーを処理してはいけません"
  );
  assert(
    manifest.coreRules.beforeDamageInstantDeathStopsAttackHits === true,
    "ダメージ前即死成功後は攻撃Hitを開始してはいけません"
  );
  assert(
    manifest.coreRules.attackDataIdentity === "battle_instance_id",
    "攻撃データは戦闘個体IDへ結び付けなければなりません"
  );
  assert(
    manifest.coreRules.duplicateDataIdsMayUseDifferentAttackData === true,
    "同じサーヴァントデータIDでも個体ごとに別の攻撃値を許可しなければなりません"
  );
  assert(
    manifest.coreRules.attackInputPreparedAfterBeforeAttack === true,
    "計算入力は攻撃前効果の反映後に構築しなければなりません"
  );
  assert(
    manifest.coreRules.missingEnemyAttackNumericData === "safe_noop",
    "敵攻撃数値の未設定は安全な不発として扱わなければなりません"
  );
  assert(
    manifest.coreRules.defaultEnemySingleTarget === "frontmost_living_ally",
    "最小敵攻撃の単体対象は先頭の生存味方でなければなりません"
  );
  assert(
    JSON.stringify(manifest.coreRules.cardResistanceAppliesTo) === JSON.stringify([
      "damage",
      "attack_np",
      "stars"
    ]),
    "カード耐性はダメージ・攻撃時NP・スターへ共通適用しなければなりません"
  );
  assert(manifest.coreRules.maxBreakGauges === 10, "ブレイクゲージ上限は10でなければなりません");
  assert(manifest.coreRules.starCap === 99, "スター上限は99でなければなりません");
  assert(
    JSON.stringify(manifest.coreRules.starBuckets) === JSON.stringify(["command", "next_command"]),
    "スターは現在使用分と次回味方コマンド用の2区分でなければなりません"
  );
  assert(
    manifest.coreRules.attackGeneratedStarsDestination === "next_command",
    "攻撃で発生したスターは次回味方コマンド用へ加算しなければなりません"
  );
  assert(
    manifest.coreRules.quickChainStarsDestination === "next_command",
    "Quickチェインのスターは次回味方コマンド用へ加算しなければなりません"
  );
  assert(
    manifest.coreRules.starCarryBeyondNextCommandPhase === false,
    "未使用スターを次の次の味方コマンドへ持ち越してはいけません"
  );
  assert(
    manifest.coreRules.artsChainNpTiming === "before_first_command",
    "ArtsチェインNPは最初のコマンド開始前に加算しなければなりません"
  );
  assert(
    manifest.coreRules.artsChainUniqueByInstanceId === true,
    "ArtsチェインNPは戦闘個体ごとに1回だけ加算しなければなりません"
  );
  assert(
    JSON.stringify(manifest.coreRules.commandStarRandomBonuses) === JSON.stringify([50, 20, 20, 0, 0]),
    "手札5枚のスター集中度ランダム補正は50・20・20・0・0でなければなりません"
  );
  assert(
    manifest.coreRules.commandStarDistributionCap === 50,
    "カードへ配分するスターは最大50個でなければなりません"
  );
  assert(
    manifest.coreRules.commandStarPerCardCap === 10,
    "カード1枚へ配分するスターは最大10個でなければなりません"
  );
  assert(
    manifest.coreRules.criticalRatePermillePerStar === 100,
    "スター1個はクリティカル率10%でなければなりません"
  );
  assert(
    manifest.coreRules.commandStarDistributionRng === "critical",
    "スター配分はクリティカル用乱数列を使わなければなりません"
  );
  assert(
    manifest.coreRules.fixedCriticalRatesConsumeRng === false,
    "クリティカル率0%・100%は乱数を消費してはいけません"
  );
  assert(
    manifest.coreRules.battleLogSchemaVersion === 4,
    "戦闘ログ形式バージョンは4でなければなりません"
  );
  assert(
    manifest.coreRules.battleLogGranularity === "completed_action",
    "戦闘ログは完了済み1行動単位で記録しなければなりません"
  );
  assert(
    JSON.stringify(manifest.coreRules.battleLogIncludes) === JSON.stringify([
      "outcome",
      "calculation",
      "declared_effects",
      "hits",
      "triggers",
      "departures",
      "arrivals",
      "retargeting",
      "rng_audit"
    ]),
    "戦闘ログの必須詳細が一致しません"
  );
  assert(
    manifest.coreRules.battleLogJsonSerializable === true,
    "戦闘ログはJSONへ保存可能でなければなりません"
  );
  assert(
    manifest.coreRules.rngAuditChangesSequence === false,
    "乱数監査で抽選結果や乱数位置を変更してはいけません"
  );
  assert(
    manifest.coreRules.fixedChanceAuditDraws === 0,
    "確率0%・100%の監査記録は乱数を消費してはいけません"
  );
  assert(
    JSON.stringify(manifest.coreRules.battleTurnStageOrder) === JSON.stringify([
      "ally_command",
      "ally_turn_end",
      "enemy_turn",
      "enemy_turn_end"
    ]),
    "1戦闘ターンの処理順が一致しません"
  );
  assert(
    manifest.coreRules.acceptedCommandRequiresTurnEnd === true,
    "成立した味方コマンド列の後は味方ターン終了を省略してはいけません"
  );
  assert(
    JSON.stringify(manifest.coreRules.enemyTurnSkippedAfterAllyCheckpoint) === JSON.stringify([
      "battle_finished",
      "wave_advanced"
    ]),
    "味方終了時判定後に敵ターンを省略する条件が一致しません"
  );
  assert(
    manifest.coreRules.battleTurnRngSource === "single_battle_rng",
    "1戦闘ターンは単一のBattleRngから用途別乱数列を受け取らなければなりません"
  );
  assert(
    manifest.coreRules.battleTurnLogSchemaVersion === 1,
    "1戦闘ターンログ形式バージョンは1でなければなりません"
  );
  assert(
    JSON.stringify(manifest.coreRules.battleTurnLogRecordOrder) === JSON.stringify([
      "ally_action_batch",
      "ally_turn_end",
      "enemy_action_batch",
      "enemy_turn_end"
    ]),
    "1戦闘ターンログの記録順が一致しません"
  );
  assert(
    JSON.stringify(manifest.coreRules.battleTurnLogIncludes) === JSON.stringify([
      "seed",
      "rng_positions",
      "turn_end_activations",
      "breaks",
      "hp_settlements",
      "durations",
      "cooldowns",
      "replacements",
      "wave_transition",
      "battle_outcome"
    ]),
    "1戦闘ターンログの必須詳細が一致しません"
  );
  assert(
    manifest.coreRules.battleTurnLogJsonSerializable === true,
    "1戦闘ターンログはJSONへ保存可能でなければなりません"
  );
  assert(
    manifest.coreRules.servantDataSchemaVersion === 1,
    "サーヴァントデータ形式バージョンは1でなければなりません"
  );
  assert(
    manifest.coreRules.servantDataIdentity === "stable_project_id",
    "サーヴァントデータは安定したプロジェクトIDを使わなければなりません"
  );
  assert(
    manifest.coreRules.servantSourcePageNumberMayBeDataId === false,
    "参照ページ番号をサーヴァント内部IDにしてはいけません"
  );
  assert(
    manifest.coreRules.servantContentRevision === "current_upgraded_only",
    "サーヴァントは強化後の現行データだけでなければなりません"
  );
  assert(
    manifest.coreRules.servantActiveSkillCount === 3,
    "サーヴァントの保有スキルは上位3つでなければなりません"
  );
  assert(
    manifest.coreRules.servantNoblePhantasmCount === 1,
    "サーヴァントの宝具は上位1つでなければなりません"
  );
  assert(
    manifest.coreRules.servantClassSkillCoverage === "all",
    "サーヴァントのクラススキルはすべて登録しなければなりません"
  );
  assert(
    manifest.coreRules.servantEffectOrder === "source_order_contiguous_from_1",
    "サーヴァント効果は資料順に1から連続登録しなければなりません"
  );
  assert(
    manifest.coreRules.servantDuplicateInstanceSelectionsIndependent === true,
    "重複サーヴァントは個体別にLvと宝具Lvを選べなければなりません"
  );
  assert(
    manifest.coreRules.servantUnresolvedEffectsExplicit === true,
    "未接続のサーヴァント効果を明示しなければなりません"
  );
  assert(
    JSON.stringify(manifest.coreRules.declaredActionValueScaling) === JSON.stringify([
      "fixed",
      "noble_phantasm_level",
      "overcharge"
    ]),
    "宣言効果の数値は固定・宝具Lv別・OC別でなければなりません"
  );
  assert(
    manifest.coreRules.declaredActionSingleTargetResolvedAtExecution === true,
    "宣言効果の単体対象は実行時に解決しなければなりません"
  );
  assert(
    manifest.coreRules.declaredActionUnsupportedPolicy === "reject_before_state_or_rng_change",
    "未対応の宣言効果は状態・乱数変更前に拒否しなければなりません"
  );
  assert(
    JSON.stringify(manifest.coreRules.declaredUnitStateActions) === JSON.stringify([
      "advance_skill_cooldowns",
      "increase_np_by_current_rate",
      "change_enemy_charge",
      "gain_stars"
    ]),
    "宣言効果の戦闘状態操作一覧が一致しません"
  );
  assert(
    manifest.coreRules.declaredSkillCooldownMinimum === 0,
    "スキルCT短縮は0未満にしてはいけません"
  );
  assert(
    manifest.coreRules.declaredCurrentNpIncreaseRateUnit === "permille_of_current_np",
    "現在NP倍率の単位は現在NPに対するpermilleでなければなりません"
  );
  assert(
    manifest.coreRules.declaredEnemyChargeRange === "zero_to_charge_max",
    "敵チャージ増減は0から最大値の範囲でなければなりません"
  );
  assert(
    JSON.stringify(manifest.coreRules.declaredStarGainDestinations) === JSON.stringify([
      "command",
      "next_command"
    ]),
    "宣言スター獲得は現在使用分と次回用を明示しなければなりません"
  );
  assert(
    JSON.stringify(manifest.coreRules.attackTriggerContextFields) === JSON.stringify([
      "attack_kind",
      "card_type"
    ]),
    "攻撃トリガー文脈は攻撃種別とカード種別を保持しなければなりません"
  );
  assert(
    JSON.stringify(manifest.coreRules.conditionalAttackTriggerKinds) === JSON.stringify([
      "normal_command",
      "noble_phantasm",
      "extra_attack",
      "enemy_normal_attack"
    ]),
    "条件付き攻撃トリガーの攻撃種別一覧が一致しません"
  );
  assert(
    JSON.stringify(manifest.coreRules.conditionalAttackTriggerCardTypes) === JSON.stringify([
      "quick",
      "arts",
      "buster",
      "extra"
    ]),
    "条件付き攻撃トリガーのカード種別一覧が一致しません"
  );
  assert(
    manifest.coreRules.conditionalAttackTriggerMismatchConsumesUse === false,
    "攻撃条件不一致時にトリガー回数を消費してはいけません"
  );
  assert(
    manifest.coreRules.conditionalAttackTriggerMismatchConsumesRng === false,
    "攻撃条件不一致時に効果乱数を消費してはいけません"
  );
  assert(
    manifest.coreRules.triggerStarGainDestinationRequired === true,
    "トリガーのスター獲得は加算先を必須指定しなければなりません"
  );
  assert(
    manifest.coreRules.turnEndTriggerStarGain === "not_yet_supported",
    "ターン終了トリガーのスター獲得対応状態が一致しません"
  );
  assert(
    manifest.coreRules.noblePhantasmCardTypeChangeCategory === "buff",
    "宝具カード種別変更は強化状態でなければなりません"
  );
  assert(
    manifest.coreRules.noblePhantasmCardTypeChangeMutatesIntrinsicType === false,
    "宝具カード種別変更で固有の宝具カード種別を書き換えてはいけません"
  );
  assert(
    manifest.coreRules.noblePhantasmCardTypeChangeOverlapPriority === "latest_registration",
    "重複した宝具カード種別変更は最新登録を優先しなければなりません"
  );
  assert(
    JSON.stringify(manifest.coreRules.noblePhantasmCardTypeChangePreserves) === JSON.stringify([
      "hit_count",
      "attack_np_rate",
      "noble_phantasm_level",
      "np_gauge"
    ]),
    "宝具カード種別変更で維持する値が一致しません"
  );
  assert(
    manifest.coreRules.commandSelectionUsesEffectiveNoblePhantasmCardType === true,
    "コマンド選択は現在有効な宝具カード種別を使わなければなりません"
  );
  assert(
    manifest.coreRules.noblePhantasmCardTypeRecheckedBeforeExecution === true,
    "宝具カード種別は実行直前に再確認しなければなりません"
  );
  assert(
    JSON.stringify(manifest.coreRules.noblePhantasmDeclaredSequenceOrder) === JSON.stringify([
      "common_before_attack",
      "declared_before_attack",
      "hits_on_hit_on_attack_on_damage_taken",
      "common_after_attack",
      "declared_after_attack",
      "on_death",
      "completed_action_boundary"
    ]),
    "宝具の宣言効果・攻撃・死亡・行動境界の順序が一致しません"
  );
  assert(
    manifest.coreRules.declaredPreAttackRebuildsActiveTargets === true,
    "宝具攻撃前効果後は生存対象から攻撃入力を再構築しなければなりません"
  );
  assert(
    JSON.stringify(manifest.coreRules.effectiveTraitSources) === JSON.stringify(["base", "active_trait_grants"]),
    "有効特性は基礎特性と付与中の特性状態から構築しなければなりません"
  );
  assert(
    manifest.coreRules.traitGrantMutatesBaseTraits === false,
    "特性付与状態を基礎特性へ書き込んではいけません"
  );
  assert(
    manifest.coreRules.duplicateTraitGrantLifetimesIndependent === true,
    "重複した特性付与状態の期限は独立していなければなりません"
  );
  assert(
    manifest.coreRules.conditionalNpSpecialAttackTraitMatch === "all_required_traits",
    "条件付き宝具特攻は必須対象特性をすべて満たす場合だけ成立しなければなりません"
  );
  assert(
    manifest.coreRules.conditionalNpSpecialAttackTiming === "after_declared_pre_attack",
    "条件付き宝具特攻は宝具攻撃前宣言効果後に判定しなければなりません"
  );
  assert(
    manifest.coreRules.conditionalNpSpecialAttackMismatchPermille === 1000,
    "条件不一致の宝具特殊威力は100%でなければなりません"
  );
  assert(
    manifest.coreRules.unresolvedDeclaredActionConsumesNpOrCharge === false,
    "未対応宣言効果は宝具NP・敵チャージを消費してはいけません"
  );
  assert(
    manifest.coreRules.enemySkillSingleTargetSource === "ai_request",
    "敵スキルの単体対象はAI要求から渡さなければなりません"
  );
  assert(
    manifest.coreRules.enemySkillCompletedActionBoundary === true,
    "敵スキル効果後は完了済み行動境界を通らなければなりません"
  );
  assert(
    manifest.coreRules.declaredActionLogUsesExecutionResults === true,
    "宣言効果ログは実行済み結果から作らなければなりません"
  );
  assert(
    manifest.coreRules.enemyNoblePhantasmScaledDeclaredValues === "unsupported_until_context_data",
    "敵宝具の段階別宣言値は文脈データ追加まで未対応でなければなりません"
  );
  assert(
    manifest.coreRules.servantPassiveInitializationOrder === "formation_order_including_reserve",
    "クラススキルは控えを含む編成順で初期化しなければなりません"
  );
  assert(
    manifest.coreRules.allySkillCooldownTiming === "before_skill_effects",
    "味方スキルCTは効果より前に設定しなければなりません"
  );
  assert(
    manifest.coreRules.allySkillConsumesCommandAction === false,
    "味方スキルはコマンドカード行動を消費してはいけません"
  );
  assert(
    manifest.coreRules.allySkillCompletedActionBoundary === true,
    "味方スキルは完了済み行動境界を通らなければなりません"
  );
  assert(
    manifest.coreRules.directNpChangeUsesTargetNpLevel === true,
    "直接NP増減は対象自身の宝具Lv上限を使わなければなりません"
  );
  assert(manifest.coreRules.enemyWithoutNoblePhantasmCharge === 0, "宝具未設定敵のチャージは0でなければなりません");
  assert(manifest.coreRules.fixedSeedReplayRequired === true, "固定シード再現は必須です");

  const docs = manifest.canonicalDocuments ?? [];
  assert(new Set(docs).size === docs.length, "canonicalDocuments に重複があります");
  for (const path of docs) {
    if (!(await exists(path))) errors.push(`正本文書がありません: ${path}`);
  }
}

const mandatoryFiles = [
  "README.md",
  "AGENTS.md",
  "docs/NEW_CHAT_GUIDE.md",
  "docs/HANDOFF_TEMPLATE.md",
  "docs/roles/SYSTEM.md",
  "docs/roles/SERVANT.md",
  "docs/roles/CRAFT_ESSENCE.md",
  "docs/roles/MYSTIC_CODE.md",
  "docs/roles/ENEMY.md",
  "docs/templates/SERVANT_ADDITION.md",
  "docs/templates/CRAFT_ESSENCE_ADDITION.md",
  "docs/templates/MYSTIC_CODE_ADDITION.md",
  "docs/templates/ENEMY_ADDITION.md",
  "docs/templates/BUG_REPORT.md"
];

for (const path of mandatoryFiles) {
  if (!(await exists(path))) errors.push(`必須ファイルがありません: ${path}`);
}

const agents = await readText("AGENTS.md");
assert(agents.includes("リポジトリを唯一の正本"), "AGENTS.md に正本規則がありません");
assert(agents.includes("特殊勝利条件・特殊敗北条件を追加する"), "AGENTS.md に特殊勝敗条件の禁止がありません");

for (const path of [
  "docs/roles/SYSTEM.md",
  "docs/roles/SERVANT.md",
  "docs/roles/CRAFT_ESSENCE.md",
  "docs/roles/MYSTIC_CODE.md",
  "docs/roles/ENEMY.md"
]) {
  const text = await readText(path);
  assert(text.includes("## 変更可能範囲"), `${path} に変更可能範囲がありません`);
  assert(text.includes("## 完了条件"), `${path} に完了条件がありません`);
}

for (const path of [
  "docs/templates/SERVANT_ADDITION.md",
  "docs/templates/CRAFT_ESSENCE_ADDITION.md",
  "docs/templates/MYSTIC_CODE_ADDITION.md",
  "docs/templates/ENEMY_ADDITION.md"
]) {
  const text = await readText(path);
  assert(text.includes("## 処理分類"), `${path} に処理分類がありません`);
  assert(text.includes("## 参照資料"), `${path} に参照資料がありません`);
  assert(text.includes("## 確認項目"), `${path} に確認項目がありません`);
}

if (errors.length > 0) {
  console.error("基盤検査に失敗しました。");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`基盤検査に成功しました。仕様書バージョン: ${manifest.specVersion}`);
