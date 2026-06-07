// 端到端：身份机制 + isEnemy 判定
import { describe, it, expect } from 'vitest';
import { makeTestGame } from './helpers.js';
import { isEnemy } from '../src/core/Logic.js';

describe('身份机制', () => {
  it('4 人局：1 核心 + 1 队友 + 1 对手 + 1 独狼', () => {
    // 显式 identities 不走随机
    const ids = [
      { key: 'core', team: 'core_side', name: '核心', goal: '' },
      { key: 'teammate', team: 'core_side', name: '队友', goal: '' },
      { key: 'opponent', team: 'opponent_side', name: '对手', goal: '' },
      { key: 'solo', team: 'solo', name: '独狼', goal: '' },
    ];
    const g = makeTestGame({
      characters: ['lebron_james', 'kobe_bryant', 'shane_battier', 'manu_ginobili'],
      identities: ids,
    });
    const got = g.players.map(p => p.identity.key);
    expect(got.filter(i => i === 'core').length).toBe(1);
    expect(got.filter(i => i === 'teammate').length).toBe(1);
    expect(got.filter(i => i === 'opponent').length).toBe(1);
    expect(got.filter(i => i === 'solo').length).toBe(1);
  });

  it('核心额外 +1 体能上限', () => {
    const ids = [
      { key: 'core', team: 'core_side', name: '核心', goal: '' },
      { key: 'teammate', team: 'core_side', name: '队友', goal: '' },
      { key: 'opponent', team: 'opponent_side', name: '对手', goal: '' },
      { key: 'solo', team: 'solo', name: '独狼', goal: '' },
    ];
    const g = makeTestGame({ identities: ids });
    const core = g.players.find(p => p.identity.key === 'core');
    expect(core.maxHp).toBe(core.character.hp + 1);
    expect(core.hp).toBe(core.maxHp);
  });

  it('isEnemy：核心 vs 队友 → false（同阵营）', () => {
    const g = makeTestGame();
    const core = g.players.find(p => p.identity.key === 'core');
    const team = g.players.find(p => p.identity.key === 'teammate');
    expect(isEnemy(core, team)).toBe(false);
    expect(isEnemy(team, core)).toBe(false);
  });

  it('isEnemy：核心 vs 对手 → true', () => {
    const g = makeTestGame();
    const core = g.players.find(p => p.identity.key === 'core');
    const opp = g.players.find(p => p.identity.key === 'opponent');
    expect(isEnemy(core, opp)).toBe(true);
  });

  it('isEnemy：核心 vs 独狼 → true', () => {
    const g = makeTestGame();
    const core = g.players.find(p => p.identity.key === 'core');
    const solo = g.players.find(p => p.identity.key === 'solo');
    expect(isEnemy(core, solo)).toBe(true);
  });

  it('isEnemy：独狼 vs 任何非独狼 → true', () => {
    const g = makeTestGame();
    const solo = g.players.find(p => p.identity.key === 'solo');
    g.players.forEach(p => {
      if (p === solo) return;
      expect(isEnemy(solo, p)).toBe(true);
    });
  });

  it('isEnemy：对手 vs 队友 → true', () => {
    const g = makeTestGame();
    const opp = g.players.find(p => p.identity.key === 'opponent');
    const team = g.players.find(p => p.identity.key === 'teammate');
    expect(isEnemy(opp, team)).toBe(true);
  });

  it('身份随机分配：核心不一定在 0 号位', () => {
    // 跑 50 次，核心至少出现在 ≥2 个不同座位
    const seats = new Set();
    for (let i = 0; i < 50; i++) {
      const g = makeTestGame();
      const coreIdx = g.players.findIndex(p => p.identity.key === 'core');
      seats.add(coreIdx);
    }
    expect(seats.size).toBeGreaterThanOrEqual(2);
  });

  it('5 人局：1 核心 + 1 队友 + 2 对手 + 1 独狼', () => {
    const g = makeTestGame({ characters: ['lebron_james', 'kobe_bryant', 'shane_battier', 'manu_ginobili', 'kevin_durant'] });
    const ids = g.players.map(p => p.identity.key);
    expect(ids.filter(i => i === 'opponent').length).toBe(2);
  });
});
