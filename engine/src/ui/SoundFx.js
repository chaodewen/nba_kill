// 音效系统：用 Web Audio API 合成简单音色，不引入任何外部资源
// 每种事件用不同的频率 / 包络 / 波形，保证可识别。可整体开关。

const SOUND_PRESETS = {
  // 出投 — 短促低频敲击
  sha:    { freq: 220, dur: 0.12, type: 'square',   gain: 0.18, decay: 0.7 },
  // 出盖 — 上扬的清脆声
  shan:   { freq: 600, dur: 0.10, type: 'triangle', gain: 0.16, decay: 0.6, slide: 800 },
  // 佳得乐 — 治愈的暖色和弦
  tao:    { freq: 523, dur: 0.18, type: 'sine',     gain: 0.18, decay: 0.5, slide: 784 },
  // 受伤 — 低沉锯齿
  hit:    { freq: 110, dur: 0.18, type: 'sawtooth', gain: 0.22, decay: 0.4 },
  // 阵亡 — 下降低音
  death:  { freq: 200, dur: 0.40, type: 'sawtooth', gain: 0.25, decay: 0.2, slide: 60 },
  // 装备 — 金属感短促
  equip:  { freq: 880, dur: 0.08, type: 'square',   gain: 0.12, decay: 0.6 },
  // 获胜 — 上扬欢快
  win:    { freq: 523, dur: 0.50, type: 'triangle', gain: 0.20, decay: 0.5, slide: 1046 },
  // 拒绝 / 错误 — 低短
  reject: { freq: 150, dur: 0.10, type: 'sawtooth', gain: 0.18, decay: 0.4 },
};

export class SoundFx {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this._unlocked = false;
  }

  _ensureCtx() {
    if (this.ctx) return this.ctx;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
    } catch (e) {
      return null;
    }
    return this.ctx;
  }

  // 浏览器策略：AudioContext 必须由用户手势触发后才能 resume
  unlock() {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended' && !this._unlocked) {
      ctx.resume().catch(() => {});
      this._unlocked = true;
    }
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (this.enabled) this.unlock();
  }

  play(name) {
    if (!this.enabled) return;
    const preset = SOUND_PRESETS[name];
    if (!preset) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = preset.type || 'sine';
    osc.frequency.setValueAtTime(preset.freq, now);
    if (preset.slide) {
      osc.frequency.exponentialRampToValueAtTime(preset.slide, now + preset.dur);
    }
    gain.gain.setValueAtTime(preset.gain, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + preset.dur * (preset.decay ?? 0.5) + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + preset.dur + 0.1);
  }
}
