import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AllySlotEditor, BattleScreen } from "../src/App";
import { listCommandCardChoices } from "../src/core/cards/selection";
import { resolveBattleSessionTurn } from "../src/core/battle/session";
import {
  DOMINATION_FOREIGNER,
  LIGHT_KOYANSKAYA,
  LUCIFERA,
  SEN_NO_RIKYU,
} from "../src/data/servants";
import {
  confirmedAttackDamageAmounts,
  confirmedPlaybackNotices,
  confirmedChainNotices,
  confirmedHpTransitions,
  confirmedNpTransitions,
  displayedCommandCardCriticalRatePermille,
  presentNoblePhantasmDetail,
  presentBattleSummary,
  presentBattleTurns,
  registeredServantWikiUrl,
  selectedChainCriticalBonus,
  toggleSelectedCommandCard,
} from "../src/ui/battleUi";
import {
  effectExpiryLabel,
  effectValueLabel,
  presentCombinedEffects,
  presentUnitEffects,
} from "../src/ui/effectPresentation";
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

  it("previews Quick-first immediately and removes it when Quick is no longer first", () => {
    const choices = listCommandCardChoices(session().loop.state).map(({ card }) => card);
    const quick = choices.find(({ type }) => type === "quick");
    const arts = choices.find(({ type }) => type === "arts");
    const buster = choices.find(({ type }) => type === "buster");
    expect(quick && arts && buster).toBeTruthy();
    expect(selectedChainCriticalBonus(
      [quick!.cardId, arts!.cardId, buster!.cardId],
      choices,
    )).toBe(true);
    expect(selectedChainCriticalBonus([quick!.cardId], choices)).toBe(true);
    expect(displayedCommandCardCriticalRatePermille(
      arts!.cardId,
      300,
      [quick!.cardId],
      choices,
    )).toBe(500);
    expect(selectedChainCriticalBonus([arts!.cardId, quick!.cardId], choices))
      .toBe(false);
    expect(displayedCommandCardCriticalRatePermille(
      quick!.cardId,
      300,
      [arts!.cardId, quick!.cardId],
      choices,
    )).toBe(300);
    expect(displayedCommandCardCriticalRatePermille(
      arts!.cardId,
      900,
      [quick!.cardId],
      choices,
    )).toBe(1_000);
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
      .toBe("/FGO_Battle_Simulator_Work/assets/skill-icons/skill-np-charge.png");
    const noblePower = effects.find(({ applied }) =>
      applied.name === "宝具威力アップ"
    );
    expect(noblePower).toBeDefined();
    expect(registeredStatusIconPath(noblePower!.applied))
      .toBe("/FGO_Battle_Simulator_Work/assets/status-icons/Nppowerup.webp");
    const recurring = effects.find(({ applied }) =>
      applied.name === "毎ターンHP減少"
    );
    expect(recurring?.sourceKind).toBe("craft_essence");
    expect(recurring?.description).toContain("毎ターンHP500減少");
    const effectByName = new Map(
      unit.effects.map((effect) => [effect.name, effect]),
    );
    expect(registeredStatusIconPath(effectByName.get("Artsカード性能アップ")!))
      .toBe("/FGO_Battle_Simulator_Work/assets/status-icons/Artsupstatus.webp");
    expect(registeredStatusIconPath(effectByName.get("Quickカード性能アップ")!))
      .toBe("/FGO_Battle_Simulator_Work/assets/status-icons/Quickupstatus.webp");
    expect(registeredStatusIconPath(effectByName.get("スター発生率アップ")!))
      .toBe("/FGO_Battle_Simulator_Work/assets/status-icons/Stargainup.webp");
    expect(registeredStatusIconPath(effectByName.get("精神異常耐性アップ")!))
      .toBe("/FGO_Battle_Simulator_Work/assets/status-icons/Resistanceup.webp");
    expect(unspecifiedEffectNames(unit.effects)).toEqual([]);

    const lucifera = started.loop.state.formation.ally.frontline[1]!;
    const fixedDamage = lucifera.effects.find((effect) =>
      effect.name === "与ダメージプラス"
    );
    expect(fixedDamage).toBeDefined();
    expect(registeredStatusIconPath(fixedDamage!))
      .toBe("/FGO_Battle_Simulator_Work/assets/status-icons/Powerup.webp");
    expect(unspecifiedEffectNames(lucifera.effects)).toEqual([]);
  });

  it("formats rate values as percent and combines matching effects across every source", () => {
    const started = session();
    const koyanskaya = started.loop.state.formation.ally.frontline[0]!;
    const combined = presentCombinedEffects(
      presentUnitEffects(started, koyanskaya),
    );
    const noblePhantasmDamage = combined.find(({ displayName }) =>
      displayName === "宝具威力"
    );
    expect(noblePhantasmDamage?.totalValue).toBe(1_000);
    expect(effectValueLabel(
      noblePhantasmDamage!.applied,
      noblePhantasmDamage!.totalValue,
    )).toBe("100%");
    expect(noblePhantasmDamage?.combinedMembers?.map(({ sourceKind }) => sourceKind))
      .toEqual(expect.arrayContaining(["class_skill", "craft_essence"]));
    expect(effectValueLabel({ effectType: "card_performance" }, 500))
      .toBe("50%");
    expect(effectExpiryLabel({ remainingTurns: 3, remainingUses: 1 }))
      .toBe("3T・1回");
    expect(effectExpiryLabel({ remainingTurns: null, remainingUses: null }))
      .toBeNull();

    const lucifera = started.loop.state.formation.ally.frontline[1]!;
    const fixedDamage = presentCombinedEffects(
      presentUnitEffects(started, lucifera),
    ).find(({ applied }) => applied.effectType === "fixed_damage");
    expect(effectValueLabel(fixedDamage!.applied, fixedDamage!.totalValue))
      .toBe("175");

    const nobleMembers = presentUnitEffects(started, koyanskaya).filter(
      ({ applied }) => applied.effectType === "noble_phantasm_damage",
    );
    const down = {
      ...nobleMembers[0],
      key: "np-down",
      sourceKind: "active_skill" as const,
      sourceName: "テスト用宝具",
      applied: {
        ...nobleMembers[0].applied,
        instanceId: "effect-np-down",
        name: "宝具威力ダウン",
        value: -400,
        remainingTurns: 2,
      },
    };
    const net = presentCombinedEffects([...nobleMembers, down])[0];
    expect(net.totalValue).toBe(600);
    expect(effectValueLabel(net.applied, net.totalValue)).toBe("60%");
    expect(net.combinedMembers?.map(({ applied }) => applied.remainingTurns))
      .toEqual(expect.arrayContaining([null, 2]));
  });

  it("presents every registered noble-phantasm effect on its own detail line", () => {
    const started = session();
    const detail = presentNoblePhantasmDetail(
      started.loop.state.formation.ally.frontline[0],
    );
    expect(detail).toMatchObject({
      title: LIGHT_KOYANSKAYA.noblePhantasm.name,
      rank: LIGHT_KOYANSKAYA.noblePhantasm.rank,
      level: 1,
    });
    expect(detail?.descriptions).toHaveLength(
      LIGHT_KOYANSKAYA.noblePhantasm.effects.length,
    );
    expect(detail?.descriptions).toContain(
      "＋敵全体に強力な攻撃[Lv]：300% / 400% / 450% / 475% / 500%",
    );
    expect(detail?.descriptions).toContain(
      "＋味方全体のNPを少し増やす<OC:効果UP>：10% / 15% / 20% / 25% / 30%",
    );
    const luciferaDetail = presentNoblePhantasmDetail(
      started.loop.state.formation.ally.frontline[1],
    );
    expect(luciferaDetail?.descriptions).toContain(
      "＆〔悪〕特攻<OC:特攻威力UP>：150% / 162.5% / 175% / 187.5% / 200%",
    );
    expect(LUCIFERA.activeSkills[2].effects.map(({ description }) => description))
      .toEqual([
        "〔悪〕特性の味方全体のスキルチャージを1進める",
        "＋味方単体のNPを倍化する[Lv]：100%",
        "＆「ターン終了時に自身の強化状態を解除する状態」を付与【デメリット】",
      ]);
  });

  it("uses explicit quest-special metadata for enemy tabs without guessing", () => {
    const started = session();
    const allyEffect = started.loop.state.formation.ally.frontline[0]!.effects[0];
    const enemy = started.loop.state.formation.enemy.frontline[0]!;
    const presented = presentUnitEffects(started, {
      ...enemy,
      effects: [
        {
          ...allyEffect,
          instanceId: "enemy-normal-effect",
          targetInstanceId: enemy.instanceId,
        },
        {
          ...allyEffect,
          instanceId: "enemy-special-effect",
          stableId: "quest-special-effect",
          targetInstanceId: enemy.instanceId,
          flags: { ...allyEffect.flags, questSpecial: true },
        },
      ],
    });
    expect(presented.map(({ enemyTab }) => enemyTab))
      .toEqual(["normal", "special"]);
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
    const hpTransitions = confirmedHpTransitions(
      started.loop.state,
      progressed.session.loop.state,
    );
    expect(hpTransitions.length).toBeGreaterThan(0);
    expect(hpTransitions.every(({ hpBefore, hpAfter }) => hpBefore !== hpAfter))
      .toBe(true);
    const departedEnemy = started.loop.state.formation.enemy.frontline[0]!;
    const departed = confirmedHpTransitions(started.loop.state, {
      ...started.loop.state,
      formation: {
        ...started.loop.state.formation,
        enemy: {
          ...started.loop.state.formation.enemy,
          frontline: [
            null,
            ...started.loop.state.formation.enemy.frontline.slice(1),
          ],
        },
      },
    });
    expect(departed).toContainEqual(expect.objectContaining({
      instanceId: departedEnemy.instanceId,
      hpBefore: departedEnemy.hp,
      hpAfter: 0,
    }));
    const npUnit = started.loop.state.formation.ally.frontline[0]!;
    const npAfter = {
      ...started.loop.state,
      formation: {
        ...started.loop.state.formation,
        ally: {
          ...started.loop.state.formation.ally,
          frontline: started.loop.state.formation.ally.frontline.map((unit) =>
            unit?.instanceId === npUnit.instanceId
              ? { ...unit, np: unit.np + 250 }
              : unit
          ),
        },
      },
    };
    expect(confirmedNpTransitions(started.loop.state, npAfter))
      .toContainEqual(expect.objectContaining({
        instanceId: npUnit.instanceId,
        npBefore: npUnit.np,
        npAfter: npUnit.np + 250,
      }));
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
    const firstAttack = turns[0].sections
      .flatMap(({ entries }) => entries)
      .find((entry) => entry.kind === "action" && "attack" in entry.detail && entry.detail.attack);
    if (!firstAttack || !("attack" in firstAttack.detail) || !firstAttack.detail.attack) {
      throw new Error("確定攻撃ログがありません");
    }
    const loggedDamage = firstAttack.detail.attack.targets[0].totalDamage;
    expect(confirmedAttackDamageAmounts([firstAttack])[0]?.damage).toBe(loggedDamage);
    const hpLossMustNotReplaceDamage = {
      ...firstAttack,
      actualHpLoss: 1,
      detail: {
        ...firstAttack.detail,
        attack: {
          ...firstAttack.detail.attack,
          targets: firstAttack.detail.attack.targets.map((target, index) =>
            index === 0
              ? { ...target, totalDamage: loggedDamage + 1_234, actualHpLoss: 1 }
              : target
          ),
        },
      },
    };
    expect(confirmedAttackDamageAmounts([hpLossMustNotReplaceDamage])[0]?.damage)
      .toBe(loggedDamage + 1_234);
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
    expect(markup).toContain("その他");
    expect(markup).toContain("通常");
    expect(markup).toContain("特殊");
    expect(markup).toContain("合算");
    expect(markup).toContain('aria-selected="true">その他</button>');
    expect(markup).toContain('aria-selected="true">通常</button>');
    expect(markup.indexOf("魔術礼装スキル"))
      .toBeGreaterThan(markup.indexOf("前衛3"));
    expect(markup.indexOf('aria-label="光のコヤンスカヤ 保有スキル"'))
      .toBeLessThan(markup.indexOf('aria-label="光のコヤンスカヤ 効果分類"'));
    expect(markup.match(/class=\"command-card (?:quick|arts|buster)/g)).toHaveLength(
      listCommandCardChoices(started.loop.state).length,
    );
    expect(markup.indexOf("宝具カード"))
      .toBeLessThan(markup.indexOf("コマンドカード</h3>"));
    expect(markup).toContain("noble-phantasm-card-grid");
    expect(markup).toContain("normal-command-card-grid");
    expect(markup.match(/class=\"card-detail-button\"/g)).toHaveLength(3);
    expect(markup).toContain("今回のシード：<code>completed-ui</code>");
    expect(markup).toContain("戦闘状態要約");
    expect(markup).toContain("src=\"/FGO_Battle_Simulator_Work/assets/skill-icons/skill-np-charge.png\"");
    expect(registeredServantWikiUrl(LIGHT_KOYANSKAYA.dataId))
      .toBe("https://w.atwiki.jp/f_go/pages/5141.html");
    expect(registeredServantWikiUrl(LUCIFERA.dataId))
      .toBe("https://w.atwiki.jp/siroi_human/pages/795.html");
    expect(registeredServantWikiUrl("unregistered-servant")).toBeNull();
    expect(markup).toContain('href="https://w.atwiki.jp/f_go/pages/5141.html"');
    expect(markup).toContain('href="https://w.atwiki.jp/siroi_human/pages/795.html"');
    expect(markup).toContain('class="servant-wiki-link"');

    const setupMarkup = renderToStaticMarkup(createElement(AllySlotEditor, {
      label: "前衛1",
      required: true,
      selection: ally(LUCIFERA.dataId),
      onChange: () => undefined,
    }));
    expect(setupMarkup.indexOf("wikiを開く"))
      .toBeGreaterThan(setupMarkup.indexOf("概念礼装"));
    expect(setupMarkup).toContain(
      'href="https://w.atwiki.jp/siroi_human/pages/795.html"',
    );
    expect(setupMarkup).toContain('target="_blank"');
    expect(setupMarkup).toContain("公式サーヴァント");
    expect(setupMarkup).toContain("オリジナルサーヴァント");
    expect(setupMarkup).toContain(
      'aria-selected="true">オリジナルサーヴァント</button>',
    );
    expect(setupMarkup.indexOf(
      '<option value="domination-foreigner">No.024’ 支配のフォーリナー',
    )).toBeLessThan(setupMarkup.indexOf(
      '<option value="lucifera" selected="">No.062 ルシフェラ',
    ));

    const officialSetupMarkup = renderToStaticMarkup(createElement(AllySlotEditor, {
      label: "前衛1",
      required: true,
      selection: ally(LIGHT_KOYANSKAYA.dataId),
      onChange: () => undefined,
    }));
    expect(officialSetupMarkup).toContain(
      'aria-selected="true">公式サーヴァント</button>',
    );
    expect(officialSetupMarkup.indexOf(
      '<option value="koyanskaya-of-light" selected="">No.314 光のコヤンスカヤ',
    )).toBeLessThan(officialSetupMarkup.indexOf(
      '<option value="sen-no-rikyu">No.362 千利休',
    ));
    expect(registeredServantWikiUrl(SEN_NO_RIKYU.dataId))
      .toBe("https://w.atwiki.jp/f_go/pages/5723.html");

    const dominationSetupMarkup = renderToStaticMarkup(createElement(AllySlotEditor, {
      label: "前衛1",
      required: true,
      selection: ally(DOMINATION_FOREIGNER.dataId),
      onChange: () => undefined,
    }));
    expect(dominationSetupMarkup).toContain("wikiを開く");
    expect(dominationSetupMarkup).not.toContain(
      "No.024’ / フォーリナー / ATK偏重 / 魔術",
    );
  });

});
