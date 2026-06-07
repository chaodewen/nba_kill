// 端到端：基本牌（投/盖/佳得乐/封闭针）核心交互
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTestGame, makeCard, giveCards, equipPlayer } from './helpers.js';

describe('基本牌 — 投 / 盖 / 佳得乐 / 封闭针', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('投：射程内 + 目标无盖 → 1 点伤害', () => {
    const g = makeTestGame({ characters: ['lebron_james', 'shane_battier', 'manu_ginobili', 'dwight_howard'] });
    const [a, b] = g.players;
    const beforeHp = b.hp;
    const sha = makeCard('sha');
    g.handleSha(a, b, sha);
    vi.runAllTimers();
    expect(b.hp).toBe(beforeHp - 1);
    expect(b.isAlive).toBe(true);
  });

  it('投：目标有盖 → 自动出盖抵消，无伤害', () => {
    const g = makeTestGame({ characters: ['lebron_james', 'shane_battier', 'manu_ginobili', 'dwight_howard'] });
    const [a, b] = g.players;
    giveCards(b, 'shan', 'shan', 'shan'); // 富余足够触发 AI 出盖
    b.hp = 1; // HP=1 必出盖
    const beforeHp = b.hp;
    const beforeShan = b.handCards.filter(c => c.key === 'shan').length;
    g.handleSha(a, b, makeCard('sha'));
    vi.runAllTimers();
    expect(b.hp).toBe(beforeHp);
    expect(b.handCards.filter(c => c.key === 'shan').length).toBe(beforeShan - 1);
  });

  it('佳得乐：HP 未满 → 回 1 血', () => {
    const g = makeTestGame();
    const [a] = g.players;
    a.hp = a.maxHp - 2;
    g.handleTao(a, a);
    expect(a.hp).toBe(a.maxHp - 1);
  });

  it('封闭针：标记 drunken（伤害 +1）', () => {
    const g = makeTestGame();
    const [a] = g.players;
    expect(a.drunken).toBeFalsy();
    g.handleJiu(a);
    expect(a.drunken).toBe(true);
  });

  it('受伤致死 → 进入濒死流程，无 tao 救则真阵亡', () => {
    const g = makeTestGame();
    const [a, b] = g.players;
    b.hp = 1;
    // 让所有人都没 tao（避免互救）
    g.players.forEach(p => { p.handCards = p.handCards.filter(c => c.key !== 'tao'); });
    g.handleSha(a, b, makeCard('sha'));
    vi.runAllTimers();
    expect(b.isAlive).toBe(false);
  });

  it('濒死被队友救起 → 救援成功，存活', () => {
    const g = makeTestGame({ characters: ['lebron_james', 'shane_battier', 'kobe_bryant', 'manu_ginobili'] });
    // LeBron 是 core，Battier 是 teammate
    const lebron = g.players[0];
    const battier = g.players[1];
    expect(lebron.identity.key).toBe('core');
    expect(battier.identity.key).toBe('teammate');
    lebron.hp = 1;
    // 让 battier 有 tao，攻击者无 tao
    battier.handCards = [makeCard('tao')];
    g.players[2].handCards = []; // attacker
    g.players[3].handCards = [];
    lebron.handCards = [];
    g.handleSha(g.players[2], lebron, makeCard('sha')); // opponent 攻击 core
    vi.runAllTimers();
    expect(lebron.isAlive).toBe(true);
    expect(lebron.hp).toBeGreaterThanOrEqual(1);
  });
});
