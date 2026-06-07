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
    // 先发当前房间元信息让对方知道还在等
    this.peers.set(peerId, { token: null, slotIndex: null, joined: false });
    this._broadcastMeta();
    this.onChange();
  }

  _onPeerLeave(peerId) {
    this.peers.delete(peerId);
    this._broadcastMeta();
    this.onChange();
    // 已开局：guest 断线 → 该 slot 转 AI 接管（v1 简化：直接把 player.isHuman = false）
    if (this.started) {
      const p = this.game.players?.find(pl => pl._peerId === peerId);
      if (p) {
        p.isHuman = false;
        p._peerId = null;
        this.game.renderer?.addLog?.(`📡 ${p.character.name} 断线 → AI 接管`, 'system');
      }
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
      // 分配 slot：第 1 个 join 的是 slot 1（slot 0 留给房主）
      const used = new Set([0, ...[...this.peers.values()].filter(p => p.slotIndex != null).map(p => p.slotIndex)]);
      let slot = 1;
      while (used.has(slot) && slot < this.maxPlayers) slot++;
      peer.slotIndex = slot;
      this._broadcastMeta();
      this.onChange();
      return;
    }
    // 开局后 intent：校验 peer 控制的 slot 跟 intent 的 playerIndex 匹配
    if (this.started) {
      const expectedSlot = peer.slotIndex;
      // 简单分发：intent.name 调 game[name](...args)
      const fn = this.game[intent.name];
      if (typeof fn === 'function') {
        // 校验：intent 第一个 arg 通常是 playerIndex，必须 == 自己 slot
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
    // 给 guest 发完整 GameState snapshot 让他们渲染初始状态
    this.bridge?.broadcastState(serializeGameState(this.game));
    this.onChange();
  }

  // 当 game state 有变化（每个 ui 事件之后），把新 snapshot 广播
  // 这里粗暴处理：每秒广播一次 + ui:updateUI 时也广播
  beginStateSync() {
    setInterval(() => {
      if (!this.started) return;
      this.bridge?.broadcastState(serializeGameState(this.game));
    }, 1000);
  }

  leave() {
    this._unsub?.();
    this.bridge?.leave();
  }
}

export class RoomGuest {
  constructor(game, opts = {}) {
    this.game = game;
    this.role = 'guest';
    this.roomId = opts.roomId;
    this.token = generatePlayerToken();
    this.displayName = opts.displayName || `玩家${Math.floor(Math.random() * 1000)}`;
    this.bridge = null;
    this.meta = null;
    this.mySlotIndex = null;
    this.onChange = opts.onChange || (() => {});
  }

  async start() {
    this.bridge = await joinAsGuest(this.roomId);
    this.bridge.onMeta((meta) => {
      this.meta = meta;
      // 找自己 slot：通过 token 匹配
      const slot = (meta.slots || []).find(s => s.kind === 'guest' && s.peerId === this._myPeerId);
      this.mySlotIndex = slot?.index ?? null;
      // 开局了：guest 端 game 也要切 humanPlayerIndex + 关闭联机 modal 让用户看到游戏区
      if (meta.started && this.game.gameState !== 'playing') {
        this.game.playerCount = meta.maxPlayers;
        this.game.humanPlayerIndex = this.mySlotIndex ?? 0;
        // 关闭联机 modal，否则 guest 一直停在等待页（实测 bug）
        document.getElementById('mp-modal')?.classList.remove('show');
        this.game.renderer?.addLog?.(`▶️ 房主开始了比赛（你是 ${slot?.name || '观战者'}）`, 'system');
        // headless mode + state sync — guest 不自己 doStartGame；等 host 的 state snapshot
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

  leave() {
    this.bridge?.leave();
  }
}
