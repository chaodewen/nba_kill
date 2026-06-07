/**
 * UI 渲染器
 */
import { KINGDOM_COLORS, POSITIONS, getCharacterAvatar } from '../config/characters';
import { SUITS, CARD_TYPES, getCardPlaceholder } from '../config/cards';
import { calculateDistance } from '../core/Logic';

export class Renderer {
  constructor(game) {
    this.game = game;
    this.elements = {};
    this.logExpanded = true;
    this.currentPhase = '';
    this.globalFilter = 'all';
    this.guideStep = 0;
    this.guideSteps = [
      '游戏开始时，每位玩家会获得 4 张初始手牌',
      '每个回合分为：摸牌阶段 → 出牌阶段 → 弃牌阶段',
      '摸牌阶段：自动摸 2 张牌',
      '出牌阶段：可以使用手牌进行攻击或装备',
      '弃牌阶段：手牌数不能超过体能值，多余的需要弃置'
    ];
  }

  cacheElements() {
    this.elements = {
      playersGrid: document.getElementById('players-grid'),
      opponentsArea: document.getElementById('opponents-area'),
      humanCardWrap: document.getElementById('human-card-wrap'),
      humanHand: document.getElementById('human-hand'),
      humanActions: document.getElementById('human-actions'),
      turnDisplay: document.getElementById('turn-display'),
      phaseTag: document.getElementById('phase-tag'),
      gameStatus: document.getElementById('game-status'),
      deckRemaining: document.getElementById('deck-remaining'),
      discardPile: document.getElementById('discard-pile'),
      btnStart: document.getElementById('btn-start'),
      btnPause: document.getElementById('btn-pause'),
      logContent: document.getElementById('log-content'),
      logInner: document.getElementById('log-inner'),
      logToggle: document.getElementById('log-toggle'),
      logCount: document.getElementById('log-count'),
      buildTimestamp: document.getElementById('build-timestamp'),
      settingsPanel: document.getElementById('settings-panel'),
      pauseOverlay: document.getElementById('pause-overlay'),
      // 挑牌弹窗
      cardPickModal: document.getElementById('card-pick-modal'),
      cardPickTitle: document.getElementById('card-pick-title'),
      cardPickBody: document.getElementById('card-pick-body'),
      // 胜利弹窗
      winnerModal: document.getElementById('winner-modal'),
      winnerTitle: document.getElementById('winner-title'),
      winnerSubtitle: document.getElementById('winner-subtitle'),
      winnerReveal: document.getElementById('winner-reveal'),
      // 游戏规则
      rulesModal: document.getElementById('rules-modal'),
      // 关于 / 信息
      infoModal: document.getElementById('info-modal'),
      // 目标选择
      targetBanner: document.getElementById('target-banner'),
      targetBannerText: document.getElementById('target-banner-text'),
      // 弹窗
      cardModal: document.getElementById('card-modal'),
      modalImage: document.getElementById('modal-image'),
      modalName: document.getElementById('modal-name'),
      modalSuit: document.getElementById('modal-suit'),
      modalDesc: document.getElementById('modal-desc'),
      confirmModal: document.getElementById('confirm-modal'),
      confirmTitle: document.getElementById('confirm-title'),
      confirmDesc: document.getElementById('confirm-desc'),
      confirmBtn: document.getElementById('confirm-btn'),
      // 引导
      guideOverlay: document.getElementById('guide-overlay'),
      guideText: document.getElementById('guide-text'),
      guideDots: document.getElementById('guide-dots'),
      guideNextBtn: document.getElementById('guide-next-btn')
    };
  }

  renderPlayers(players) {
    document.querySelector('.app')?.setAttribute('data-players', String(players.length));

    const human = players.find(p => p.isHuman);
    const opponents = players.filter(p => !p.isHuman);
    const oppCount = opponents.length;

    // 手机竖屏：圆桌布局（top 数 / 中间自己 / bottom 数 — 按 4-8 人各自设计）
    const isMobilePortrait = typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(max-width: 768px) and (orientation: portrait)').matches;

    if (isMobilePortrait) {
      this.renderMobilePortrait(players, human, opponents);
      // 人类的手牌 / 快捷按钮仍在底部 tray
      if (human) {
        this.renderHandCards(human);
        const actions = this.elements.humanActions;
        if (actions) actions.innerHTML = this.renderQuickActions(human);
      }
      return;
    }

    // —— 桌面 / 平板布局（弧形对手 + 左下角玩家） ——
    const oppArea = this.elements.opponentsArea;
    if (oppArea) {
      oppArea.innerHTML = '';
      oppArea.className = `opponents-area opponents-${oppCount}`;

      const sorted = opponents.slice().sort((a, b) => b.index - a.index);

      sorted.forEach((p, i) => {
        const fraction = oppCount === 1 ? 0.5 : i / (oppCount - 1);
        const margin = oppCount <= 3 ? 15 : oppCount === 4 ? 13 : oppCount === 5 ? 11 : oppCount === 6 ? 9 : 7.5;
        const x = margin + fraction * (100 - 2 * margin);
        const y = oppCount === 1
          ? 22
          : 42 - 24 * Math.sin(fraction * Math.PI);

        const wrap = document.createElement('div');
        wrap.className = 'opp-seat';
        wrap.style.left = `${x}%`;
        wrap.style.top = `${y}%`;
        const card = this.createPlayerCard(p);
        wrap.appendChild(card);
        p.element = card;
        oppArea.appendChild(wrap);
      });
    }

    // 下方左侧：人类的玩家信息卡（无手牌、无快捷按钮，那些渲染到右侧 tray）
    const humanCardWrap = this.elements.humanCardWrap;
    if (humanCardWrap && human) {
      humanCardWrap.innerHTML = '';
      const card = this.createPlayerCard(human);
      human.element = card;
      humanCardWrap.appendChild(card);
    }

    // 下方右侧：手牌 + 快捷按钮
    if (human) {
      this.renderHandCards(human);
      const actions = this.elements.humanActions;
      if (actions) actions.innerHTML = this.renderQuickActions(human);
    }
  }

