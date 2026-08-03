import { RNG_ALGORITHM_VERSION, RNG_STREAM_NAMES } from "./core/rng";

export function App() {
  return (
    <main>
      <p className="eyebrow">FGO Battle Simulator Work</p>
      <h1>宝具前後効果・敵スキル統合</h1>
      <p>
        戦闘UIの実装前に、資料順の宝具攻撃前後効果と敵スキルを、既存の攻撃・死亡・補充・1戦闘ターンへ接続し、実行済み結果を形式2の行動ログへ保存できることを検証しています。
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
