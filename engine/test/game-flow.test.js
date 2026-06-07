// 端到端：游戏流程（决斗 / AOE / 锦囊 / 装备链）
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTestGame, makeCard, giveCards, equipPlayer, freezeAfterAction } from './helpers.js';
import { checkGameOver } from '../src/core/Logic.js';

const FOUR_IDS = [
  { key: 'core', team: 'core_side', name: '核心', goal: '' },
  { key: 'teammate', team: 'core_side', name: '队友', goal: '' },
  { key: 'opponent', team: 'opponent_side', name: '对手', goal: '' },
  { key: 'solo', team: 'solo', name: '独狼', goal: '' },
];

describe('决斗（juedou）', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('被使用方先出投；如果先方无投则受伤', () => {
    const g = makeTestGame({ identities: FOUR_IDS, humanIndex: 0 });
    freezeAfterAction(g);
    const [a, b] = g.players;
    a.handCards = [makeCard('sha'), makeCard('sha')]; // 攻击者有投
    b.handCards = []; // target 没投 → 应受伤
    const beforeHp = b.hp;
    g.handleJuedou(a, b, makeCard('juedou'));
    vi.runAllTimers();
    expect(b.hp).toBe(beforeHp - 1);
  });

  it('被使用方有投但发起者最后无 → 发起者受伤', () => {
    const g = makeTestGame({ identities: FOUR_IDS, humanIndex: 0 });
    freezeAfterAction(g);
    const [a, b] = g.players;
    a.handCards = []; // 发起者无投
    b.handCards = [makeCard('sha')]; // target 有 1 张投
    const beforeHpA = a.hp;
    g.handleJuedou(a, b, makeCard('juedou'));
    vi.runAllTimers();
    // target 出 1 张投 → a 无法回应 → a 受伤
    expect(a.hp).toBe(beforeHpA - 1);
  });

  it('决斗中出的投不计入回合 1 张投限制', () => {
    const g = makeTestGame({ identities: FOUR_IDS, humanIndex: 0 });
    freezeAfterAction(g);
    const [a] = g.players;
    expect(a.hasUsedSha).toBe(false);
    a.handCards = [makeCard('sha'), makeCard('sha')];
    g.handleJuedou(a, g.players[1], makeCard('juedou'));
    vi.runAllTimers();
    // 决斗中 a 是否出过投，hasUsedSha 不变（仍可常规出 sha）
    expect(a.hasUsedSha).toBe(false);
  });
});

describe('AOE 锦囊', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('全场紧逼：所有非源玩家需出投，无投则受伤', () => {
    const g = makeTestGame({ identities: FOUR_IDS, humanIndex: 0 });
    freezeAfterAction(g);
    const [a, b, c, d] = g.players;
    a.handCards = [];
    b.handCards = []; c.handCards = []; d.handCards = [];
    const hps = [b.hp, c.hp, d.hp];
    g.handleNanman(a, makeCard('nanman'));
    vi.runAllTimers();
    expect(b.hp).toBe(hps[0] - 1);
    expect(c.hp).toBe(hps[1] - 1);
    expect(d.hp).toBe(hps[2] - 1);
  });

  it('三分雨：所有非源玩家需出盖，无盖则受伤', () => {
    const g = makeTestGame({ identities: FOUR_IDS, humanIndex: 0 });
    freezeAfterAction(g);
    const [a, b, c, d] = g.players;
    a.handCards = [];
    b.handCards = [makeCard('shan')];
    c.handCards = []; d.handCards = [];
    const hps = [b.hp, c.hp, d.hp];
    g.handleWanjian(a, makeCard('wanjian'));
    vi.runAllTimers();
    expect(b.hp).toBe(hps[0]); // b 有盖 → 抵消
    expect(c.hp).toBe(hps[1] - 1);
    expect(d.hp).toBe(hps[2] - 1);
  });

  it('官方暂停：所有玩家回 1 血（HP 已满除外）', () => {
    const g = makeTestGame({ identities: FOUR_IDS, humanIndex: 0 });
    freezeAfterAction(g);
    g.players.forEach(p => { p.hp = 1; });
    g.handleTaoyuan(g.players[0], makeCard('taoyuan'));
    vi.runAllTimers();
    g.players.forEach(p => {
      expect(p.hp).toBeGreaterThan(1);
    });
  });
});

