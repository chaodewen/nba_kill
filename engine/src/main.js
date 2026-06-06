import { Game } from './core/Game';

const game = new Game();
window.game = game;

document.addEventListener('DOMContentLoaded', () => {
  console.log('NBA Kill engine');
  game.init();
});
