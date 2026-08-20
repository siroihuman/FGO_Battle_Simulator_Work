# 作業開始ページ

仕様書バージョン: 1.0.0

## 現在地点

- フェーズ: 19／v1.0初期完成範囲外サーヴァントの順次追加
- 状態: PR #70のサーヴァント分類一覧まで`main`へ統合済み。No.007「本多忠勝」の具体データ確認に先立ち、有限ターン状態を所持者側終了・相手側終了・手動へ分離した。聖母マリア「身籠る聖処女」のターゲット集中・対粛清防御は味方ターン終了後も敵行動中に残り、敵ターン終了で失効する。防御系・その他強化の既存代表データにも相手側終了を明示した。BattleSession、中断保存形式4・データ1.38.0、直接再開、固定シードリプレイ、カード再配布、6乱数列は変更していない。No.007は未実装のままである。
- 完成目標: `v1.0`
- 正本: このリポジトリの `main`、文書、実装、テスト。チャット履歴は正本にしない。

## 次の作業

1. `SERVANT_CLASSIFICATION.md`のカテゴリ1・No.順に従い、未実装のNo.007「本多忠勝」の具体データ確認・実装計画確定へ進む。

期限境界の修正は[`qa/EFFECT_DURATION_BOUNDARY_ACCEPTANCE_2026-08-21.md`](qa/EFFECT_DURATION_BOUNDARY_ACCEPTANCE_2026-08-21.md)、聖母マリアは[`qa/MOTHER_MARY_ACCEPTANCE_2026-08-20.md`](qa/MOTHER_MARY_ACCEPTANCE_2026-08-20.md)、千利休は[`qa/SEN_NO_RIKYU_ACCEPTANCE_2026-08-15.md`](qa/SEN_NO_RIKYU_ACCEPTANCE_2026-08-15.md)、支配のフォーリナーは[`qa/DOMINATION_FOREIGNER_ACCEPTANCE_2026-08-14.md`](qa/DOMINATION_FOREIGNER_ACCEPTANCE_2026-08-14.md)を参照します。具体サーヴァントの選定前には、[`SERVANT_CLASSIFICATION.md`](SERVANT_CLASSIFICATION.md)の確定済みカテゴリを確認します。

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
