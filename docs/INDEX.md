# 文書案内

仕様書バージョン: 1.0.0

## 最初に読むもの

| 文書 | 用途 |
|---|---|
| [`AGENTS.md`](../AGENTS.md) | 全作業者に適用する最優先規則 |
| [`START_HERE.md`](START_HERE.md) | 現在地点、次の作業、最短の読取順 |
| [`PROJECT_RULES.md`](PROJECT_RULES.md) | 必須規則の短縮版 |
| [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md) | 進捗、未実装、検査基準 |

`project-manifest.json` はコア規則・データ形式・仕様書バージョンに関わる変更で読む機械判定用の正本です。

## 依頼に応じて読むもの

| 種別 | 文書 |
|---|---|
| 設計 | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| 戦闘・編成・敵 | [`specs/BATTLE_SYSTEM.md`](specs/BATTLE_SYSTEM.md) |
| 計算・乱数 | [`specs/CALCULATIONS_AND_RNG.md`](specs/CALCULATIONS_AND_RNG.md) |
| 効果・状態・発動順 | [`specs/EFFECTS_AND_TIMING.md`](specs/EFFECTS_AND_TIMING.md) |
| UI・保存 | [`specs/UI_AND_STORAGE.md`](specs/UI_AND_STORAGE.md) |
| 初期データ | [`specs/INITIAL_CONTENT.md`](specs/INITIAL_CONTENT.md)（旧称入口: [`specs/INITIAL_DATA.md`](specs/INITIAL_DATA.md)） |

## 役割別指示と依頼テンプレート

| 役割 | 指示 | テンプレート |
|---|---|---|
| システム | [`roles/SYSTEM.md`](roles/SYSTEM.md) | — |
| サーヴァント | [`roles/SERVANT.md`](roles/SERVANT.md) | [`templates/SERVANT_ADDITION.md`](templates/SERVANT_ADDITION.md) |
| 概念礼装 | [`roles/CRAFT_ESSENCE.md`](roles/CRAFT_ESSENCE.md) | [`templates/CRAFT_ESSENCE_ADDITION.md`](templates/CRAFT_ESSENCE_ADDITION.md) |
| 魔術礼装 | [`roles/MYSTIC_CODE.md`](roles/MYSTIC_CODE.md) | [`templates/MYSTIC_CODE_ADDITION.md`](templates/MYSTIC_CODE_ADDITION.md) |
| 敵 | [`roles/ENEMY.md`](roles/ENEMY.md) | [`templates/ENEMY_ADDITION.md`](templates/ENEMY_ADDITION.md) |
| UI | [`roles/UI.md`](roles/UI.md) | — |
| 不具合 | — | [`templates/BUG_REPORT.md`](templates/BUG_REPORT.md) |

## 引継ぎと履歴

- 作業途中の引継ぎ: [`HANDOFF_TEMPLATE.md`](HANDOFF_TEMPLATE.md)
- v1.0初期範囲の統合受入結果: [`qa/V1_INITIAL_ACCEPTANCE_2026-08-10.md`](qa/V1_INITIAL_ACCEPTANCE_2026-08-10.md)
- カード再配布共通処理の統合受入結果: [`qa/COMMAND_CARD_REDISTRIBUTION_ACCEPTANCE_2026-08-11.md`](qa/COMMAND_CARD_REDISTRIBUTION_ACCEPTANCE_2026-08-11.md)
- 魔術協会制服の統合受入結果: [`qa/MAGE_ASSOCIATION_UNIFORM_ACCEPTANCE_2026-08-11.md`](qa/MAGE_ASSOCIATION_UNIFORM_ACCEPTANCE_2026-08-11.md)
- スリップダメージ倍加の統合受入結果: [`qa/SLIP_DAMAGE_AMPLIFICATION_ACCEPTANCE_2026-08-11.md`](qa/SLIP_DAMAGE_AMPLIFICATION_ACCEPTANCE_2026-08-11.md)
- 敵宝具Lv・OC文脈と段階別宣言値の統合受入結果: [`qa/ENEMY_NP_CONTEXT_ACCEPTANCE_2026-08-11.md`](qa/ENEMY_NP_CONTEXT_ACCEPTANCE_2026-08-11.md)
- ターン終了トリガーによるスター獲得の統合受入結果: [`qa/TURN_END_STAR_GAIN_ACCEPTANCE_2026-08-11.md`](qa/TURN_END_STAR_GAIN_ACCEPTANCE_2026-08-11.md)
- UI完成仕様の受入結果: [`qa/UI_COMPLETION_ACCEPTANCE_2026-08-13.md`](qa/UI_COMPLETION_ACCEPTANCE_2026-08-13.md)
- No.024’「支配のフォーリナー」の受入結果: [`qa/DOMINATION_FOREIGNER_ACCEPTANCE_2026-08-14.md`](qa/DOMINATION_FOREIGNER_ACCEPTANCE_2026-08-14.md)
- No.362「千利休」と編成区分タブの受入結果: [`qa/SEN_NO_RIKYU_ACCEPTANCE_2026-08-15.md`](qa/SEN_NO_RIKYU_ACCEPTANCE_2026-08-15.md)
- No.070「聖母マリア」の受入状況: [`qa/MOTHER_MARY_ACCEPTANCE_2026-08-20.md`](qa/MOTHER_MARY_ACCEPTANCE_2026-08-20.md)
- 詳細な完了履歴・決定理由・旧規則: [`archive/README.md`](archive/README.md)

詳細仕様は現在も有効な正本です。履歴を確認する必要がある場合だけアーカイブを開いてください。
