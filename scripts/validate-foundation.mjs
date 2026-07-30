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
