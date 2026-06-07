import { Game } from './core/Game';

const game = new Game();
window.game = game;

document.addEventListener('DOMContentLoaded', () => {
  console.log('NBA Kill engine');
  game.init();
  // 任何用户手势后解锁 AudioContext（浏览器自动播放策略要求）
  const unlock = () => {
    game.fx?.unlock?.();
    document.removeEventListener('click', unlock, true);
    document.removeEventListener('keydown', unlock, true);
  };
  document.addEventListener('click', unlock, true);
  document.addEventListener('keydown', unlock, true);
});
