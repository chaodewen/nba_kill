/**
 * 游戏主控制器 - 协调游戏流程
 */
import { CHARACTERS } from '../config/characters';
import { CARDS } from '../config/cards';
import { Player } from './Player';
import { Deck } from './Deck';
import { SkillSystem } from './Skills';
import { Renderer } from '../ui/Renderer';
import { SoundFx } from '../ui/SoundFx';
import {
  calculateDistance, canAttack, getShaDamage, getRequiredShanCount,
  checkGameOver, getAlivePlayers, getNextAlivePlayer,
  aiDecideCard, aiDecideShan, aiDecideTao, isEnemy
} from './Logic';

export class Game {
  constructor() {
    this.players = [];
    this.deck = null;
    this.skills = null;
    this.renderer = null;
    
    this.playerCount = 4;
    this.currentPlayerIndex = 0;
    this.turnCount = 0;
    this.gameState = 'waiting';  // waiting, playing, paused, ended
    this.isPaused = false;
    this.humanPlayerIndex = 0;
    this.awaitingHumanAction = false;
    this.selectedHandCardIndex = null;
    this.identities = [
      { key: 'core', name: '核心', team: 'core_side', goal: '与队友击败所有对手和独狼。' },
      { key: 'teammate', name: '队友', team: 'core_side', goal: '保护核心并击败所有对手和独狼。' },
      { key: 'opponent', name: '对手', team: 'opponent_side', goal: '击败核心。' },
      { key: 'solo', name: '独狼', team: 'solo', goal: '清理其他势力，最后击败核心。' }
    ];
    
    this.playQueue = [];
    this.playInterval = null;
  }

  // ========== 初始化 ==========

  init() {
    // 初始化牌堆
    this.deck = new Deck();

    // 初始化技能系统
    this.skills = new SkillSystem(this);

    // 初始化音效系统
    this.fx = new SoundFx();

    // 初始化渲染器并缓存元素
    this.renderer = new Renderer(this);
    this.renderer.cacheElements();
    
    // 显示初始界面
    this.renderer.updateUI(this);
    this.renderer.showBuildTimestamp();
    
    // 显示欢迎信息
    this.renderer.addLog('欢迎来到 NBA Kill。', 'system');
    this.renderer.addLog('点击"开始比赛"开始对战', 'system');
    
    // 检查是否显示新手引导
    if (this.renderer.shouldShowGuide()) {
      setTimeout(() => this.renderer.showGuide(), 500);
    }
  }

  createPlayers() {
    this.players = [];
    
    // 真正随机选择 4 个不同的球员
    const shuffled = [...CHARACTERS].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, this.playerCount);
    
    selected.forEach((character, i) => {
      const player = new Player(i, character);
      player.isHuman = i === this.humanPlayerIndex;
      player.identity = this.identities[i];
      // 核心身份的玩家额外 +1 体能上限
      if (player.identity?.key === 'core') {
        player.maxHp += 1;
        player.hp = player.maxHp;
      }
      this.players.push(player);
    });
    
