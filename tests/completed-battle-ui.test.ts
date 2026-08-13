import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BattleScreen } from "../src/App";
import { listCommandCardChoices } from "../src/core/cards/selection";
import { resolveBattleSessionTurn } from "../src/core/battle/session";
import { LIGHT_KOYANSKAYA, LUCIFERA } from "../src/data/servants";
import {
  confirmedPlaybackNotices,
  confirmedChainNotices,
  presentBattleSummary,
  presentBattleTurns,
  selectedChainCriticalBonus,
  toggleSelectedCommandCard,
} from "../src/ui/battleUi";
import { presentUnitEffects } from "../src/ui/effectPresentation";
import {
  registeredSkillIconPath,
  registeredStatusIconPath,
  unspecifiedEffectNames,
} from "../src/ui/iconRegistry";
import {
  createEmptyInitialBattleSetup,
  createInitialBattleSession,
  type InitialAllySlotSelection,
} from "../src/ui/initialBattle";

function ally(
  servantDataId: string,
  craftEssenceDataId: string | null = null,
): InitialAllySlotSelection {
  return {
    servantDataId,
    level: 90,
    noblePhantasmLevel: 1,
    craftEssenceDataId,
  };
}

function session() {
  const setup = createEmptyInitialBattleSetup();
  setup.frontline = [
    ally(LIGHT_KOYANSKAYA.dataId, "black-grail"),
    ally(LUCIFERA.dataId),
    ally(LIGHT_KOYANSKAYA.dataId),
  ];
  setup.mysticCodeDataId = "normal-chaldea-uniform";
  setup.seedMode = "fixed";
  setup.seed = "completed-ui";
  return createInitialBattleSession(setup);
}

describe("completed battle UI selectors", () => {
  it("caps command selection at three while keeping selected cards removable", () => {
    expect(toggleSelectedCommandCard(["a", "b", "c"], "d"))
      .toEqual(["a", "b", "c"]);
    expect(toggleSelectedCommandCard(["a", "b", "c"], "b"))
      .toEqual(["a", "c"]);
  });

  it("labels Quick-start and Mighty normal-card bonuses only after three choices", () => {
    const choices = listCommandCardChoices(session().loop.state).map(({ card }) => card);
    const quick = choices.find(({ type }) => type === "quick");
    const arts = choices.find(({ type }) => type === "arts");
    const buster = choices.find(({ type }) => type === "buster");
    expect(quick && arts && buster).toBeTruthy();
    expect(selectedChainCriticalBonus(
      [quick!.cardId, arts!.cardId, buster!.cardId],
      choices,
    )).toBe(true);
    expect(selectedChainCriticalBonus([quick!.cardId, arts!.cardId], choices))
      .toBe(false);
  });

  it("uses confirmed engine chain facts for every chain notice", () => {
    expect(confirmedChainNotices({
      chainError: false,
      colorChain: "arts",
      mightyChain: false,
      braveChain: true,
    })).toEqual(["Arts Chain成立", "Brave Chain成立"]);
    expect(confirmedChainNotices({
      chainError: true,
      colorChain: "buster",
      mightyChain: false,
      braveChain: true,
    })).toEqual([]);
  });

  it("uses only explicit uploaded-asset mappings and reports unmapped effects", () => {
    const started = session();
    const unit = started.loop.state.formation.ally.frontline[0]!;
    const effects = presentUnitEffects(started, unit);
    expect(registeredSkillIconPath("イノベイター・バニー"))
      .toBe("/assets/skill-icons/skill-np-charge.png");
    const noblePower = effects.find(({ applied }) =>
      applied.name === "宝具威力アップ"
    );
    expect(noblePower).toBeDefined();
    expect(registeredStatusIconPath(noblePower!.applied))
      .toBe("/assets/status-icons/Nppowerup.webp");
    const recurring = effects.find(({ applied }) =>
      applied.name === "毎ターンHP減少"
    );
    expect(recurring?.sourceKind).toBe("craft_essence");
    expect(recurring?.description).toContain("毎ターンHP500減少");
    expect(unspecifiedEffectNames(unit.effects)).toEqual([
      "Artsカード性能アップ",
      "Quickカード性能アップ",
      "スター発生率アップ",
      "精神異常耐性アップ",
    ]);
  });

  it("presents save summaries and four saved-log sections without re-running battle rules", () => {
    const started = session();
    const summary = presentBattleSummary(started);
    expect(summary).toMatchObject({
      wave: "1 / 3",
      turn: 1,
      seed: "completed-ui",
    });
    expect(summary.frontline).toHaveLength(3);
    const cards = started.loop.state.commandDeck.currentHand
      .slice(0, 3)
      .map(({ cardId }) => cardId);
    const progressed = resolveBattleSessionTurn(started, {
      cardIds: cards,
      ally: { requestedTargetInstanceId: "enemy-w1-1" },
    });
    expect(progressed.result.accepted).toBe(true);
    const turns = presentBattleTurns(
      progressed.session.turnLogs,
      progressed.session.inputLogs,
    );
    expect(turns[0].sections.map(({ label }) => label)).toEqual([
      "スキル・味方行動",
      "味方ターン終了",
      "敵行動",
      "敵ターン終了",
    ]);
    expect(confirmedPlaybackNotices(progressed.session.turnLogs[0]))
      .toEqual(expect.arrayContaining(["味方ターン終了", "敵ターン終了"]));
  });

  it("renders the required battle regions in order with source tabs, five cards, seed, and save summary", () => {
    const started = session();
    const markup = renderToStaticMarkup(createElement(BattleScreen, {
      session: started,
      onSessionChange: () => undefined,
      onReturnToSetup: () => undefined,
      onFixedSeedToSetup: () => undefined,
    }));
    const headings = [
      "戦闘状況",
      "敵前衛",
      "味方前衛・控え・魔術礼装",
      "コマンドカード・実行",
      "戦闘ログ",
      "保存・再開",
    ];
    headings.reduce((previous, heading) => {
      const current = markup.indexOf(heading);
      expect(current).toBeGreaterThan(previous);
      return current;
    }, -1);
    expect(markup).toContain("クラススキル");
    expect(markup).toContain("概念礼装");
    expect(markup).toContain("保有スキル・宝具");
    expect(markup).toContain("敵スキル・宝具");
    expect(markup).toContain("その他の状態");
    expect(markup.match(/class=\"command-card/g)).toHaveLength(
      listCommandCardChoices(started.loop.state).length,
    );
    expect(markup).toContain("今回のシード：<code>completed-ui</code>");
    expect(markup).toContain("戦闘状態要約");
    expect(markup).toContain("src=\"/assets/skill-icons/skill-np-charge.png\"");
  });

});
