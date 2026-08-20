# 作業開始ページ

仕様書バージョン: 1.0.0

## 現在地点

- フェーズ: 19／v1.0初期完成範囲外サーヴァントの順次追加
- 状態: 初期完成範囲外の追加対象として、オリジナルNo.070「聖母マリア」の最終再臨版を登録した。8段階能力値、Q1／A3／B1、上位3スキル、5クラススキル、〔天の力〕OC特攻全体Arts宝具、OC別HP回復・NP増加、最大HPアップ、ターゲット集中、対粛清防御を共通処理へ接続した。編成では各戦闘個体のHP・ATKフォウを各0～3000で指定でき、旧保存の欠落値は0として読み込む。通常ターゲット集中は`Tauntup`、「外道の知識（姉なるもの） EX」は`skill-hp-heal-per-turn`を使用する。BattleSession、中断保存形式4・データ1.38.0、直接再開、固定シードリプレイ、カード再配布は変更していない。自動検査後、ユーザー実画面受入待ちとする。
- 完成目標: `v1.0`
- 正本: このリポジトリの `main`、文書、実装、テスト。チャット履歴は正本にしない。

## 次の作業

1. No.070「聖母マリア」をPC・スマートフォン実画面で確認し、必要な表示修正と最終受入を行う。

聖母マリアは[`qa/MOTHER_MARY_ACCEPTANCE_2026-08-20.md`](qa/MOTHER_MARY_ACCEPTANCE_2026-08-20.md)、千利休は[`qa/SEN_NO_RIKYU_ACCEPTANCE_2026-08-15.md`](qa/SEN_NO_RIKYU_ACCEPTANCE_2026-08-15.md)、支配のフォーリナーは[`qa/DOMINATION_FOREIGNER_ACCEPTANCE_2026-08-14.md`](qa/DOMINATION_FOREIGNER_ACCEPTANCE_2026-08-14.md)を参照します。

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
