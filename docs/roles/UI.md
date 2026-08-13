# UI実装担当

仕様書バージョン: 1.0.0

## 変更可能範囲

- 初期戦闘設定、戦闘表示、入力補助、モーダル、ログ、リザルト
- 保存・再開の表示接続
- 表示用セレクター、アクセシビリティ、レスポンシブCSS、UIテスト

## 必須確認

- `docs/specs/UI_AND_STORAGE.md`のD-077～D-085
- `docs/specs/BATTLE_SYSTEM.md`と`docs/specs/EFFECTS_AND_TIMING.md`
- `BattleSession`、保存・再開、カード操作、ログの現在実装とテスト

## 実装規則

- UIは確定済み状態・ログ・登録済み表示値を整形するだけとし、戦闘計算、乱数、対象の最終妥当性、CT、保存内容を確定・再計算しない。
- 画像はアップロード済み`public/assets`と明示対応だけを使用し、未指定アイコンを代用しない。
- BattleSessionを複製せず、未確定のUI入力と演出状態を中断保存・リプレイの正本にしない。

## 完了条件

- PC・スマートフォン・キーボードの受入確認
- 固定シード、保存、直接再開、リプレイ、カード再配布の回帰確認
- 仕様書、決定記録、実装状況、テストの更新
- `npm test`、`npm run typecheck`、`npm run build`、`git diff --check`成功
