import { RNG_ALGORITHM_VERSION, RNG_STREAM_NAMES } from "./core/rng";

export function App() {
  return (
    <main>
      <p className="eyebrow">FGO Battle Simulator Work</p>
      <h1>1戦闘ターン統合基盤</h1>
      <p>
        戦闘UIの実装前に、味方カード、味方終了時、敵行動、敵終了時を固定シードで連続実行し、勝敗や次Waveを飛ばさず安全な入力地点へ進める共通基盤を検証しています。
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
