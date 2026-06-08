// 房间管理：建房 / 加入 / 玩家列表 / 开始；与 Game 解耦
// host 端：管理玩家槽位（哪些是 AI / 哪些是 human guest）+ 收 intent 转发
// guest 端：维护房间状态（房号 / 自己的 slot / 谁是房主）+ 接事件渲染
//
// 这一层只关心房间元信息，不含游戏 logic 本身

import { createHost, joinAsGuest, generateRoomId, generatePlayerToken,
         serializeArgs, hydrateArgs, serializeGameState } from './NetworkBridge.js';

export class RoomHost {
  constructor(game, opts = {}) {
    this.game = game;
    this.role = 'host';
    this.roomId = opts.roomId || generateRoomId();
    this.bridge = null;
    this.peers = new Map(); // peerId -> { token, slotIndex, name, joined }
    // 断线宽限：peerId leave 后 30s 内能凭 token 重连恢复 slot；超时才真正 AI 接管
    this.disconnectedSlots = new Map(); // token -> { slotIndex, displayName, timer, leftAt }
    this.disconnectGraceMs = opts.disconnectGraceMs ?? 30_000;
    this.maxPlayers = opts.maxPlayers || 4;
    this.aiCount = opts.aiCount || 0;
    this.started = false;
    this.onChange = opts.onChange || (() => {});
  }

  async start() {
    this.bridge = await createHost(this.roomId);
    this.bridge.onPeerJoin((peerId) => this._onPeerJoin(peerId));
    this.bridge.onPeerLeave((peerId) => this._onPeerLeave(peerId));
    this.bridge.onPeerIntent((intent, peerId) => this._onIntent(intent, peerId));
    // 房主自己 events.on('*') 订阅 — 把所有 ui:/fx: 转发给 guest
    this._unsub = this.game.events.on('*', ({ type, args }) => {
      if (!this.started) return;
      // 序列化后广播
      this.bridge.broadcastEvent({ type, args: serializeArgs(args) });
    });
    return this;
  }

  _onPeerJoin(peerId) {
    // 等加入者发 join 元信息（含 token / 期望 slot）才正式 assign
    this.peers.set(peerId, { token: null, slotIndex: null, joined: false });
    this._broadcastMeta();
    this.onChange();
  }

  _onPeerLeave(peerId) {
    const peer = this.peers.get(peerId);
    this.peers.delete(peerId);
    this._broadcastMeta();
    this.onChange();
    if (!this.started) return;
    // 已开局：先标记"断线中"，AI 接管该 slot 但保留重连窗口
    const p = this.game.players?.find(pl => pl._peerId === peerId);
    if (!p) return;
    const wasHuman = p.isHuman;
    p.isHuman = false;
    p._peerId = null;
    if (wasHuman && peer?.token) {
      // 30s 内重连可恢复
      this.disconnectedSlots.set(peer.token, {
        slotIndex: p.index,
        displayName: peer.displayName || p.character?.name,
        leftAt: Date.now(),
        timer: setTimeout(() => {
          this.disconnectedSlots.delete(peer.token);
          this.game.renderer?.addLog?.(`⏱️ ${p.character.name} 断线 30s 未重连，AI 永久接管`, 'system');
          this._broadcastMeta();
        }, this.disconnectGraceMs),
      });
      this.game.renderer?.addLog?.(`📡 ${p.character.name} 断线（AI 临时接管，30s 内可重连）`, 'system');
    } else {
      this.game.renderer?.addLog?.(`📡 ${p.character.name} 断线 → AI 接管`, 'system');
    }
  }

