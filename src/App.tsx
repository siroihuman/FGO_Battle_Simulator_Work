import { RNG_ALGORITHM_VERSION, RNG_STREAM_NAMES } from "./core/rng";

export function App() {
  return (
    <main>
      <p className="eyebrow">FGO Battle Simulator Work</p>
      <h1>攻撃トリガー列基盤</h1>
      <p>
        戦闘UIの実装前に、攻撃前、各Hit、被ダメージ、攻撃後、死亡時効果を単体・全体攻撃へ順序どおり接続して検証しています。
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
