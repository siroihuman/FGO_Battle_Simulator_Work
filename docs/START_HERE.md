# 作業開始ページ

仕様書バージョン: 1.0.0

## 現在地点

- フェーズ: 7／初期戦闘UI
- 状態: 共通戦闘・効果・ログ基盤、初期サーヴァント2騎、初期魔術礼装2着、初期概念礼装2枚、黎明の炎腕（剣）と種火集め（剣基準）極級3 Wave・7個体の具体データ・効果・行動、完全戦闘ループ、中断保存・直接再開・固定シードリプレイを実装済み。次は登録済み初期データを選択して戦闘を操作するUIへ接続する。
- 完成目標: `v1.0`
- 正本: このリポジトリの `main`、文書、実装、テスト。チャット履歴は正本にしない。

## 次の作業

1. 登録済みの初期サーヴァント・魔術礼装・概念礼装・`ember-gathering-saber-extreme`を選択し、固定シード入力、戦闘開始、現在編成・HP・NP・敵チャージ・手札・ログ、中断保存・再開を既存エンジンへ接続する最小の初期戦闘UIを実装する（UI／システム実装担当、推奨モデル: `gpt-5.6-sol`）。Lv・ATK・HP、対象、クリティカル、チャージ、効果、ログをUIで再計算せず、レジストリ、ロードアウト初期化、`BattleSession`の確定結果だけを使用する。

## 最初に読むもの

1. [`AGENTS.md`](../AGENTS.md)
2. この文書
3. 今回の担当の [`roles/`](roles/) 文書
4. 依頼に直接関係する [`specs/`](specs/) と [`templates/`](templates/) の文書
5. 関係する実装ファイルとテスト

コア規則、データ形式、システム全体を変更する場合は、追加で `project-manifest.json`、[`ARCHITECTURE.md`](ARCHITECTURE.md)、すべての詳細仕様書を読みます。

## 必須規則

- 通常処理は共通効果、特殊な発動条件は共通トリガー、本当に固有な処理だけは対象別モジュールで扱う。
- 未対応・不明な効果を近似しない。状態・NP・敵チャージ・乱数を変更する前に明示して不発とする。
- UIは戦闘エンジンの確定結果だけを表示し、計算を重複させない。
- 同じシード、設定、操作なら結果と乱数消費順を再現する。
- 特殊勝利条件・特殊敗北条件を追加しない。
- 変更した範囲のテストを追加し、`npm test`、`npm run typecheck`、`npm run build` を実行する。

正確な規則は [`PROJECT_RULES.md`](PROJECT_RULES.md)、現在の未実装項目と検査基準は [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md) を参照します。

## 文書の使い分け

- 現在有効な詳細仕様: [`specs/`](specs/) と [`ARCHITECTURE.md`](ARCHITECTURE.md)。依頼に必要なものだけ読む。
- 短い現在情報: この文書、[`PROJECT_RULES.md`](PROJECT_RULES.md)、[`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md)。
- 完了履歴・旧規則・詳細な決定理由: [`archive/README.md`](archive/README.md)。必要な場合だけ読む。