  _onIntent(intent, peerId) {
    if (!intent || typeof intent !== 'object') return;
    const peer = this.peers.get(peerId);
    if (!peer) return;
    // 加入流程
    if (intent.name === 'join') {
      peer.token = intent.token;
      peer.displayName = intent.displayName || `玩家${this.peers.size}`;
      peer.joined = true;
      // 重连：token 命中断线表 → 恢复原 slot
      const reconnect = peer.token && this.disconnectedSlots.get(peer.token);
      if (reconnect && this.started) {
        clearTimeout(reconnect.timer);
        this.disconnectedSlots.delete(peer.token);
        peer.slotIndex = reconnect.slotIndex;
        const p = this.game.players?.[reconnect.slotIndex];
        if (p) {
          p.isHuman = true;
          p._peerId = peerId;
          this.game.renderer?.addLog?.(`✅ ${p.character.name} 重连成功（${peer.displayName}）`, 'system');
        }
        this._broadcastMeta();
        // 给重连者单独发只含他自己手牌的 state（私有化）
        const state = serializeGameState(this.game, reconnect.slotIndex);
        this.bridge.sendToPeer(peerId, 'state', state);
        this.onChange();
        return;
      }
      // 新加入：分配未占用 slot（slot 0 是房主自己）
      const used = new Set([0, ...[...this.peers.values()].filter(p => p.slotIndex != null && p !== peer).map(p => p.slotIndex)]);
      // 也排除断线表里仍然 hold 的 slot
      for (const dc of this.disconnectedSlots.values()) used.add(dc.slotIndex);
      let slot = 1;
      while (used.has(slot) && slot < this.maxPlayers) slot++;
      peer.slotIndex = slot < this.maxPlayers ? slot : null;
      if (peer.slotIndex == null) {
        this.game.renderer?.addLog?.(`⚠️ ${peer.displayName} 想加入但无空位（${this.maxPlayers} 人已满）`, 'system');
      }
      this._broadcastMeta();
      this.onChange();
      return;
    }
    // 开局后 intent：校验 peer 控制的 slot 跟 intent 的 playerIndex 匹配
    if (this.started) {
      const expectedSlot = peer.slotIndex;
      const fn = this.game[intent.name];
      if (typeof fn === 'function') {
        const firstArg = intent.args?.[0];
        if (typeof firstArg === 'number' && firstArg !== expectedSlot) {
          console.warn(`[host] reject intent: peer ${peerId} 试图操作非本人 slot (expected ${expectedSlot}, got ${firstArg})`);
          return;
        }
        try {
          fn.apply(this.game, intent.args || []);
        } catch (e) {
          console.warn(`[host] intent ${intent.name} error:`, e);
        }
      }
    }
  }

  // 玩家列表 / 状态广播
  _broadcastMeta() {
    const meta = {
      roomId: this.roomId,
      maxPlayers: this.maxPlayers,
      aiCount: this.aiCount,
      started: this.started,
      hostPeerId: this.bridge?.selfId,   // 让 guest 能识别"房主断线"
      slots: this._buildSlots(),
    };
    this.bridge?.broadcastMeta(meta);
  }

  _buildSlots() {
    const slots = [];
    slots.push({ index: 0, kind: 'host', name: '房主（你）' });
    for (const [pid, p] of this.peers) {
      if (p.slotIndex != null) {
        slots.push({ index: p.slotIndex, kind: 'guest', name: p.displayName, peerId: pid });
      }
    }
    // 剩下的 slot 是 AI
    const filled = new Set(slots.map(s => s.index));
    for (let i = 0; i < this.maxPlayers; i++) {
      if (!filled.has(i)) slots.push({ index: i, kind: 'ai', name: 'AI' });
    }
    return slots.sort((a, b) => a.index - b.index);
  }

  setMaxPlayers(n) {
    this.maxPlayers = n;
    this._broadcastMeta();
    this.onChange();
  }

  startGame() {
    if (this.started) return;
    this.started = true;
    // 对 game 的 player slot 标记 _peerId（用于断线时定位）
    const slots = this._buildSlots();
    this.game.playerCount = this.maxPlayers;
    this.game.humanPlayerIndex = 0; // 房主自己一定是 slot 0 / human
    this.game.doStartGame();
    // 给 game.players 上贴 _peerId
    if (this.game.players) {
      for (const slot of slots) {
        const p = this.game.players[slot.index];
        if (!p) continue;
        if (slot.kind === 'guest') {
          p.isHuman = true;
          p._peerId = slot.peerId;
        } else if (slot.kind === 'host') {
          p.isHuman = true;
        } else {
          p.isHuman = false;
        }
      }
    }
    this._broadcastMeta();
    // 开局：给每个 guest 单独发只含自己手牌的 state（避免泄露其他人手牌）
    this._broadcastStatePrivacy();
    this.onChange();
  }

