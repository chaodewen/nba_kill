// 多人对战网络层 — 房主权威 + WebRTC P2P + Trystero 公共信令（零后端）
//
// 房主（host）：
//   - 跑 game logic（headless: false）
//   - events.on('*') 监听 ui:* / fx:* 事件 → 序列化广播给所有 guest
//   - guest 发 intent（playHandCard / quickPlay / selectTarget 等）→ 校验 → 执行
//   - 同时维护 GameState snapshot 给 guest 知道全局状态
//
// 加入者（guest）：
//   - 跑 Game({ headless: true })，不计算 logic
//   - 收到 host 的 ui:/fx: 事件 → 调本地 renderer.flashCardPlay / fx.play 渲染
//   - 收到 GameState snapshot → 反序列化更新本地 players / hp / handCards
//   - 用户点击 → 上行 intent 给 host
//
// Trystero 用 nostr 策略：Nostr 公共 relays 做信令，零账号零费用
// （信令只走几 KB SDP/ICE，数据本身仍 P2P；trystero 0.25 起 torrent/mqtt/firebase 都被
// 拆出独立包，只剩 nostr 是默认绑定 — 我们用 nostr）

import { joinRoom } from 'trystero/nostr';

const APP_ID = 'nba-kill-v1';

// ========== Host ==========
// 用法：
//   const host = await createHost('ABC123');
//   host.onPeerJoin((peerId) => { ... });
//   host.broadcastEvent({ type: 'ui:flashCardPlay', args: [...] });
//   host.onPeerIntent((intent, peerId) => { game.handleIntent(intent) });
export async function createHost(roomId) {
  const room = joinRoom({ appId: APP_ID }, roomId);
  const [sendEvent, getEvent] = room.makeAction('event');
  const [sendState, getState] = room.makeAction('state');
  const [sendIntent, getIntent] = room.makeAction('intent');
  const [sendMeta, getMeta] = room.makeAction('meta'); // 房间元信息（玩家列表 / 开始）

  return {
    roomId,
    role: 'host',
    room,
    onPeerJoin(fn) { room.onPeerJoin(fn); },
    onPeerLeave(fn) { room.onPeerLeave(fn); },
    onPeerIntent(fn) { getIntent(fn); },
    broadcastEvent(payload) { sendEvent(payload); },
    broadcastState(state) { sendState(state); },
    broadcastMeta(meta) { sendMeta(meta); },
    sendToPeer(peerId, kind, payload) {
      // trystero send 第三参数限定接收者
      if (kind === 'event') sendEvent(payload, peerId);
      else if (kind === 'state') sendState(payload, peerId);
      else if (kind === 'meta') sendMeta(payload, peerId);
    },
    leave() { room.leave(); },
  };
}

// ========== Guest ==========
// 用法：
//   const guest = await joinAsGuest('ABC123');
//   guest.onEvent(({ type, args }) => { ... });
//   guest.sendIntent({ name: 'playHandCard', args: [0, cardId] });
export async function joinAsGuest(roomId) {
  const room = joinRoom({ appId: APP_ID }, roomId);
  const [sendEvent, getEvent] = room.makeAction('event');
  const [sendState, getState] = room.makeAction('state');
  const [sendIntent, getIntent] = room.makeAction('intent');
  const [sendMeta, getMeta] = room.makeAction('meta');

  return {
    roomId,
    role: 'guest',
    room,
    onPeerJoin(fn) { room.onPeerJoin(fn); },
    onPeerLeave(fn) { room.onPeerLeave(fn); },
    onEvent(fn) { getEvent(fn); },
    onState(fn) { getState(fn); },
    onMeta(fn) { getMeta(fn); },
    sendIntent(intent) { sendIntent(intent); },
    leave() { room.leave(); },
  };
}

// ========== 房号生成 ==========
// 6 位大写字母 + 数字（去除易混淆 0/O 1/I）
export function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// ========== Player Token（断线重连用） ==========
export function generatePlayerToken() {
  const a = (Math.random() * 0x100000000) | 0;
  const b = (Math.random() * 0x100000000) | 0;
  return a.toString(36) + b.toString(36);
}

// ========== 序列化 helpers ==========
// 把 game ui/fx 事件 args 里的 Player / Card 等对象转成可 JSON 化的形式
// guest 端反序列化时用 playerIndex / cardId 在本地 snapshot 找对应对象
export function serializeArgs(args) {
  return args.map(a => {
    if (a == null) return a;
    // Player 对象 → { __kind: 'player', index }
    if (typeof a === 'object' && 'index' in a && 'character' in a) {
      return { __kind: 'player', index: a.index };
    }
    // Card 对象 → { __kind: 'card', id, key, name, suit, value, color }
    if (typeof a === 'object' && 'id' in a && 'key' in a && 'name' in a) {
      return {
        __kind: 'card', id: a.id, key: a.key, name: a.name,
        suit: a.suit, value: a.value, color: a.color, type: a.type,
      };
    }
    // 普通可序列化值
    if (typeof a === 'object') {
      try { JSON.stringify(a); return a; } catch { return null; }
    }
    return a;
  });
}

// guest 端反序列化：把 { __kind: 'player', index } 还原成本地 player 对象
export function hydrateArgs(args, players) {
  if (!Array.isArray(args)) return args;
  return args.map(a => {
    if (a && typeof a === 'object' && a.__kind === 'player') {
      return players[a.index] || a;
    }
    if (a && typeof a === 'object' && a.__kind === 'card') {
      return { ...a, __kind: undefined };
    }
    return a;
  });
}

// 把 Game 当前 state 序列化（player snapshot 用）
export function serializeGameState(game) {
  return {
    gameState: game.gameState,
    currentPlayerIndex: game.currentPlayerIndex,
    turnCount: game.turnCount,
    isPaused: game.isPaused,
    deckRemaining: game.deck?.getRemaining?.() ?? 0,
    discardCount: game.deck?.getDiscardCount?.() ?? 0,
    players: (game.players || []).map(p => ({
      index: p.index,
      isAlive: p.isAlive,
      isHuman: p.isHuman,
      hp: p.hp,
      maxHp: p.maxHp,
      hasUsedSha: p.hasUsedSha,
      drunken: p.drunken,
      character: {
        key: p.character.key,
        name: p.character.name,
        cnName: p.character.cnName,
        nickname: p.character.nickname,
        position: p.character.position,
        kingdom: p.character.kingdom,
      },
      identity: p.identity,
      handCards: (p.handCards || []).map(c => ({
        id: c.id, key: c.key, name: c.name, suit: c.suit, value: c.value, color: c.color, type: c.type,
      })),
      equipment: {
        weapon: p.equipment?.weapon ? { ...p.equipment.weapon } : null,
        armor: p.equipment?.armor ? { ...p.equipment.armor } : null,
        defenseHorse: p.equipment?.defenseHorse ? { ...p.equipment.defenseHorse } : null,
        offenseHorse: p.equipment?.offenseHorse ? { ...p.equipment.offenseHorse } : null,
      },
      judgeCards: (p.judgeCards || []).map(j => ({ ...j })),
    })),
  };
}
