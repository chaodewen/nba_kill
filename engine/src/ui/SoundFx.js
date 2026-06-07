// 音效系统：用 Web Speech API（中文 TTS）报牌名，气势喊出来；用 Web Audio API 给关键事件加底色提示音。
// 全部 zero-asset：无外部 mp3，浏览器原生合成。

// flashCardPlay 已经通过 cardName 喊牌名，这里只配那些没经过 flashCardPlay 的关键事件
const DEFAULT_TEXT = {
  hit:    '命中!',
  death:  '阵亡!',
  win:    '胜利!',
  reject: '无效!',
};

const BEEP_PRESETS = {
  sha:    { freq: 220, dur: 0.10, type: 'square',   gain: 0.10, decay: 0.7 },
  shan:   { freq: 600, dur: 0.08, type: 'triangle', gain: 0.10, decay: 0.6, slide: 800 },
  tao:    { freq: 523, dur: 0.10, type: 'sine',     gain: 0.10, decay: 0.5, slide: 784 },
  hit:    { freq: 110, dur: 0.12, type: 'sawtooth', gain: 0.14, decay: 0.4 },
  death:  { freq: 200, dur: 0.30, type: 'sawtooth', gain: 0.18, decay: 0.2, slide: 60 },
  equip:  { freq: 880, dur: 0.06, type: 'square',   gain: 0.08, decay: 0.6 },
  win:    { freq: 523, dur: 0.40, type: 'triangle', gain: 0.16, decay: 0.5, slide: 1046 },
  reject: { freq: 150, dur: 0.08, type: 'sawtooth', gain: 0.12, decay: 0.4 },
};

export class SoundFx {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this._unlocked = false;
    this.synth = (typeof window !== 'undefined') ? window.speechSynthesis : null;
    this.zhVoice = null;
    this._loadVoices();
  }

  _loadVoices() {
    if (!this.synth) return;
    const pick = () => {
      const voices = this.synth.getVoices();
      // 优先级：Tingting（macOS）→ Yating → 任何 zh-CN → 任何 zh
      this.zhVoice = voices.find(v => /tingting/i.test(v.name))
        || voices.find(v => /yating/i.test(v.name))
        || voices.find(v => v.lang === 'zh-CN')
        || voices.find(v => /^zh/i.test(v.lang))
        || null;
    };
    pick();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = pick;
    }
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
    // SpeechSynthesis 在某些浏览器上也需要用户手势激活：先 speak 一个空串「热身」
    if (this.synth && !this._speechWarmed) {
      try {
        const warm = new SpeechSynthesisUtterance('');
        warm.volume = 0;
        this.synth.speak(warm);
        this._speechWarmed = true;
      } catch (e) {}
    }
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (this.enabled) this.unlock();
    else if (this.synth) {
      try { this.synth.cancel(); } catch (e) {}
    }
  }

  // 喊牌名：text 是要报的中文（"投"/"盖"/"三分雨" 等）
  // 气势配置：rate 1.25 / pitch 1.2 / volume 1.0
  speak(text) {
    if (!this.enabled || !this.synth || !text) return;
    try {
      // 取消上一句，避免堆积
      this.synth.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = 'zh-CN';
      u.rate = 1.25;
      u.pitch = 1.2;
      u.volume = 1.0;
      if (this.zhVoice) u.voice = this.zhVoice;
      this.synth.speak(u);
    } catch (e) {}
  }

  // 关键事件音色（合成短音）+ 报名喊出
  play(name, opts = {}) {
    if (!this.enabled) return;
    // 喊话：opts.text 优先（如卡名），否则用默认事件文本
    const text = opts.text ?? DEFAULT_TEXT[name];
    if (text && opts.silent !== true) this.speak(text);
    // beep 底色（音色短暂，不抢风头）
    const preset = BEEP_PRESETS[name];
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
