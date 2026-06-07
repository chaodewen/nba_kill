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
export async function createHost(roomId) {
  const room = joinRoom({ appId: APP_ID }, roomId);
  // trystero 0.25+ makeAction 返回 { send, onMessage, ... } 对象（不再是 tuple）
  // onPeerJoin/onPeerLeave 也变成 property 赋值（不是函数调用）
  const eventAction = room.makeAction('event');
  const stateAction = room.makeAction('state');
  const intentAction = room.makeAction('intent');
  const metaAction = room.makeAction('meta');

  return {
    roomId,
    role: 'host',
    room,
    onPeerJoin(fn) { room.onPeerJoin = fn; },
    onPeerLeave(fn) { room.onPeerLeave = fn; },
    onPeerIntent(fn) { intentAction.onMessage = (data, ctx) => fn(data, ctx?.peerId); },
    broadcastEvent(payload) { eventAction.send(payload); },
    broadcastState(state) { stateAction.send(state); },
    broadcastMeta(meta) { metaAction.send(meta); },
    sendToPeer(peerId, kind, payload) {
      const action = kind === 'event' ? eventAction
                   : kind === 'state' ? stateAction
                   : kind === 'meta' ? metaAction : null;
      if (action) action.send(payload, { to: [peerId] });
    },
    leave() { room.leave(); },
  };
}

// ========== Guest ==========
export async function joinAsGuest(roomId) {
  const room = joinRoom({ appId: APP_ID }, roomId);
  const eventAction = room.makeAction('event');
  const stateAction = room.makeAction('state');
  const intentAction = room.makeAction('intent');
  const metaAction = room.makeAction('meta');

  return {
    roomId,
    role: 'guest',
    room,
    onPeerJoin(fn) { room.onPeerJoin = fn; },
    onPeerLeave(fn) { room.onPeerLeave = fn; },
    onEvent(fn) { eventAction.onMessage = (data) => fn(data); },
    onState(fn) { stateAction.onMessage = (data) => fn(data); },
    onMeta(fn) { metaAction.onMessage = (data) => fn(data); },
    sendIntent(intent) { intentAction.send(intent); },
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
