// 测试 helpers — 把 Game / Player / Deck 用真实代码组装，但 Renderer / fx 全 stub
// 目标是在 Node + happy-dom 里 headless 跑完整游戏逻辑，不依赖任何 UI

import { Game } from '../src/core/Game.js';
import { Player } from '../src/core/Player.js';
import { Deck } from '../src/core/Deck.js';
import { SkillSystem } from '../src/core/Skills.js';
import { CARDS } from '../src/config/cards.js';
import { CHARACTERS } from '../src/config/characters.js';

// 静默 renderer：吞掉所有 UI 调用，让 Game 逻辑能正常跑
export function makeMockRenderer() {
  const noop = () => {};
  return new Proxy({
    elements: {
      confirmBtn: { onclick: null },
      cardModal: { classList: { add: noop, remove: noop, contains: () => false }, querySelector: () => null },
      logContent: { classList: { add: noop, remove: noop, toggle: noop, contains: () => false } },
      logToggle: { textContent: '' },
      logCount: { textContent: '' },
      logInner: { children: [], insertBefore: noop, removeChild: noop, scrollTop: 0 },
      cardPickModal: { classList: { add: noop, remove: noop } },
      cardPickTitle: { textContent: '' },
      cardPickBody: { innerHTML: '' },
    },
    addLog: noop,
    updatePlayer: noop,
    updateUI: noop,
    flashCardPlay: noop,
    flashHpDelta: noop,
    flashRejected: noop,
    flashInvalidTarget: noop,
    flashDiscard: noop,
    showWinnerModal: noop,
    showCardPickModal: noop,
    hideCardPickModal: noop,
    renderPlayers: noop,
    showConfirm: noop,
    confirmAction: noop,
    setPhase: noop,
    highlightPlayer: noop,
    updateButtons: noop,
    showBuildTimestamp: noop,
    cacheElements: noop,
    markTargetCandidates: noop,
    clearTargetCandidates: noop,
    showTargetBanner: noop,
    hideTargetBanner: noop,
    updateDistanceLabels: noop,
    showPauseOverlay: noop,
    hidePauseOverlay: noop,
    isCardDisabled: () => false,
    renderHandCards: noop,
    updateCenterDiscardPile: noop,
    showSkillModal: noop,
    showCardModal: noop,
    hideCardTooltip: noop,
    showCardTooltip: noop,
    showGuide: noop,
    shouldShowGuide: () => false,
    closeModal: noop,
    toggleSettings: noop,
    setTheme: noop,
    toggleLog: noop,
    clearLog: noop,
    hideRulesModal: noop,
    showRulesModal: noop,
    hideInfoModal: noop,
    showInfoModal: noop,
    cancelConfirm: noop,
    cancelCardPick: noop,
    filterAllHands: noop,
  }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      // 任何其他被调用的方法都返回 noop，避免 undefined is not a function
      return noop;
    },
  });
}

export function makeMockFx() {
  return { play: () => {}, speak: () => {}, unlock: () => {}, setEnabled: () => {} };
}

// 组装一个 headless game，可指定球员 + 身份 + 手牌
export function makeTestGame({ characters = ['lebron_james', 'kobe_bryant', 'shane_battier', 'manu_ginobili'], identities = null, humanIndex = 0 } = {}) {
  const game = new Game();
  game.deck = new Deck();
  game.skills = new SkillSystem(game);
  game.renderer = makeMockRenderer();
  game.fx = makeMockFx();
  game.playerCount = characters.length;
  game.humanPlayerIndex = humanIndex;
  game.gameState = 'playing';
  game.turnCount = 0;
  game.highlights = [];
  game.killCounts = {};

  // 默认走真实 generateIdentities（含 Fisher-Yates 随机），让测试也能验证随机分布
  // 测试需要确定身份顺序时显式传 identities 参数
  game.identities = identities || game.generateIdentities(characters.length);

  game.players = characters.map((charKey, i) => {
    const char = CHARACTERS.find(c => c.key === charKey);
    if (!char) throw new Error(`Unknown character: ${charKey}`);
    const p = new Player(i, char);
    p.isHuman = i === humanIndex;
    p.identity = game.identities[i];
    if (p.identity?.key === 'core') {
      p.maxHp += 1;
      p.hp = p.maxHp;
    }
    return p;
  });

  game.currentPlayerIndex = game.players.findIndex(p => p.identity?.key === 'core');
  if (game.currentPlayerIndex < 0) game.currentPlayerIndex = 0;

  return game;
}

// 用 key 直接构造一张牌（绕过随机牌堆）— 测试时方便
let cardIdCounter = 100000;
export function makeCard(key, suit = null) {
  const def = CARDS[key];
  if (!def) throw new Error(`Unknown card: ${key}`);
  return {
    id: cardIdCounter++,
    key,
    name: def.name,
    type: def.type,
    suit: suit || def.suit,
    color: def.color,
    description: def.description,
    range: def.range,
  };
}

// 把指定的牌塞给 player（用于装备 / 给手牌）
export function giveCards(player, ...cardKeys) {
  for (const k of cardKeys) {
    const c = typeof k === 'string' ? makeCard(k) : k;
    player.handCards.push(c);
  }
}

// 给 player 装备特定卡（绕过 handleEquip 流程）
export function equipPlayer(player, key) {
  const c = makeCard(key);
  if (c.type === 'weapon') player.equipWeapon(c);
  else if (c.type === 'armor') player.equipArmor(c);
  else if (c.type === 'defense_horse') player.equipDefenseHorse(c);
  else if (c.type === 'offense_horse') player.equipOffenseHorse(c);
  return c;
}

// 把当前 action 之后的所有链式 setTimeout 都阻断
// 让单一 handleSha / handleX 只测试它本身的直接效果，不传染到后续回合
export function freezeAfterAction(game) {
  game.continueAfterCard = () => {};
  game.aiPlayCards = () => {};
  game.executePlayQueue = () => {};
  game.startTurn = () => {};
  game.preparePhase = () => {};
  game.drawPhase = () => {};
  game.playPhase = () => {};
  game.discardPhase = () => {};
  game.endPhase = () => {};
  game.nextTurn = () => {};
}

// 同步执行所有 setTimeout — 用 vi.useFakeTimers 控制
export function flushTimers(vi) {
  for (let i = 0; i < 50; i++) {
    if (vi.getTimerCount() === 0) break;
    vi.runAllTimers();
  }
}
