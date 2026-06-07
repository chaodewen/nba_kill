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

// 把任意对象（renderer / fx 等）包成"调用即发事件 + 转发原方法"的代理
// 用法：
//   const proxy = wrapWithEvents(realRenderer, events, 'ui:')
//   proxy.flashCardPlay(p, '投', '#e74c3c')
//     → 触发：events.emit('ui:flashCardPlay', p, '投', '#e74c3c')
//             events.emit('*', { type: 'ui:flashCardPlay', args: [...] })
//             realRenderer.flashCardPlay(p, '投', '#e74c3c')
export function wrapWithEvents(target, events, prefix = 'ui:') {
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
        return orig.apply(obj, args);
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
