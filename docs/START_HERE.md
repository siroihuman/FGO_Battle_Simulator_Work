# 作業開始ページ

仕様書バージョン: 1.0.0

## 現在地点

- フェーズ: 9／初期対象外カード再配布効果（仕様確定）
- 状態: v1.0初期範囲の統合受入合格後、コマンドシャッフル等のカード再配布について、味方入力境界、現在前衛の全通常カードからの新周期5枚、宝具候補除外、カード・クリティカル乱数順、カード別スター配分、原子的拒否、入力ログ、中断保存形式4の互換方針を確定済み。具体処理と登録コンテンツは未実装。
- 完成目標: `v1.0`
- 正本: このリポジトリの `main`、文書、実装、テスト。チャット履歴は正本にしない。

## 次の作業

1. 仕様確定済みの`redistribute_command_cards`を、現在前衛からの新周期5枚配布、入力境界スター配分、能動スキル操作ログ、中断保存形式4のデータ版移行、固定シード検証リプレイ、最小UIへ共通処理として実装する（システム実装担当、推奨モデル: `gpt-5.6-sol`、思考レベル: `high`）。テスト用宣言データで共通処理を検査し、新しいサーヴァント・魔術礼装等の具体データは追加しない。

統合受入の詳細は [`qa/V1_INITIAL_ACCEPTANCE_2026-08-10.md`](qa/V1_INITIAL_ACCEPTANCE_2026-08-10.md) を参照します。

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
