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

// 多策略信令：同时连 nostr / torrent / mqtt — 任何一个能用就 OK
// 公司代理 / 防火墙可能拦截某种信令的特定域名（如 nostr 国外 wss），多备份提高连通率
// 静态 import 避免 top-level await 在 webpack 下 crash
import { joinRoom as joinNostr, selfId } from 'trystero/nostr';
import { joinRoom as joinTorrent } from '@trystero-p2p/torrent';
import { joinRoom as joinMqtt } from '@trystero-p2p/mqtt';

const APP_ID = 'nba-kill-v1';
const ROOM_CONFIG = { appId: APP_ID };

// 同时启动多个策略；任何 room 收到事件都处理；发事件时 broadcast 到所有 room（去重靠 _seq）
function joinMulti(roomId) {
  const rooms = [];
  const tryJoin = (name, fn) => {
    try {
      const room = fn(ROOM_CONFIG, roomId);
      rooms.push({ name, room });
    } catch (e) {
      console.warn(`[mp] ${name} join failed:`, e?.message || e);
    }
  };
  tryJoin('nostr', joinNostr);
  tryJoin('torrent', joinTorrent);
  tryJoin('mqtt', joinMqtt);
  console.log(`[mp] joined ${rooms.length} 个信令策略：`, rooms.map(r => r.name).join(', '));
  return rooms;
}

// 给所有 room 同名 makeAction 并合一：sender 给所有 room 各发一份，receiver 任一 room 收到都 fire
// 同 _seq 去重（避免 host 收到 3 份同样的 join intent）
function aggregatedAction(rooms, name) {
  const actions = rooms.map(r => {
    try { return r.room.makeAction(name); } catch (e) { return null; }
  }).filter(Boolean);
  const seen = new Set();
  let onMessage = null;
  for (const a of actions) {
    a.onMessage = (data, ctx) => {
      const seq = (data && typeof data === 'object' && '_seq' in data) ? data._seq : null;
      if (seq != null) {
        if (seen.has(seq)) return;
        seen.add(seq);
        if (seen.size > 500) seen.delete(seen.values().next().value);
      }
      onMessage?.(data, ctx);
    };
  }
  let nextSeq = 0;
  return {
    send(data, opts) {
      const payload = (data && typeof data === 'object')
        ? { ...data, _seq: `${selfId}-${nextSeq++}` }
        : data;
      for (const a of actions) {
        try { a.send(payload, opts); } catch (e) {}
      }
    },
    set onMessage(fn) { onMessage = fn; },
    get onMessage() { return onMessage; },
  };
}

function aggregatePeerEvents(rooms) {
  const seen = new Set();
  let _onPeerJoin = null, _onPeerLeave = null;
  for (const r of rooms) {
    r.room.onPeerJoin = (peerId) => {
      if (seen.has(peerId)) return;
      seen.add(peerId);
      _onPeerJoin?.(peerId);
    };
    r.room.onPeerLeave = (peerId) => {
      seen.delete(peerId);
      _onPeerLeave?.(peerId);
    };
  }
  return {
    onPeerJoin(fn) { _onPeerJoin = fn; },
    onPeerLeave(fn) { _onPeerLeave = fn; },
  };
}

// ========== Host ==========
export async function createHost(roomId) {
  console.log('[mp] createHost', roomId, 'selfId=', selfId);
  const rooms = joinMulti(roomId);
  if (rooms.length === 0) throw new Error('所有信令策略都不可用');

  const eventAction = aggregatedAction(rooms, 'event');
  const stateAction = aggregatedAction(rooms, 'state');
  const intentAction = aggregatedAction(rooms, 'intent');
  const metaAction = aggregatedAction(rooms, 'meta');
  const peers = aggregatePeerEvents(rooms);

  return {
    roomId, role: 'host', selfId, rooms,
    onPeerJoin: peers.onPeerJoin,
    onPeerLeave: peers.onPeerLeave,
    onPeerIntent(fn) { intentAction.onMessage = (data, ctx) => fn(data, ctx?.peerId); },
    broadcastEvent(payload) { eventAction.send(payload); },
    broadcastState(state) { stateAction.send(state); },
    broadcastMeta(meta) { metaAction.send(meta); },
    sendToPeer(peerId, kind, payload) {
      const a = kind === 'event' ? eventAction
              : kind === 'state' ? stateAction
              : kind === 'meta' ? metaAction : null;
      if (a) a.send(payload, { target: peerId });
    },
    leave() { for (const r of rooms) try { r.room.leave(); } catch (e) {} },
  };
}

