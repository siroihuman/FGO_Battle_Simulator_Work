import { RNG_ALGORITHM_VERSION, RNG_STREAM_NAMES } from "./core/rng";

export function App() {
  return (
    <main>
      <p className="eyebrow">FGO Battle Simulator Work</p>
      <h1>1戦闘ターン時系列ログ基盤</h1>
      <p>
        戦闘UIの実装前に、味方・敵の行動、双方の終了時効果、ブレイク、交代、CT、Wave移行、勝敗、乱数位置を、固定シードで再現できる時系列ログとして検証しています。
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
