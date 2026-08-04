import { RNG_ALGORITHM_VERSION, RNG_STREAM_NAMES } from "./core/rng";

export function App() {
  return (
    <main>
      <p className="eyebrow">FGO Battle Simulator Work</p>
      <h1>動的特性・条件付き宝具特攻</h1>
      <p>
        戦闘UIの実装前に、期限付きの特性付与を対象・威力条件へ共通反映し、宝具攻撃前に付与した特性で同じ宝具の条件付き特攻を対象別に解決できることを検証しています。
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