// ========== Guest ==========
export async function joinAsGuest(roomId) {
  console.log('[mp] joinAsGuest', roomId, 'selfId=', selfId);
  const rooms = joinMulti(roomId);
  if (rooms.length === 0) throw new Error('所有信令策略都不可用');

  const eventAction = aggregatedAction(rooms, 'event');
  const stateAction = aggregatedAction(rooms, 'state');
  const intentAction = aggregatedAction(rooms, 'intent');
  const metaAction = aggregatedAction(rooms, 'meta');
  const peers = aggregatePeerEvents(rooms);

  return {
    roomId, role: 'guest', selfId, rooms,
    onPeerJoin: peers.onPeerJoin,
    onPeerLeave: peers.onPeerLeave,
    onEvent(fn) { eventAction.onMessage = (data) => fn(data); },
    onState(fn) { stateAction.onMessage = (data) => fn(data); },
    onMeta(fn) { metaAction.onMessage = (data) => fn(data); },
    sendIntent(intent) { intentAction.send(intent); },
    leave() { for (const r of rooms) try { r.room.leave(); } catch (e) {} },
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
// forSlotIndex: 给哪个 slot 看 — 该 slot 看到自己真实 handCards，其他 slot 只暴露 length
//   undefined / null：debug 模式或房主自己 — 暴露全部手牌
//   number：仅暴露 forSlotIndex 自己的手牌细节
export function serializeGameState(game, forSlotIndex) {
  const hideOthersHand = (forSlotIndex != null);
  return {
    gameState: game.gameState,
    currentPlayerIndex: game.currentPlayerIndex,
    turnCount: game.turnCount,
    isPaused: game.isPaused,
    deckRemaining: game.deck?.getRemaining?.() ?? 0,
    discardCount: game.deck?.getDiscardCount?.() ?? 0,
    forSlotIndex: forSlotIndex ?? null,
    players: (game.players || []).map(p => {
      const isSelf = !hideOthersHand || p.index === forSlotIndex;
      const isDead = !p.isAlive;
      return {
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
          voiceName: p.character.voiceName,
          position: p.character.position,
          kingdom: p.character.kingdom,
          nbaId: p.character.nbaId,         // NBA CDN 头像 ID — 缺这个 guest 端头像 fallback 字母
          photoUrl: p.character.photoUrl,   // 自定义头像（如 Battier）
          photoTransform: p.character.photoTransform,
          skill: p.character.skill,         // 技能摘要文本（用于 player-skill UI）
        },
        identity: p.identity,
        // 关键：仅自己 / 阵亡 / 房主 debug 视角看到 handCards 内容；其他人只看张数
        handCards: (isSelf || isDead)
          ? (p.handCards || []).map(c => ({
              id: c.id, key: c.key, name: c.name, suit: c.suit, value: c.value, color: c.color, type: c.type,
            }))
          : new Array(p.handCards?.length || 0).fill(null).map((_, i) => ({
              id: `hidden-${p.index}-${i}`,
              key: '_hidden', name: '?', suit: '?', value: 0, color: '#888', type: 'hidden',
            })),
        equipment: {
          weapon: p.equipment?.weapon ? { ...p.equipment.weapon } : null,
          armor: p.equipment?.armor ? { ...p.equipment.armor } : null,
          defenseHorse: p.equipment?.defenseHorse ? { ...p.equipment.defenseHorse } : null,
          offenseHorse: p.equipment?.offenseHorse ? { ...p.equipment.offenseHorse } : null,
        },
        judgeCards: (p.judgeCards || []).map(j => ({ ...j })),
      };
    }),
  };
}
