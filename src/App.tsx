import { RNG_ALGORITHM_VERSION, RNG_STREAM_NAMES } from "./core/rng";

export function App() {
  return (
    <main>
      <p className="eyebrow">FGO Battle Simulator Work</p>
      <h1>カード・敵攻撃データ入力基盤</h1>
      <p>
        戦闘UIの実装前に、味方カードと敵通常攻撃・宝具の個体別データを、攻撃トリガー・ダメージ・NP・スターの共通処理へ接続して検証しています。
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
