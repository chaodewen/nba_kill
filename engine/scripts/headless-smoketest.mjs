// 验证 engine 能在 Node 端 headless 跑游戏（无 DOM / 无浏览器 API）
// 用法：node scripts/headless-smoketest.mjs
//
// 这个脚本是 engine 双端重构的"烟囱"测试：
// - 直接 import Game，开 headless 模式（renderer / fx 走 noop proxy）
// - 让 4 人局自动跑（4 个 AI 互相打）
// - 监听 events 看 ui:flashCardPlay / ui:addLog 等 RPC 事件流
// - 几秒后打印当前游戏状态：当前回合、存活玩家、是否结束
//
// 通过 = 多人对战房主端能用同一份代码跑权威逻辑

import { Game } from '../src/core/Game.js';

const game = new Game({ headless: true });
game.init();

// 监听全部 ui:/fx: 事件，统计调用次数
const eventCounts = {};
game.events.on('*', ({ type }) => {
  eventCounts[type] = (eventCounts[type] || 0) + 1;
});

// 模拟 4 人局（全部 AI，humanIndex = 0 但 isHuman 也按 AI 玩）
game.playerCount = 4;
game.humanPlayerIndex = -1; // 让 0 号也是 AI
game.doStartGame();
// 强制让所有 player 的 isHuman = false
game.players.forEach(p => p.isHuman = false);

console.log('[start]', {
  gameState: game.gameState,
  players: game.players.map(p => ({
    name: p.character.name,
    nick: p.character.nickname,
    hp: p.hp,
    identity: p.identity?.key,
  })),
});

// 跑 30 秒看进展
setTimeout(() => {
  const alive = game.players.filter(p => p.isAlive).length;
  console.log('\n[after 30s]', {
    gameState: game.gameState,
    turnCount: game.turnCount,
    alive,
    deck: game.deck?.getRemaining?.(),
  });
  console.log('\n[event counts]');
  const sorted = Object.entries(eventCounts).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sorted.slice(0, 12)) {
    console.log(`  ${type.padEnd(40)} ${count}`);
  }
  console.log(`  ... ${sorted.length} unique events total`);
  process.exit(0);
}, 30000);
