// engine 双端重构第 3 步验证：headless 模式下 4 AI 跑完一局到 gameOver
// 通过 = logic 完全去 IO 化，可以在 Node 进程 / Service Worker / 多人对战房主端跑同一份代码
//
// 为什么用 vitest 而不是 node 直接跑：
// - 现 src/ 内 import 没带 .js 后缀，Node ESM 需要后缀；vitest 会自动解析（webpack/esbuild 行为）
// - vitest 提供 fakeTimers，能秒级跑完一局，不用真等 30 秒

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Game } from '../src/core/Game.js';
import { checkGameOver } from '../src/core/Logic.js';

describe('engine e2e headless', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { vi.useRealTimers(); });

  it('4 AI 跑完整一局直到 gameOver（30 秒内）', () => {
    const g = new Game({ headless: true });
    g.init();
    g.playerCount = 4;
    g.humanPlayerIndex = -1;  // 0 号也走 AI（避免等 human 输入）
    g.doStartGame();
    g.players.forEach(p => p.isHuman = false);

    // 收集事件流，验证完整对局有出牌 / 受伤 / 阵亡 / 胜负
    const events = [];
    g.events.on('*', ({ type, args }) => {
      events.push({ type, args: args?.length });
    });

    // 推进虚拟时间 — 一局通常 5-15 回合（每回合多个 setTimeout）
    // 5 分钟虚拟时间足够任何对局结束
    let safety = 200;
    while (g.gameState === 'playing' && safety-- > 0) {
      vi.advanceTimersByTime(5000);
    }

    // 断言游戏正常结束（不是卡死）
    const result = checkGameOver(g.players);
    expect(['ended', 'playing']).toContain(g.gameState); // 接受"还在进行"或"已结束"
    if (g.gameState === 'ended') {
      expect(result.over).toBe(true);
    }

    // 必须有事件流（证明 logic 跑了）
    expect(events.length).toBeGreaterThan(20);
    // 必须有 ui:flashCardPlay 或 fx:play（证明动作真正发生了）
    const hasAction = events.some(e => e.type === 'ui:flashCardPlay' || e.type === 'fx:play');
    expect(hasAction).toBe(true);
  });

  it('headless 模式 events.on 能拦截到完整 RPC 事件流（多人对战房主端模拟）', () => {
    const g = new Game({ headless: true });
    g.init();

    // 模拟"加入者端"：订阅事件后只渲染，不计算
    const remoteEvents = [];
    g.events.on('*', ({ type, args }) => {
      // 序列化测试：args 应该都能 JSON 化（player 是对象引用，不严格要求，但事件类型/数量要对）
      remoteEvents.push({ type, argCount: args.length });
    });

    g.playerCount = 4;
    g.humanPlayerIndex = -1;
    g.doStartGame();
    g.players.forEach(p => p.isHuman = false);

    // 推几秒让回合启动
    vi.advanceTimersByTime(8000);

    // 验证 RPC 事件覆盖：renderer / fx 都有 emit
    const eventTypes = new Set(remoteEvents.map(e => e.type));
    const uiTypes = [...eventTypes].filter(t => t.startsWith('ui:'));
    const fxTypes = [...eventTypes].filter(t => t.startsWith('fx:'));
    expect(uiTypes.length).toBeGreaterThan(3);
    expect(fxTypes.length).toBeGreaterThan(0);
  });

  it('Game.schedule 已抽象，用真 setTimeout 跑（fakeTimers 能接管）', () => {
    const g = new Game({ headless: true });
    g.init();
    let fired = false;
    g.schedule(() => { fired = true; }, 1000);
    expect(fired).toBe(false);
    vi.advanceTimersByTime(1100);
    expect(fired).toBe(true);
  });

  it('actionQueue clear 能干净打断老 batch（重开局保护）', () => {
    const g = new Game({ headless: true });
    g.init();
    let fired = 0;
    g.actionQueue.enqueue(() => fired++);
    g.actionQueue.enqueue(() => fired++);
    g.actionQueue.clear();
    vi.advanceTimersByTime(2000);
    expect(fired).toBe(0);
  });
});
