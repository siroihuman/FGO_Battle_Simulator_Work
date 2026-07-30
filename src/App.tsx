import { RNG_ALGORITHM_VERSION, RNG_STREAM_NAMES } from "./core/rng";

export function App() {
  return (
    <main>
      <p className="eyebrow">FGO Battle Simulator Work</p>
      <h1>編成・ターン・Wave基盤</h1>
      <p>
        戦闘UIの実装前に、計算・状態効果に加えて、ブレイク、毎ターン効果、自動交代、敵補充、CT、Wave進行、全滅戦の勝敗判定を確定順で接続する基盤を検証しています。
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