  // 给所有连接的 guest 发 state — 每人只看到自己 slot 的手牌（其他 slot 只暴露张数 placeholder）
  _broadcastStatePrivacy() {
    if (!this.bridge) return;
    for (const [peerId, peer] of this.peers) {
      if (peer.slotIndex == null) continue;
      const state = serializeGameState(this.game, peer.slotIndex);
      this.bridge.sendToPeer(peerId, 'state', state);
    }
  }

  // 当 game state 有变化时按 slot 私有化广播给每个 guest（每秒一次定时刷新）
  beginStateSync() {
    if (this._stateSyncTimer) return;
    this._stateSyncTimer = setInterval(() => {
      if (!this.started) return;
      this._broadcastStatePrivacy();
    }, 1000);
  }

  leave() {
    this._unsub?.();
    if (this._stateSyncTimer) { clearInterval(this._stateSyncTimer); this._stateSyncTimer = null; }
    this.bridge?.leave();
  }
}

export class RoomGuest {
  constructor(game, opts = {}) {
    this.game = game;
    this.role = 'guest';
    this.roomId = opts.roomId;
    // token 存 sessionStorage：浏览器刷新后还能凭它重连原 slot（30s 内）
    // key 含 roomId，避免不同房间 token 互串
    const tokenKey = `nba-kill-token-${this.roomId}`;
    let storedToken = null;
    try { storedToken = sessionStorage.getItem(tokenKey); } catch (e) {}
    this.token = storedToken || generatePlayerToken();
    try { sessionStorage.setItem(tokenKey, this.token); } catch (e) {}
    this.displayName = opts.displayName || `玩家${Math.floor(Math.random() * 1000)}`;
    this.bridge = null;
    this.meta = null;
    this.mySlotIndex = null;
    this.onChange = opts.onChange || (() => {});
  }

  async start() {
    this.bridge = await joinAsGuest(this.roomId);
    this._myPeerId = this.bridge.selfId;
    this.bridge.onPeerLeave((peerId) => {
      // 房主断线 — guest 直接退出比赛（v2.1：先告诉用户，v2.2 再做接力）
      if (this.meta?.hostPeerId && peerId === this.meta.hostPeerId) {
        this._onHostDisconnected();
      }
    });
    this.bridge.onMeta((meta) => {
      this.meta = meta;
      // 找自己 slot：trystero selfId 跟 meta.slots[].peerId 比对
      const slot = (meta.slots || []).find(s => s.kind === 'guest' && s.peerId === this._myPeerId);
      this.mySlotIndex = slot?.index ?? null;
      // 开局了：guest 端 game 也要切 humanPlayerIndex + 关闭联机 modal 让用户看到游戏区
      if (meta.started && this.game.gameState !== 'playing') {
        this.game.playerCount = meta.maxPlayers;
        this.game.humanPlayerIndex = this.mySlotIndex ?? 0;
        document.getElementById('mp-modal')?.classList.remove('show');
        this.game.renderer?.addLog?.(`▶️ 房主开始了比赛（你是 ${slot?.name || '观战者'}）`, 'system');
      }
      this.onChange();
    });
    this.bridge.onState((state) => this._applyState(state));
    this.bridge.onEvent(({ type, args }) => this._applyEvent(type, args));
    // 发 join intent
    this.bridge.sendIntent({
      name: 'join',
      token: this.token,
      displayName: this.displayName,
    });
    return this;
  }

