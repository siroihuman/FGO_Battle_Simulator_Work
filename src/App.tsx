import { RNG_ALGORITHM_VERSION, RNG_STREAM_NAMES } from "./core/rng";

export function App() {
  return (
    <main>
      <p className="eyebrow">FGO Battle Simulator Work</p>
      <h1>宣言的スキル・宝具効果基盤</h1>
      <p>
        戦闘UIの実装前に、スキル・クラススキル・宝具効果の固定値、宝具Lv別値、OC別値、対象範囲を型付きデータとして実行し、未対応効果を状態・乱数変更前に検出できることを検証しています。
      </p>
      <dl>
        <div>
          <dt>乱数処理バージョン</dt>
          <dd>{RNG_ALGORITHM_VERSION}</dd>
        </div>
        <div>
          <dt>独立乱数列</dt>
          <dd>{RNG_STREAM_NAMES.length}本</dd>
        </div>
      </dl>
    </main>
  );
}