  // 手机竖屏圆桌布局：人在左边圈上，对手分布上/下两排，右边空出留给牌堆
  // 顺时针顺序：human (左) → 上排 L→R → 右边折返 → 下排 R→L → 回到 human
  static getMobileSeatLayout(N, seat) {
    const M = {
      4: { 0: ['humanleft'], 1: ['top', 0, 2], 2: ['top', 1, 2], 3: ['bot', 0, 1] },
      5: { 0: ['humanleft'], 1: ['top', 0, 2], 2: ['top', 1, 2], 3: ['bot', 1, 2], 4: ['bot', 0, 2] },
      6: { 0: ['humanleft'], 1: ['top', 0, 3], 2: ['top', 1, 3], 3: ['top', 2, 3], 4: ['bot', 1, 2], 5: ['bot', 0, 2] },
      7: { 0: ['humanleft'], 1: ['top', 0, 3], 2: ['top', 1, 3], 3: ['top', 2, 3], 4: ['bot', 2, 3], 5: ['bot', 1, 3], 6: ['bot', 0, 3] },
      8: { 0: ['humanleft'], 1: ['top', 0, 4], 2: ['top', 1, 4], 3: ['top', 2, 4], 4: ['top', 3, 4], 5: ['bot', 2, 3], 6: ['bot', 1, 3], 7: ['bot', 0, 3] },
    };
    return (M[N] && M[N][seat]) || ['top', 0, 1];
  }

  renderMobilePortrait(players, human, opponents) {
    const oppArea = this.elements.opponentsArea;
    if (!oppArea) return;
    oppArea.innerHTML = '';
    const N = players.length;
    oppArea.className = `opponents-area opponents-${opponents.length} mobile-portrait players-${N}`;

    if (this.elements.humanCardWrap) this.elements.humanCardWrap.innerHTML = '';

    // 顺时针箭头：椭圆 path + 4 个轻量短箭头标方向
    const arrow = document.createElement('div');
    arrow.className = 'mobile-turn-arrow';
    arrow.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <marker id="arrhead-mobile" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <polygon points="0 0, 6 3, 0 6" fill="rgba(243,156,18,0.85)"/>
        </marker>
      </defs>
      <!-- 椭圆轨迹（细虚线） -->
      <path d="M 18 50 Q 18 18 50 18 Q 92 18 92 50 Q 92 82 50 82 Q 18 82 18 50"
            fill="none" stroke="rgba(243,156,18,0.28)" stroke-width="1" stroke-dasharray="2 4"/>
      <!-- 4 个小箭头（顺时针方向）：上→右 / 右→下 / 下→左 / 左→上 -->
      <line x1="42" y1="19" x2="48" y2="18" stroke="rgba(243,156,18,0.7)" stroke-width="1.6" marker-end="url(#arrhead-mobile)"/>
      <line x1="89" y1="42" x2="91" y2="48" stroke="rgba(243,156,18,0.7)" stroke-width="1.6" marker-end="url(#arrhead-mobile)"/>
      <line x1="58" y1="81" x2="52" y2="82" stroke="rgba(243,156,18,0.7)" stroke-width="1.6" marker-end="url(#arrhead-mobile)"/>
      <line x1="17" y1="58" x2="18" y2="52" stroke="rgba(243,156,18,0.7)" stroke-width="1.6" marker-end="url(#arrhead-mobile)"/>
    </svg>`;
    oppArea.appendChild(arrow);

    // 牌堆视觉元素：一摞卡背 + 张数（位置在 mid-right 偏左，不压圈线）
    const deckSlot = document.createElement('div');
    deckSlot.className = 'mobile-deck-slot';
    deckSlot.id = 'mobile-deck-slot';
    deckSlot.innerHTML = `
      <div class="mobile-deck-stack">
        <div class="mobile-deck-card mobile-deck-card-3"></div>
        <div class="mobile-deck-card mobile-deck-card-2"></div>
        <div class="mobile-deck-card mobile-deck-card-1"></div>
      </div>
      <div class="mobile-deck-count" id="mobile-deck-count">${this.game?.deck?.getRemaining?.() ?? 0}</div>
      <div class="mobile-deck-discard">🗑️ <span id="mobile-discard-count">${this.game?.deck?.getDiscardCount?.() ?? 0}</span></div>
    `;
    oppArea.appendChild(deckSlot);

    const place = (player) => {
      const layout = Renderer.getMobileSeatLayout(N, player.index);
      let x, y;
      if (layout[0] === 'humanleft') {
        x = 14;
        y = 50;
      } else {
        const [row, col, total] = layout;
        // 充分利用横向：x 中心点按行内等分（cards 边到边但不重叠，CSS 里 width 配套）
        // 留 2% 边距防贴边裁切
        x = 2 + (col + 0.5) / total * 96;
        y = row === 'top' ? 18 : 82;
      }
      const wrap = document.createElement('div');
      wrap.className = `opp-seat mobile-seat ${player.isHuman ? 'seat-human' : (layout[0] === 'top' ? 'seat-top' : 'seat-bot')}`;
      wrap.style.left = `${x}%`;
      wrap.style.top = `${y}%`;
      const card = this.createPlayerCard(player);
      wrap.appendChild(card);
      player.element = card;
      oppArea.appendChild(wrap);
    };

    players.forEach(place);
  }

  createPlayerCard(player) {
    const card = document.createElement('div');
    card.className = `player-card kingdom-${player.character.kingdom}${player.isHuman ? ' human-player' : ''}`;
    card.id = `player-${player.index}`;
    card.onclick = () => this.game.selectTarget(player.index);
    
    const kingdom = KINGDOM_COLORS[player.character.kingdom];
    const position = POSITIONS[player.character.position] || { name: '?', short: '·', icon: '·', color: '#888', synergy: '' };
    const initial = player.character.name.charAt(0);
    const identity = player.identity || { key: 'unknown', name: '未知', goal: '' };
    const avatarUrl = getCharacterAvatar(player.character);
    const photoTransform = player.character.photoTransform || '';
    const imgStyle = photoTransform ? `style="transform: ${photoTransform}"` : '';
    const skillClick = `event.stopPropagation(); game.showSkillModal('${player.character.key}')`;
    const avatarInner = avatarUrl
      ? `<div class="player-avatar" onclick="${skillClick}" style="cursor:pointer"><img class="player-avatar-img" src="${avatarUrl}" ${imgStyle} alt="${player.character.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><span class="avatar-fallback" style="display:none">${initial}</span></div>`
      : `<div class="player-avatar" onclick="${skillClick}" style="cursor:pointer"><span class="avatar-fallback" style="display:flex">${initial}</span></div>`;
    const avatarHtml = `
      <div class="player-avatar-wrap">
        ${avatarInner}
        <span class="position-tag position-${position.key || 'unknown'}" title="位置：${position.name}\n协同：${position.synergy}">${position.short || position.name}</span>
      </div>`;

    // 状态图标
    let statusHtml = '';
    if (player.judgeCards?.length > 0) {
      player.judgeCards.forEach(j => {
        if (j.key === 'lebusishu') statusHtml += '<span class="status-icon" title="犯规麻烦">🎭</span>';
        if (j.key === 'bingliangcunduan') statusHtml += '<span class="status-icon" title="体能危机">🍚</span>';
        if (j.key === 'shandian') statusHtml += '<span class="status-icon" title="伤病隐患">⚡</span>';
      });
    }

    // 人类的手牌 / 快捷按钮渲染到下方独立 tray，不嵌进 player-card 里
    const handHtml = !player.isHuman ? `
      <div class="hand-section">
        <div class="hand-cards" id="hand-${player.index}"></div>
      </div>` : '';

    card.innerHTML = `
      <div class="status-area" id="status-${player.index}">${statusHtml}</div>

      <div class="player-header">
        ${avatarHtml}
        <div class="player-info">
          <div class="player-name-row">
            <span class="player-name" onclick="event.stopPropagation(); game.showSkillModal('${player.character.key}')" style="cursor:pointer">${player.character.name}</span>
            <span class="identity-tag identity-${identity.key}" title="身份目标：${identity.goal}">${identity.name}</span>
            <span class="distance-tag" id="dist-${player.index}"></span>
          </div>
          <div class="player-skill" title="点击查看技能详情" onclick="event.stopPropagation(); game.showSkillModal('${player.character.key}')">【${player.character.skill}】</div>
        </div>
      </div>

      <div class="hp-display" id="hp-${player.index}" title="当前体能 / 体能上限（HP）">${this.renderHP(player.hp, player.maxHp)}</div>
      <div class="equipment-bar" id="equip-${player.index}" title="装备区（武器、防具、战靴）">${this.renderEquipment(player)}</div>
      ${handHtml}
    `;

    return card;
  }

