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
    manifest.coreRules.enemyDataSchemaVersion === 1
      && manifest.coreRules.enemyDataIdentity === "stable_project_id"
      && manifest.coreRules.enemyEncounterIdentity === "battle_instance_id"
      && manifest.coreRules.enemyDefinitionAndEncounterSeparated === true,
    "敵形式1は安定データIDと戦闘個体IDを分離しなければなりません"
  );
  assert(
    manifest.coreRules.enemyRandomSingleTargetPolicy === "random_living_ally_frontline"
      && manifest.coreRules.enemyRandomSingleTargetRng === "ai"
      && manifest.coreRules.enemyCriticalRng === "critical",
    "初期敵のランダム単体対象とクリティカルは用途別乱数列を使わなければなりません"
  );
  assert(
    manifest.coreRules.enemyChargeIncreaseTiming === "enemy_turn_end"
      && manifest.coreRules.enemyChargeIncreasePerTurn === 1
      && manifest.coreRules.enemyReserveProgressionPaused === true,
    "敵通常チャージは敵ターン終了時に前衛だけ1増加しなければなりません"
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
    manifest.coreRules.commandCardRedistributionStatus === "implemented"
      && manifest.coreRules.commandCardRedistributionActionId === "redistribute_command_cards",
    "カード再配布は宣言的共通戦場操作として実装されていなければなりません"
  );
  assert(
    JSON.stringify(manifest.coreRules.declaredBattlefieldActions)
      === JSON.stringify(["redistribute_command_cards"]),
    "宣言的共通戦場操作の一覧が一致しません"
  );
  assert(
    manifest.coreRules.commandCardRedistributionBoundary
      === "ally_input_before_card_submission"
      && manifest.coreRules.commandCardRedistributionSource
        === "current_living_ally_frontline_all_normal_cards"
      && manifest.coreRules.commandCardRedistributionDrawCount === 5
      && manifest.coreRules.commandCardRedistributionResetsCycle === true
      && manifest.coreRules.commandCardRedistributionAllowsPreviousHandCards === true,
    "カード再配布はカード提出前に現在前衛の全通常カードから新周期5枚を配らなければなりません"
  );
  assert(
    manifest.coreRules.commandCardRedistributionIncludesNoblePhantasmCards === false
      && manifest.coreRules.commandCardRedistributionCardsRngLogicalDraws === 5
      && manifest.coreRules.commandCardRedistributionPreservesStarBuckets === true
      && manifest.coreRules.commandCardRedistributionReallocatesCommandStars === true,
    "カード再配布の宝具候補・カード乱数・スター規則が一致しません"
  );
  assert(
    manifest.coreRules.commandCardRedistributionRejectedMutation
      === "none_including_history_and_logs"
      && manifest.coreRules.commandCardStarDistributionPersistence
        === "input_boundary_state"
      && manifest.coreRules.commandCardStarDistributionLegacyMode
        === "legacy_on_command_confirmation",
    "カード再配布は原子的に拒否し、入力境界スター配分と旧方式を区別しなければなりません"
  );
  assert(
    manifest.coreRules.battleLogSchemaVersion === 5,
    "戦闘ログ形式バージョンは5でなければなりません"
  );
  assert(
    manifest.coreRules.battleLogGranularity === "completed_action_or_ally_input_action",
    "戦闘ログは完了済み1行動または味方入力操作単位で記録しなければなりません"
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
      "direct_ally_exchange",
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
    manifest.coreRules.battleTurnLogSchemaVersion === 2,
    "1戦闘ターンログ形式バージョンは2でなければなりません"
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
      "turn_end_star_additions",
      "breaks",
      "hp_settlements",
      "enemy_charge_changes",
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
    manifest.coreRules.battleSuspendSchemaVersion === 4
      && manifest.coreRules.battleSuspendResume === "direct_snapshot_restore"
      && manifest.coreRules.battleSuspendLegacyMigration
        === "schema_3_to_4_direct_snapshot_restore",
    "中断保存形式4は直接再開し、形式3を再実行せず移行しなければなりません"
  );
  assert(
    manifest.coreRules.battleSuspendCardRedistributionOuterSchemaChange === false
      && manifest.coreRules.battleSuspendCardRedistributionDataSchemaChangeOnImplementation === true
      && manifest.coreRules.battleSuspendCardRedistributionDataSchemaVersion === "1.38.0"
      && manifest.coreRules.battleSuspendPreRedistributionDataSchemaVersion === "1.37.0"
      && manifest.coreRules.battleSuspendLegacyStarDistributionMigration
        === "add_legacy_mode_without_draw_or_state_change",
    "カード再配布対応は形式4・データ1.38.0と乱数非消費の旧配分移行を必要とします"
  );
  assert(
    manifest.coreRules.allySkillOperationsSavedAndReplayed === true
      && manifest.coreRules.mysticCodeOperationsSavedAndReplayed === true
      && manifest.coreRules.inputActionLogBatchKind === "ally_input"
      && JSON.stringify(manifest.coreRules.inputActionLogKinds)
        === JSON.stringify(["ally_skill", "mystic_code_skill"]),
    "味方能動スキル操作は入力境界ログ・保存・リプレイへ統合しなければなりません"
  );
  assert(
    manifest.dataSchemaVersion === "1.38.0"
      && manifest.coreRules.battleSuspendSchemaVersion === 4,
    "スリップダメージ倍加受入後も保存形式4・データ1.38.0を変更してはいけません"
  );
  assert(
    JSON.stringify(manifest.specifiedContent?.mysticCodes)
      === JSON.stringify([{
        name: "魔術協会制服",
        dataId: "mage-association-uniform",
        schemaVersion: 2,
        levelPolicy: "max",
        implementationStatus: "implemented",
        source: "https://w.atwiki.jp/f_go/pages/41.html",
        sourceCheckedAt: "2026-08-11",
        skills: [{
          slot: 1,
          stableId: "mage-association-full-recovery",
          name: "全体回復",
          cooldownAtMax: 12,
          target: "living_ally_frontline_all",
          effects: [{ order: 1, action: "heal_hp", amount: 2800 }],
        }, {
          slot: 2,
          stableId: "mage-association-spiritron-transfer",
          name: "霊子譲渡",
          cooldownAtMax: 15,
          target: "selected_living_ally_frontline_single",
          effects: [{ order: 1, action: "change_np", amount: 2000 }],
        }, {
          slot: 3,
          stableId: "mage-association-command-shuffle",
          name: "コマンドシャッフル",
          cooldownAtMax: 15,
          target: "ally_battlefield_self_no_unit_selection",
          effects: [{ order: 1, action: "redistribute_command_cards" }],
        }],
      }]),
    "魔術協会制服の形式2具体データ仕様が正本と一致しません"
  );
  assert(
    JSON.stringify(manifest.initialContent?.mysticCodes)
      === JSON.stringify([
        "アトラス院制服",
        "ノーマルカルデア制服",
        "魔術協会制服",
      ]),
    "初期魔術礼装レジストリは3着でなければなりません"
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
  const turnEndStarGain = manifest.coreRules.turnEndTriggerStarGain;
  assert(
    turnEndStarGain.status === "accepted"
      && turnEndStarGain.v1InitialScope === true
      && JSON.stringify(turnEndStarGain.endingSides) === JSON.stringify([
        "ally",
        "enemy"
      ])
      && turnEndStarGain.destination === "next_command"
      && turnEndStarGain.commandDestinationAllowed === false
      && turnEndStarGain.starCap === 99
      && turnEndStarGain.candidateSnapshot === "living_frontline_at_turn_end_start"
      && JSON.stringify(turnEndStarGain.resolutionOrder) === JSON.stringify([
        "frontline_slot",
        "owner_trigger_priority",
        "registration_order",
        "child_action_order"
      ])
      && turnEndStarGain.additionTiming === "immediate_per_child_action_before_hp_settlement_and_later_turn_end_stages"
      && turnEndStarGain.multipleAdditionPolicy === "sequential_cap_per_action"
      && turnEndStarGain.reserveActivation === false
      && turnEndStarGain.newlyFrontlinedDuringPhaseActivation === false
      && turnEndStarGain.additionConsumesRng === false
      && turnEndStarGain.parentProbabilityRng === "effects"
      && JSON.stringify(turnEndStarGain.confirmedLogFields) === JSON.stringify([
        "bucket",
        "requested",
        "before",
        "added",
        "after",
        "overflow"
      ])
      && turnEndStarGain.battleSuspendSchemaChange === false
      && turnEndStarGain.dataSchemaChange === false
      && turnEndStarGain.battleLogSchemaChange === false
      && turnEndStarGain.battleTurnLogSchemaChange === false
      && turnEndStarGain.uiRecalculates === false
      && turnEndStarGain.implementationStatus === "implemented_and_accepted",
    "ターン終了トリガーのスター獲得仕様が一致しません"
  );
  const completedUi = manifest.coreRules.completedUiSpecification;
  assert(
    manifest.status === "content-addition-domination-foreigner-review-ready"
      && completedUi.decisionRange === "D-077-D-085"
      && completedUi.acceptanceRevision === "D-088"
      && completedUi.implementationStatus === "accepted"
      && manifest.coreRules.servantDefaultDemeritApplicationRatePermille === 5000
      && manifest.coreRules.servantDefaultDemeritRateAppliesWhenSourceRateMissing === true
      && manifest.coreRules.servantDemeritUsesDebuffResistanceAndImmunity === true
      && completedUi.defaultSeedMode === "random"
      && completedUi.randomBlankSeedResolvedBeforeBattleRng === true
      && JSON.stringify(completedUi.allyEffectTabs) === JSON.stringify(["class_skill", "craft_essence", "other", "combined"])
      && completedUi.allyEffectDefaultTab === "other"
      && JSON.stringify(completedUi.enemyEffectTabs) === JSON.stringify(["normal", "special", "combined"])
      && completedUi.enemyEffectDefaultTab === "normal"
      && completedUi.combinedEffectMutatesBattleState === false
      && completedUi.rateDisplayUnit === "percent_from_permille_divided_by_10"
      && completedUi.publicAssetUrlSource === "vite_base_url"
      && completedUi.mysticCodeSkillPosition === "frontline_tab_bottom"
      && completedUi.commandCardSelectionMaximum === 3
      && JSON.stringify(completedUi.commandCardRows) === JSON.stringify(["noble_phantasm", "normal_command"])
      && completedUi.otherEffectBadge === "remaining_turns_and_uses"
      && completedUi.quickFirstPreviewTiming === "immediately_after_first_quick_selection_including_unselected_normal_candidates"
      && completedUi.hpAttackNumberSource === "confirmed_action_log_target_total_damage"
      && completedUi.hpDifferenceUsedAsAttackDamage === false
      && completedUi.allyNpChangePresentation === "animated_bars_from_confirmed_before_and_after_np"
      && completedUi.confirmedLogPlaybackOnly === true
      && completedUi.playbackNavigation === "manual_previous_next"
      && completedUi.playbackAutomaticAdvance === false
      && completedUi.playbackStateSaved === false
      && completedUi.servantWikiLinks === "registered_wiki_source_only_in_setup_and_battle"
      && completedUi.skillAndNoblePhantasmDescriptions === "wiki_notation_with_registered_rates_one_effect_per_line"
      && completedUi.battleSuspendSchemaChange === false
      && completedUi.dataSchemaChange === false,
    "UI完成仕様の実装状態が一致しません"
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
    manifest.coreRules.enemyNoblePhantasmScaledDeclaredValues === "accepted",
    "敵宝具の段階文脈は統合受入済みでなければなりません"
  );
  const enemyNpContext = manifest.coreRules.enemyNoblePhantasmContext;
  assert(
    enemyNpContext?.scope === "battle_instance_and_action"
      && enemyNpContext.authoringSplit === "enemy_definition_values_and_encounter_context"
      && JSON.stringify(enemyNpContext.noblePhantasmLevels) === JSON.stringify([1, 2, 3, 4, 5])
      && JSON.stringify(enemyNpContext.overchargeStages) === JSON.stringify([1, 2, 3, 4, 5])
      && JSON.stringify(enemyNpContext.valueKinds) === JSON.stringify([
        "fixed",
        "noble_phantasm_level",
        "overcharge",
      ])
      && enemyNpContext.stagedValueCount === 5
      && enemyNpContext.requiredOnlyWhenScalingUsed === true
      && enemyNpContext.fixedValuesRequireNoContext === true
      && enemyNpContext.inferNoblePhantasmLevelFromEnemyLevel === false
      && enemyNpContext.inferOverchargeFromCharge === false
      && enemyNpContext.snapshotTiming === "enemy_noble_phantasm_preflight"
      && JSON.stringify(enemyNpContext.sameSnapshotFor) === JSON.stringify([
        "attack_multiplier",
        "before_attack_declared_effects",
        "after_attack_declared_effects",
        "action_log",
      ])
      && enemyNpContext.invalidHandling === "typed_full_action_skip_before_target_charge_state_counters_and_rng"
      && JSON.stringify(enemyNpContext.skipReasons) === JSON.stringify([
        "enemy_noble_phantasm_context_missing",
        "enemy_noble_phantasm_context_invalid",
        "enemy_noble_phantasm_data_invalid",
        "action_effects_unresolved",
      ])
      && enemyNpContext.selectionConsumesRng === false
      && enemyNpContext.fixedEnemyAttackCompatibility === true
      && JSON.stringify(enemyNpContext.saveContainers) === JSON.stringify([
        "attackData",
        "actionEffectData",
      ])
      && enemyNpContext.directResume === "restore_saved_context_values_and_logs_without_registry_recalculation"
      && JSON.stringify(enemyNpContext.replayEquality) === JSON.stringify([
        "state",
        "effect_runtime_counters",
        "six_rng_streams",
        "action_logs",
        "turn_logs",
      ])
      && enemyNpContext.uiRecalculates === false
      && enemyNpContext.battleSuspendSchemaVersion === 4
      && enemyNpContext.dataSchemaVersion === "1.38.0"
      && enemyNpContext.enemyDataSchemaVersion === 1
      && enemyNpContext.battleLogSchemaVersion === 5
      && enemyNpContext.battleTurnLogSchemaVersion === 2
      && enemyNpContext.fixedOnlyLogShapeUnchanged === true,
    "敵宝具Lv・OCの保持、段階選択、不発、保存、リプレイ、UI規則が不正です"
  );
  assert(
    enemyNpContext.implementationStatus === "accepted"
      && JSON.stringify(enemyNpContext.implementationSources) === JSON.stringify([
        "src/effects/declarations.ts",
        "src/data/enemies/schema.ts",
        "src/data/enemies/validation.ts",
        "src/data/enemies/registry.ts",
        "src/core/battle/actionData.ts",
        "src/core/battle/enemyNoblePhantasmContext.ts",
        "src/ai/enemyAttack.ts",
        "src/core/battle/log.ts",
      ]),
    "敵宝具Lv・OC共通処理の実装元または受入状態が不正です"
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
  assert(
    manifest.coreRules.craftEssenceSlotsPerAllyInstance === 1,
    "概念礼装は味方戦闘個体ごとに0～1枚でなければなりません"
  );
  assert(
    manifest.coreRules.craftEssenceUnselectedAllowed === true,
    "概念礼装の未選択を許可しなければなりません"
  );
  assert(
    manifest.coreRules.craftEssenceInventoryTracking === false,
    "初期範囲では概念礼装の所持枚数を管理してはいけません"
  );
  assert(
    manifest.coreRules.craftEssenceDuplicateDataIdAcrossInstances === true,
    "同じ概念礼装を複数の味方戦闘個体へ装備できなければなりません"
  );
  assert(
    manifest.coreRules.craftEssenceInitialLimitBreak === "max",
    "初期概念礼装は最大解放固定でなければなりません"
  );
  assert(
    manifest.coreRules.craftEssenceInitialLevelPolicy === "rarity_max_fixed",
    "初期概念礼装はレアリティ別最大Lv固定でなければなりません"
  );
  assert(
    JSON.stringify(manifest.coreRules.craftEssenceMaxLevelByRarity) === JSON.stringify({
      "1": 50,
      "2": 55,
      "3": 60,
      "4": 80,
      "5": 100
    }),
    "概念礼装のレアリティ別最大Lvが一致しません"
  );
  assert(
    manifest.coreRules.craftEssenceInitialEffectTarget === "equipped_ally_instance",
    "初期概念礼装の効果対象は装備した味方戦闘個体でなければなりません"
  );
  assert(
    manifest.coreRules.craftEssenceReserveSelectable === true
      && manifest.coreRules.craftEssenceStartEffectsIncludeReserve === true,
    "控えも概念礼装の選択・開始時初期化対象でなければなりません"
  );
  assert(
    manifest.coreRules.initialCraftEssenceDataRegistry
      === "src/data/craftEssences/initialCraftEssences.ts"
      && manifest.coreRules.kaleidoscopeStartNpUnits === 10000
      && manifest.coreRules.blackGrailNoblePhantasmDamagePermille === 800,
    "初期概念礼装の登録先・開始NP・宝具威力が一致しません"
  );
  assert(
    JSON.stringify(manifest.coreRules.blackGrailRecurringHpReduction)
      === JSON.stringify({ amount: 500, canDefeat: true, turnEndSettlement: null }),
    "黒の聖杯の毎ターンHP減少はHP0可能な共通HP減少でなければなりません"
  );
  assert(
    JSON.stringify(manifest.coreRules.slipDamageAmplification)
      === JSON.stringify({
        status: "accepted",
        categories: {
          burn: "spread_of_fire",
          poison: "toxic",
          curse: "evil_curse"
        },
        baseAggregation: "per_category_sum_before_multiplier",
        matchingAmplifierAggregation: "sum_at_each_slip_trigger_activation",
        percentUnit: "permille",
        formula: "floor(category_base_total*(1000+matching_amplifier_total)/1000)_per_category",
        rounding: "floor_per_category",
        settlement: "existing_recovery_and_slip_simultaneous_hp1_clamp",
        defeatBehavior: "no_break_guts_or_death",
        reserveProgression: "paused",
        saveSchemaChange: false,
        dataSchemaChange: false,
        runtimeTypeSource: "src/effects/types.ts",
        amplifierLookupSource: "src/effects/slipDamage.ts",
        settlementSource: "src/effects/hp.ts",
        confirmedLogSource: "src/core/battle/turnLog.ts",
        uiRecalculates: false
      }),
    "スリップダメージ倍加の対象・合計・発動時倍率・切捨て・保存・UI規則が不正です"
  );

  const initialCraftEssences = manifest.initialContent?.craftEssences ?? [];
  assert(
    JSON.stringify(initialCraftEssences) === JSON.stringify([
      {
        name: "カレイドスコープ",
        dataId: "kaleidoscope",
        rarity: 5,
        limitBreak: "max",
        level: 100,
        effectTarget: "equipped_ally_instance",
        source: "https://appmedia.jp/fategrandorder/90628",
        implementationStatus: "implemented"
      },
      {
        name: "黒の聖杯",
        dataId: "black-grail",
        rarity: 5,
        limitBreak: "max",
        level: 100,
        effectTarget: "equipped_ally_instance",
        source: "https://appmedia.jp/fategrandorder/103128",
        implementationStatus: "implemented"
      }
    ]),
    "初期概念礼装2枚の正式名称・ID・最大解放・Lv・対象・参照が一致しません"
  );

  const initialEnemies = manifest.initialContent?.enemies ?? [];
  assert(initialEnemies.length === 1, "初期敵は黎明の炎腕（剣）1種でなければなりません");
  const radiantArm = initialEnemies[0] ?? {};
  assert(
    radiantArm.name === "黎明の炎腕"
      && radiantArm.dataId === "radiant-arm-of-dawn-saber"
      && radiantArm.externalIds?.atlasAcademyServantId === 9933710
      && radiantArm.externalIds?.atlasAcademyAiId === 1000000
      && radiantArm.category === "normal_enemy"
      && radiantArm.classKey === "saber"
      && radiantArm.attributeKey === "sky"
      && radiantArm.classAttackCoefficientPermille === 1000,
    "黎明の炎腕（剣）の正式名称・ID・区分・クラス・属性が一致しません"
  );
  assert(
    JSON.stringify(radiantArm.traits) === JSON.stringify([
      "demon_unused",
      "bonus_enemy",
      "hand_or_door",
      "hand",
      "divine"
    ])
      && radiantArm.deathRatePermille === 200
      && radiantArm.criticalChancePermille === 100
      && radiantArm.attackNpRatePermille === 1000
      && radiantArm.targetNpRatePermille === 1000
      && radiantArm.targetStarRatePermille === 0
      && JSON.stringify(radiantArm.nonServantUnusedAttackFields) === JSON.stringify({
        attackNpUnits: 0,
        receivedNpUnits: 0,
        starRatePermille: 0,
        starWeight: 0,
        commandCardHitWeights: null,
        extraAttackHitWeights: null,
        noblePhantasms: []
      }),
    "黎明の炎腕（剣）の特性・基礎率が一致しません"
  );
  assert(
    radiantArm.maxActions === 1
      && JSON.stringify(radiantArm.skills) === JSON.stringify([])
      && JSON.stringify(radiantArm.normalAttack) === JSON.stringify({
        stableId: "radiant-arm-of-dawn-saber-normal-attack",
        targetScope: "single",
        targetPolicy: "random_living_ally_frontline",
        cardType: "quick",
        hitWeights: [100],
        cardDamageValuePermille: 1000
      }),
    "黎明の炎腕（剣）の行動上限・通常攻撃・スキルが一致しません"
  );
  assert(
    JSON.stringify(radiantArm.chargeAttack) === JSON.stringify({
      name: "業火",
      stableId: "radiant-arm-of-dawn-saber-charge-attack",
      targetScope: "single",
      targetPolicy: "random_living_ally_frontline",
      cardType: "arts",
      hitWeights: [100],
      damageMultiplierPermille: 6000,
      chargeMax: 4,
      levelScaling: "fixed",
      overchargeScaling: "none"
    }),
    "業火はArts・単体・1Hit・固定600%・チャージ最大4でなければなりません"
  );
  assert(
    radiantArm.sourceCheckedAt === "2026-08-10"
      && radiantArm.implementationStatus === "implemented",
    "初期敵は参照確認日を持つ実装済みデータでなければなりません"
  );

  const initialEnemyEncounter = manifest.initialContent?.initialEnemyEncounter ?? {};
  assert(
    initialEnemyEncounter.dataId === "ember-gathering-saber-extreme"
      && initialEnemyEncounter.activeMode === 3
      && initialEnemyEncounter.replacementMode === "standard"
      && initialEnemyEncounter.reserveCount === 0
      && initialEnemyEncounter.breakGaugeCount === 0,
    "極級初期戦闘は3体モード・控えなし・ブレイクなしでなければなりません"
  );
  const expectedEnemyPlacements = [
    [
      ["enemy-w1-1", "A", 1, 23, 27849, 4561],
      ["enemy-w1-2", "B", 2, 22, 26649, 4401],
      ["enemy-w1-3", "C", 3, 24, 29049, 4721]
    ],
    [
      ["enemy-w2-1", "A", 1, 25, 37811, 4881],
      ["enemy-w2-2", "B", 2, 26, 39311, 5041],
      ["enemy-w2-3", "C", 3, 27, 40811, 5201]
    ],
    [
      ["enemy-w3-1", "A", 1, 45, 136216, 8113]
    ]
  ];
  const actualEnemyPlacements = (initialEnemyEncounter.waves ?? []).map((wave) =>
    wave.map((enemy) => [
      enemy.instanceId,
      enemy.encounterLabel,
      enemy.frontlineSlot,
      enemy.level,
      enemy.hp,
      enemy.attack
    ])
  );
  assert(
    JSON.stringify(actualEnemyPlacements) === JSON.stringify(expectedEnemyPlacements),
    "極級3 Wave・7個体の配置・Lv・HP・ATKが一致しません"
  );
  assert(
    (initialEnemyEncounter.waves ?? []).flat().every((enemy) =>
      enemy.enemyDataId === "radiant-arm-of-dawn-saber" && enemy.charge === 0
    )
      && initialEnemyEncounter.sourceCheckedAt === "2026-08-10"
      && initialEnemyEncounter.implementationStatus === "implemented",
    "極級7個体は同じ敵dataId・開始チャージ0の実装済みデータでなければなりません"
  );

  const docs = manifest.canonicalDocuments ?? [];
  assert(new Set(docs).size === docs.length, "canonicalDocuments に重複があります");
  for (const path of docs) {
    if (!(await exists(path))) errors.push(`正本文書がありません: ${path}`);
  }
}

const mandatoryFiles = [
  "README.md",
  "AGENTS.md",
  "docs/INDEX.md",
  "docs/START_HERE.md",
  "docs/PROJECT_RULES.md",
  "docs/IMPLEMENTATION_STATUS.md",
  "docs/DECISION_LOG.md",
  "docs/NEW_CHAT_GUIDE.md",
  "docs/HANDOFF_TEMPLATE.md",
  "docs/qa/TURN_END_STAR_GAIN_ACCEPTANCE_2026-08-11.md",
  "docs/qa/UI_COMPLETION_ACCEPTANCE_2026-08-13.md",
  "docs/qa/DOMINATION_FOREIGNER_ACCEPTANCE_2026-08-14.md",
  "docs/archive/README.md",
  "docs/archive/2026-08-04/PROJECT_RULES_v1.0.0.md",
  "docs/archive/2026-08-04/IMPLEMENTATION_STATUS_v1.0.0.md",
  "docs/archive/2026-08-04/DECISION_LOG_v1.0.0.md",
  "docs/roles/SYSTEM.md",
  "docs/roles/SERVANT.md",
  "docs/roles/CRAFT_ESSENCE.md",
  "docs/roles/MYSTIC_CODE.md",
  "docs/roles/ENEMY.md",
  "docs/roles/UI.md",
  "docs/specs/INITIAL_DATA.md",
  "docs/templates/SERVANT_ADDITION.md",
  "docs/templates/CRAFT_ESSENCE_ADDITION.md",
  "docs/templates/MYSTIC_CODE_ADDITION.md",
  "docs/templates/ENEMY_ADDITION.md",
  "docs/templates/BUG_REPORT.md",
  "src/data/enemies/schema.ts",
  "src/data/enemies/validation.ts",
  "src/data/enemies/registry.ts",
  "src/data/enemies/initialEnemies.ts",
  "src/data/enemies/index.ts",
  "src/core/battle/enemyNoblePhantasmContext.ts",
  "src/data/servants/dominationForeigner.ts",
  "src/effects/noblePhantasmOvercharge.ts",
];

for (const path of mandatoryFiles) {
  if (!(await exists(path))) errors.push(`必須ファイルがありません: ${path}`);
}

const agents = await readText("AGENTS.md");
assert(agents.includes("リポジトリを唯一の正本"), "AGENTS.md に正本規則がありません");
assert(agents.includes("特殊勝利条件・特殊敗北条件を追加する"), "AGENTS.md に特殊勝敗条件の禁止がありません");
assert(agents.includes("docs/START_HERE.md"), "AGENTS.md に作業開始ページへの案内がありません");

const startHere = await readText("docs/START_HERE.md");
assert(startHere.includes("## 現在地点"), "作業開始ページに現在地点がありません");
assert(startHere.includes("## 次の作業"), "作業開始ページに次の作業がありません");
assert(startHere.includes("## 必須規則"), "作業開始ページに必須規則がありません");
assert(
  startHere.includes("フェーズ: 19／v1.0初期完成範囲外サーヴァントの順次追加")
    && startHere.includes("No.024’「支配のフォーリナー」")
    && startHere.includes("カテゴリ1の未登録サーヴァント"),
  "作業開始ページに支配のフォーリナー実装と次作業がありません"
);
const uiAcceptance = await readText(
  "docs/qa/UI_COMPLETION_ACCEPTANCE_2026-08-13.md"
);
assert(
  uiAcceptance.includes("判定: 最終合格")
    && uiAcceptance.includes("51ファイル・525テスト")
    && uiAcceptance.includes("ユーザー実画面受入完了")
    && uiAcceptance.includes("v1.0初期完成範囲外の具体コンテンツ追加対象を1件だけ選定する"),
  "UI完成仕様の受入報告が正本と一致しません"
);

const requiredUiAssets = [
  ...[
    "skill-attack-up", "skill-card-buster-up", "skill-clear-debuff",
    "skill-cooldown", "skill-damage-up", "skill-hp-heal",
    "skill-immune-invincibility", "skill-np-charge",
    "skill-unique-command-shuffle", "skill-unique-order-change",
    "skill-card-quick-up", "skill-np-damafe-up",
  ].map((name) => `public/assets/skill-icons/${name}.png`),
  ...[
    "Artsupstatus", "Attackdown", "Attackup", "Buffatk", "Busterupstatus",
    "Critabsup", "Critdmgup", "Debuffatk", "Debuffregen", "DelayedBuff",
    "DelayedDebuff", "Dragontrait", "Invincible", "Npcardtypechange",
    "Nppowerdown", "Nppowerup", "Powerup", "Removalresistdown",
    "Removalresistup", "Resistancedown", "Resistanceup", "Quickupstatus",
    "Starabsoprtdown", "Stargainup", "Statusdown", "Statusup",
    "Npgainturn", "Stargainturn", "NPOvercharge",
  ].map((name) => `public/assets/status-icons/${name}.webp`),
];
for (const path of requiredUiAssets) {
  if (!(await exists(path))) errors.push(`指定済みUI画像がありません: ${path}`);
}

const implementationStatus = await readText("docs/IMPLEMENTATION_STATUS.md");
assert(implementationStatus.includes("## 現在地点"), "実装状況に現在地点がありません");
assert(implementationStatus.includes("## 次の実装"), "実装状況に次の実装がありません");
assert(
  implementationStatus.includes("D-077～D-085のUI完成仕様")
    && implementationStatus.includes("v1.0初期完成範囲へ追加")
    && implementationStatus.includes("No.024’「支配のフォーリナー」")
    && implementationStatus.includes("52ファイル・533テスト"),
  "実装状況にUI完成範囲、支配のフォーリナー、検査記録がありません"
);

const decisionLog = await readText("docs/DECISION_LOG.md");
assert(
  decisionLog.includes("## D-069 敵宝具の段階文脈を戦闘個体・行動ごとに明示する")
    && decisionLog.includes("## D-070 次の実装対象を敵宝具段階文脈の共通処理とする")
    && decisionLog.includes("## D-071 次の作業を敵宝具段階文脈の統合受入検査とする")
    && decisionLog.includes("## D-072 次の仕様化対象をターン終了トリガーによるスター獲得とする")
    && decisionLog.includes("## D-073 ターン終了スター獲得を次回味方コマンド用へ順次加算する")
    && decisionLog.includes("## D-074 次の実装対象をターン終了スター獲得の共通処理とする")
    && decisionLog.includes("## D-075 ターン終了スター獲得をv1.0初期完成範囲へ含める")
    && decisionLog.includes("## D-076 次の作業を初期範囲外の具体コンテンツ追加対象の選定とする"),
  "決定記録にターン終了スターの実装・初期範囲・次作業がありません"
);
assert(
  decisionLog.includes("## D-077 初期設定と確定シードを4タブへ固定する")
    && decisionLog.includes("## D-078 戦闘画面の領域順と操作可能寸法を固定する")
    && decisionLog.includes("## D-079 効果表示を発生元別にし、登録・適用済み値だけを使う")
    && decisionLog.includes("## D-080 アイコンをアップロード済み明示対応だけへ限定する")
    && decisionLog.includes("## D-081 スキル短押し・詳細・対象確定を分離する")
    && decisionLog.includes("## D-082 3枚選択時の入力ロックとカード識別を固定する")
    && decisionLog.includes("## D-083 確定ログだけを再生し、再生中入力を遮断する")
    && decisionLog.includes("## D-084 リザルトを確定戦闘画面へ重ねる")
    && decisionLog.includes("## D-085 保存・再開を要約付き・非破壊にする")
    && decisionLog.includes("## D-086 UI実画面受入の状態表示と確定結果演出を追補する")
    && decisionLog.includes("## D-087 UI実画面受入の資源・状態・カード表示を追補する")
    && decisionLog.includes("## D-088 UI実画面受入の遅延状態・Wiki導線・説明表記を追補する"),
  "決定記録にUI完成仕様D-077～D-085がありません"
);
assert(
  decisionLog.includes("## D-089 No.024’「支配のフォーリナー」を最初の初期範囲外サーヴァントとして登録する"),
  "決定記録に支配のフォーリナー実装方針がありません"
);

const enemyNpAcceptance = await readText(
  "docs/qa/ENEMY_NP_CONTEXT_ACCEPTANCE_2026-08-11.md"
);
assert(
  enemyNpAcceptance.includes("判定: 合格")
    && enemyNpAcceptance.includes("基準コミット: `cc8334bcae60c3e652217d50bed7575dda9c1892`")
    && enemyNpAcceptance.includes("保存形式4・データ1.38.0"),
  "敵宝具段階文脈の統合受入報告が正本と一致しません"
);
const docsIndex = await readText("docs/INDEX.md");
assert(
  docsIndex.includes("qa/ENEMY_NP_CONTEXT_ACCEPTANCE_2026-08-11.md")
    && docsIndex.includes("qa/TURN_END_STAR_GAIN_ACCEPTANCE_2026-08-11.md")
    && docsIndex.includes("qa/UI_COMPLETION_ACCEPTANCE_2026-08-13.md"),
  "文書索引に最新の統合受入報告がありません"
);

const turnEndStarAcceptance = await readText(
  "docs/qa/TURN_END_STAR_GAIN_ACCEPTANCE_2026-08-11.md"
);
assert(
  turnEndStarAcceptance.includes("判定: 合格")
    && turnEndStarAcceptance.includes("基準mainコミット: `e5b13b7981aef49f9d300a967609fdcc4a5771f7`")
    && turnEndStarAcceptance.includes("中断保存形式4、データ1.38.0、敵データ形式1、行動ログ形式5、ターンログ形式2")
    && turnEndStarAcceptance.includes("v1.0初期完成範囲の未実装は0件"),
  "ターン終了スター獲得の統合受入報告が正本と一致しません"
);

const effectsAndTiming = await readText("docs/specs/EFFECTS_AND_TIMING.md");
assert(
  effectsAndTiming.includes("### 敵宝具Lv・OCと段階別宣言値")
    && effectsAndTiming.includes("values[noblePhantasmLevel - 1]")
    && effectsAndTiming.includes("values[overchargeStage - 1]"),
  "効果仕様に敵宝具段階文脈の宣言・選択規則がありません"
);
assert(
  effectsAndTiming.includes("### ターン終了トリガーのスター獲得")
    && effectsAndTiming.includes("`destination: next_command`だけを有効な登録")
    && effectsAndTiming.includes("実加算量0の成立結果"),
  "効果仕様にターン終了スターの登録・上限・ログ規則がありません"
);

const battleSystem = await readText("docs/specs/BATTLE_SYSTEM.md");
assert(
  battleSystem.includes("### ターン終了トリガーによるスター獲得")
    && battleSystem.includes("戦闘終了時は繰り上げず"),
  "戦闘仕様にターン終了スターの順序と繰上げ境界がありません"
);

const calculationsAndRng = await readText(
  "docs/specs/CALCULATIONS_AND_RNG.md"
);
assert(
  calculationsAndRng.includes("ターン終了トリガーによるスター獲得も")
    && calculationsAndRng.includes("他の5乱数列は変更しない"),
  "計算・乱数仕様にターン終了スターの上限と乱数境界がありません"
);

const uiAndStorage = await readText("docs/specs/UI_AND_STORAGE.md");
const uiStyles = await readText("src/styles.css");
const appSource = await readText("src/App.tsx");
const effectPresentation = await readText("src/ui/effectPresentation.ts");
const iconRegistry = await readText("src/ui/iconRegistry.ts");
const battleUi = await readText("src/ui/battleUi.ts");
assert(
  uiAndStorage.includes("敵宝具の任意の宝具Lv・OC文脈")
    && uiAndStorage.includes("UIは段階選択、配列参照、文脈補完"),
  "UI・保存仕様に敵宝具段階文脈の保存と非再計算規則がありません"
);
assert(
  uiAndStorage.includes("ターン終了スター獲得は、ターンログ形式2")
    && uiAndStorage.includes("中断保存形式4・データ1.38.0・行動ログ形式5・ターンログ形式2を維持")
    && uiAndStorage.includes("終了時効果、99個上限、次回用繰上げを再実行しない"),
  "UI・保存仕様にターン終了スターの確定ログと版維持規則がありません"
);
assert(
  uiAndStorage.includes("味方効果はクラススキル／概念礼装／その他／合算")
    && uiAndStorage.includes("敵効果は通常／特殊／合算")
    && uiAndStorage.includes("倍率として登録されるpermille値は表示時だけ10で割って百分率")
    && uiAndStorage.includes("時間による自動送りは行わない")
    && uiAndStorage.includes("敵・味方のHPバー"),
  "UI・保存仕様にD-086の状態表示・合算・手動HP演出がありません"
);
assert(
  uiAndStorage.includes("実画面受入の資源・状態・カード表示追補（D-087）")
    && uiAndStorage.includes("対象別`totalDamage`")
    && uiAndStorage.includes("味方NPバー")
    && uiAndStorage.includes("後続未選択カードにも直ちに表示")
    && uiAndStorage.includes("宝具カードを上段、通常カードを下段"),
  "UI・保存仕様にD-087のダメージ・NP・状態期限・カード表示がありません"
);
assert(
  uiAndStorage.includes("実画面受入の遅延状態・Wiki導線・説明表記追補（D-088）")
    && uiAndStorage.includes("概念礼装欄の下へ登録済み主参照")
    && uiAndStorage.includes("Wikiの効果順")
    && uiAndStorage.includes("DelayedDebuff"),
  "UI・保存仕様にD-088の遅延状態・Wiki導線・説明表記がありません"
);
assert(
  /button\s*\{[\s\S]*?min-height:\s*3\.5rem/.test(uiStyles)
    && /@media \(max-width: 43\.99rem\)[\s\S]*?\.unit-grid,[\s\S]*?overflow-x:\s*auto/.test(uiStyles)
    && /@media \(min-width: 44rem\)[\s\S]*?\.slot-grid,[\s\S]*?\.unit-grid\s*\{\s*grid-template-columns:\s*repeat\(3/.test(uiStyles)
    && /@media \(min-width: 44rem\)[\s\S]*?\.normal-command-card-grid\s*\{\s*grid-template-columns:\s*repeat\(5/.test(uiStyles)
    && /\.modal-backdrop,[\s\S]*?position:\s*fixed/.test(uiStyles)
    && /\.playback-blocker\s*\{[\s\S]*?z-index:\s*120/.test(uiStyles)
    && /\.animated-hp-track span\s*\{[\s\S]*?transition:\s*width/.test(uiStyles)
    && /\.animated-np-track span\s*\{[\s\S]*?transition:\s*width/.test(uiStyles)
    && uiStyles.includes(".effect-expiry-badge")
    && uiStyles.includes(".noble-phantasm-card-grid"),
  "UIのPC・スマートフォン・56px・モーダル・再生遮断CSSが一致しません"
);
assert(
  appSource.includes("前へ")
    && appSource.includes("次へ（操作へ戻る）")
    && appSource.includes("confirmedHpTransitions")
    && appSource.includes("confirmedNpTransitions")
    && appSource.includes("confirmedAttackDamageAmounts")
    && appSource.includes("noble-phantasm-card-grid")
    && appSource.includes("action-description-list")
    && appSource.includes("魔術礼装スキルの操作は「前衛」タブの最下部")
    && effectPresentation.includes("presentCombinedEffects")
    && effectPresentation.includes("value / 10")
    && iconRegistry.includes("import.meta.env.BASE_URL")
    && battleUi.includes("confirmedHpTransitions")
    && battleUi.includes("displayedCommandCardCriticalRatePermille")
    && battleUi.includes("presentNoblePhantasmDetail")
    && battleUi.includes("registeredServantWikiUrl")
    && appSource.includes("servant-wiki-link")
    && appSource.includes("wikiを開く")
    && effectPresentation.includes("effectExpiryLabel"),
  "UI実装にD-086～D-088の画像・状態・カード・Wiki・確定資源演出がありません"
);
const battlePresentation = await readText("src/ui/battlePresentation.ts");
assert(
  !battlePresentation.includes("prepareEnemyNoblePhantasmContext")
    && !battlePresentation.includes("resolveDeclaredActionInteger")
    && !battlePresentation.includes("npDamageMultiplierPermilleByLevel"),
  "UIは敵宝具の段階選択や倍率解決を再実装してはいけません"
);

const initialContent = await readText("docs/specs/INITIAL_CONTENT.md");
assert(initialContent.includes("カレイドスコープ"), "初期データ仕様にカレイドスコープがありません");
assert(initialContent.includes("黒の聖杯"), "初期データ仕様に黒の聖杯がありません");
assert(initialContent.includes("同じ概念礼装`dataId`を複数"), "初期データ仕様に概念礼装の重複装備規則がありません");
assert(initialContent.includes("radiant-arm-of-dawn-saber"), "初期データ仕様に黎明の炎腕（剣）の安定IDがありません");
assert(initialContent.includes("136,216"), "初期データ仕様に極級Wave 3のHPがありません");
assert(initialContent.includes("敵ターン終了時"), "初期データ仕様に敵通常チャージの時期がありません");
assert(
  initialContent.includes("基礎付与率500%（5000 permille）")
    && initialContent.includes("弱体耐性と弱体無効"),
  "初期データ仕様にスキル・宝具デメリットの既定付与率がありません"
);
assert(
  initialContent.includes("### No.024’ 支配のフォーリナー")
    && initialContent.includes("debuff_success_basis_points")
    && initialContent.includes("強化前宝具を選択肢または別定義として残さない"),
  "具体データ仕様に支配のフォーリナーの採用範囲と精度規則がありません"
);
const initialServants = await readText("src/data/servants/initialServants.ts");
const servantSchema = await readText("src/data/servants/schema.ts");
assert(
  servantSchema.includes("SERVANT_DEFAULT_DEMERIT_APPLICATION_RATE_PERMILLE = 5_000")
    && initialServants.includes("baseRatePermille: SERVANT_DEFAULT_DEMERIT_APPLICATION_RATE_PERMILLE")
    && initialServants.includes("lucifera-queen-buff-clear-state")
    && !initialServants.includes("ignoreResistance: true"),
  "初期サーヴァントに500%の遅延デメリット登録がありません"
);

const archiveReadme = await readText("docs/archive/README.md");
assert(archiveReadme.includes("IMPLEMENTATION_STATUS_v1.0.0.md"), "実装状況の履歴アーカイブへの案内がありません");
assert(archiveReadme.includes("DECISION_LOG_v1.0.0.md"), "決定記録の履歴アーカイブへの案内がありません");

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