    return selected;
  }

  // ========== 工具方法 ==========

  getAlivePlayers() {
    return getAlivePlayers(this.players);
  }

  getCardData(cardKey) {
    return CARDS[cardKey];
  }

  // ========== 卡牌提示 ==========

  initTooltipEvents() {
    document.addEventListener('mousemove', (e) => {
      if (this.renderer.elements.cardTooltip.classList.contains('show')) {
        this.renderer.updateTooltipPosition(e);
      }
    });
  }

  showCardTooltip(cardKey, event) {
    this.renderer.showCardTooltip(cardKey, event);
  }

  hideCardTooltip() {
    this.renderer.hideCardTooltip();
  }

  // ========== 游戏流程 ==========

  confirmRestart() {
    if (this.gameState === 'playing' || this.gameState === 'paused') {
      this.renderer.showConfirm('确定要重新开始吗？', '当前游戏进度将丢失', () => {
        this.doStartGame();
      });
      this.renderer.elements.confirmBtn.onclick = () => this.renderer.confirmAction();
    } else {
      this.doStartGame();
    }
  }

  cancelConfirm() {
    this.renderer.cancelConfirm();
  }

  doStartGame() {
    // 读取玩家选择的人数
    const sel = typeof document !== 'undefined' && document.getElementById('player-count-select');
    if (sel) {
      const v = parseInt(sel.value, 10);
      if (v >= 4 && v <= 8) this.playerCount = v;
    }

    // 根据人数生成本局身份分配
    this.identities = this.generateIdentities(this.playerCount);

    // 重新初始化牌堆
    this.deck = new Deck();
    // 牌堆耗尽时洗弃牌堆复用，向玩家广播一条系统日志，避免静默 stall
    this.deck.onReshuffle = (count) => {
      this.renderer?.addLog?.(`🔄 牌堆耗尽，洗弃牌堆复用（${count} 张）`, 'system');
    };

    // 本局精彩镜头数据
    this.highlights = [];
    this.killCounts = {};

    // 创建玩家
    this.createPlayers();
    this.renderer.renderPlayers(this.players);

    // 更新牌堆显示
    this.renderer.updateUI(this);

    // 发初始手牌
    this.players.forEach((player, idx) => {
      const cards = this.deck.drawMultiple(4);
      player.drawCards(cards);
      this.renderer.updatePlayer(player);
      // 普通模式下不暴露 AI 的手牌内容；只对自己 / 调试模式展示具体牌名
      if (player.isHuman || this.debugMode) {
        const cardNames = cards.map(c => `【${c.name}】`).join(' ');
        this.renderer.addLog(`${player.character.name} 初始手牌：${cardNames}`, 'draw');
      } else {
        this.renderer.addLog(`${player.character.name} 拿到 4 张初始手牌`, 'draw');
      }
    });

    this.gameState = 'playing';
    this.isPaused = false;
    this.turnCount = 0;
    // 开局首先轮到核心（主力）出牌，然后顺时针轮转
    const coreIdx = this.players.findIndex(p => p.identity?.key === 'core');
    this.currentPlayerIndex = coreIdx >= 0 ? coreIdx : 0;

    this.renderer.updateButtons('playing');
    this.renderer.updateUI(this);

    this.renderer.addLog(`🎮 游戏开始！${this.playerCount} 人局，牌堆 ${this.deck.getRemaining()} 张`, 'system');

    // 开局宏大号角 + 中文 TTS 喊话（魔兽风 fanfare）
    this.fx?.unlock?.();
    this.fx?.playFanfare?.();
    setTimeout(() => this.fx?.speak?.('比赛开始！'), 300);

    // 开始第一个回合（fanfare 约 2.6s，给 3s 让玩家听完再开打）
    setTimeout(() => this.startTurn(), 3000);
  }

  // 根据人数生成本局身份分配（全部打乱，人类玩家落到哪个身份完全随机）
  // 4: 1核心 1队友 1对手 1独狼
  // 5: 1核心 1队友 2对手 1独狼
  // 6: 1核心 1队友 3对手 1独狼
  // 7: 1核心 2队友 3对手 1独狼
  // 8: 1核心 2队友 4对手 1独狼
  generateIdentities(count) {
    const C = { key: 'core', name: '核心', team: 'core_side', goal: '与队友击败所有对手和独狼。' };
    const T = () => ({ key: 'teammate', name: '队友', team: 'core_side', goal: '保护核心并击败所有对手和独狼。' });
    const O = () => ({ key: 'opponent', name: '对手', team: 'opponent_side', goal: '击败核心。' });
    const S = { key: 'solo', name: '独狼', team: 'solo', goal: '清理其他势力，最后击败核心。' };

    const map = {
      4: [C, T(), O(), S],
      5: [C, T(), O(), O(), S],
      6: [C, T(), O(), O(), O(), S],
      7: [C, T(), T(), O(), O(), O(), S],
      8: [C, T(), T(), O(), O(), O(), O(), S],
    };
    const list = (map[count] || map[4]).slice();
    // Fisher-Yates shuffle 全部位置（含核心）
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  startGame() {
    this.doStartGame();
  }

  resetGame() {
    this.stopPlayQueue();
    this.gameState = 'waiting';
    this.renderer.clearLog();
    this.renderer.setPhase('');
    this.init();
  }

  togglePause() {
    if (this.gameState !== 'playing' && this.gameState !== 'paused') return;
    
    this.isPaused = !this.isPaused;
    this.gameState = this.isPaused ? 'paused' : 'playing';
    
    this.renderer.updateButtons(this.gameState);
    this.renderer.updateUI(this);
    
    if (this.isPaused) {
      this.stopPlayQueue();
      this.renderer.showPauseOverlay();
      this.renderer.addLog('⏸️ 游戏暂停', 'system');
    } else {
      this.renderer.hidePauseOverlay();
      this.renderer.addLog('▶️ 游戏继续', 'system');
      this.continueTurn();
    }
  }

  backToMenu() {
    if (confirm('确定要退出吗？当前游戏将丢失。')) {
      this.resetGame();
    }
  }

  // ========== 回合系统 ==========

  startTurn() {
    if (this.isPaused || this.gameState !== 'playing') return;

    const player = this.players[this.currentPlayerIndex];
    if (!player.isAlive) {
      this.nextTurn();
      return;
    }

    this.turnCount++;
    player.hasUsedSha = false;
    player.drunken = false;
    // 本回合状态：用于 篮板（首张被弃基本牌）/ 抢断（第 N 张牌）等触发
    this._discardedThisTurn = 0;
    this._cardsUsedThisTurn = 0;
    player._activePhaseSkillUsed = false;
    player._shaLimitDelta = 0;
    
    this.renderer.highlightPlayer(player);
    this.renderer.updateUI(this);

    this.renderer.addLog(`═══ 第 ${this.turnCount} 回合 - ${player.character.name} ═══`, 'turn');
    // 回合开始：英文 voice 念出 NBA 球员名（"LeBron" / "Kobe" / "Curry" ...）
    const voiceName = player.character.voiceName || player.character.name;
    this.fx?.play?.('card_play', { silent: true });
    this.fx?.speakName?.(voiceName);
    
    // 准备阶段
    this.preparePhase(player);
  }

  preparePhase(player) {
    this.renderer.setPhase('prepare');
    this.renderer.addLog('🌅 准备阶段', 'phase');

    // 重置「每轮限一次」类技能标记（在该球员自己的回合开始重置）
    player.oncePerRoundUsed = {};

    // 判定：伤病隐患（闪电）
    const shandian = player.judgeCards?.find(j => j.key === 'shandian');
    if (shandian) {
      const judgeCard = this.deck.judge();
      const v = judgeCard?.value ?? 0;
      const isStrike = judgeCard && judgeCard.suit === 'spade' && v >= 2 && v <= 9;
      this.renderer.addLog(`⚡ 伤病隐患判定：${judgeCard?.name || '?'}${isStrike ? ' — 命中' : ' — 未命中，移交下家'}`, 'normal');
      player.judgeCards = player.judgeCards.filter(j => j !== shandian);
      if (isStrike) {
        player.takeDamage(3);
        this.renderer.flashHpDelta?.(player, -3);
        this.renderer.addLog(`💥 ${player.character.name} 受到 3 点伤病伤害`, 'play');
        this.deck.discard(shandian);
        this.renderer.updatePlayer(player);
        this.checkDeath(player, null);
        if (this.gameState !== 'playing' || !player.isAlive) return;
      } else {
        // 移交给下家（活的下一名玩家）
        let nextIdx = (player.index + 1) % this.players.length;
        while (nextIdx !== player.index && !this.players[nextIdx].isAlive) {
          nextIdx = (nextIdx + 1) % this.players.length;
        }
        const next = this.players[nextIdx];
        next.judgeCards = next.judgeCards || [];
        next.judgeCards.push(shandian);
        this.renderer.updatePlayer(next);
      }
    }

    // 触发准备阶段技能；NBA 球员技能在 SkillSystem 中实现
    this.skills.checkTrigger(player, 'prepare_phase', {});

    // 进入摸牌阶段
    this.drawPhase(player);
  }

  // 「每轮限一次」类技能消费控制
  consumeOncePerRound(player, skillName) {
    if (!player.oncePerRoundUsed) player.oncePerRoundUsed = {};
    if (player.oncePerRoundUsed[skillName]) return false;
    player.oncePerRoundUsed[skillName] = true;
    return true;
  }

  // 检查是否还有同位置存活队友（用于位置协同加成）
  hasSamePositionAlive(player) {
    const pos = player?.character?.position;
    if (!pos) return false;
    return this.players.some(p =>
      p !== player && p.isAlive && p.character?.position === pos
    );
  }

  drawPhase(player) {
    this.renderer.setPhase('draw');
    this.renderer.addLog('📦 摸牌阶段', 'phase');
    
    // 检查兵粮寸断（体能危机）
    const bingliang = player.judgeCards.find(j => j.key === 'bingliangcunduan');
    if (bingliang) {
      const card = this.deck.judge();
      const isClub = card && card.suit === 'club';
      this.renderer.addLog(`体能危机判定：${isClub ? '梅花' : '非梅花'}`, 'normal');

      player.judgeCards = player.judgeCards.filter(j => j !== bingliang);
      this.deck.discard(bingliang);
      if (!isClub) {
        this.renderer.addLog('跳过摸牌阶段', 'skill');
        this.renderer.updatePlayer(player);
        this.playPhase(player);
        return;
      }
    }
    
    // 正常摸牌（含「后场操盘」同位置协同：多摸 1 张）
    let count = 2;
    if (this.hasSamePositionAlive(player) && player.character?.position === 'guard') {
      count += 1;
      this.renderer.addLog(`✨ ${player.character.name} 触发【后场操盘 · 挡拆传切】，摸牌阶段额外摸 1 张`, 'skill');
    }
    const cards = this.deck.drawMultiple(count);
    player.drawCards(cards);
    this.renderer.updatePlayer(player);
    this.renderer.updateUI(this);
    if (player.isHuman || this.debugMode) {
      const cardNames = cards.map(c => `【${c.name}】`).join(' ');
      this.renderer.addLog(`摸了 ${count} 张牌：${cardNames}`, 'draw');
    } else {
      this.renderer.addLog(`${player.character.name} 摸了 ${count} 张牌`, 'draw');
    }
    
    this.playPhase(player);
  }

  playPhase(player) {
    this.renderer.setPhase('play');
    this.renderer.addLog('🎯 出牌阶段', 'phase');
    
    // 检查乐不思蜀
    const lebu = player.judgeCards.find(j => j.key === 'lebusishu');
    if (lebu) {
      const card = this.deck.judge();
      const isHeart = card && card.suit === 'heart';
      this.renderer.addLog(`犯规麻烦判定：${isHeart ? '红桃' : '非红桃'}`, 'normal');
      
      if (!isHeart) {
        this.renderer.addLog('跳过出牌阶段', 'skill');
        player.judgeCards = player.judgeCards.filter(j => j !== lebu);
        this.discardPhase(player);
        return;
      }
      player.judgeCards = player.judgeCards.filter(j => j !== lebu);
    }
    
    if (player.isHuman) {
      this.awaitingHumanAction = true;
      this.selectedHandCardIndex = null;
      this.renderer.addLog('你的出牌阶段：点击手牌使用，或点击“结”结束回合。', 'system');
      this.renderer.updatePlayer(player);
      this.renderer.updateUI(this);
      return;
    }

    // AI 出牌阶段主动技尝试（妖刀 / 干拔等。每回合限一次，由 _activePhaseSkillUsed 防重复）
    if (!player._activePhaseSkillUsed) {
      const r = this.skills?.checkTrigger?.(player, 'play_phase', { source: player });
      if (r?.canUse) {
        player._activePhaseSkillUsed = true;
        const handled = this.applySkillResult(player, r);
        if (handled) {
          // 主动技占用 ~1.5s 时间窗，完后继续走 aiPlayCards
          setTimeout(() => this.aiPlayCards(player), 1500);
          return;
        }
      }
    }

    this.aiPlayCards(player);
  }

  aiPlayCards(player) {
    this.playQueue = [];
    
    // 生成出牌队列
    for (let i = 0; i < 10; i++) {  // 最多 10 次出牌
      const decision = aiDecideCard(player, this.players);
      if (!decision) break;
      this.playQueue.push(decision);
    }
    
    this.executePlayQueue(player);
  }

  executePlayQueue(player) {
    // 防 stale：上回合的 setTimeout fire 时，已经轮到下一玩家，直接 abort
    if (this.players[this.currentPlayerIndex] !== player) return;
    if (this.isPaused || this.playQueue.length === 0) {
      this.discardPhase(player);
      return;
    }

    const decision = this.playQueue.shift();
    this.executeDecision(player, decision);
  }

  continueAfterCard(player, delay = 400) {
    if (player?.isHuman && this.awaitingHumanAction && this.gameState === 'playing') {
      this.renderer.updatePlayer(player);
      this.renderer.updateUI(this);
      return;
    }
    // 全局节奏：默认 5x（400 × 5 = 2000ms / 动作）；通过 paceMultiplier 设置切换 0.5x / 1x / 2x
    const PACE_MULTIPLIER = 5 * (this.paceMultiplier ? this.paceMultiplier / 2 : 1);
    setTimeout(() => {
      // 防 stale：fire 时回合已切换则不继续
      if (this.players[this.currentPlayerIndex] !== player) return;
      this.executePlayQueue(player);
    }, delay * PACE_MULTIPLIER);
  }

  executeDecision(player, decision) {
    const { card, action, target } = decision;
    
    // 找到牌的索引
    const cardIndex = player.handCards.findIndex(c => c.id === card.id);
    if (cardIndex === -1) {
      this.executePlayQueue(player);
      return;
    }
    
    switch (action) {
      case 'equip':
        this.handleEquip(player, card, cardIndex);
        break;
      case 'use':
        this.handleUseCard(player, card, cardIndex, target);
        break;
      default:
        this.executePlayQueue(player);
    }
  }

  handleEquip(player, card, cardIndex) {
    let oldEquip = null;
    
    switch (card.type) {
      case 'weapon':
        oldEquip = player.equipWeapon(card);
        break;
      case 'armor':
        oldEquip = player.equipArmor(card);
        break;
      case 'defense_horse':
        oldEquip = player.equipDefenseHorse(card);
        break;
      case 'offense_horse':
        oldEquip = player.equipOffenseHorse(card);
        break;
    }
    
    player.handCards.splice(cardIndex, 1);

    if (oldEquip) {
      this.discardWithFlash(oldEquip, player);
    }

    this.renderer.updatePlayer(player);
    this.renderer.updateUI(this);
    this.renderer.addLog(`${player.character.name} 装备【${card.name}】`, 'play');
    // 装备类用紫色徽章区分于战术 / 投盖佳得乐
    const equipColor = card.type === 'weapon' ? '#e67e22'
      : card.type === 'armor' ? '#3498db'
      : '#9b59b6';
    this.renderer.flashCardPlay(player, card.name, equipColor);
    this.fx?.play?.('equip');

    this.continueAfterCard(player, 400);
  }

  handleUseCard(player, card, cardIndex, target) {
    player.handCards.splice(cardIndex, 1);

    // 抢断（Paul）：他人于其出牌阶段使用第二张牌时触发
    if (player === this.players[this.currentPlayerIndex]) {
      this._cardsUsedThisTurn = (this._cardsUsedThisTurn || 0) + 1;
      if (this._cardsUsedThisTurn === 2) {
        this.players.forEach(p => {
          if (p === player || !p.isAlive) return;
          const r = this.skills.checkTrigger(p, 'other_uses_second_card', { source: player, card });
          if (r) this.applySkillResult(p, r);
        });
      }
    }

    switch (card.key) {
      case 'sha':
        this.handleSha(player, target, card);
        return; // 这些方法会自己调用 executePlayQueue
      case 'tao':
        this.handleTao(player, player);
        return;
      case 'ji':
        this.handleJiu(player);
        return;
      case 'wuzhong':
        this.handleWuzhong(player);
        return;
      case 'juedou':
        this.handleJuedou(player, target, card);
        return;
      case 'shunshou':
        this.handleShunshou(player, target, card);
        return;
      case 'guoheshuang':
        this.handleGuohe(player, target, card);
        return;
      case 'nanman':
        this.handleNanman(player, card);
        return;
      case 'wanjian':
        this.handleWanjian(player, card);
        return;
      case 'lebusishu':
        this.handleLebu(player, target, card);
        return;
      case 'bingliangcunduan':
        this.handleBingliang(player, target, card);
        return;
      case 'shandian':
        this.handleShandian(player, card);
        return;
      case 'jiedao':
        this.handleJiedao(player, card);  // 做球在方法内部选择目标
        return;
      case 'taoyuan':
        this.handleTaoyuan(player, card);
        return;
      case 'wuke':
        this.handleWuke(player, card);
        return;
      default:
        // 其他牌的默认处理
        this.renderer.addLog(`使用【${card.name}】`, 'play');
        if (target && target.isAlive) {
          target.takeDamage(1);
          this.renderer.flashHpDelta?.(target, -1);
          this.renderer.updatePlayer(target);
          this.checkDeath(target, player);
        }
        this.deck.discard(card);
        this.renderer.updateUI(this);
        this.continueAfterCard(player, 400);
    }
  }

  // 做球
  handleJiedao(player, card) {
    // 步骤1: 检查场上是否有装备武器的球员
    const playersWithWeapon = this.players.filter(p => 
      p !== player && 
      p.isAlive && 
      p.equipment?.weapon
    );
    
    if (playersWithWeapon.length === 0) {
      this.renderer.addLog(`❌ 无法使用【做球】：场上没有装备武器的球员`, 'normal');
      // 归还卡牌
      player.handCards.push(card);
      this.renderer.updatePlayer(player);
      this.renderer.updateUI(this);
      this.continueAfterCard(player, 400);
      return;
    }
    
    // 步骤2: 随机选择一个装备武器的球员作为借刀目标
    const jiedaoTarget = playersWithWeapon[Math.floor(Math.random() * playersWithWeapon.length)];
    
    this.renderer.addLog(`📜 ${player.character.name} 对 ${jiedaoTarget.character.name} 使用【做球】`, 'play');
    this.renderer.flashCardPlay(player, '做球', '#95a5a6');
    
    // 步骤3: 检查目标是否有可攻击的对象
    const shaTarget = this.findValidTarget(jiedaoTarget);
    
    if (!shaTarget) {
      // 没有可攻击目标，目标弃置武器
      const weapon = jiedaoTarget.equipment.weapon;
      if (weapon) {
        jiedaoTarget.equipment.weapon = null;
        this.deck.discard(weapon);
        this.renderer.addLog(`${jiedaoTarget.character.name} 没有可攻击目标，弃置武器【${weapon.name}】`, 'play');
      }
    } else if (jiedaoTarget.handCards.some(c => c.key === 'sha')) {
      // 目标有投，对投目标出投
      const shaIndex = jiedaoTarget.handCards.findIndex(c => c.key === 'sha');
      const sha = jiedaoTarget.handCards.splice(shaIndex, 1)[0];
      this.renderer.addLog(`⚔️ ${jiedaoTarget.character.name} 对 ${shaTarget.character.name} 使用【投】`, 'play');
      
      // 处理投的效果
      const decision = aiDecideShan(shaTarget, sha, jiedaoTarget);
      
      if (decision.useBagua) {
        const judgeCard = this.deck.judge();
        const isRed = judgeCard && (judgeCard.suit === 'heart' || judgeCard.suit === 'diamond');
        if (isRed) {
          this.renderer.addLog(`✨ ${shaTarget.character.name} 联防体系生效，盖避成功`, 'skill');
        } else {
          shaTarget.takeDamage(1);
          this.renderer.flashHpDelta?.(shaTarget, -1);
          this.renderer.addLog(`💥 ${shaTarget.character.name} 受到 1 点伤害`, 'play');
          this.checkDeath(shaTarget, jiedaoTarget);
        }
      } else if (decision.useShan) {
        const shanIdx = shaTarget.handCards.findIndex(c => c.key === 'shan');
        if (shanIdx !== -1) {
          const shan = shaTarget.handCards.splice(shanIdx, 1)[0];
          this.deck.discard(shan);
          this.renderer.addLog(`🛡️ ${shaTarget.character.name} 使用【盖】盖避成功`, 'normal');
          this.renderer.flashCardPlay(shaTarget, '盖', '#3498db');
        }
      } else {
        shaTarget.takeDamage(1);
        this.renderer.flashHpDelta?.(shaTarget, -1);
        this.renderer.addLog(`💥 ${shaTarget.character.name} 受到 1 点伤害，剩余 ${shaTarget.hp} 点体能`, 'play');
        this.checkDeath(shaTarget, jiedaoTarget);
      }
      
      this.deck.discard(sha);
      this.renderer.updatePlayer(shaTarget);
    } else {
      // 目标没有投，弃置武器
      const weapon = jiedaoTarget.equipment.weapon;
      if (weapon) {
        jiedaoTarget.equipment.weapon = null;
        this.deck.discard(weapon);
        this.renderer.addLog(`${jiedaoTarget.character.name} 没有【投】，弃置武器【${weapon.name}】`, 'play');
      }
    }
    
    this.deck.discard(card);
    this.renderer.updatePlayer(jiedaoTarget);
    this.renderer.updatePlayer(player);
    this.renderer.updateUI(this);
    this.continueAfterCard(player, 400);
  }

  // 做球 — 玩家手动指定（jiedaoTarget = 装备武器的队友，shaTarget = 让他攻击的对象）
  executeJiedaoManual(player, jiedaoTarget, shaTarget, card) {
    this.renderer.addLog(`📜 ${player.character.name} 对 ${jiedaoTarget.character.name} 使用【做球】 → 让其攻击 ${shaTarget.character.name}`, 'play');
    this.renderer.flashCardPlay(player, '做球', '#95a5a6');

    if (jiedaoTarget.handCards.some(c => c.key === 'sha')) {
      const shaIndex = jiedaoTarget.handCards.findIndex(c => c.key === 'sha');
      const sha = jiedaoTarget.handCards.splice(shaIndex, 1)[0];
      this.renderer.addLog(`⚔️ ${jiedaoTarget.character.name} 对 ${shaTarget.character.name} 使用【投】`, 'play');

      const decision = aiDecideShan(shaTarget, sha, jiedaoTarget);
      if (decision.useBagua) {
        const judgeCard = this.deck.judge();
        const isRed = judgeCard && (judgeCard.suit === 'heart' || judgeCard.suit === 'diamond');
        if (isRed) {
          this.renderer.addLog(`✨ ${shaTarget.character.name} 联防体系生效，盖避成功`, 'skill');
        } else {
          shaTarget.takeDamage(1);
          this.renderer.flashHpDelta?.(shaTarget, -1);
          this.renderer.addLog(`💥 ${shaTarget.character.name} 受到 1 点伤害`, 'play');
          this.checkDeath(shaTarget, jiedaoTarget);
        }
      } else if (decision.useShan) {
        const shanIdx = shaTarget.handCards.findIndex(c => c.key === 'shan');
        if (shanIdx !== -1) {
          const shan = shaTarget.handCards.splice(shanIdx, 1)[0];
          this.deck.discard(shan);
          this.renderer.addLog(`🛡️ ${shaTarget.character.name} 使用【盖】盖避成功`, 'normal');
          this.renderer.flashCardPlay(shaTarget, '盖', '#3498db');
        }
      } else {
        shaTarget.takeDamage(1);
        this.renderer.flashHpDelta?.(shaTarget, -1);
        this.renderer.addLog(`💥 ${shaTarget.character.name} 受到 1 点伤害，剩余 ${shaTarget.hp} 点体能`, 'play');
        this.checkDeath(shaTarget, jiedaoTarget);
      }

      this.deck.discard(sha);
      this.renderer.updatePlayer(shaTarget);
    } else {
      const weapon = jiedaoTarget.equipment.weapon;
      if (weapon) {
        jiedaoTarget.equipment.weapon = null;
        this.deck.discard(weapon);
        this.renderer.addLog(`${jiedaoTarget.character.name} 没有【投】，弃置武器【${weapon.name}】`, 'play');
      }
    }

    this.deck.discard(card);
    this.renderer.updatePlayer(jiedaoTarget);
    this.renderer.updatePlayer(player);
    this.renderer.updateUI(this);
    this.continueAfterCard(player, 400);
  }
  handleTaoyuan(player, card) {
    this.renderer.addLog(`📜 使用【官方暂停】`, 'play');
    this.renderer.flashCardPlay(player, '官方暂停', '#2ecc71');
    
    this.players.forEach(p => {
      if (p.isAlive && p.hp < p.maxHp) {
        p.heal(1);
        this.renderer.flashHpDelta?.(p, 1);
        this.renderer.addLog(`${p.character.name} 回复 1 点体能`, 'heal');
        this.renderer.updatePlayer(p);
      }
    });
    
    this.deck.discard(card);
    this.renderer.updateUI(this);
    this.continueAfterCard(player, 400);
  }

  // 裁判回看
  handleWuke(player, card) {
    // 查找场上所有可被无懈的目标（延时战术）
    const wukeTargets = [];
    
    this.players.forEach(p => {
      if (p.judgeCards && p.judgeCards.length > 0) {
        p.judgeCards.forEach((j, idx) => {
          if (['lebusishu', 'bingliangcunduan', 'shandian'].includes(j.key)) {
            wukeTargets.push({
              player: p,
              card: j,
              index: idx
            });
          }
        });
      }
    });
    
    if (wukeTargets.length === 0) {
      // 无可抵消的战术，归还卡牌
      this.renderer.addLog(`❌ 无法使用【裁判回看】：没有可抵消的战术`, 'normal');
      player.handCards.push(card);
      this.renderer.updatePlayer(player);
      this.renderer.updateUI(this);
      this.continueAfterCard(player, 400);
      return;
    }
    
    // 随机选择一个目标抵消
    const target = wukeTargets[Math.floor(Math.random() * wukeTargets.length)];
    const cardName = target.card.name;
    
    // 移除延时战术
    target.player.judgeCards.splice(target.index, 1);
    this.deck.discard(target.card);
    
    this.renderer.addLog(`🛡️ ${player.character.name} 使用【裁判回看】，抵消了 ${target.player.character.name} 的【${cardName}】`, 'skill');
    this.renderer.flashCardPlay(player, '裁判回看', '#8e44ad');
    
    this.deck.discard(card);
    this.renderer.updatePlayer(target.player);
    this.renderer.updatePlayer(player);
    this.renderer.updateUI(this);
    this.continueAfterCard(player, 400);
  }

  handleSha(player, target, card) {
    this.renderer.addLog(`⚔️ ${player.character.name} 对 ${target.character.name} 使用【投】`, 'play');
    this.renderer.flashCardPlay(player, '投', '#e74c3c');
    this.renderer.flashTargeted?.(target);
    this.fx?.play?.('sha');

    // 触发：被投（FMVP 等可能直接取消此投）
    const tbsResult = this.skills.checkTrigger(target, 'targeted_by_sha', { target, source: player, card });
    this.applySkillResult(target, tbsResult);
    if (tbsResult?.shaCancelled) {
      this.renderer.addLog(`📛 ${target.character.name} 触发【${tbsResult.name}】取消此【投】`, 'skill');
      player.hasUsedSha = true;
      if (!card.isVirtual) this.deck.discard(card);
      this.renderer.updateUI(this);
      this.continueAfterCard(player, 800);
      return;
    }

    // 触发：他人被投 — 可能直接取消此投（Duncan 护框 / Iguodala 协防）
    let shaCancelled = false;
    for (const p of this.players) {
      if (shaCancelled) break;
      if (p === target || p === player || !p.isAlive) continue;
      const r = this.skills.checkTrigger(p, 'other_targeted_by_sha', { target, source: player, card });
      if (!r) continue;
      if (r.effect === 'discard_shan_cancel_sha' && p.hasCard('shan')) {
        if (r.oncePerRound && !this.consumeOncePerRound(p, r.name)) continue;
        const idx = p.handCards.findIndex(c => c.key === 'shan');
        const shan = p.handCards.splice(idx, 1)[0];
        this.discardWithFlash(shan, p);
        this.renderer.addLog(`✨ ${p.character.name} 发动【${r.name}】 — 弃【盖】令此【投】无效`, 'skill');
        this.renderer.flashCardPlay(p, '盖', '#3498db');
        this.renderer.updatePlayer(p);
        shaCancelled = true;
      } else if (r.effect === 'shan_for_other' && p.hasCard('shan') && target.hp < p.hp) {
        // Iguodala 协防：体能比 target 高时替其出盖
        const idx = p.handCards.findIndex(c => c.key === 'shan');
        const shan = p.handCards.splice(idx, 1)[0];
        this.discardWithFlash(shan, p);
        this.renderer.addLog(`✨ ${p.character.name} 发动【${r.name}】，替 ${target.character.name} 出一张【盖】`, 'skill');
        this.renderer.flashCardPlay(p, '盖', '#3498db');
        this.renderer.updatePlayer(p);
        shaCancelled = true;
      } else {
        this.applySkillResult(p, r);
      }
    }

    if (shaCancelled) {
      this.renderer.addLog(`📛 ${target.character.name} 受到的【投】被取消`, 'normal');
      player.hasUsedSha = true;
      // 虚拟投不入弃牌堆
      if (!card.isVirtual) this.deck.discard(card);
      this.renderer.updateUI(this);
      this.continueAfterCard(player, 800);
      return;
    }

    // 触发：使用投（攻击者侧） — KD 错位 等可能让此投不可响应
    const useShaResult = this.skills.checkTrigger(player, 'use_sha', { source: player, target, card });
    let unblockable = false;
    if (useShaResult?.effect === 'unblockable_sha') {
      unblockable = true;
      this.renderer.addLog(`✨ ${player.character.name} 发动【${useShaResult.name}】 — 此【投】不可被【盖】响应`, 'skill');
    } else if (useShaResult?.effect === 'no_sha_limit') {
      // 例如 Kobe 绝杀：HP 1 时投无视距离（已在选目标阶段判定）
      this.applySkillResult(player, useShaResult);
    }

    const needShan = getRequiredShanCount(player, target);
    if (needShan > 1) {
      this.renderer.addLog(`⚡ 强力终结需要 ${needShan} 张【盖】`, 'skill');
    }

    const decision = aiDecideShan(target, card, player);
    if (unblockable) {
      decision.useShan = false;
      decision.useBagua = false;
    }

    const finishDodged = () => {
      // 触发：盖被使用 + 投被盖抵消（target 视角）
      const offTurn = this.currentPlayerIndex !== target.index;
      this.applySkillResult(target, this.skills.checkTrigger(target, 'used_shan', { source: target, attacker: player, offTurn }));
      this.applySkillResult(target, this.skills.checkTrigger(target, 'shan_dodged_sha', { defender: target, attacker: player, card }));
      // 触发：投被抵消（攻击者侧）— Kobe 曼巴 / Harden 造犯
      this.applySkillResult(player, this.skills.checkTrigger(player, 'sha_dodged', { source: player, target, card }));
    };

    const proceedShaResolution = () => {
      setTimeout(() => {
      if (decision.useBagua) {
        const judgeCard = this.deck.judge();
        const isRed = judgeCard && (judgeCard.suit === 'heart' || judgeCard.suit === 'diamond');
        this.renderer.addLog(`🎯 联防体系判定：${isRed ? '红' : '黑'}色`, 'normal');

        if (isRed) {
          this.renderer.addLog(`✨ ${target.character.name} 联防体系生效，盖避成功`, 'skill');
          finishDodged();
          player.hasUsedSha = true;
          if (!card.isVirtual) this.deck.discard(card);
          this.renderer.updateUI(this);
          this.continueAfterCard(player, 400);
          return;
        }
      }

      if (decision.useShan) {
        // 人类点了某张盖时已经在 playHandCard 里消耗过；只有 AI 自动决策才在这里消耗
        if (!decision.shanAlreadyConsumed) {
          const shanCount = Math.min(decision.count, target.handCards.filter(c => c.key === 'shan').length);
          for (let i = 0; i < shanCount; i++) {
            const idx = target.handCards.findIndex(c => c.key === 'shan');
            if (idx !== -1) {
              const shan = target.handCards.splice(idx, 1)[0];
              this.discardWithFlash(shan, target);
            }
          }
          // Battier 站位：真盖不够则用黑色手牌补
          let extraNeeded = decision.count - shanCount;
          const isBattier = target.character?.key === 'shane_battier';
          if (extraNeeded > 0 && isBattier) {
            for (let i = 0; i < extraNeeded; i++) {
              const idx = target.handCards.findIndex(c => c.key !== 'shan' && (c.suit === 'spade' || c.suit === 'club'));
              if (idx === -1) break;
              const c = target.handCards.splice(idx, 1)[0];
              this.discardWithFlash(c, target);
              this.renderer.addLog(`✨ ${target.character.name} 触发【站位】，将黑色手牌【${c.name}】当【盖】使用`, 'skill');
            }
          }
        }
        this.renderer.addLog(`🛡️ ${target.character.name} 使用 ${decision.count} 张【盖】盖避成功`, 'normal');
        this.renderer.flashCardPlay(target, '盖', '#3498db');
        this.fx?.play?.('shan');
        this.renderer.updatePlayer(target);
        finishDodged();
      } else {
        // 造成伤害（含「禁区铁壁」同位置协同：受到的伤害 -1）
        let damage = getShaDamage(player, target, this.players);
        if (target.character?.position === 'inside' && this.hasSamePositionAlive(target)) {
          if (damage > 0) {
            damage = Math.max(0, damage - 1);
            this.renderer.addLog(`🛡️ ${target.character.name} 触发【禁区铁壁 · 禁区轮转】，伤害 -1`, 'skill');
          }
        }
        // KG 协防：他人在 KG 攻击范围内将受到投伤害时，KG 弃 1 张令伤害 -1
        if (damage > 0) {
          for (const p of this.players) {
            if (!p.isAlive || p === target || p === player) continue;
            const r = this.skills?.checkTrigger?.(p, 'other_about_to_damage', { source: player, target, card });
            if (r?.effect === 'discard_reduce_damage') {
              const handled = this.applySkillResult(p, r);
              if (handled && r.damageDelta) {
                damage = Math.max(0, damage + r.damageDelta);
                this.renderer.addLog(`🛡️ ${target.character.name} 受到的伤害变为 ${damage}`, 'skill');
                if (damage <= 0) break;
              }
            }
          }
        }
        // Shaq 罚球：投造伤害前，target 可令攻击者弃 1 张牌完全免去此伤害
        // AI 决策：target 通常接受免伤（弃 1 比受 1 点伤更便宜）
        if (damage > 0) {
          const r = this.skills?.checkTrigger?.(player, 'about_to_damage', { source: player, target, card });
          if (r?.effect === 'force_choice' && r.choices?.includes('discard_attacker_card')) {
            if (target.handCards.length > 0 && player.handCards.length > 0) {
              const idx = Math.floor(Math.random() * player.handCards.length);
              const c = player.handCards.splice(idx, 1)[0];
              this.discardWithFlash(c, player);
              this.renderer.addLog(`✨ ${target.character.name} 触发【${r.name}】，令 ${player.character.name} 弃【${c.name}】免去此伤害`, 'skill');
              this.renderer.updatePlayer(player);
              damage = 0;
            }
          }
        }
        if (damage > 0) {
          target.takeDamage(damage);
          this.renderer.updatePlayer(target);
          this.renderer.flashHpDelta?.(target, -damage);
          this.fx?.play?.('hit');
          this.renderer.addLog(`💥 ${target.character.name} 受到 ${damage} 点伤害，剩余 ${target.hp} 点体能`, 'play');

          this.handleDamageSkills(player, target, card);

          // 「锋线尖刃」同位置协同：投造成伤害后额外弃目标 1 张牌
          if (target.isAlive && player.character?.position === 'forward' && this.hasSamePositionAlive(player) && target.handCards.length > 0) {
            const idx = Math.floor(Math.random() * target.handCards.length);
            const c = target.handCards.splice(idx, 1)[0];
            this.deck.discard(c);
            this.renderer.addLog(`⚡ ${player.character.name} 触发【锋线尖刃 · 前后夹击】，额外弃置 ${target.character.name} 的【${c.name}】`, 'skill');
            this.renderer.updatePlayer(target);
          }

          this.checkDeath(target, player);
        }
      }

      player.hasUsedSha = true;
      if (!card.isVirtual) this.discardWithFlash(card, player);
      this.renderer.updateUI(this);
      this.continueAfterCard(player, 400);
    }, 2000);
    };

    // 人类作为目标时，让玩家自己选是否出盖（不再用模态弹窗，改成 banner + 手牌点击）
    if (target.isHuman && !unblockable) {
      const hasShan = target.handCards.some(c => c.key === 'shan');
      const hasBaguaArmor = typeof target.hasBagua === 'function' && target.hasBagua();
      const battierBlackShan = target.character?.key === 'shane_battier'
        && target.handCards.some(c => c.key !== 'shan' && (c.suit === 'spade' || c.suit === 'club'));
      const canRespond = hasShan || battierBlackShan;
      if (canRespond || hasBaguaArmor) {
        this.pendingShanResponse = {
          target, source: player, card,
          onShan: (alreadyConsumed) => {
            decision.useShan = true;
            decision.useBagua = false;
            decision.shanAlreadyConsumed = !!alreadyConsumed;
            proceedShaResolution();
          },
          onBagua: () => {
            decision.useShan = false;
            decision.useBagua = true;
            proceedShaResolution();
          },
          onSkip: () => {
            decision.useShan = false;
            decision.useBagua = false;
            proceedShaResolution();
          },
        };
        this.renderer.showShanResponseBanner(player.character.name, 1);
        if (canRespond) this.renderer.markShanCandidates(target);
        // 如果有 bagua 但没 shan，自动按 bagua 走（不需要选）
        if (!canRespond && hasBaguaArmor) {
          // 1.2s 后自动出 bagua（让用户看到提示）
          setTimeout(() => this.pendingShanResponse?.onBagua?.(), 1200);
        }
        return;
      }
    }

    proceedShaResolution();
  }

  // 人类点击下面"受伤"按钮 → 跳过出盖直接受伤
  skipShanResponse() {
    const ctx = this.pendingShanResponse;
    if (!ctx) return;
    this.pendingShanResponse = null;
    this.renderer.hideTargetBanner();
    ctx.onSkip();
  }

  handleTao(player, target) {
    const before = target.hp;
    target.heal(1);
    const delta = target.hp - before;
    this.renderer.updatePlayer(target);
    if (delta > 0) {
      this.renderer.flashHpDelta?.(target, delta);
      this.fx?.play?.('tao');
    }
    this.renderer.addLog(`❤️ 使用【佳得乐】回复 1 点体能`, 'heal');
    this.renderer.flashCardPlay(target, '佳得乐', '#2ecc71');
    this.continueAfterCard(player, 400);
  }

  handleJiu(player) {
    player.drunken = true;
    this.renderer.addLog(`🍶 使用【封闭针】`, 'play');
    this.renderer.flashCardPlay(player, '封闭针', '#9b59b6');
    this.continueAfterCard(player, 400);
  }

  handleWuzhong(player) {
    this.renderer.addLog(`📜 使用【战术板】`, 'play');
    this.renderer.flashCardPlay(player, '战术板', '#f39c12');
    const cards = this.deck.drawMultiple(2);
    player.drawCards(cards);
    this.renderer.updatePlayer(player);
    if (player.isHuman || this.debugMode) {
      const cardNames = cards.map(c => `【${c.name}】`).join(' ');
      this.renderer.addLog(`摸了 2 张牌：${cardNames}`, 'draw');
    } else {
      this.renderer.addLog(`${player.character.name} 摸了 2 张牌`, 'draw');
    }
    this.continueAfterCard(player, 400);
  }

  handleJuedou(player, target, card) {
    this.renderer.addLog(`⚔️ 对 ${target.character.name} 使用【决斗】`, 'play');
    this.renderer.flashCardPlay(player, '单挑', '#e67e22');
    this.fireSingleTargetScroll(player, target, card);

    // 决斗规则：被使用方（target）先出【投】，然后 source，交替直到一方无法响应；
    // 决斗中出的【投】不计入回合"每回合一张投"限制（不动 hasUsedSha）
    const round = (current, other) => {
      const shaIdx = current.handCards.findIndex(c => c.key === 'sha');
      if (shaIdx === -1) {
        // current 无法出 → 受 1 点伤害
        current.takeDamage(1);
        this.renderer.flashHpDelta?.(current, -1);
        this.renderer.updatePlayer(current);
        this.renderer.addLog(`${current.character.name} 无法出【投】，受到 1 点伤害`, 'play');
        this.checkDeath(current, other);
        setTimeout(() => {
          if (!card.isVirtual) this.deck.discard(card);
          this.renderer.updatePlayer(player);
          this.renderer.updatePlayer(target);
          this.renderer.updateUI(this);
          this.continueAfterCard(player, 400);
        }, 1200);
        return;
      }
      const sha = current.handCards.splice(shaIdx, 1)[0];
      this.discardWithFlash(sha, current);
      this.renderer.flashCardPlay(current, '投', '#e74c3c');
      this.renderer.addLog(`${current.character.name} 打出【投】`, 'normal');
      this.renderer.updatePlayer(current);
      setTimeout(() => round(other, current), 1500);
    };

    // target 先响应（被指定方先打投）
    setTimeout(() => round(target, player), 1500);
  }

  // 触发 used_single_target_scroll — 用于 Manu 奇袭（指定唯一目标的锦囊后令目标弃 1 张）
  fireSingleTargetScroll(source, target, card) {
    if (!source || !target) return;
    const r = this.skills?.checkTrigger?.(source, 'used_single_target_scroll', { source, target, card });
    if (r) this.applySkillResult(source, r);
  }

  // 触发 card_discarded — 用于 Howard 篮板（每回合首张被弃基本牌）
  fireCardDiscarded(card, source) {
    if (!card) return;
    const isFirstThisTurn = (this._discardedThisTurn || 0) === 0;
    this._discardedThisTurn = (this._discardedThisTurn || 0) + 1;
    this.players.forEach(p => {
      if (!p.isAlive) return;
      const r = this.skills?.checkTrigger?.(p, 'card_discarded', { card, source, isFirstThisTurn });
      if (r) this.applySkillResult(p, r);
    });
  }

  // 弃牌包装：进弃牌堆 + 飞牌动效（让玩家 2s 看清明牌） + 触发 card_discarded
  discardWithFlash(card, source) {
    if (!card) return;
    this.deck.discard(card);
    this.renderer?.flashDiscard?.(source, card);
    this.fireCardDiscarded(card, source);
  }

  // 触发 targeted_by_scroll — 让 Kawhi 沉默 / 类似的"取消锦囊"技能介入
  // 返回 true 表示锦囊被取消，调用方应跳过效果
  fireTargetedByScrollAndCancel(player, target, card) {
    const r = this.skills?.checkTrigger?.(target, 'targeted_by_scroll', { source: player, target, card });
    if (!r) return false;
    this.applySkillResult(target, r);
    if (r.cancelled) {
      this.renderer.addLog(`✨ ${target.character.name} 的【${r.name}】取消了【${card.name}】`, 'skill');
      return true;
    }
    return false;
  }

  handleShunshou(player, target, actionCard) {
    if (this.fireTargetedByScrollAndCancel(player, target, actionCard)) {
      this.deck.discard(actionCard);
      this.fireCardDiscarded(actionCard, player);
      this.continueAfterCard(player, 400);
      return;
    }
    if (player.isHuman) {
      this.openCardPickModal(player, target, 'shunshou', actionCard);
      return;
    }
    this.renderer.addLog(`📜 对 ${target.character.name} 使用【抢断】`, 'play');
    this.renderer.flashCardPlay(player, '抢断', '#1abc9c');
    if (target.handCards.length > 0) {
      const idx = Math.floor(Math.random() * target.handCards.length);
      const card = target.handCards.splice(idx, 1)[0];
      player.handCards.push(card);
      this.renderer.updatePlayer(player);
      this.renderer.updatePlayer(target);
      this.renderer.addLog(`获得【${card.name}】`, 'play');
    } else {
      this.renderer.addLog(`${target.character.name} 没有手牌`, 'normal');
    }
    this.fireSingleTargetScroll(player, target, actionCard);
    this.renderer.updateUI(this);
    this.continueAfterCard(player, 400);
  }

  handleGuohe(player, target, actionCard) {
    if (this.fireTargetedByScrollAndCancel(player, target, actionCard)) {
      this.deck.discard(actionCard);
      this.fireCardDiscarded(actionCard, player);
      this.continueAfterCard(player, 400);
      return;
    }
    if (player.isHuman) {
      this.openCardPickModal(player, target, 'guoheshuang', actionCard);
      return;
    }
    this.renderer.addLog(`📜 对 ${target.character.name} 使用【迫使失误】`, 'play');
    this.renderer.flashCardPlay(player, '迫使失误', '#34495e');
    if (target.handCards.length > 0) {
      const idx = Math.floor(Math.random() * target.handCards.length);
      const card = target.handCards.splice(idx, 1)[0];
      this.discardWithFlash(card, target);
      this.renderer.updatePlayer(target);
      this.renderer.addLog(`弃置【${card.name}】`, 'play');
    } else {
      this.renderer.addLog(`${target.character.name} 没有手牌`, 'normal');
    }
    this.fireSingleTargetScroll(player, target, actionCard);
    this.renderer.updateUI(this);
    this.continueAfterCard(player, 400);
  }

  // ========== 挑牌弹窗（摘板 / 抢断 人类玩家路径） ==========

  collectPickItems(target) {
    const items = [];
    (target.handCards || []).forEach((card, i) => {
      items.push({ region: 'hand', card, itemKey: `hand:${i}` });
    });
    const eq = target.equipment || {};
    if (eq.weapon) items.push({ region: 'equipment', card: eq.weapon, itemKey: 'equipment:weapon' });
    if (eq.armor) items.push({ region: 'equipment', card: eq.armor, itemKey: 'equipment:armor' });
    if (eq.defenseHorse) items.push({ region: 'equipment', card: eq.defenseHorse, itemKey: 'equipment:defenseHorse' });
    if (eq.offenseHorse) items.push({ region: 'equipment', card: eq.offenseHorse, itemKey: 'equipment:offenseHorse' });
    (target.judgeCards || []).forEach((card, i) => {
      items.push({ region: 'judge', card, itemKey: `judge:${i}` });
    });
    return items;
  }

  openCardPickModal(source, target, action, actionCard) {
    const items = this.collectPickItems(target);
    if (items.length === 0) {
      this.renderer.addLog(`${target.character.name} 没有可拿走的牌`, 'normal');
      // 退还动作牌
      if (actionCard) source.handCards.push(actionCard);
      this.renderer.updatePlayer(source);
      this.continueAfterCard(source, 400);
      return;
    }
    this.pendingCardPick = { source, target, action, actionCard };
    const title = action === 'shunshou'
      ? `🃏 抢断：从 ${target.character.name} 处选一张牌带回手牌`
      : `🗑️ 迫使失误：选一张 ${target.character.name} 的牌弃掉`;
    this.renderer.showCardPickModal({
      title,
      items,
      // 对手手牌正面隐藏；这里只有装备/判定区可见
      hideHandCardContent: !target.isHuman,
    });
  }

  // 技能效果发起的弃牌挑选（如 Kawhi 死亡缠绕、Garnett 怒吼）
  openSkillDiscardPick(source, target, skillName) {
    const items = this.collectPickItems(target);
    if (items.length === 0) {
      this.renderer.addLog(`${target.character.name} 没有可弃置的牌，【${skillName}】未生效`, 'normal');
      return;
    }
    this.pendingCardPick = { source, target, action: 'skill_discard', actionCard: null, skillName };
    this.renderer.showCardPickModal({
      title: `✨ ${source.character.name} 发动【${skillName}】 — 选择弃置 ${target.character.name} 一张牌`,
      items,
      hideHandCardContent: !target.isHuman,
    });
  }

  confirmCardPick(itemKey) {
    const ctx = this.pendingCardPick;
    if (!ctx) return;
    this.pendingCardPick = null;
    this.renderer.hideCardPickModal();
    const { source, target, action, skillName } = ctx;

    let card = null;
    if (itemKey.startsWith('hand:')) {
      const i = parseInt(itemKey.slice(5), 10);
      if (target.handCards[i]) card = target.handCards.splice(i, 1)[0];
    } else if (itemKey.startsWith('equipment:')) {
      const slot = itemKey.slice('equipment:'.length);
      card = target.equipment[slot];
      target.equipment[slot] = null;
    } else if (itemKey.startsWith('judge:')) {
      const i = parseInt(itemKey.slice(6), 10);
      if (target.judgeCards && target.judgeCards[i]) card = target.judgeCards.splice(i, 1)[0];
    }

    if (!card) {
      this.renderer.addLog(`挑牌失败：找不到对应的牌`, 'normal');
      this.continueAfterCard(source, 400);
      return;
    }

    if (action === 'shunshou') {
      source.handCards.push(card);
      this.renderer.addLog(`✋ ${source.character.name} 从 ${target.character.name} 处摘走【${card.name}】`, 'play');
      this.fireSingleTargetScroll(source, target, ctx.actionCard);
    } else if (action === 'guoheshuang') {
      this.discardWithFlash(card, target);
      this.renderer.addLog(`🗑️ ${source.character.name} 弃置 ${target.character.name} 的【${card.name}】`, 'play');
      this.fireSingleTargetScroll(source, target, ctx.actionCard);
    } else if (action === 'skill_discard') {
      this.discardWithFlash(card, target);
      this.renderer.addLog(`✨ ${source.character.name} 发动【${skillName}】，弃置 ${target.character.name} 的【${card.name}】`, 'skill');
    } else if (action === 'self_discard') {
      this.discardWithFlash(card, source);
      this.renderer.addLog(`🗑️ ${source.character.name} 弃置【${card.name}】`, 'normal');
      this.renderer.updatePlayer(source);
      this.renderer.updateUI(this);
      const remaining = (ctx.remaining || 1) - 1;
      if (remaining > 0) {
        setTimeout(() => this.openSelfDiscardPick(source, remaining), 250);
      } else {
        this.endPhase(source);
      }
      return;
    }
    this.renderer.updatePlayer(source);
    this.renderer.updatePlayer(target);
    this.renderer.updateUI(this);
    this.continueAfterCard(source, 400);
  }

  cancelCardPick(event) {
    // 通过 overlay 点击触发时，event 存在；过滤掉点 box 内部的冒泡
    if (event && event.target && event.target !== this.renderer?.elements?.cardPickModal) return;
    const ctx = this.pendingCardPick;
    this.pendingCardPick = null;
    this.renderer.hideCardPickModal();
    if (!ctx) return;
    const { source, actionCard, action, skillName, remaining } = ctx;
    // 自我弃牌不能"完全取消"，按上限自动弃剩余的（从牌尾），然后进入 endPhase
    if (action === 'self_discard') {
      const need = remaining || 0;
      const discarded = [];
      for (let i = 0; i < need; i++) {
        if (source.handCards.length === 0) break;
        const c = source.handCards.pop();
        this.deck.discard(c);
        discarded.push(`【${c.name}】`);
      }
      if (discarded.length > 0) {
        this.renderer.addLog(`已自动弃置剩余 ${discarded.length} 张牌：${discarded.join(' ')}`, 'normal');
      }
      this.renderer.updatePlayer(source);
      this.renderer.updateUI(this);
      this.endPhase(source);
      return;
    }
    // 退还动作牌（演示模式宽松取消）
    if (actionCard) source.handCards.push(actionCard);
    this.renderer.updatePlayer(source);
    if (action === 'shunshou') {
      this.renderer.addLog(`已取消【抢断】`, 'normal');
    } else if (action === 'guoheshuang') {
      this.renderer.addLog(`已取消【迫使失误】`, 'normal');
    } else {
      this.renderer.addLog(`已放弃发动【${skillName}】`, 'normal');
    }
    this.awaitingHumanAction = true;
    this.continueAfterCard(source, 400);
  }

  handleNanman(player, card) {
    this.renderer.addLog(`📜 ${player.character.name} 使用【全场紧逼】 — 所有人需要打出【投】`, 'play');
    this.renderer.flashCardPlay(player, '全场紧逼', '#c0392b');
    const targets = this.players.filter(p => p !== player && p.isAlive);
    this.deck.discard(card);
    this.processAoeSequential(player, targets, 'sha', '投', '全场紧逼', 0);
  }

  handleWanjian(player, card) {
    this.renderer.addLog(`📜 ${player.character.name} 使用【三分雨】 — 所有人需要打出【盖】`, 'play');
    this.renderer.flashCardPlay(player, '三分雨', '#e74c3c');
    const targets = this.players.filter(p => p !== player && p.isAlive);
    this.deck.discard(card);
    this.processAoeSequential(player, targets, 'shan', '盖', '三分雨', 0);
  }

  // 全场紧逼/三分雨 — 每个目标依次反应，每段 2 秒，便于看清谁中招
  processAoeSequential(source, targets, requiredKey, requiredName, aoeName, idx) {
    if (idx >= targets.length) {
      this.renderer.updateUI(this);
      this.continueAfterCard(source, 400);
      return;
    }
    const p = targets[idx];
    if (!p.isAlive) {
      setTimeout(() => this.processAoeSequential(source, targets, requiredKey, requiredName, aoeName, idx + 1), 100);
      return;
    }

    // 被 AOE 锁定：摇晃 + 红光提示
    this.renderer.flashTargeted?.(p);

    const hasCard = p.handCards.some(c => c.key === requiredKey);

    // 把"消耗 1 张响应牌"封装成回调（pendingResponse.alreadyConsumed 决定要不要再扣）
    const consumeAndContinue = () => {
      this.renderer.addLog(`🛡️ ${p.character.name} 打出【${requiredName}】抵消`, 'normal');
      const color = requiredKey === 'shan' ? '#3498db' : '#e74c3c';
      this.renderer.flashCardPlay(p, requiredName, color);
      this.renderer.updatePlayer(p);
      this.renderer.updateUI(this);
      setTimeout(() => this.processAoeSequential(source, targets, requiredKey, requiredName, aoeName, idx + 1), 2000);
    };

    const useResponseCard = () => {
      const i = p.handCards.findIndex(c => c.key === requiredKey);
      const used = p.handCards.splice(i, 1)[0];
      this.discardWithFlash(used, p);
      consumeAndContinue();
    };

    const takeDamage = () => {
      p.takeDamage(1);
      this.renderer.flashHpDelta?.(p, -1);
      this.renderer.addLog(`💥 ${p.character.name} 没有【${requiredName}】，受到 1 点伤害（剩余 ${p.hp}）`, 'play');
      this.checkDeath(p, source);
      this.renderer.updatePlayer(p);
      this.renderer.updateUI(this);
      setTimeout(() => this.processAoeSequential(source, targets, requiredKey, requiredName, aoeName, idx + 1), 2000);
    };

    // 人类作为目标：复用 pendingShanResponse 模式 — banner + 手牌点击 + 受伤按钮
    if (p.isHuman && hasCard) {
      this.pendingShanResponse = {
        target: p,
        source,
        card: null,
        requiredKey,
        requiredName,
        // 玩家点了一张能用的牌：消耗它（playHandCard 已 splice），然后调 consumeAndContinue
        onShan: (alreadyConsumed) => consumeAndContinue(),
        onSkip: () => takeDamage(),
      };
      this.renderer.showShanResponseBanner(
        `${source.character.name} 的【${aoeName}】`,
        1
      );
      this.renderer.markShanCandidates(p, requiredKey);
      return;
    }

    // AI 自动决策
    if (hasCard) useResponseCard();
    else takeDamage();
  }

  handleLebu(player, target, card) {
    if (this.fireTargetedByScrollAndCancel(player, target, card)) {
      this.deck.discard(card);
      this.fireCardDiscarded(card, player);
      this.continueAfterCard(player, 400);
      return;
    }
    target.judgeCards.push(card);
    this.renderer.addLog(`🎭 对 ${target.character.name} 使用【犯规麻烦】`, 'play');
    this.renderer.flashCardPlay(player, '犯规麻烦', '#f39c12');
    this.fireSingleTargetScroll(player, target, card);
    this.renderer.updateUI(this);
    this.continueAfterCard(player, 400);
  }

  handleBingliang(player, target, card) {
    if (this.fireTargetedByScrollAndCancel(player, target, card)) {
      this.deck.discard(card);
      this.fireCardDiscarded(card, player);
      this.continueAfterCard(player, 400);
      return;
    }
    target.judgeCards.push(card);
    this.renderer.addLog(`🍚 对 ${target.character.name} 使用【体能危机】（下回合摸牌阶段判定）`, 'play');
    this.renderer.flashCardPlay(player, '体能危机', '#d35400');
    this.fireSingleTargetScroll(player, target, card);
    this.renderer.updatePlayer(target);
    this.renderer.updateUI(this);
    this.continueAfterCard(player, 400);
  }

  handleShandian(player, card) {
    player.judgeCards.push(card);
    this.renderer.addLog(`⚡ ${player.character.name} 对自己使用【伤病隐患】（下回合准备阶段判定）`, 'play');
    this.renderer.flashCardPlay(player, '伤病隐患', '#3498db');
    this.renderer.updatePlayer(player);
    this.renderer.updateUI(this);
    this.continueAfterCard(player, 400);
  }

  handleDamageSkills(source, target, card) {
    // NBA 球员的伤害触发技能由 SkillSystem 统一派发
    const ctx = { source, target, card };
    // 受伤一方：Tim 基本功 等
    this.applySkillResult(target, this.skills.checkTrigger(target, 'damaged', ctx));
    // 造伤一方：LeBron 组织 / Wade 突破 / Kawhi 死亡缠绕 等
    if (source && source.isAlive && source !== target) {
      this.applySkillResult(source, this.skills.checkTrigger(source, 'damaged', ctx));
    }
  }

  // 把 NBA 球员技能 handler 返回的 effect 派发到引擎层执行
  applySkillResult(player, result) {
    if (!player || !result || !result.effect) return false;
    // 「每轮限一次」类技能在准备阶段重置；这里统一拦截
    if (result.oncePerRound && !this.consumeOncePerRound(player, result.name)) return false;
    const log = (msg) => this.renderer.addLog(`✨ ${player.character.name} 发动【${result.name}】 ${msg}`, 'skill');

    switch (result.effect) {
      case 'draw_one': {
        const cnt = result.count || 1;
        const drawn = this.deck.drawMultiple(cnt);
        player.drawCards(drawn);
        log(`摸 ${cnt} 张牌`);
        this.renderer.updatePlayer(player);
        return true;
      }

      // Howard 篮板：把刚被弃置的基本牌捞回手里
      case 'gain_card': {
        const c = result.card;
        if (!c) return false;
        // 从弃牌堆移除（如果在）
        if (this.deck?.discardPile) {
          const idx = this.deck.discardPile.findIndex(x => x === c || x.id === c.id);
          if (idx >= 0) this.deck.discardPile.splice(idx, 1);
        }
        player.handCards.push(c);
        log(`从弃牌堆获得【${c.name}】`);
        this.renderer.updatePlayer(player);
        return true;
      }

      // Paul 抢断：弃自己一张 → 令其他人弃一张
      case 'discard_then_force_discard': {
        const t = result.target;
        if (!t || !t.isAlive || player.handCards.length === 0 || t.handCards.length === 0) return false;
        const idx = Math.floor(Math.random() * player.handCards.length);
        const own = player.handCards.splice(idx, 1)[0];
        this.deck.discard(own);
        const tIdx = Math.floor(Math.random() * t.handCards.length);
        const tc = t.handCards.splice(tIdx, 1)[0];
        this.deck.discard(tc);
        log(`弃【${own.name}】，令 ${t.character.name} 弃【${tc.name}】`);
        this.renderer.updatePlayer(player);
        this.renderer.updatePlayer(t);
        return true;
      }

      // Kawhi 沉默：弃一张取消针对自己的锦囊牌
      case 'discard_cancel_scroll': {
        if (player.handCards.length === 0) return false;
        const idx = Math.floor(Math.random() * player.handCards.length);
        const c = player.handCards.splice(idx, 1)[0];
        this.deck.discard(c);
        log(`弃【${c.name}】，取消针对自己的锦囊牌`);
        this.renderer.updatePlayer(player);
        result.cancelled = true; // 调用方检测此 flag 决定是否继续
        return true;
      }

      // KG 协防：弃一张让其他角色受到的投伤害 -1
      case 'discard_reduce_damage': {
        if (player.handCards.length === 0) return false;
        const idx = Math.floor(Math.random() * player.handCards.length);
        const c = player.handCards.splice(idx, 1)[0];
        this.deck.discard(c);
        log(`弃【${c.name}】，伤害 -1`);
        this.renderer.updatePlayer(player);
        result.damageDelta = -1;
        return true;
      }

      // Paul 控场：把一张手牌给一名队友，然后摸 1 张
      case 'give_one_then_draw': {
        if (player.handCards.length === 0) return false;
        const allies = this.players.filter(p => p !== player && p.isAlive && !isEnemy(player, p));
        const recipient = allies[0] || this.players.find(p => p !== player && p.isAlive);
        if (!recipient) return false;
        // AI：给第一张牌（最早抓到的，通常优先级低）
        const give = player.handCards.shift();
        recipient.handCards.push(give);
        const drawn = this.deck.drawMultiple(1);
        player.drawCards(drawn);
        log(`将【${give.name}】交给 ${recipient.character.name}，然后摸 1 张牌`);
        this.renderer.updatePlayer(player);
        this.renderer.updatePlayer(recipient);
        return true;
      }

      // Iguodala FMVP：摸 1 张然后弃 1 张；若弃的是【盖】则此投无效
      case 'draw_then_discard_maybe_cancel': {
        const drawCount = result.drawCount || 1;
        const drawn = this.deck.drawMultiple(drawCount);
        player.drawCards(drawn);
        log(`摸 ${drawCount} 张牌`);
        if (player.handCards.length === 0) {
          this.renderer.updatePlayer(player);
          return true;
        }
        // 优先弃 shan 取消此投
        let dIdx = -1;
        if (result.cancelOnDiscardShan) {
          dIdx = player.handCards.findIndex(c => c.key === 'shan');
        }
        if (dIdx === -1) dIdx = Math.floor(Math.random() * player.handCards.length);
        const c = player.handCards.splice(dIdx, 1)[0];
        this.discardWithFlash(c, player);
        if (c.key === 'shan' && result.cancelOnDiscardShan) {
          log(`弃【${c.name}】令此【投】无效`);
          result.shaCancelled = true;
        } else {
          log(`弃【${c.name}】`);
        }
        this.renderer.updatePlayer(player);
        return true;
      }

      // Curry 三分雨主动技：弃两张同花色手牌，视为使用一张三分雨
      case 'discard_as_wanjian': {
        const eligibleSuits = result.eligibleSuits || [];
        if (eligibleSuits.length === 0) return false;
        const suit = eligibleSuits[0];
        const cards = player.handCards.filter(c => c.suit === suit).slice(0, 2);
        if (cards.length < 2) return false;
        cards.forEach(c => {
          const idx = player.handCards.indexOf(c);
          if (idx >= 0) player.handCards.splice(idx, 1);
          this.discardWithFlash(c, player);
        });
        log(`弃【${cards[0].name}】【${cards[1].name}】视为使用一张【三分雨】`);
        this.renderer.updatePlayer(player);
        const virtualWanjian = {
          key: 'wanjian', name: '三分雨', suit, type: 'scroll',
          color: '#e74c3c',
          id: -Date.now() - Math.random(),
          isVirtual: true,
        };
        setTimeout(() => this.handleWanjian(player, virtualWanjian), 1000);
        return true;
      }

      // LeBron 全能：把一张手牌当投/盖/佳得乐使用（AI 自动按需求决策）
      case 'card_as_basic': {
        if (player.handCards.length === 0) return false;
        // 决策：HP 低优先 tao；否则有目标转 sha；否则 skip 留给后续防御
        if (player.hp < player.maxHp && player.handCards.length >= 2) {
          if (player.hp <= Math.ceil(player.maxHp / 2)) {
            const c = player.handCards.shift();
            this.discardWithFlash(c, player);
            log(`将【${c.name}】当【佳得乐】使用`);
            setTimeout(() => this.handleTao(player, player), 800);
            return true;
          }
        }
        // 转 sha：要求未用过 sha + 有合法目标
        if (!player.hasUsedSha) {
          const candidates = this.players.filter(p =>
            p !== player && p.isAlive && canAttack(player, p, this.players) && isEnemy(player, p)
          );
          if (candidates.length > 0) {
            candidates.sort((a, b) => a.hp - b.hp);
            const t = candidates[0];
            const c = player.handCards.shift();
            this.discardWithFlash(c, player);
            log(`将【${c.name}】当【投】用于 ${t.character.name}`);
            const virtualSha = {
              key: 'sha', name: '投', suit: c.suit, type: 'basic',
              color: '#e74c3c',
              id: -Date.now() - Math.random(),
              isVirtual: true,
            };
            setTimeout(() => this.handleSha(player, t, virtualSha), 800);
            return true;
          }
        }
        // 没合适场景，跳过本次（不消耗 oncePerRound 在 AI 流程中已经标记 used）
        return false;
      }

      // Ray Allen 绝平：被佳得乐救起后视为出一张投
      case 'virtual_sha': {
        const candidates = this.players.filter(p =>
          p !== player && p.isAlive && canAttack(player, p, this.players) && isEnemy(player, p)
        );
        if (candidates.length === 0) {
          this.renderer.addLog(`✨ ${player.character.name} 触发【${result.name}】 — 攻击范围内无敌人，无法发动`, 'skill');
          return false;
        }
        // 优先选体能最低的敌人
        candidates.sort((a, b) => a.hp - b.hp);
        const t = candidates[0];
        const virtualSha = {
          key: 'sha', name: '投', suit: 'spade', type: 'basic',
          color: '#e74c3c',
          id: -Date.now() - Math.random(),
          isVirtual: true,
        };
        log(`视为对 ${t.character.name} 使用一张【投】`);
        setTimeout(() => this.handleSha(player, t, virtualSha), 1200);
        return true;
      }

      // Manu 妖刀：弃 1 张牌摸 2 张牌，本阶段投上限 -1
      case 'discard_draw_two_limit': {
        if (player.handCards.length === 0) return false;
        const idx = Math.floor(Math.random() * player.handCards.length);
        const c = player.handCards.splice(idx, 1)[0];
        this.discardWithFlash(c, player);
        const drawCount = result.drawCount || 2;
        const drawn = this.deck.drawMultiple(drawCount);
        player.drawCards(drawn);
        player._shaLimitDelta = (player._shaLimitDelta || 0) + (result.shaLimitDelta || 0);
        log(`弃【${c.name}】，摸 ${drawCount} 张牌（本阶段投上限 ${result.shaLimitDelta || 0}）`);
        this.renderer.updatePlayer(player);
        return true;
      }

      // KD 干拔：弃 1 张装备视为出一张无距离限制的投
      case 'discard_equip_as_sha': {
        const eq = player.equipment || {};
        const slots = ['weapon', 'armor', 'defenseHorse', 'offenseHorse'];
        const haveSlot = slots.find(s => eq[s]);
        if (!haveSlot) return false;
        const equipCard = eq[haveSlot];
        eq[haveSlot] = null;
        this.discardWithFlash(equipCard, player);

        const candidates = this.players.filter(p =>
          p !== player && p.isAlive && isEnemy(player, p)
        );
        this.renderer.updatePlayer(player);
        if (candidates.length === 0) {
          log(`弃装备【${equipCard.name}】 — 但场上无敌人可击`);
          return true;
        }
        candidates.sort((a, b) => a.hp - b.hp);
        const t = candidates[0];
        const virtualSha = {
          key: 'sha', name: '投', suit: 'spade', type: 'basic',
          color: '#e74c3c',
          id: -Date.now() - Math.random(),
          isVirtual: true,
        };
        log(`弃装备【${equipCard.name}】，无视距离对 ${t.character.name} 出一张【投】`);
        setTimeout(() => this.handleSha(player, t, virtualSha), 1000);
        return true;
      }

      case 'discard_target_card': {
        const t = result.target;
        const cnt = result.count || 1;
        if (!t || !t.isAlive || t.handCards.length === 0) return false;
        // 人类作为源时可以挑选要弃哪张
        if (player.isHuman && cnt === 1) {
          this.openSkillDiscardPick(player, t, result.name);
          return true;
        }
        const removed = [];
        for (let i = 0; i < cnt && t.handCards.length > 0; i++) {
          const idx = Math.floor(Math.random() * t.handCards.length);
          removed.push(t.handCards.splice(idx, 1)[0]);
        }
        removed.forEach(c => this.deck.discard(c));
        log(`弃置 ${t.character.name} 的【${removed.map(c => c.name).join('、')}】`);
        this.renderer.updatePlayer(t);
        return true;
      }

      case 'force_target_discard': {
        const t = result.target;
        const cnt = result.count || 1;
        if (!t || !t.isAlive || t.handCards.length === 0) return false;
        if (player.isHuman && cnt === 1) {
          this.openSkillDiscardPick(player, t, result.name);
          return true;
        }
        for (let i = 0; i < cnt && t.handCards.length > 0; i++) {
          const idx = Math.floor(Math.random() * t.handCards.length);
          const c = t.handCards.splice(idx, 1)[0];
          this.deck.discard(c);
        }
        log(`令 ${t.character.name} 弃 ${cnt} 张牌`);
        this.renderer.updatePlayer(t);
        return true;
      }

      case 'turn_player_and_self_draw': {
        const turnPlayer = this.players[this.currentPlayerIndex];
        const cnt = result.count || 1;
        if (turnPlayer && turnPlayer !== player && turnPlayer.isAlive) {
          const d = this.deck.drawMultiple(cnt);
          turnPlayer.drawCards(d);
          this.renderer.updatePlayer(turnPlayer);
        }
        const d2 = this.deck.drawMultiple(cnt);
        player.drawCards(d2);
        log(`回合角色与自己各摸 ${cnt} 张牌`);
        this.renderer.updatePlayer(player);
        return true;
      }

      case 'ally_draw_one': {
        const cnt = result.count || 1;
        const allies = this.players.filter(p => p !== player && p.isAlive && !isEnemy(player, p));
        const recipient = allies[0] || this.players.find(p => p !== player && p.isAlive);
        if (!recipient) return false;
        const drawn = this.deck.drawMultiple(cnt);
        recipient.drawCards(drawn);
        log(`令 ${recipient.character.name} 摸 ${cnt} 张牌`);
        this.renderer.updatePlayer(recipient);
        return true;
      }

      // Kobe 曼巴：弃一张牌后视为再用一张投
      case 'discard_resha': {
        const t = result.target;
        if (!t || !t.isAlive || player.handCards.length === 0) return false;
        const idx = Math.floor(Math.random() * player.handCards.length);
        const discarded = player.handCards.splice(idx, 1)[0];
        this.deck.discard(discarded);
        log(`弃【${discarded.name}】，对 ${t.character.name} 再使用一张视为【投】`);
        this.renderer.updatePlayer(player);
        const virtualSha = {
          key: 'sha',
          name: '投',
          suit: discarded.suit,
          type: 'basic',
          color: '#e74c3c',
          id: -Date.now() - Math.random(),
          isVirtual: true,
        };
        setTimeout(() => this.handleSha(player, t, virtualSha), 900);
        return true;
      }

      // Harden 造犯：目标在「弃一张牌」与「让你摸一张」之间二选一
      case 'force_choice': {
        const t = result.target;
        if (!t) return false;
        if (Array.isArray(result.choices) && result.choices.includes('discard_1') && result.choices.includes('source_draw_1')) {
          // AI 简单决策：手牌≤1 时让攻击者摸（成本低），否则弃 1 张
          if (t.handCards.length <= 1) {
            const drawn = this.deck.drawMultiple(1);
            player.drawCards(drawn);
            log(`${t.character.name} 选择令 ${player.character.name} 摸 1 张牌`);
            this.renderer.updatePlayer(player);
          } else {
            const idx = Math.floor(Math.random() * t.handCards.length);
            const c = t.handCards.splice(idx, 1)[0];
            this.deck.discard(c);
            log(`${t.character.name} 选择弃置【${c.name}】`);
            this.renderer.updatePlayer(t);
          }
          return true;
        }
        this.renderer.addLog(`✨ ${player.character.name} 触发【${result.name}】（force_choice 多分支待完善）`, 'skill');
        return false;
      }

      // KD 错位 / Kobe 绝杀 等流程类 effect 不在这里产生 side-effect，由 handleSha 内联处理
      case 'unblockable_sha':
      case 'no_sha_limit':
      case 'range_plus_1':
      case 'damage_plus_1':
        return true;

      default: {
        // 未实装的 effect 先记录提示，便于排查
        this.renderer.addLog(`✨ ${player.character.name} 触发【${result.name}】（${result.description || result.effect}，未实装效果）`, 'skill');
        return false;
      }
    }
  }

  checkDeath(player, killer) {
    if (player.isAlive) return;

    // 濒死阶段：正式宣布阵亡前，按座位顺序问是否有人出佳得乐救
    const saved = this.tryRescueDying(player);
    if (saved) {
      // Ray Allen 绝平等技能在被救后触发
      this.applySkillResult(player, this.skills?.checkTrigger?.(player, 'saved_by_tao', { target: player, source: player }));
      return;
    }

    // 没人救 → 正式阵亡
    this.renderer.addLog(`💀 ${player.character.name} 阵亡！`, 'death');
    this.fx?.play?.('death');

    // 记录精彩镜头：击杀
    if (this.highlights) {
      this.highlights.push({
        kind: 'kill',
        source: killer,
        target: player,
        turn: this.turnCount,
      });
    }
    if (killer && this.killCounts) {
      const k = killer.character?.name || '?';
      this.killCounts[k] = (this.killCounts[k] || 0) + 1;
    }

    // 击败奖励
    if (killer && isEnemy(killer, player)) {
      const cards = this.deck.drawMultiple(3);
      killer.drawCards(cards);
      this.renderer.addLog(`🎁 ${killer.character.name} 击败敌人，摸 3 张牌`, 'skill');
      this.renderer.updatePlayer(killer);
    }
  }

  // 濒死救援：HP<=0 的玩家，按座位顺序问是否出佳得乐救
  // 顺序：dying 自己 → 顺时针下家 → ... → 最后 dying 上家
  // 每张佳得乐 +1 HP；任何时候 HP > 0 即停。返回是否救回
  tryRescueDying(player) {
    this.renderer.addLog(`⚠️ ${player.character.name} 濒死！(HP=${player.hp})`, 'death');

    const N = this.players.length;
    const order = [];
    for (let i = 0; i < N; i++) {
      const idx = (player.index + i) % N;
      const p = this.players[idx];
      // dying 自己仍可作为 savior（自救）；其他必须 isAlive
      if (p === player || p.isAlive) order.push(p);
    }

    for (const savior of order) {
      if (player.hp > 0) break; // 已救回
      if (!savior.handCards.some(c => c.key === 'tao')) continue;
      if (!aiDecideTao(savior, player)) continue;

      const taoIdx = savior.handCards.findIndex(c => c.key === 'tao');
      const tao = savior.handCards.splice(taoIdx, 1)[0];
      this.discardWithFlash(tao, savior);

      // 自救 / 救人都 +1 HP
      player.hp += 1;
      if (player.hp > 0) player.isAlive = true;

      const verb = savior === player ? '自救' : `救起 ${player.character.name}`;
      this.renderer.addLog(`💖 ${savior.character.name} 使用【佳得乐】${verb}`, 'skill');
      this.renderer.flashCardPlay(savior, '佳得乐', '#2ecc71');
      this.renderer.flashHpDelta?.(player, 1);
      this.renderer.updatePlayer(savior);
      this.renderer.updatePlayer(player);
    }

    return player.isAlive;
  }

  discardPhase(player) {
    this.renderer.setPhase('discard');
    this.renderer.addLog('🗑️ 弃牌阶段', 'phase');

    const maxCards = player.getMaxCards();
    const discardCount = player.handCards.length - maxCards;

    if (discardCount > 0) {
      // 一次性语音报弃牌总数（不一张一张报）
      this.fx?.speak?.(`弃牌${discardCount}张`);
      // 人类玩家：弹出交互式弃牌窗口，自己挑要弃哪几张
      if (player.isHuman) {
        this.renderer.addLog(`需要弃置 ${discardCount} 张手牌（手牌上限 ${maxCards}）`, 'system');
        this.openSelfDiscardPick(player, discardCount);
        return; // 等待玩家挑完再继续 endPhase
      }
      // AI / 兜底：从牌尾弃
      const discarded = [];
      for (let i = 0; i < discardCount; i++) {
        const card = player.handCards.pop();
        if (card) {
          this.discardWithFlash(card, player);
          discarded.push(`【${card.name}】`);
        }
      }
      this.renderer.addLog(`${player.character.name} 弃置 ${discardCount} 张牌：${discarded.join(' ')}`, 'normal');
    }

    this.renderer.updatePlayer(player);
    this.renderer.updateUI(this);

    // 结束阶段
    this.endPhase(player);
  }

  openSelfDiscardPick(player, remaining) {
    if (!player || !player.handCards || player.handCards.length === 0) {
      this.endPhase(player);
      return;
    }
    this.pendingCardPick = {
      source: player,
      target: player,
      action: 'self_discard',
      actionCard: null,
      remaining,
    };
    const items = player.handCards.map((c, i) => ({
      region: 'hand',
      card: c,
      itemKey: `hand:${i}`,
    }));
    this.renderer.showCardPickModal({
      title: `🗑️ 弃牌阶段 — 还需弃 ${remaining} 张牌（手牌上限 ${player.getMaxCards()}）`,
      items,
      hideHandCardContent: false,
    });
  }

  endPhase(player) {
    this.renderer.setPhase('end');

    // 结束阶段技能由 SkillSystem 处理

    this.renderer.addLog('✅ 回合结束', 'system');
    
    // 检查游戏结束
    const result = checkGameOver(this.players);
    if (result.over) {
      this.gameOver(result);
      return;
    }
    
    // 下一个玩家
    this.nextTurn();
  }

  nextTurn() {
    this.currentPlayerIndex = getNextAlivePlayer(this.players, this.currentPlayerIndex);
    setTimeout(() => this.startTurn(), 500);
  }

  continueTurn() {
    // 继续当前回合
    const player = this.players[this.currentPlayerIndex];
    if (player && this.playQueue.length > 0) {
      this.executePlayQueue(player);
    } else {
      this.nextTurn();
    }
  }

  stopPlayQueue() {
    this.playQueue = [];
  }

  gameOver(result) {
    this.gameState = 'ended';
    this.stopPlayQueue();
    this.fx?.play?.('win');

    this.renderer.updateButtons('ended');
    this.renderer.updateUI(this);

    if (result.winner) {
      this.renderer.addLog(`🏆 游戏结束！${result.winnerName || result.winner.character.name} 获胜！${result.reason ? `（${result.reason}）` : ''}`, 'system');
    } else {
      this.renderer.addLog('🏆 游戏结束！平局！', 'system');
    }

    // 弹出胜利窗口 + 身份揭示 + 精彩镜头总结
    this.renderer.showWinnerModal?.({
      winner: result.winner,
      winnerName: result.winnerName,
      reason: result.reason,
      players: this.players,
      summary: this.buildHighlightSummary(),
      turnCount: this.turnCount,
    });
  }

  // 比赛精彩镜头：从 highlights 数组提炼 2 条总结
  buildHighlightSummary() {
    const lines = [];
    const kills = (this.highlights || []).filter(h => h.kind === 'kill');
    const totalKills = kills.length;
    const turns = this.turnCount || 0;

    if (kills.length > 0) {
      const first = kills[0];
      lines.push(`第 ${first.turn} 回合，${first.source?.character?.name || '?'} 率先建功，将 ${first.target?.character?.name || '?'} 送出场外。`);
    }

    // MVP：击杀最多
    if (this.killCounts) {
      const ranked = Object.entries(this.killCounts).sort((a, b) => b[1] - a[1]);
      if (ranked.length > 0 && ranked[0][1] >= 2) {
        lines.push(`${ranked[0][0]} 全场轰下 ${ranked[0][1]} 次终结，毫无悬念的 MVP。`);
      }
    }

    if (lines.length < 2) {
      lines.push(`激战 ${turns} 个回合、共 ${totalKills} 次击杀的硬仗，赛场已写入名人堂。`);
    }
    return lines.slice(0, 2);
  }

  // ========== UI 交互方法 ==========

  toggleDebug() {
    this.debugMode = !this.debugMode;
    document.body.classList.toggle('debug-identity', this.debugMode);
    const btn = document.getElementById('btn-debug');
    if (btn) {
      btn.textContent = this.debugMode ? '🐞 调试中' : '🐞 调试';
      btn.classList.toggle('active', this.debugMode);
    }
    // 重新渲染全部玩家手牌（对手的卡牌正反面切换）
    this.players?.forEach(p => this.renderer?.renderHandCards?.(p));
    this.renderer.addLog(this.debugMode ? '🐞 调试视图：所有身份与手牌可见' : '🐞 已关闭调试视图', 'system');
  }

  toggleSettings() {
    this.renderer.toggleSettings();
  }

  // 节奏档位：0.5 极速、1 快速、2 标准（默认）
  setPace(pace) {
    const v = Number(pace);
    if (![0.5, 1, 2].includes(v)) return;
    this.paceMultiplier = v;
    if (this.renderer) this.renderer._paceMultiplier = v / 2;
    document.querySelectorAll('.settings-option[data-pace]').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.pace) === v);
    });
    const labels = { 0.5: '极速 (0.5s)', 1: '快速 (1s)', 2: '标准 (2s)' };
    this.renderer?.addLog?.(`⏱ 节奏切换：${labels[v]}`, 'system');
  }

  setTheme(theme) {
    this.renderer.setTheme(theme);
  }

  // 音效开关
  setSound(on) {
    this.fx?.setEnabled?.(on);
    document.querySelectorAll('.settings-option[data-sound]').forEach(b => {
      b.classList.toggle('active', (b.dataset.sound === 'on') === !!on);
    });
    this.renderer?.addLog?.(on ? '🔊 音效已开' : '🔇 音效已关', 'system');
  }

  toggleLog() {
    this.renderer.toggleLog();
  }

  filterHand(type, element) {
    this.renderer.filterHandCards(type);
    const tabs = element.parentElement.querySelectorAll('.hand-tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    element.classList.add('active');
    const currentPlayer = this.players[this.currentPlayerIndex];
    if (currentPlayer) {
      this.renderer.renderHandCards(currentPlayer, type);
    }
  }

  // 弹窗
  showCardModal(cardKey, event) {
    this.renderer.showCardModal(cardKey, event);
  }

  closeModal(event) {
    this.renderer.closeModal(event);
  }

  // 快捷操作
  playHandCard(playerIndex, cardId) {
    const player = this.players[playerIndex];
    if (!player?.isHuman) return;

    // 优先级：响应出盖模式（pendingShanResponse） — 即便不是当前回合也允许（被指定方）
    if (this.pendingShanResponse && this.pendingShanResponse.target === player) {
      const card = player.handCards.find(c => c.id === cardId);
      if (!card) return;
      const requiredKey = this.pendingShanResponse.requiredKey || 'shan';
      const isBattier = player.character?.key === 'shane_battier';
      // Battier 站位仅在 sha 响应（requiredKey=shan）时允许黑色手牌当盖；其它情况严格匹配
      const canRespond = card.key === requiredKey
        || (requiredKey === 'shan' && isBattier && (card.suit === 'spade' || card.suit === 'club'));
      if (!canRespond) {
        this.renderer.flashRejected(playerIndex, `只能出【${this.pendingShanResponse.requiredName || '盖'}】响应，或点"受伤"`);
        return;
      }
      // 先消耗这张响应牌（盖 / Battier 黑色手牌 / 全场紧逼时的投）
      const idx = player.handCards.findIndex(c => c.id === cardId);
      if (idx === -1) return;
      const used = player.handCards.splice(idx, 1)[0];
      this.discardWithFlash(used, player);
      if (used.key !== requiredKey && requiredKey === 'shan') {
        this.renderer.addLog(`✨ ${player.character.name} 触发【站位】，将【${used.name}】当【盖】使用`, 'skill');
      }
      this.renderer.updatePlayer(player);
      const ctx = this.pendingShanResponse;
      this.pendingShanResponse = null;
      this.renderer.hideTargetBanner();
      // onShan 内部会执行 finishDodged + flashCardPlay 等；告诉它"我已经消耗过了"
      ctx.onShan(true);
      return;
    }

    if (!this.awaitingHumanAction || this.currentPlayerIndex !== playerIndex) return;

    const cardIndex = player.handCards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return;

    // 切换取消：再点一次同一张牌就退出选目标模式
    if (this.selectedHandCardIndex === cardIndex) {
      this.cancelTargetSelection();
      return;
    }

    const card = player.handCards[cardIndex];

    if (['weapon', 'armor', 'defense_horse', 'offense_horse'].includes(card.type)) {
      this.confirmAndExecuteAction(player, card, cardIndex, 'equip');
      return;
    }

    if (card.key === 'tao') {
      if (player.hp >= player.maxHp) {
        this.renderer.flashRejected(playerIndex, `体能已满，暂时不需要使用【佳得乐】`);
        return;
      }
      this.cancelTargetSelection();
      this.handleUseCard(player, card, cardIndex, player);
      this.awaitingHumanAction = true;
      return;
    }

    if (['ji', 'wuzhong', 'nanman', 'wanjian', 'taoyuan', 'wuke', 'shandian'].includes(card.key)) {
      this.confirmAndExecuteAction(player, card, cardIndex, 'use');
      return;
    }

    if (card.key === 'sha' || card.key === 'juedou' || card.key === 'shunshou' || card.key === 'guoheshuang' || card.key === 'lebusishu' || card.key === 'bingliangcunduan' || card.key === 'jiedao') {
      // sha 每回合只能用 1 次，除非装备了【投篮训练机】（key=zhugelian）或技能放开此限制
      if (card.key === 'sha' && player.hasUsedSha && !player.hasZhugeliannu()) {
        this.renderer.flashRejected(playerIndex, `本回合已经使用过【投】，需要装备【投篮训练机】才能再次使用`);
        return;
      }
      this.selectedHandCardIndex = cardIndex;
      const validIndices = this.getValidTargetIndices(player, card);
      if (validIndices.length === 0) {
        const reason = card.key === 'jiedao' ? '场上没有装备武器的球员' : '没有可作用目标';
        this.renderer.flashRejected(playerIndex, `${reason}，无法使用【${card.name}】`);
        this.cancelTargetSelection();
        return;
      }
      this.renderer.markTargetCandidates(validIndices);
      const banner = card.key === 'jiedao'
        ? `【做球】 — 选择装备武器的队友（他来出投）`
        : `已选择【${card.name}】 — 请点击有橙色光圈的球员（再点该牌可取消）`;
      this.renderer.showTargetBanner(banner);
      this.renderer.addLog(`已选择【${card.name}】，点击有橙色光圈的球员。`, 'system');
      this.renderer.renderHandCards(player);
      return;
    }

    this.renderer.addLog(`【${card.name}】暂未接入手动使用。`, 'normal');
  }

  confirmAndExecuteAction(player, card, cardIndex, action) {
    this.cancelTargetSelection();
    const verb = action === 'equip' ? '装备' : '使用';
    this.renderer.showConfirm(
      `${verb}【${card.name}】？`,
      card.description || '（暂无描述）',
      () => {
        if (action === 'equip') {
          this.handleEquip(player, card, cardIndex);
        } else {
          this.handleUseCard(player, card, cardIndex, player);
        }
        this.awaitingHumanAction = true;
      },
    );
    this.renderer.elements.confirmBtn.onclick = () => this.renderer.confirmAction();
  }

  getValidTargetIndices(source, card) {
    const indices = [];
    this.players.forEach((p, i) => {
      if (p === source || !p.isAlive) return;
      // 投：受攻击范围限制
      if (card.key === 'sha' && !canAttack(source, p, this.players)) return;
      // 做球：仅能选择装备武器的其他玩家
      if (card.key === 'jiedao' && !p.equipment?.weapon) return;
      // 其他需要目标的牌（摘板/抢断/犯规麻烦/单挑）：任意其他存活角色
      indices.push(i);
    });
    return indices;
  }

  cancelTargetSelection() {
    this.selectedHandCardIndex = null;
    this.renderer?.hideTargetBanner?.();
    const player = this.players?.[this.currentPlayerIndex];
    if (player) this.renderer?.renderHandCards?.(player);
  }

  selectTarget(targetIndex) {
    const player = this.players[this.currentPlayerIndex];
    const target = this.players[targetIndex];
    if (!player?.isHuman || !this.awaitingHumanAction || this.selectedHandCardIndex === null) return;

    const card = player.handCards[this.selectedHandCardIndex];
    if (!card) return;

    if (!target?.isAlive) {
      this.renderer.flashInvalidTarget(targetIndex, `${target?.character?.name || '该球员'} 已阵亡，不能作为目标`);
      return;
    }
    if (target === player) {
      this.renderer.flashInvalidTarget(targetIndex, `不能选自己作为【${card.name}】的目标`);
      return;
    }

    if (card.key === 'sha' && !canAttack(player, target, this.players)) {
      const dist = calculateDistance(player, target, this.players);
      const range = player.getAttackRange();
      this.renderer.flashInvalidTarget(
        targetIndex,
        `${target.character.name} 不在攻击范围（你的射程 ${range}，距离 ${dist}）— 装备武器可拉远射程`,
      );
      return;
    }
    // 非攻击牌（摘板/抢断/犯规麻烦/单挑）允许任意其他存活目标，不再做阵营限制

    // 做球（jiedao）特殊处理：两步选目标 — 先选装备武器的队友，再选他攻击的对象
    if (card.key === 'jiedao') {
      if (!this.pendingJiedao) {
        // Step 1：选定了装备武器的队友。下一步：选他要攻击的对象
        if (!target.equipment?.weapon) {
          this.renderer.flashInvalidTarget(targetIndex, `${target.character.name} 没有装备武器，不能作为【做球】目标`);
          return;
        }
        const armedShaCandidates = [];
        this.players.forEach((p, i) => {
          if (p === target || !p.isAlive) return;
          if (canAttack(target, p, this.players)) armedShaCandidates.push(i);
        });
        this.pendingJiedao = { armed: target, source: player, cardId: card.id };
        if (armedShaCandidates.length === 0) {
          // 队友也无攻击目标 → 直接弃武器
          this.renderer.addLog(`📜 ${player.character.name} 对 ${target.character.name} 使用【做球】 — ${target.character.name} 攻击范围内无目标，弃置武器`, 'play');
          const weapon = target.equipment.weapon;
          target.equipment.weapon = null;
          this.deck.discard(weapon);
          this.deck.discard(card);
          const cIdx = player.handCards.findIndex(c => c.id === card.id);
          if (cIdx >= 0) player.handCards.splice(cIdx, 1);
          this.renderer.updatePlayer(target);
          this.renderer.updatePlayer(player);
          this.pendingJiedao = null;
          this.cancelTargetSelection();
          this.continueAfterCard(player, 400);
          return;
        }
        this.renderer.markTargetCandidates(armedShaCandidates);
        this.renderer.showTargetBanner(`【做球】Step 2 — 选择 ${target.character.name} 攻击的目标`);
        this.renderer.addLog(`【做球】已锁定 ${target.character.name}，请选其攻击目标`, 'system');
        return;
      } else {
        // Step 2：选好了被攻击对象，执行
        const armed = this.pendingJiedao.armed;
        if (!canAttack(armed, target, this.players)) {
          this.renderer.flashInvalidTarget(targetIndex, `${target.character.name} 不在 ${armed.character.name} 的攻击范围`);
          return;
        }
        this.pendingJiedao = null;
        const cIdx = player.handCards.findIndex(c => c.id === card.id);
        if (cIdx >= 0) player.handCards.splice(cIdx, 1);
        this.cancelTargetSelection();
        this.executeJiedaoManual(player, armed, target, card);
        return;
      }
    }

    const cardIndex = this.selectedHandCardIndex;
    this.cancelTargetSelection();
    this.handleUseCard(player, card, cardIndex, target);
    this.awaitingHumanAction = true;
  }

  quickPlay(cardKey) {
    const player = this.players[this.currentPlayerIndex];
    if (!player || this.gameState !== 'playing') return;
    
    const cardIndex = player.handCards.findIndex(c => c.key === cardKey);
    if (cardIndex === -1) return;
    
    const card = player.handCards[cardIndex];
    
    if (cardKey === 'sha') {
      const target = this.findValidTarget(player);
      if (target) {
        this.handleSha(player, target, card);
      }
    } else if (cardKey === 'tao') {
      if (player.hp < player.maxHp) {
        this.handleTao(player, player);
      }
    }
  }

  quickDiscard() {
    const player = this.players[this.currentPlayerIndex];
    if (!player || this.gameState !== 'playing') return;

    const maxCards = player.getMaxCards();
    const excess = player.handCards.length - maxCards;
    if (excess <= 0) {
      this.renderer.addLog('🧹 当前没有需要弃置的多余手牌', 'normal');
      return;
    }
    if (player.isHuman) {
      // 直接进入弃牌阶段（弹模态让玩家自己挑）
      this.discardPhase(player);
      return;
    }
    // AI fallback
    while (player.handCards.length > maxCards) {
      const card = player.handCards.pop();
      this.deck.discard(card);
    }
    this.renderer.updatePlayer(player);
    this.renderer.updateUI(this);
    this.renderer.addLog('🧹 一键弃牌完成', 'normal');
  }

  quickEndTurn() {
    if (this.gameState !== 'playing') return;

    this.stopPlayQueue();
    const player = this.players[this.currentPlayerIndex];
    if (player?.isHuman) {
      this.awaitingHumanAction = false;
      this.cancelTargetSelection();
      this.fx?.play?.('card_play');
      this.fx?.speak?.('结束回合');
    }
    this.discardPhase(player);
  }

  findValidTarget(source) {
    for (const player of this.players) {
      if (player !== source && player.isAlive && canAttack(source, player, this.players)) {
        return player;
      }
    }
    return null;
  }

  // 新增 UI 方法
  filterAllHands(type, element) {
    this.renderer.filterAllHands(type, element);
  }

  showSkillModal(characterKey) {
    this.renderer.showSkillModal(characterKey);
  }

  closeModal(event) {
    this.renderer.closeModal(event);
  }

  showCardModal(cardKey, event) {
    this.renderer.showCardModal(cardKey, event);
  }

  showRulesModal() {
    this.renderer.elements.rulesModal?.classList.add('show');
  }

  showDistanceModal(playerIndex) {
    const tag = document.getElementById(`dist-mob-${playerIndex}`);
    const text = tag?.title || '距离：你与该球员的攻击距离。\n相邻座位距离 1，越远数字越大；不在攻击范围则需要装备武器或技能拉远射程。';
    this.renderer.showConfirm('距离说明', text, () => {});
  }

  hideRulesModal(event) {
    if (event && event.target && event.target !== this.renderer.elements.rulesModal) return;
    this.renderer.elements.rulesModal?.classList.remove('show');
  }

  showInfoModal() {
    this.renderer.elements.infoModal?.classList.add('show');
  }

  hideInfoModal(event) {
    if (event && event.target && event.target !== this.renderer.elements.infoModal) return;
    this.renderer.elements.infoModal?.classList.remove('show');
  }

  nextGuide() {
    this.renderer.nextGuide();
  }

  skipGuide() {
    this.renderer.skipGuide();
  }
}