  _applyEvent(type, args) {
    if (!type) return;
    const [namespace, method] = type.split(':');
    if (!namespace || !method) return;
    const target = namespace === 'ui' ? this.game.renderer
                 : namespace === 'fx' ? this.game.fx : null;
    if (!target || typeof target[method] !== 'function') return;
    const hydrated = hydrateArgs(args || [], this.game.players || []);
    try { target[method](...hydrated); } catch (e) {}
  }

  _applyState(state) {
    if (!state) return;
    // 初始化 player slot（第一次收到 state）
    if (!this.game.players?.length && Array.isArray(state.players)) {
      // 触发 game.headless 的 createPlayers 逻辑代替 — 用 state 直接构造 player snapshot
      // 注意 guest 不跑 logic，players 仅作渲染用
      this.game.players = state.players.map(ps => this._buildPlayerSnapshot(ps));
      this.game.gameState = state.gameState;
      this.game.currentPlayerIndex = state.currentPlayerIndex;
      this.game.turnCount = state.turnCount;
      this.game.renderer?.renderPlayers?.(this.game.players);
    }
    // 已有：增量更新
    state.players?.forEach((ps, i) => {
      const local = this.game.players[i];
      if (!local) return;
      local.hp = ps.hp;
      local.maxHp = ps.maxHp;
      local.isAlive = ps.isAlive;
      local.handCards = ps.handCards || [];
      local.equipment = ps.equipment || {};
      local.judgeCards = ps.judgeCards || [];
      local.hasUsedSha = ps.hasUsedSha;
      local.drunken = ps.drunken;
    });
    this.game.gameState = state.gameState;
    this.game.currentPlayerIndex = state.currentPlayerIndex;
    this.game.turnCount = state.turnCount;
    this.game.renderer?.updateUI?.(this.game);
  }

  _buildPlayerSnapshot(ps) {
    // 从 serialized snapshot 构造一个最小可用的 Player-like 对象
    return {
      index: ps.index,
      isAlive: ps.isAlive,
      isHuman: ps.index === this.mySlotIndex,
      hp: ps.hp,
      maxHp: ps.maxHp,
      hasUsedSha: ps.hasUsedSha,
      drunken: ps.drunken,
      character: ps.character,
      identity: ps.identity,
      handCards: ps.handCards || [],
      equipment: ps.equipment || {},
      judgeCards: ps.judgeCards || [],
      element: null,
      // Methods
      hasCard(key) { return (this.handCards || []).some(c => c.key === key); },
      getMaxCards() { return Math.max(this.hp, 0); },
      getAttackRange() { return 1; }, // guest 端不计算，只是兜底
      drawCards(cards) { (cards || []).forEach(c => this.handCards.push(c)); },
      takeDamage(d) { this.hp = Math.max(0, this.hp - d); if (this.hp === 0) this.isAlive = false; },
    };
  }

  // 用户操作 → 上行 intent
  sendIntent(name, args) {
    this.bridge?.sendIntent({ name, args });
  }

  // 房主断线：暂停 game state 更新 + 弹明确提示，让用户知道是房主问题不是自己
  _onHostDisconnected() {
    if (this._hostDown) return;
    this._hostDown = true;
    try {
      const banner = document.createElement('div');
      Object.assign(banner.style, {
        position: 'fixed', top: '0', left: '0', right: '0',
        background: 'linear-gradient(90deg, #e74c3c, #c0392b)',
        color: '#fff', padding: '14px 16px', textAlign: 'center',
        fontWeight: '700', fontSize: '14px', zIndex: '9999',
        boxShadow: '0 4px 18px rgba(0,0,0,0.5)',
      });
      banner.innerHTML = '⚠️ 房主已断线 / 关闭浏览器，本局无法继续。<br>'
        + '<span style="font-size:12px;font-weight:400;opacity:0.85;">'
        + 'v2 计划做"房主接力"，目前请联系房主重开房间。</span>';
      document.body.appendChild(banner);
    } catch (e) {}
    this.game.gameState = 'ended';
    this.game.renderer?.addLog?.('⚠️ 房主断线，本局结束', 'system');
  }

  leave() {
    this.bridge?.leave();
  }
}
