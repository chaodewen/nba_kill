// 极简事件总线 — 用于 Game 把 UI / FX 调用对外抛事件
// 目的：
//   1. 把渲染层和逻辑层解耦（logic 仍写 this.renderer.flashXxx，但每次调用都会 emit）
//   2. 多人对战时，房主发 event 给加入者，加入者订阅 event 自己渲染
//   3. headless 模式（Node / 测试）下 renderer 是 noop，但 event 仍可被消费
export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    this._listeners.get(event)?.delete(fn);
  }

  emit(event, ...args) {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) return;
    for (const fn of set) {
      try { fn(...args); } catch (e) { /* 单订阅者出错不影响其他 */ }
    }
  }

  // 通配 — 用 'ui:*' / '*' 订阅一类事件
  onAny(fn) {
    return this.on('*', fn);
  }
}

// 节奏窗口 — 所有 ui:* / fx:* 调用都进入同一个 1.5s 时间窗，每窗 fire 一次"批量动作"
// 这让 log / 动效 / 声音都按 log 节奏对齐：用户每 1.5s 看到/听到一个完整动作 batch
// 系统类 log（system / turn / phase / death）由 Renderer 直接 immediate 渲染，不进 queue
export class ActionQueue {
  constructor(intervalMs = 1500) {
    this.interval = intervalMs;
    this._pending = [];
    this._timer = null;
    this._nextFlushAt = 0;
  }

  setInterval(ms) {
    this.interval = ms;
  }

  enqueue(fn) {
    this._pending.push(fn);
    this._schedule();
  }

  _schedule() {
    if (this._timer) return;
    const now = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
    const delay = Math.max(0, this._nextFlushAt - now);
    this._timer = setTimeout(() => this._flush(), delay);
  }

  _flush() {
    this._timer = null;
    const batch = this._pending;
    this._pending = [];
    const now = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
    this._nextFlushAt = now + this.interval;
    for (const fn of batch) {
      try { fn(); } catch (e) {}
    }
    // 如果在 flush 中又有新 push（比如回调里），下个窗口接上
    if (this._pending.length > 0) this._schedule();
  }

  // 立即清空：游戏切换 / 重开时调用，避免老 batch fire 到新局
  clear() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this._pending = [];
    this._nextFlushAt = 0;
  }
}

// 把任意对象（renderer / fx 等）包成"调用即发事件 + 转发原方法"的代理
// 用法：
//   const proxy = wrapWithEvents(realRenderer, events, 'ui:', queue, immediateMethods)
//   proxy.flashCardPlay(p, '投', '#e74c3c')
//     → 触发：events.emit('ui:flashCardPlay', p, '投', '#e74c3c')
//             events.emit('*', { type: 'ui:flashCardPlay', args: [...] })
//             queue.enqueue(() => realRenderer.flashCardPlay(p, '投', '#e74c3c'))
// queue 不传时立即调用（行为同旧版，向后兼容）
// immediateMethods 是 Set<string>，匹配的方法名跳过 queue 直接调用
//   （比如 cacheElements / updateUI / updatePlayer / shouldShowGuide 等纯刷新类）
export function wrapWithEvents(target, events, prefix = 'ui:', queue = null, immediateMethods = null) {
  return new Proxy(target, {
    get(obj, prop) {
      const orig = Reflect.get(obj, prop);
      if (typeof orig !== 'function') return orig;
      // 不要拦截内部属性 / Symbol（如 Symbol.iterator）
      if (typeof prop === 'symbol' || (typeof prop === 'string' && prop.startsWith('_'))) {
        return orig.bind(obj);
      }
      return (...args) => {
        events.emit(prefix + prop, ...args);
        events.emit('*', { type: prefix + prop, args });
        // 直接调用 vs 入节奏队列
        if (!queue || (immediateMethods && immediateMethods.has(prop))) {
          return orig.apply(obj, args);
        }
        queue.enqueue(() => {
          try { orig.apply(obj, args); } catch (e) {}
        });
      };
    },
  });
}

// noop renderer / fx — 用于 headless 模式 / Node 测试 / 多人对战中"不渲染只跑逻辑"的端
// 任何方法调用 / 属性读取都返回 noop，避免 Game 内部 this.renderer.xxx 报错
export function makeNoopProxy(extras = {}) {
  const noop = () => {};
  return new Proxy(extras, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      // elements 子属性 fallback
      if (prop === 'elements') return makeNoopProxy({});
      return noop;
    },
  });
}