  renderHP(current, max) {
    return `<span class="hp-number" title="当前体能">${current}</span><span title="/ ${max} 体能上限">/${max}</span><span title="生命值">❤️</span>`;
  }

  renderEquipment(player) {
    const eq = player.equipment || {};
    const parts = [];
    const safeTitle = (text) => (text || '').replace(/"/g, '&quot;');
    const click = (key) => `event.stopPropagation(); game.showCardModal('${key}', event)`;
    if (eq.weapon) parts.push(`<span class="equip-tag" title="${safeTitle(eq.weapon.description)}" onclick="${click(eq.weapon.key)}">⚔${eq.weapon.name}</span>`);
    if (eq.armor) parts.push(`<span class="equip-tag" title="${safeTitle(eq.armor.description)}" onclick="${click(eq.armor.key)}">🛡${eq.armor.name}</span>`);
    if (eq.defenseHorse) parts.push(`<span class="equip-tag" title="${safeTitle(eq.defenseHorse.description)}" onclick="${click(eq.defenseHorse.key)}">👟 ${eq.defenseHorse.name}</span>`);
    if (eq.offenseHorse) parts.push(`<span class="equip-tag" title="${safeTitle(eq.offenseHorse.description)}" onclick="${click(eq.offenseHorse.key)}">👟 ${eq.offenseHorse.name}</span>`);
    return parts.join('');
  }

  renderQuickActions(player) {
    const hasSha = player.handCards?.some(c => c.key === 'sha');
    const hasTao = player.handCards?.some(c => c.key === 'tao');
    const isDiscardPhase = this.currentPhase === 'discard';
    
    return `
      <button class="quick-btn sha ${player.hasUsedSha ? '' : ''}" onclick="game.quickPlay('sha')" ${hasSha && !player.hasUsedSha ? '' : 'disabled'}>投</button>
      <button class="quick-btn tao" onclick="game.quickPlay('tao')" ${hasTao && player.hp < player.maxHp ? '' : 'disabled'}>佳得乐</button>
      <button class="quick-btn discard ${isDiscardPhase ? 'highlight' : ''}" onclick="game.quickDiscard()">🧹弃</button>
      <button class="quick-btn end" onclick="game.quickEndTurn()">▶️结</button>
    `;
  }

  renderHandCards(player, filterType = null) {
    const containerId = player.isHuman ? 'human-hand' : `hand-${player.index}`;
    const container = document.getElementById(containerId);
    if (!container || !player.handCards) return;

    // 非人类玩家在普通模式下只显示叠起来的卡背 + 张数（隐藏具体牌）；
    // 调试模式下与自己一样展示牌正面，便于排查
    const debugReveal = !!this.game?.debugMode;
    if (!player.isHuman && !debugReveal) {
      const n = player.handCards.length;
      if (n === 0) {
        container.innerHTML = '<div class="hand-empty">无手牌</div>';
        return;
      }
      const visible = Math.min(n, 5);
      const backs = Array.from({ length: visible }, (_, i) => {
        const isLast = i === visible - 1;
        return isLast
          ? `<div class="hand-back hand-back-count" data-count="${n}"></div>`
          : '<div class="hand-back"></div>';
      }).join('');
      container.innerHTML = `<div class="hand-stacked" title="${n} 张手牌">${backs}</div>`;
      return;
    }

    const filter = filterType || this.globalFilter;
    let cards = player.handCards;

    if (filter === 'equip') {
      cards = cards.filter(c => ['weapon', 'armor', 'defense_horse', 'offense_horse'].includes(c.type));
    } else if (filter !== 'all') {
      cards = cards.filter(c => c.type === filter);
    }

    container.innerHTML = cards.map((card, i) => {
      const suit = SUITS[card.suit];
      const disabled = this.isCardDisabled(player, card);
      const selected = this.game.selectedHandCardIndex !== null && player.handCards[this.game.selectedHandCardIndex]?.id === card.id;
      const clickHandler = player.isHuman
        ? `event.stopPropagation(); game.playHandCard(${player.index}, ${card.id})`
        : `event.stopPropagation(); game.showCardModal('${card.key}', event)`;
      const hint = player.isHuman ? '点击使用｜右键查看详情' : '点击查看详情';
      const safeDesc = (card.description || '').replace(/"/g, '&quot;');
      const nativeTitle = `【${card.name}】\n\n${safeDesc}\n\n（${hint}）`;
      const debugCls = player.isHuman ? '' : 'debug-reveal';
      return `
        <div class="mini-card ${debugCls} ${disabled ? 'disabled' : ''} ${selected ? 'selected' : ''}"
             style="--card-color:${card.color}"
             title="${nativeTitle}"
             onclick="${clickHandler}"
             oncontextmenu="event.preventDefault(); event.stopPropagation(); game.showCardModal('${card.key}', event); return false;">
          <span class="mini-card-suit">${suit.symbol}</span>
          <span class="mini-card-name">${card.name}</span>
        </div>
      `;
    }).join('');
  }

  isCardDisabled(player, card) {
    const hasLebu = player.judgeCards?.some(j => j.key === 'lebusishu');
    return hasLebu && card.type === 'scroll';
  }

  // 更新一个玩家的渲染（HP/装备/手牌/快捷按钮）+ 变更动效
  updatePlayer(player) {
    const hpEl = document.getElementById(`hp-${player.index}`);
    const equipEl = document.getElementById(`equip-${player.index}`);
    const statusEl = document.getElementById(`status-${player.index}`);
    const cardEl = document.getElementById(`player-${player.index}`);

    if (hpEl) hpEl.innerHTML = this.renderHP(player.hp, player.maxHp);
    if (equipEl) equipEl.innerHTML = this.renderEquipment(player);
    // 状态区（判定区图标：犯规麻烦 🎭 / 体能危机 🍚 / 伤病隐患 ⚡）
    if (statusEl) statusEl.innerHTML = this.renderStatusIcons(player);

    // 人类的快捷按钮在下方独立 tray
    if (player.isHuman) {
      const actionsEl = document.getElementById('human-actions');
      if (actionsEl) actionsEl.innerHTML = this.renderQuickActions(player);
    }

    this.renderHandCards(player);

    if (cardEl) {
      cardEl.classList.toggle('dead', !player.isAlive);
      cardEl.classList.toggle('dying', player.hp === 1 && player.isAlive);
      cardEl.classList.remove('flash-change');
      void cardEl.offsetWidth;
      cardEl.classList.add('flash-change');
    }
  }

  renderStatusIcons(player) {
    if (!player.judgeCards?.length) return '';
    let html = '';
    player.judgeCards.forEach(j => {
      if (j.key === 'lebusishu') html += '<span class="status-icon" title="犯规麻烦">🎭</span>';
      if (j.key === 'bingliangcunduan') html += '<span class="status-icon" title="体能危机">🍚</span>';
      if (j.key === 'shandian') html += '<span class="status-icon" title="伤病隐患">⚡</span>';
    });
    return html;
  }

  updateUI(game) {
    const { turnCount, currentPlayerIndex, deck, gameState, players } = game;
    const currentPlayer = players?.[currentPlayerIndex];

    // 距离标签随回合变化同步
    if (currentPlayer && players) {
      this.updateDistanceLabels(currentPlayer, players);
    }

    if (deck && typeof deck.getRemaining === 'function') {
      this.elements.deckRemaining.textContent = deck.getRemaining();
      const discardCount = deck.getDiscardCount();
      this.elements.discardPile.textContent = discardCount;
      this.updateCenterDiscardPile(discardCount);
      // 手机端右侧牌堆视觉
      const mobileDeck = document.getElementById('mobile-deck-count');
      const mobileDiscard = document.getElementById('mobile-discard-count');
      if (mobileDeck) mobileDeck.textContent = deck.getRemaining();
      if (mobileDiscard) mobileDiscard.textContent = discardCount;
    }
    
    const statusEl = this.elements.gameStatus;
    statusEl.className = 'status-badge';
    
    if (gameState === 'playing' && currentPlayer) {
      this.elements.turnDisplay.textContent = `第${turnCount}回合 · ${currentPlayer.character.name}`;
      statusEl.textContent = '对战中';
      statusEl.classList.add('status-playing');
    } else if (gameState === 'paused') {
      statusEl.textContent = '已暂停';
      statusEl.classList.add('status-paused');
    } else if (gameState === 'ended') {
      statusEl.textContent = '已结束';
      statusEl.classList.add('status-ended');
    } else {
      this.elements.turnDisplay.textContent = '准备开始';
      statusEl.textContent = '等待';
      statusEl.classList.add('status-waiting');
    }
  }

  setPhase(phase) {
    this.currentPhase = phase;
    const phaseNames = {
      'prepare': '准备阶段',
      'draw': '摸牌阶段',
      'play': '出牌阶段',
      'discard': '弃牌阶段',
      'end': '结束阶段'
    };
    
    if (phase && phaseNames[phase]) {
      this.elements.phaseTag.textContent = phaseNames[phase];
      this.elements.phaseTag.style.display = 'inline';
      this.elements.phaseTag.className = `phase-tag ${phase === 'discard' ? 'discard' : ''}`;
    } else {
      this.elements.phaseTag.style.display = 'none';
    }
    
    // 更新当前玩家的操作按钮
    const currentPlayer = this.game.players?.[this.game.currentPlayerIndex];
    if (currentPlayer) {
      this.updatePlayer(currentPlayer);
    }
  }

  highlightPlayer(player) {
    document.querySelectorAll('.player-card').forEach(el => el.classList.remove('active'));
    document.getElementById(`player-${player.index}`)?.classList.add('active');
  }

  // 弹窗
  showCardModal(cardKey, event) {
    const card = this.game.getCardData?.(cardKey);
    if (!card) return;
    
    const suit = SUITS[card.suit];
    
    this.elements.modalImage.src = getCardPlaceholder(cardKey);
    this.elements.modalName.textContent = card.name;
    this.elements.modalName.style.color = card.color;
    this.elements.modalSuit.textContent = `${suit.symbol} ${suit.name} · ${CARD_TYPES[card.type].name}`;
    const safeDesc = (card.description || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    this.elements.modalDesc.innerHTML = safeDesc;
    
    this.elements.cardModal.classList.add('show');
    this.elements.cardModal.querySelector('.modal-box')?.classList.remove('skill-layout');
  }

  showSkillModal(characterKey) {
    const character = this.game.players?.find(p => p.character.key === characterKey)?.character;
    if (!character) return;

    const kingdomColor = KINGDOM_COLORS[character.kingdom]?.primary || '#888';
    const positionColor = (character.position && this.constructor && this.constructor.POSITIONS) ? '' : kingdomColor;
    const avatarUrl = getCharacterAvatar(character);
    const initial = (character.name || '?').charAt(0);

    // 把头像变成真正的球员照片，加载失败降级到首字母
    if (avatarUrl) {
      this.elements.modalImage.src = avatarUrl;
      this.elements.modalImage.style.background = kingdomColor;
      this.elements.modalImage.style.objectFit = 'cover';
      this.elements.modalImage.style.display = 'block';
      // 失败兜底：把 img 替换为一个画首字母的 div（用 .onerror 一次性 hook）
      this.elements.modalImage.onerror = () => {
        this.elements.modalImage.style.display = 'none';
        const fallback = this.elements.modalImage.parentNode?.querySelector('.modal-image-fallback');
        if (!fallback) {
          const div = document.createElement('div');
          div.className = 'modal-image-fallback';
          div.style.cssText = `display:flex;align-items:center;justify-content:center;width:100%;height:200px;font-size:64px;font-weight:700;color:#fff;background:${kingdomColor};border-radius:8px;`;
          div.textContent = initial;
          this.elements.modalImage.parentNode.insertBefore(div, this.elements.modalImage);
        } else {
          fallback.style.display = 'flex';
        }
      };
      // 重新展示之前可能藏起来的 fallback
      const oldFallback = this.elements.modalImage.parentNode?.querySelector('.modal-image-fallback');
      if (oldFallback) oldFallback.style.display = 'none';
    } else {
      this.elements.modalImage.src = '';
      this.elements.modalImage.style.background = kingdomColor;
    }

    const archetype = character.archetype || character.description?.split('。')[0] || '';
    this.elements.modalName.textContent = `${character.name}`;
    this.elements.modalName.style.color = kingdomColor;
    this.elements.modalSuit.textContent = `${KINGDOM_COLORS[character.kingdom]?.name || ''} · ${archetype} · ${character.hp} 体能`;

    // 优先显示完整 skills 数组；fallback 到旧 description 字符串
    const skills = Array.isArray(character.skills) && character.skills.length > 0
      ? character.skills
      : null;

    if (skills) {
      const escape = (s) => String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      const bioHtml = character.bio
        ? `<div style="margin: 4px 0 12px; padding: 10px 12px; background: rgba(255,255,255,0.05); border-radius: 6px; font-size: 13px; line-height: 1.7; color: var(--text-muted); font-style: italic;">${escape(character.bio)}</div>`
        : '';
      const skillsHtml = skills.map(s => `
        <div style="margin: 8px 0; padding: 10px 12px; background: rgba(255,255,255,0.04); border-left: 3px solid ${kingdomColor}; border-radius: 4px;">
          <div style="font-weight:700; color:${kingdomColor}; font-size:14px; margin-bottom:4px;">【${escape(s.name)}】</div>
          <div style="font-size:13px; line-height:1.6; color:var(--text);">${escape(s.description)}</div>
        </div>
      `).join('');
      const pos = POSITIONS[character.position];
      const posHtml = pos
        ? `<div style="margin: 8px 0; padding: 10px 12px; background: rgba(255,255,255,0.04); border-left: 3px solid ${pos.color}; border-radius: 4px;">
            <div style="font-weight:700; color:${pos.color}; font-size:14px; margin-bottom:4px;">${pos.icon} 【${escape(pos.name)}】 位置协同（被动）</div>
            <div style="font-size:13px; line-height:1.6; color:var(--text);">${escape(pos.synergy)}</div>
          </div>`
        : '';
      this.elements.modalDesc.innerHTML = bioHtml + skillsHtml + posHtml;
    } else {
      this.elements.modalDesc.textContent = character.description || '';
    }

    this.elements.cardModal.classList.add('show');
    this.elements.cardModal.querySelector('.modal-box')?.classList.add('skill-layout');
  }

  closeModal(event) {
    if (!event || event.target === this.elements.cardModal) {
      this.elements.cardModal.classList.remove('show');
      this.elements.cardModal.querySelector('.modal-box')?.classList.remove('skill-layout');
      this.elements.modalImage.innerHTML = '';
      this.elements.modalImage.style.background = '';
    }
  }

  // 确认弹窗
  showConfirm(title, desc, onConfirm, onCancel) {
    this.elements.confirmTitle.textContent = title;
    this.elements.confirmDesc.textContent = desc;
    this.elements.confirmModal.classList.add('show');
    this._confirmCallback = onConfirm;
    this._cancelCallback = onCancel;
  }

  confirmAction() {
    this.elements.confirmModal.classList.remove('show');
    if (this._confirmCallback) {
      this._confirmCallback();
      this._confirmCallback = null;
    }
    this._cancelCallback = null;
  }

  cancelConfirm() {
    this.elements.confirmModal.classList.remove('show');
    if (this._cancelCallback) {
      this._cancelCallback();
      this._cancelCallback = null;
    }
    this._confirmCallback = null;
  }

  // 暂停
  showPauseOverlay() {
    this.elements.pauseOverlay.classList.add('show');
  }

  hidePauseOverlay() {
    this.elements.pauseOverlay.classList.remove('show');
  }

  // 目标选择 UI
  showTargetBanner(message) {
    if (!this.elements.targetBanner) return;
    if (this.elements.targetBannerText) {
      this.elements.targetBannerText.textContent = message;
    }
    this.elements.targetBanner.style.display = 'flex';
    // 默认是"取消"模式
    const cancelBtn = document.getElementById('target-banner-cancel');
    const skipBtn = document.getElementById('target-banner-skip');
    if (cancelBtn) cancelBtn.style.display = '';
    if (skipBtn) skipBtn.style.display = 'none';
  }

  // 响应出盖的提示横幅：替换 cancel 为 受伤 按钮
  showShanResponseBanner(attackerName, hpAtRisk = 1) {
    if (!this.elements.targetBanner) return;
    if (this.elements.targetBannerText) {
      this.elements.targetBannerText.textContent = `🛡️ ${attackerName} 对你出【投】 — 点亮蓝色【盖】响应，或点「受伤」承受 ${hpAtRisk} 点`;
    }
    this.elements.targetBanner.style.display = 'flex';
    const cancelBtn = document.getElementById('target-banner-cancel');
    const skipBtn = document.getElementById('target-banner-skip');
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (skipBtn) {
      skipBtn.style.display = '';
      skipBtn.textContent = `😣 受伤 (-${hpAtRisk})`;
    }
  }

  hideTargetBanner() {
    if (!this.elements.targetBanner) return;
    this.elements.targetBanner.style.display = 'none';
    this.clearTargetCandidates();
    this.clearShanCandidates();
  }

  // 标记 / 清除人类手牌中可作为响应的卡（默认 shan + Battier 黑色，可指定其他 key 如 sha）
  markShanCandidates(humanPlayer, requiredKey = 'shan') {
    const handEl = document.getElementById('human-hand');
    if (!handEl || !humanPlayer) return;
    const isBattier = humanPlayer.character?.key === 'shane_battier';
    const minis = handEl.querySelectorAll('.mini-card');
    minis.forEach((el, i) => {
      const card = humanPlayer.handCards[i];
      if (!card) return;
      const canRespond = card.key === requiredKey
        || (requiredKey === 'shan' && isBattier && card.key !== 'shan' && (card.suit === 'spade' || card.suit === 'club'));
      if (canRespond) {
        el.classList.add('shan-response-candidate');
        el.classList.remove('shan-response-locked');
      } else {
        el.classList.add('shan-response-locked');
        el.classList.remove('shan-response-candidate');
      }
    });
  }

  clearShanCandidates() {
    document.querySelectorAll('.mini-card').forEach(el => {
      el.classList.remove('shan-response-candidate');
      el.classList.remove('shan-response-locked');
    });
  }

  markTargetCandidates(playerIndices) {
    const validSet = new Set(playerIndices);
    document.querySelectorAll('.player-card').forEach(el => {
      el.classList.remove('target-candidate');
      el.classList.remove('target-non-candidate');
    });
    document.querySelectorAll('.player-card').forEach(el => {
      const m = el.id.match(/^player-(\d+)$/);
      if (!m) return;
      const idx = parseInt(m[1], 10);
      if (validSet.has(idx)) {
        el.classList.add('target-candidate');
      } else {
        el.classList.add('target-non-candidate');
      }
    });
    // 攻击模式光标
    document.body.classList.add('target-selecting');
  }

  clearTargetCandidates() {
    document.querySelectorAll('.player-card').forEach(el => {
      el.classList.remove('target-candidate');
      el.classList.remove('target-non-candidate');
    });
    document.body.classList.remove('target-selecting');
  }

  // HP 变化飘字 + 音效（受伤 hit beep / 回血 tao beep，不念文案）
  flashHpDelta(player, delta) {
    if (!player || !delta) return;
    const card = document.getElementById(`player-${player.index}`);
    if (!card) return;
    // 自动音效：每次 HP 变化都有声音
    this.game?.fx?.play?.(delta > 0 ? 'tao' : 'hit');
    const flash = document.createElement('div');
    flash.className = `hp-flash ${delta < 0 ? 'damage' : 'heal'}`;
    flash.textContent = delta < 0 ? `💥 ${delta}` : `❤️ +${delta}`;
    card.appendChild(flash);
    setTimeout(() => flash.remove(), 1750);
  }

  // 出牌动效：在玩家卡片上飘出一张被使用的牌名（投/盖/佳得乐 等都通用）
  // 同步 game.fx 用中文 TTS 报牌名 + 一个底色 beep（保证即便 TTS 不可用也有声音）
  flashCardPlay(player, cardName, color) {
    if (!player) return;
    const card = document.getElementById(`player-${player.index}`);
    if (!card) return;
    const burst = document.createElement('div');
    burst.className = 'card-play-burst';
    burst.textContent = `【${cardName}】`;
    if (color) burst.style.background = color;
    card.appendChild(burst);
    setTimeout(() => burst.remove(), 1900);
    // 底色 beep（card_play 没有 DEFAULT_TEXT，纯 beep）
    this.game?.fx?.play?.('card_play');
    // TTS 报牌名（用 cardName 的中文）
    this.game?.fx?.speak?.(cardName);
  }

  // 被锁定 / 被攻击动效：target 卡片摇晃 + 红光，让玩家立刻知道谁在被打
  flashTargeted(player) {
    if (!player) return;
    const card = document.getElementById(`player-${player.index}`);
    if (!card) return;
    card.classList.remove('flash-targeted');
    void card.offsetWidth; // restart animation
    card.classList.add('flash-targeted');
    setTimeout(() => card.classList.remove('flash-targeted'), 1100);
  }

  // 弃牌动效：从源玩家位置弹出一张明牌（2s 可看清楚），最后飞向屏幕正中
  flashDiscard(source, card) {
    if (!card) return;
    const srcEl = source ? document.getElementById(`player-${source.index}`) : null;
    const srcRect = srcEl?.getBoundingClientRect();
    const startX = srcRect ? srcRect.left + srcRect.width / 2 : window.innerWidth / 2;
    const startY = srcRect ? srcRect.top + srcRect.height / 2 : window.innerHeight / 2;
    // 屏幕正中（叠加少量随机偏移避免多张完全重合）
    const jitterX = (Math.random() - 0.5) * 80;
    const jitterY = (Math.random() - 0.5) * 50;
    const endX = window.innerWidth / 2 + jitterX;
    const endY = window.innerHeight / 2 + jitterY;

    const suit = SUITS[card.suit] || { symbol: '?', color: '#888' };
    const el = document.createElement('div');
    el.className = 'discard-flash';
    el.style.left = `${startX}px`;
    el.style.top = `${startY}px`;
    el.style.setProperty('--card-color', card.color || '#888');
    el.innerHTML = `
      <span class="discard-flash-suit-tl" style="color:${suit.color}">${suit.symbol}</span>
      <span class="discard-flash-name">${card.name}</span>
      <span class="discard-flash-suit-br" style="color:${suit.color}">${suit.symbol}</span>
    `;
    document.body.appendChild(el);

    // Phase 1：出现并悬停在源位置 1 秒（读牌时间）
    // Phase 2：1s 后飞向屏幕正中，缩小淡出
    setTimeout(() => {
      el.style.transition = 'left 1s cubic-bezier(.4,0,.2,1), top 1s cubic-bezier(.4,0,.2,1), transform 1s ease, opacity 1s ease';
      el.style.left = `${endX}px`;
      el.style.top = `${endY}px`;
      el.style.transform = 'translate(-50%, -50%) scale(0.4) rotate(8deg)';
      el.style.opacity = '0.55';
    }, 1000);

    setTimeout(() => el.remove(), 2100);
  }

  // 屏幕正中弃牌堆：每次有牌入弃牌堆都同步刷新（堆叠卡背 + 张数）
  updateCenterDiscardPile(count) {
    const el = document.getElementById('center-discard-stack');
    if (!el) return;
    if (!count || count <= 0) {
      el.classList.remove('has-cards');
      el.innerHTML = '';
      return;
    }
    el.classList.add('has-cards');
    const visible = Math.min(count, 5);
    const backs = Array.from({ length: visible }, () => '<div class="stack-back"></div>').join('');
    el.innerHTML = `${backs}<span class="stack-count">${count} 张</span>`;
  }

  // 无效目标反馈：红色摇晃 + 日志
  flashInvalidTarget(playerIndex, reason) {
    const card = document.getElementById(`player-${playerIndex}`);
    if (card) {
      card.classList.add('flash-invalid');
      setTimeout(() => card.classList.remove('flash-invalid'), 480);
    }
    this.game?.fx?.play?.('reject');
    if (reason) this.addLog(`⛔ ${reason}`, 'normal');
  }

  // 玩家自己操作被拒绝时的红色摇头反馈（不是出牌目标无效，是当前操作本身不允许）
  flashRejected(playerIndex, reason) {
    const card = document.getElementById(`player-${playerIndex}`);
    if (card) {
      card.classList.remove('flash-reject');
      void card.offsetWidth;
      card.classList.add('flash-reject');
      setTimeout(() => card.classList.remove('flash-reject'), 600);
    }
    this.game?.fx?.play?.('reject');
    if (reason) this.addLog(`🚫 ${reason}`, 'normal');
  }

  // 挑牌弹窗
  showCardPickModal({ title, items, hideHandCardContent }) {
    if (!this.elements.cardPickModal) return;
    this.elements.cardPickTitle.textContent = title || '请选择一张牌';

    const escape = (s) => String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const regionLabel = { hand: '🃏 手牌', equipment: '⚔️ 装备区', judge: '⏳ 判定区' };
    const groups = {};
    items.forEach((it) => {
      groups[it.region] = groups[it.region] || [];
      groups[it.region].push(it);
    });

    let html = '';
    ['hand', 'equipment', 'judge'].forEach((region) => {
      const list = groups[region];
      if (!list || list.length === 0) return;
      html += `<div class="card-pick-region">${regionLabel[region]} (${list.length})</div>`;
      list.forEach((it) => {
        const card = it.card;
        const suit = SUITS[card.suit] || SUITS.spade;
        const isHidden = region === 'hand' && hideHandCardContent;
        const tileClass = `card-pick-tile${isHidden ? ' card-pick-tile-back' : ''}`;
        const name = isHidden ? '?' : escape(card.name);
        const suitSymbol = isHidden ? '🂠' : `<span style="color:${suit.color}">${suit.symbol}</span>`;
        const desc = isHidden ? '点击选取（背面）' : escape(card.description || '');
        html += `
          <div class="${tileClass}" onclick="game.confirmCardPick('${escape(it.itemKey)}')">
            <div class="card-pick-tile-suit">${suitSymbol}</div>
            <div class="card-pick-tile-name" style="color:${isHidden ? '' : (card.color || 'var(--text)')}">${name}</div>
            <div class="card-pick-tile-desc">${desc}</div>
          </div>
        `;
      });
    });

    if (!html) html = '<div style="grid-column:1/-1; text-align:center; color:var(--text-muted); padding: 16px;">没有可选的牌</div>';

    this.elements.cardPickBody.innerHTML = html;
    this.elements.cardPickModal.classList.add('show');
  }

  hideCardPickModal() {
    if (!this.elements.cardPickModal) return;
    this.elements.cardPickModal.classList.remove('show');
    if (this.elements.cardPickBody) this.elements.cardPickBody.innerHTML = '';
  }

  // 胜利弹窗 + 身份揭示
  showWinnerModal({ winner, winnerName, reason, players, summary, turnCount }) {
    if (!this.elements.winnerModal) return;
    const escape = (s) => String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    this.elements.winnerTitle.textContent = winnerName
      ? `🏆 ${winnerName} 获胜`
      : '🏁 比赛结束';
    const subParts = [];
    if (reason) subParts.push(reason);
    if (turnCount) subParts.push(`历时 ${turnCount} 回合`);
    this.elements.winnerSubtitle.textContent = subParts.join(' · ');

    if (this.elements.winnerReveal) {
      const winnerKey = winner?.character?.key;
      const winnerIdentityKey = winner?.identity?.key;
      const winnerTeam = winner?.identity?.team;
      const rows = (players || []).map(p => {
        const isWinnerSelf = p.character?.key === winnerKey;
        const isWinningTeam = winnerIdentityKey === 'solo'
          ? (p.identity?.key === 'solo')
          : (p.identity?.team === winnerTeam);
        const winnerCls = (isWinnerSelf || isWinningTeam) ? 'is-winner' : '';
        const deadCls = !p.isAlive ? 'is-dead' : '';
        const status = p.isAlive ? '存活' : '阵亡';
        return `<div class="winner-reveal-row ${winnerCls} ${deadCls}">
          <span class="winner-reveal-name">${escape(p.character?.name || '?')}</span>
          <span class="winner-reveal-id">${escape(p.identity?.name || '未知')}</span>
          <span class="winner-reveal-status">${status}</span>
        </div>`;
      }).join('');

      // 精彩镜头：2 句总结
      let highlightHtml = '';
      if (Array.isArray(summary) && summary.length > 0) {
        highlightHtml = `<div class="winner-highlights">
          <div class="winner-highlights-title">📺 赛后回顾</div>
          ${summary.map(s => `<div class="winner-highlights-line">${escape(s)}</div>`).join('')}
        </div>`;
      }

      this.elements.winnerReveal.innerHTML = highlightHtml + `<div class="winner-reveal-list">${rows}</div>`;
    }

    this.elements.winnerModal.classList.add('show');
  }

  hideWinnerModal() {
    if (!this.elements.winnerModal) return;
    this.elements.winnerModal.classList.remove('show');
  }

  // 距离标签更新（每次回合切换或 UI 刷新时调用）
  updateDistanceLabels(currentPlayer, players) {
    if (!currentPlayer || !players) return;
    players.forEach(p => {
      const tag = document.getElementById(`dist-${p.index}`);
      if (!tag) return;
      if (p === currentPlayer) {
        // 当前回合不再标文字，靠卡片黄色描边动效区分
        tag.textContent = '';
        tag.className = 'distance-tag self';
        tag.title = '';
        return;
      }
      if (!p.isAlive) {
        tag.textContent = '阵亡';
        tag.className = 'distance-tag out-of-range';
        return;
      }
      const dist = calculateDistance(currentPlayer, p, players);
      const range = currentPlayer.getAttackRange?.() || 1;
      const inRange = dist <= range;
      tag.textContent = `${dist}`;
      tag.className = `distance-tag ${inRange ? '' : 'out-of-range'}`;
      tag.title = `距离 ${dist}\n${currentPlayer.character?.name || '当前角色'} 攻击范围 ${range}\n相邻座位距离 1，越远数字越大；不在攻击范围则需要装备武器或技能拉远射程`;
    });
  }

  // 日志（最新条目置顶）
  addLog(message, type = 'normal') {
    // 把日志排队，每条间隔 ~1.2s 展示，避免连续事件刷屏看不清
    // 系统类（system / phase / turn / 错误）即时显示，不入队
    const instantTypes = new Set(['system', 'turn', 'phase', 'death']);
    if (instantTypes.has(type)) {
      this._renderLogEntry(message, type);
      return;
    }
    this._logQueue = this._logQueue || [];
    this._logQueue.push({ message, type });
    if (this._logTimer) return;
    this._processLogQueue();
  }

  _processLogQueue() {
    if (!this._logQueue || this._logQueue.length === 0) {
      this._logTimer = null;
      return;
    }
    const { message, type } = this._logQueue.shift();
    this._renderLogEntry(message, type);
    // 每条日志默认 2s 后弹下一条；积压超过 6 条自动缩到 1s；paceMultiplier 倍率支持设置面板调速
    const baseGap = this._logQueue.length > 6 ? 1000 : 2000;
    const mult = this._paceMultiplier ?? 1;
    this._logTimer = setTimeout(() => this._processLogQueue(), Math.max(120, baseGap * mult));
  }

  _renderLogEntry(message, type = 'normal') {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type} new`;
    entry.textContent = `[${time}] ${message}`;
    entry.title = `[${time}] ${message}`;

    // 最新放最上面
    this.elements.logInner.insertBefore(entry, this.elements.logInner.firstChild);
    this.elements.logInner.scrollTop = 0;

    // 动效结束后移除 new class，避免多次刷新累积动画
    setTimeout(() => entry.classList.remove('new'), 2000);

    while (this.elements.logInner.children.length > 80) {
      this.elements.logInner.removeChild(this.elements.logInner.lastChild);
    }

    // 默认展开日志面板
    if (this.elements.logContent && !this.elements.logContent.classList.contains('show')) {
      this.elements.logContent.classList.add('show');
      if (this.elements.logToggle) this.elements.logToggle.textContent = '收起 ▲';
      this.logExpanded = true;
    }

    // 更新日志数量
    this.elements.logCount.textContent = `(${this.elements.logInner.children.length})`;
  }

  clearLog() {
    this._logQueue = [];
    if (this._logTimer) { clearTimeout(this._logTimer); this._logTimer = null; }
    this.elements.logInner.innerHTML = '';
    this.elements.logCount.textContent = '';
  }

  toggleLog() {
    this.logExpanded = !this.logExpanded;
    this.elements.logContent.classList.toggle('show', this.logExpanded);
    this.elements.logToggle.textContent = this.logExpanded ? '收起 ▲' : '展开 ▼';
    // 手机端：扩展 / 收起 bottom-panel 占用高度（CSS 由 .bottom-panel.expanded 控制）
    const panel = document.querySelector('.bottom-panel');
    if (panel) panel.classList.toggle('expanded', this.logExpanded);
  }

  // 全局筛选
  filterAllHands(type, element) {
    this.globalFilter = type;
    
    document.querySelectorAll('.filter-tab').forEach(tab => tab.classList.remove('active'));
    element.classList.add('active');
    
    this.game.players?.forEach(player => {
      this.renderHandCards(player, type);
    });
  }

  // 引导
  showGuide() {
    this.guideStep = 0;
    this.updateGuide();
    this.elements.guideOverlay.classList.add('show');
  }

  updateGuide() {
    this.elements.guideText.textContent = this.guideSteps[this.guideStep];
    
    // 更新进度点
    let dotsHtml = '';
    for (let i = 0; i < this.guideSteps.length; i++) {
      dotsHtml += `<span class="guide-dot ${i === this.guideStep ? 'active' : ''}"></span>`;
    }
    this.elements.guideDots.innerHTML = dotsHtml;
    
    // 更新按钮文字
    this.elements.guideNextBtn.textContent = this.guideStep === this.guideSteps.length - 1 ? '开始游戏' : '下一步';
  }

  nextGuide() {
    this.guideStep++;
    if (this.guideStep >= this.guideSteps.length) {
      this.skipGuide();
    } else {
      this.updateGuide();
    }
  }

  skipGuide() {
    this.elements.guideOverlay.classList.remove('show');
    localStorage.setItem('nba_kill_guide_shown', 'true');
  }

  shouldShowGuide() {
    return !localStorage.getItem('nba_kill_guide_shown');
  }

  showBuildTimestamp() {
    if (this.elements.buildTimestamp) {
      const now = new Date();
      this.elements.buildTimestamp.textContent = now.toLocaleString('zh-CN', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      });
    }
  }

  updateButtons(gameState) {
    const { btnStart, btnPause } = this.elements;
    
    if (gameState === 'playing' || gameState === 'paused') {
      btnStart.textContent = '🔄 重新开始';
      btnStart.className = 'btn btn-danger';
      btnPause.style.display = 'block';
      btnPause.textContent = gameState === 'paused' ? '▶️' : '⏸️';
    } else {
      btnStart.textContent = '开始比赛';
      btnStart.className = 'btn btn-primary';
      btnPause.style.display = 'none';
    }
  }

  toggleSettings() {
    this.elements.settingsPanel.classList.toggle('open');
  }
}
