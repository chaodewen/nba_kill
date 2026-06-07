// 端到端：基本牌（投/盖/佳得乐/封闭针）核心交互
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTestGame, makeCard, giveCards, freezeAfterAction } from './helpers.js';

describe('基本牌 — 投 / 盖 / 佳得乐 / 封闭针', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('投：射程内 + 目标无盖 → 1 点伤害', () => {
    const g = makeTestGame();
    freezeAfterAction(g);
    const [a, b] = g.players;
    b.handCards = [];
    const beforeHp = b.hp;
    g.handleSha(a, b, makeCard('sha'));
    vi.runAllTimers();
    expect(b.hp).toBe(beforeHp - 1);
    expect(b.isAlive).toBe(true);
  });

  it('投：目标有盖且 HP=1 必出盖 → 抵消，仅消耗 1 张盖', () => {
    const g = makeTestGame();
    freezeAfterAction(g);
    const [a, b] = g.players;
    b.handCards = [makeCard('shan'), makeCard('shan'), makeCard('shan')];
    b.hp = 1;
    const beforeHp = b.hp;
    g.handleSha(a, b, makeCard('sha'));
    vi.runAllTimers();
    expect(b.hp).toBe(beforeHp);
    expect(b.handCards.filter(c => c.key === 'shan').length).toBe(2);
  });

  it('佳得乐：HP 未满 → 回 1 血', () => {
    const g = makeTestGame();
    freezeAfterAction(g);
    const [a] = g.players;
    a.hp = a.maxHp - 2;
    g.handleTao(a, a);
    expect(a.hp).toBe(a.maxHp - 1);
  });

  it('佳得乐：HP 已满 → 不回血', () => {
    const g = makeTestGame();
    freezeAfterAction(g);
    const [a] = g.players;
    const before = a.hp;
    g.handleTao(a, a);
    expect(a.hp).toBe(before);
  });

  it('封闭针：标记 drunken（伤害 +1）', () => {
    const g = makeTestGame();
    freezeAfterAction(g);
    const [a] = g.players;
    expect(a.drunken).toBeFalsy();
    g.handleJiu(a);
    expect(a.drunken).toBe(true);
  });

  it('受伤致死 → 进入濒死流程；无 tao 救则真阵亡', () => {
    const g = makeTestGame();
    freezeAfterAction(g);
    const [a, b] = g.players;
    b.hp = 1;
    g.players.forEach(p => { p.handCards = []; });
    g.handleSha(a, b, makeCard('sha'));
    vi.runAllTimers();
    expect(b.isAlive).toBe(false);
  });

  it('濒死被队友救起 → 救援成功，存活', () => {
    const ids = [
      { key: 'core', team: 'core_side', name: '核心', goal: '' },
      { key: 'teammate', team: 'core_side', name: '队友', goal: '' },
      { key: 'opponent', team: 'opponent_side', name: '对手', goal: '' },
      { key: 'solo', team: 'solo', name: '独狼', goal: '' },
    ];
    const g = makeTestGame({
      characters: ['lebron_james', 'shane_battier', 'kobe_bryant', 'manu_ginobili'],
      identities: ids,
    });
    freezeAfterAction(g);
    const [core, teammate, opp] = g.players;
    expect(core.identity.key).toBe('core');
    expect(teammate.identity.key).toBe('teammate');
    core.hp = 1;
    g.players.forEach(p => { p.handCards = []; });
    teammate.handCards = [makeCard('tao')];
    g.handleSha(opp, core, makeCard('sha'));
    vi.runAllTimers();
    expect(core.isAlive).toBe(true);
    expect(core.hp).toBeGreaterThanOrEqual(1);
  });

  it('AOE 三分雨：每个目标按响应能力分别处理伤害', () => {
    const g = makeTestGame();
    freezeAfterAction(g);
    const [a, b, c, d] = g.players;
    b.handCards = [makeCard('shan')]; // b 有盖 → 抵消
    c.handCards = []; // c 无盖 → 受伤
    d.handCards = []; // d 无盖 → 受伤
    const cHp = c.hp, dHp = d.hp;
    g.handleWanjian(a, makeCard('wanjian'));
    vi.runAllTimers();
    expect(b.handCards.filter(x => x.key === 'shan').length).toBe(0);
    expect(c.hp).toBe(cHp - 1);
    expect(d.hp).toBe(dHp - 1);
  });
});
