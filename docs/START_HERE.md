# 作業開始ページ

仕様書バージョン: 1.0.0

## 現在地点

- フェーズ: 19／v1.0初期完成範囲外サーヴァントの順次追加
- 状態: 初期完成範囲外の追加サーヴァントとして、No.024’「支配のフォーリナー」に続き公式No.362「千利休」を登録した。千利休の8段階能力値、Q3／A1／B1、上位3スキル、4クラススキル、〔人の力〕OC特攻全体Quick宝具、宝具封印、呪い、OC+2、無敵、Quick攻撃前の対象限定防御力ダウンを共通処理へ接続した。味方編成は「公式」／「オリジナル」の2タブへ分け、横スクロールなしで収め、公式は光のコヤンスカヤ→千利休、オリジナルは支配のフォーリナー→ルシフェラのNo.昇順で表示する。千利休のNP獲得量アップは`Npchargeup`、色限定クリティカル威力アップは汎用`Critdmgup`へ訂正した。BattleSession、中断保存形式4・データ1.38.0、直接再開、固定シードリプレイ、カード再配布を維持し、自動検査完了・実画面受入待ちである。
- 完成目標: `v1.0`
- 正本: このリポジトリの `main`、文書、実装、テスト。チャット履歴は正本にしない。

## 次の作業

1. 千利休と公式／オリジナル編成タブをPC・スマートフォンで実画面確認する。
2. 合格後、カテゴリ1の未登録サーヴァントからNo.が次に若い1騎だけを選定する。

千利休は[`qa/SEN_NO_RIKYU_ACCEPTANCE_2026-08-15.md`](qa/SEN_NO_RIKYU_ACCEPTANCE_2026-08-15.md)、支配のフォーリナーは[`qa/DOMINATION_FOREIGNER_ACCEPTANCE_2026-08-14.md`](qa/DOMINATION_FOREIGNER_ACCEPTANCE_2026-08-14.md)、ターン終了スター獲得は[`qa/TURN_END_STAR_GAIN_ACCEPTANCE_2026-08-11.md`](qa/TURN_END_STAR_GAIN_ACCEPTANCE_2026-08-11.md)、敵宝具段階文脈は[`qa/ENEMY_NP_CONTEXT_ACCEPTANCE_2026-08-11.md`](qa/ENEMY_NP_CONTEXT_ACCEPTANCE_2026-08-11.md)、従来のv1.0初期範囲は[`qa/V1_INITIAL_ACCEPTANCE_2026-08-10.md`](qa/V1_INITIAL_ACCEPTANCE_2026-08-10.md)を参照します。

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