describe('单目标锦囊', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('抢断：从目标手牌偷一张到自己手里', () => {
    const g = makeTestGame({ identities: FOUR_IDS, humanIndex: 1 }); // 让 source 是 AI
    freezeAfterAction(g);
    const a = g.players[0];
    const b = g.players[1];
    b.handCards = [makeCard('shan'), makeCard('wuzhong')];
    a.handCards = [];
    const beforeA = a.handCards.length;
    const beforeB = b.handCards.length;
    g.handleShunshou(a, b, makeCard('shunshou'));
    vi.runAllTimers();
    expect(a.handCards.length).toBe(beforeA + 1);
    expect(b.handCards.length).toBe(beforeB - 1);
  });

  it('迫使失误：从目标手牌弃一张', () => {
    const g = makeTestGame({ identities: FOUR_IDS, humanIndex: 1 });
    freezeAfterAction(g);
    const a = g.players[0];
    const b = g.players[1];
    b.handCards = [makeCard('shan'), makeCard('wuzhong')];
    const beforeB = b.handCards.length;
    g.handleGuohe(a, b, makeCard('guoheshuang'));
    vi.runAllTimers();
    expect(b.handCards.length).toBe(beforeB - 1);
  });

  it('犯规麻烦：把卡放进目标判定区', () => {
    const g = makeTestGame({ identities: FOUR_IDS, humanIndex: 0 });
    freezeAfterAction(g);
    const [a, b] = g.players;
    const before = b.judgeCards.length;
    g.handleLebu(a, b, makeCard('lebusishu'));
    expect(b.judgeCards.length).toBe(before + 1);
    expect(b.judgeCards[before].key).toBe('lebusishu');
  });

  it('体能危机：把卡放进目标判定区', () => {
    const g = makeTestGame({ identities: FOUR_IDS, humanIndex: 0 });
    freezeAfterAction(g);
    const [a, b] = g.players;
    g.handleBingliang(a, b, makeCard('bingliangcunduan'));
    expect(b.judgeCards.some(j => j.key === 'bingliangcunduan')).toBe(true);
  });

  it('伤病隐患：放在自己判定区', () => {
    const g = makeTestGame({ identities: FOUR_IDS, humanIndex: 0 });
    freezeAfterAction(g);
    const [a] = g.players;
    g.handleShandian(a, makeCard('shandian'));
    expect(a.judgeCards.some(j => j.key === 'shandian')).toBe(true);
  });
});

describe('其他锦囊', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('战术板：摸 2 张牌', () => {
    const g = makeTestGame({ identities: FOUR_IDS, humanIndex: 0 });
    freezeAfterAction(g);
    const [a] = g.players;
    a.handCards = [];
    g.handleWuzhong(a, makeCard('wuzhong'));
    vi.runAllTimers();
    expect(a.handCards.length).toBe(2);
  });
});

describe('胜利条件', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('checkGameOver：核心阵亡 → 对手 / 独狼侧赢', () => {
    const ids = [
      { key: 'core', team: 'core_side', name: '核心', goal: '' },
      { key: 'teammate', team: 'core_side', name: '队友', goal: '' },
      { key: 'opponent', team: 'opponent_side', name: '对手', goal: '' },
      { key: 'solo', team: 'solo', name: '独狼', goal: '' },
    ];
    const g = makeTestGame({ identities: ids });
    g.players[0].isAlive = false;
    const result = checkGameOver(g.players);
    expect(result.over).toBe(true);
    // winner 是对手或独狼
    expect(['对手', '独狼']).toContain(result.winnerName);
  });

  it('checkGameOver：所有非核心阵营都死 → 核心阵营赢', () => {
    const ids = [
      { key: 'core', team: 'core_side', name: '核心', goal: '' },
      { key: 'teammate', team: 'core_side', name: '队友', goal: '' },
      { key: 'opponent', team: 'opponent_side', name: '对手', goal: '' },
      { key: 'solo', team: 'solo', name: '独狼', goal: '' },
    ];
    const g = makeTestGame({ identities: ids });
    g.players[2].isAlive = false;
    g.players[3].isAlive = false;
    const result = checkGameOver(g.players);
    expect(result.over).toBe(true);
    expect(result.winnerName).toBe('核心阵营');
  });
});
