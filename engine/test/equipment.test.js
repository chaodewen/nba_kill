// 端到端：装备效果（武器射程 / 战靴距离 +-1 / 防具）
import { describe, it, expect } from 'vitest';
import { makeTestGame, makeCard, equipPlayer } from './helpers.js';
import { calculateDistance, canAttack } from '../src/core/Logic.js';

describe('装备效果', () => {
  it('武器：装备投篮训练机后攻击范围 = 1', () => {
    const g = makeTestGame();
    const [a] = g.players;
    expect(a.getAttackRange()).toBe(1);
    equipPlayer(a, 'zhugelian');
    expect(a.getAttackRange()).toBe(1); // 这把武器范围 1
  });

  it('武器：装备半场标志线后攻击范围 = 4', () => {
    const g = makeTestGame();
    const [a] = g.players;
    equipPlayer(a, 'fangtian');
    expect(a.getAttackRange()).toBe(4);
  });

  it('武器：装备比赛用球后攻击范围 = 5', () => {
    const g = makeTestGame();
    const [a] = g.players;
    equipPlayer(a, 'qilin');
    expect(a.getAttackRange()).toBe(5);
  });

  it('+1 战靴（Air Jordan 11）：其他人到我距离 +1', () => {
    const g = makeTestGame();
    const [a, b] = g.players;
    const dBase = calculateDistance(b, a, g.players);
    equipPlayer(a, 'horse_plus_aj11');
    const dWith = calculateDistance(b, a, g.players);
    expect(dWith).toBe(dBase + 1);
  });

  it('-1 战靴（Kobe 6）：我到其他人距离 -1（不低于 1）', () => {
    const g = makeTestGame({
      characters: ['lebron_james', 'kobe_bryant', 'shane_battier', 'manu_ginobili', 'kevin_durant', 'chris_paul'],
    });
    const a = g.players[0];
    const c = g.players[2]; // 距离 2
    const dBase = calculateDistance(a, c, g.players);
    equipPlayer(a, 'horse_minus_kobe6');
    const dWith = calculateDistance(a, c, g.players);
    expect(dWith).toBe(Math.max(1, dBase - 1));
  });

  it('canAttack：默认 1 范围内可攻击', () => {
    const g = makeTestGame();
    const [a, b] = g.players;
    // 4 人局相邻距离 1
    expect(canAttack(a, b, g.players)).toBe(true);
  });

  it('canAttack：超出射程不可攻击（不带武器）', () => {
    const g = makeTestGame({
      characters: ['shane_battier', 'kobe_bryant', 'manu_ginobili', 'kevin_durant', 'chris_paul', 'james_harden'],
    });
    const a = g.players[0];
    const c = g.players[2]; // 距离 2，默认射程 1
    expect(canAttack(a, c, g.players)).toBe(false);
  });

  it('canAttack：装备半场标志线（射程 4）后远端可攻击', () => {
    const g = makeTestGame({
      characters: ['shane_battier', 'kobe_bryant', 'manu_ginobili', 'kevin_durant', 'chris_paul', 'james_harden'],
    });
    const a = g.players[0];
    const c = g.players[2];
    expect(canAttack(a, c, g.players)).toBe(false);
    equipPlayer(a, 'fangtian');
    expect(canAttack(a, c, g.players)).toBe(true);
  });
});
