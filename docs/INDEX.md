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
| 初期データ | [`specs/INITIAL_CONTENT.md`](specs/INITIAL_CONTENT.md) |

## 役割別指示と依頼テンプレート

| 役割 | 指示 | テンプレート |
|---|---|---|
| システム | [`roles/SYSTEM.md`](roles/SYSTEM.md) | — |
| サーヴァント | [`roles/SERVANT.md`](roles/SERVANT.md) | [`templates/SERVANT_ADDITION.md`](templates/SERVANT_ADDITION.md) |
| 概念礼装 | [`roles/CRAFT_ESSENCE.md`](roles/CRAFT_ESSENCE.md) | [`templates/CRAFT_ESSENCE_ADDITION.md`](templates/CRAFT_ESSENCE_ADDITION.md) |
| 魔術礼装 | [`roles/MYSTIC_CODE.md`](roles/MYSTIC_CODE.md) | [`templates/MYSTIC_CODE_ADDITION.md`](templates/MYSTIC_CODE_ADDITION.md) |
| 敵 | [`roles/ENEMY.md`](roles/ENEMY.md) | [`templates/ENEMY_ADDITION.md`](templates/ENEMY_ADDITION.md) |
| 不具合 | — | [`templates/BUG_REPORT.md`](templates/BUG_REPORT.md) |

## 引継ぎと履歴

- 作業途中の引継ぎ: [`HANDOFF_TEMPLATE.md`](HANDOFF_TEMPLATE.md)
- 詳細な完了履歴・決定理由・旧規則: [`archive/README.md`](archive/README.md)

詳細仕様は現在も有効な正本です。履歴を確認する必要がある場合だけアーカイブを開いてください。
