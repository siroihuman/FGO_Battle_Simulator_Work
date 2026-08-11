# 作業開始ページ

仕様書バージョン: 1.0.0

## 現在地点

- フェーズ: 11／カード再配布共通処理（統合受入合格）
- 状態: 50ファイル・484自動テスト、型検査、ビルド、Chromium 149・390×844pxの実操作で、入力境界、原子的拒否、スター配分、保存移行、固定シードリプレイ、保存済みスター表示を合格と判定。具体コンテンツは未追加。
- 完成目標: `v1.0`
- 正本: このリポジトリの `main`、文書、実装、テスト。チャット履歴は正本にしない。

## 次の作業

1. 魔術協会制服を次の具体対象として、形式2データに必要な正式名称、安定ID、Lv方針、3スキルの名称・対象・最大Lv時CT・効果順、コマンドシャッフルの`redistribute_command_cards`接続範囲、参照資料を仕様化する（魔術礼装仕様策定担当、推奨モデル: `gpt-5.6-sol`、思考レベル: `high`）。具体データ・効果実装には進まない。

今回の受入詳細は[`qa/COMMAND_CARD_REDISTRIBUTION_ACCEPTANCE_2026-08-11.md`](qa/COMMAND_CARD_REDISTRIBUTION_ACCEPTANCE_2026-08-11.md)、v1.0初期範囲の受入詳細は[`qa/V1_INITIAL_ACCEPTANCE_2026-08-10.md`](qa/V1_INITIAL_ACCEPTANCE_2026-08-10.md)を参照します。

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
