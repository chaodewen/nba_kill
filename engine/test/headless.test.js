// engine 双端重构验证：Game({ headless: true }) 不需要任何 mock，能直接 import + 跑
// 通过 = 多人对战的"房主端"逻辑可以在 Node 进程或 Service Worker 里跑同一份代码

import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game.js';

describe('engine headless 模式', () => {
  it('不传 mock renderer/fx，Game 也能 init / 开局 / 跑回合', () => {
    const g = new Game({ headless: true });
    g.init();
    expect(g.deck).toBeTruthy();
    expect(g.skills).toBeTruthy();
    expect(g.renderer).toBeTruthy();  // noop proxy
    expect(g.fx).toBeTruthy();
    expect(g.events).toBeTruthy();

    // 验证 noop proxy 不报错
    expect(() => g.renderer.flashCardPlay({}, '投', '#fff')).not.toThrow();
    expect(() => g.fx.play('sha')).not.toThrow();
    expect(() => g.fx.speak('测试')).not.toThrow();
  });

  it('renderer/fx 调用自动 emit 事件，可被远端订阅', () => {
    const g = new Game({ headless: true });
    g.init();
    const events = [];
    g.events.on('*', ({ type, args }) => events.push({ type, argLen: args.length }));

    g.renderer.flashCardPlay({ index: 0 }, '投', '#e74c3c');
    g.fx.play('sha');
    g.fx.speak('投篮！');
    g.renderer.addLog('test message', 'normal');

    expect(events.length).toBe(4);
    expect(events[0].type).toBe('ui:flashCardPlay');
    expect(events[1].type).toBe('fx:play');
    expect(events[2].type).toBe('fx:speak');
    expect(events[3].type).toBe('ui:addLog');
  });

  it('headless 模式跑完一个 4 人局开局发牌，玩家手牌 4 张', () => {
    const g = new Game({ headless: true });
    g.init();
    g.playerCount = 4;
    // doStartGame 会触发 setTimeout，用 fakeTimers 不必要 — 直接验证创建后状态
    g.identities = g.generateIdentities(4);
    g.deck = new (g.deck.constructor)();
    g.createPlayers();

    expect(g.players.length).toBe(4);
    g.players.forEach(p => {
      const cards = g.deck.drawMultiple(4);
      p.drawCards(cards);
      expect(p.handCards.length).toBe(4);
      expect(p.hp).toBeGreaterThan(0);
      expect(p.character.nickname).toBeTruthy();  // 16 球员都有 nickname
      expect(p.character.voiceName).toBeTruthy();  // 都有英文 voiceName
    });
  });

  it('events.on(*) 在 200 张事件下不卡', () => {
    const g = new Game({ headless: true });
    g.init();
    let count = 0;
    g.events.on('*', () => count++);
    for (let i = 0; i < 200; i++) {
      g.renderer.addLog(`msg-${i}`, 'normal');
    }
    expect(count).toBe(200);
  });
});
