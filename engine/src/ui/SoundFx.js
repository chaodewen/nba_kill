// 音效系统：用 Web Speech API（中文 TTS）报牌名，气势喊出来；用 Web Audio API 给关键事件加底色提示音。
// 全部 zero-asset：无外部 mp3，浏览器原生合成。

// 杨毅风格的解说梗：动作 / 牌 → 中文 NBA 解说语（随机选一句让语音有变化）
// 文字日志依旧走正式名（"投" / "盖" / "三分雨"），TTS 仅在朗读时改用解说梗
const COMMENTARY = {
  sha:    ['投篮！', '强突！', '砍下两分！', '硬解！', '面框对位！', '压哨出手！'],
  shan:   ['防守到位！', '挡下了！', '化解！', '没让他得手！'],
  tao:    ['佳得乐补给！', '回血了！', '体能恢复！', '续上一口！'],
  juedou: ['硬碰硬！', '刺刀见红！', '斗牛！见真章！'],
  wanjian: ['三分雨！哗啦啦！', '外线开火！', '雨下大了！'],
  nanman:  ['全场紧逼！压迫防守！', '联防绞肉机！'],
  taoyuan: ['暂停！教练布置战术！', '伤停补时！'],
  wuzhong: ['排兵布阵！', '战术板！教练写了好东西！'],
  wuxie:   ['这战术读懂了！直接破解！'],
  wugu:    ['手感来了！直接两连砍！'],
  shunshou: ['抢断！漂亮的单防！'],
  guoheshuang: ['迫使失误！打掉他的牌！'],
  jiedaosharen: ['借刀杀人！调虎离山！'],
  lebusishu: ['犯规麻烦！多打少了！'],
  bingliangcunduan: ['体能危机！跑不起来了！'],
  shandian: ['伤病隐患！随时可能炸雷！'],
  end_turn: ['回合结束！换人！', '这一波打完！'],
  discard: ['弃牌！', '清理手牌！'],
  hit: ['进了！得手！'],
  miss: ['打铁！', '没进！'],
  death: ['伤退！下场！'],
  win: ['终场哨响！比赛结束！'],
  reject: ['这个不行！', '没用！'],
};

function pickCommentary(key) {
  const arr = COMMENTARY[key];
  if (!arr || !arr.length) return null;
  return arr[Math.floor(arr.length * 0.5)]; // 中位句兜底；speakLine 内部会随机
}

const BEEP_PRESETS = {
  // 通用出牌音色（短促清脆，所有 flashCardPlay 都垫一个）
  card_play: { freq: 660, dur: 0.06, type: 'triangle', gain: 0.10, decay: 0.5, slide: 880 },
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
    this.enVoice = null;
    // mp3 优先：manifest 是 { "投篮！": "/voice/abc.mp3", ... }
    // 命中走预生成的 zh-CN-YunjianNeural（Microsoft Edge TTS 的体育解说男声）；
    // 命中不上才 fallback 到浏览器 SpeechSynthesis
    this.mp3Manifest = null;
    this._audioCache = new Map();
    this._loadVoices();
    this._loadMp3Manifest();
  }

  async _loadMp3Manifest() {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
    try {
      const baseDir = (window.__VOICE_BASE__ || './voice');
      const manifestUrl = new URL(baseDir + '/manifest.json', window.location.href).href;
      const res = await fetch(manifestUrl, { cache: 'no-cache' });
      if (!res.ok) {
        const msg = `voice manifest 加载失败 (${res.status}) — ${manifestUrl}`;
        console.warn(`[SoundFx] ${msg}`);
        this._broadcastVoiceStatus({ ok: false, message: msg });
        return;
      }
      const raw = await res.json();
      // 把所有相对路径转成绝对，避免不同 base URL / 二级目录下 Audio() 解析错
      const baseAbs = new URL(baseDir + '/', window.location.href).href;
      this.mp3Manifest = {};
      for (const [k, v] of Object.entries(raw)) {
        // v 可能是 './voice/xxx.mp3'（相对 page）或 'voice/xxx.mp3'，这里全转绝对
        const filename = String(v).split('/').pop();
        this.mp3Manifest[k] = baseAbs + filename;
      }
      const count = Object.keys(this.mp3Manifest).length;
      console.log(`[SoundFx] ✓ 杨毅风男声 mp3 已加载（${count} 句）— 优先播 mp3，未命中走系统 TTS`);
      this._broadcastVoiceStatus({ ok: true, count, baseAbs });
    } catch (e) {
      console.warn('[SoundFx] voice manifest fetch 异常，fallback 到 SpeechSynthesis 女声：', e?.message || e);
      this._broadcastVoiceStatus({ ok: false, message: e?.message || String(e) });
      this.mp3Manifest = null;
    }
  }

  // 把 voice 加载状态用自定义事件抛出，让 Renderer 显示 toast 提示
  _broadcastVoiceStatus(status) {
    try {
      window.dispatchEvent(new CustomEvent('nba-voice-status', { detail: status }));
    } catch (e) {}
  }

  _loadVoices() {
    if (!this.synth) return;
    const pick = () => {
      const voices = this.synth.getVoices();
      // 中文（杨毅风格 — 优先成熟男声 / 不行就 fallback 女声 + pitch 调低）
      const isMale = (v) => /male|男|lin[-_]?feng|kang[-_]?kang|hui[-_]?hui|kaiwei|yunjian|yunyang|yunxi|liang|hu-hu|yang/i.test(v.name);
      const isZh = (v) => /^zh/i.test(v.lang) || /chinese|mandarin/i.test(v.name);
      this.zhVoice = voices.find(v => isZh(v) && isMale(v))               // 中文男声
        || voices.find(v => v.lang === 'zh-CN' && /enhanced|premium/i.test(v.name))
        || voices.find(v => /tingting/i.test(v.name))
        || voices.find(v => /yating/i.test(v.name))
        || voices.find(v => v.lang === 'zh-CN')
        || voices.find(v => /^zh/i.test(v.lang))
        || null;
      // 英文：优先美音 Samantha / Alex（macOS）→ Google US → 任何 en-US → 任何 en
      this.enVoice = voices.find(v => /samantha/i.test(v.name) && /^en/i.test(v.lang))
        || voices.find(v => /alex/i.test(v.name) && /^en/i.test(v.lang))
        || voices.find(v => /google.*us english/i.test(v.name))
        || voices.find(v => v.lang === 'en-US')
        || voices.find(v => /^en/i.test(v.lang))
        || null;
      // 标记找到的男/女声 — 用于 speak() 调 pitch
      this.zhVoiceIsMale = this.zhVoice && isMale(this.zhVoice);
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

  // 浏览器策略：AudioContext 必须由用户手势触发后才能 resume；mp3 Audio() 同样需要手势 unlock
  unlock() {
    const ctx = this._ensureCtx();
    if (ctx && ctx.state === 'suspended' && !this._unlocked) {
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
    // mp3 / Audio() 在 iOS Safari 必须由用户手势 unlock — 用极短无声 mp3 触发一次 play()
    // 之后 setTimeout 内的 audio.play() 不会被静默
    if (!this._audioWarmed) {
      try {
        const a = new Audio('data:audio/mp3;base64,SUQzAwAAAAAAFlRJVDIAAAAFAAAATEFNRQAAAAAAAAAAAAAAAAAA//uQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
        a.volume = 0;
        a.play().then(() => a.pause()).catch(() => {});
        this._audioWarmed = true;
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

  // 喊牌名 / 解说语：杨毅风格 — 偏成熟男声节奏
  // 优先级：(1) 命中 mp3 manifest → 用预生成的 Yunjian 男声播 mp3；
  //        (2) 没命中 → SpeechSynthesis 极限调音（pitch 0.5）模拟低沉男声
  // lang: 'zh' (默认 中文) | 'en' (英文 — NBA 球员名朗读)
  speak(text, lang = 'zh') {
    if (!this.enabled || !text) return;
    const key = String(text).trim();

    // (1) mp3 优先
    if (lang === 'zh' && this.mp3Manifest && this.mp3Manifest[key]) {
      this._playMp3(this.mp3Manifest[key], key);
      return;
    }
    // 命中失败：log 一次方便用户知道哪些 text 没生成 mp3
    if (lang === 'zh' && this.mp3Manifest && !this._missLogged) {
      this._missLogged = new Set();
    }
    if (lang === 'zh' && this.mp3Manifest && this._missLogged && !this._missLogged.has(key)) {
      this._missLogged.add(key);
      console.debug(`[SoundFx] mp3 未命中: "${key}" → fallback SpeechSynthesis`);
    }

    // (2) Fallback: SpeechSynthesis
    this._speakSS(key, lang);
  }

  _speakSS(text, lang = 'zh') {
    if (!this.synth) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      const isEn = lang === 'en';
      u.lang = isEn ? 'en-US' : 'zh-CN';
      u.rate = isEn ? 1.05 : 0.92;
      u.pitch = isEn ? 1.0 : (this.zhVoiceIsMale ? 0.95 : 0.5);
      u.volume = 1.0;
      const v = isEn ? this.enVoice : this.zhVoice;
      if (v) u.voice = v;
      this.synth.speak(u);
    } catch (e) {}
  }

  _playMp3(url, fallbackText) {
    try {
      let audio = this._audioCache.get(url);
      if (!audio) {
        audio = new Audio(url);
        audio.preload = 'auto';
        this._audioCache.set(url, audio);
      }
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise && playPromise.catch) {
        playPromise.catch((err) => {
          // mp3 播放失败（404 / autoplay 限制）→ fallback 到 SS
          if (!this._mp3FailLogged) {
            console.warn(`[SoundFx] mp3 播放失败，fallback SS：${err?.name || err}（url=${url}）`);
            this._mp3FailLogged = true;
          }
          if (fallbackText) this._speakSS(fallbackText, 'zh');
        });
      }
    } catch (e) {
      if (fallbackText) this._speakSS(fallbackText, 'zh');
    }
  }

  // 朗读 NBA 球员名（自动用英文 voice）
  speakName(name) {
    this.speak(name, 'en');
  }

  // 关键事件音色（合成短音）+ 报名喊出
  play(name, opts = {}) {
    if (!this.enabled) return;
    // 喊话：opts.text 优先（如卡名），否则用默认事件文本
    const text = opts.text ?? (COMMENTARY[name] ? COMMENTARY[name][Math.floor(Math.random() * COMMENTARY[name].length)] : null);
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

  // 开局宏大号角 — 仿魔兽风格的铜管 fanfare：低音鼓 + 三和弦递进 + 高音 triumph + 收尾大锤
  // 全程 ~2.6s，纯 Web Audio 合成，零外部资源
  playFanfare() {
    if (!this.enabled) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const t0 = ctx.currentTime;
    const note = (freq, start, dur, type = 'sawtooth', vol = 0.08, slideTo = null) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0 + start);
      if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, t0 + start + dur);
      gain.gain.setValueAtTime(0, t0 + start);
      gain.gain.linearRampToValueAtTime(vol, t0 + start + 0.04);
      gain.gain.linearRampToValueAtTime(vol * 0.65, t0 + start + dur * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + dur + 0.05);
    };

    // 第一击：低音鼓（深沉，sub-bass）
    note(55, 0.00, 0.45, 'sine', 0.32, 30);

    // C 大调主和弦（C3 / E3 / G3）
    note(131, 0.00, 0.65, 'sawtooth', 0.06);
    note(165, 0.00, 0.65, 'sawtooth', 0.06);
    note(196, 0.00, 0.65, 'sawtooth', 0.06);

    // F 大调（IV）
    note(175, 0.65, 0.55, 'sawtooth', 0.07);
    note(220, 0.65, 0.55, 'sawtooth', 0.07);
    note(262, 0.65, 0.55, 'sawtooth', 0.07);

    // G 大调（V，张力）
    note(196, 1.20, 0.55, 'sawtooth', 0.08);
    note(247, 1.20, 0.55, 'sawtooth', 0.08);
    note(294, 1.20, 0.55, 'sawtooth', 0.08);

    // C 大调高八度（I 解决，胜利感）
    note(262, 1.75, 1.00, 'sawtooth', 0.10);
    note(330, 1.75, 1.00, 'sawtooth', 0.10);
    note(392, 1.75, 1.00, 'sawtooth', 0.10);
    note(523, 1.75, 1.20, 'triangle', 0.10); // 高音 melody C5

    // 收尾大锤
    note(55, 2.65, 0.40, 'sine', 0.28, 28);
    note(523, 2.65, 0.50, 'square', 0.06);
    note(659, 2.65, 0.50, 'square', 0.06);
    note(784, 2.65, 0.55, 'square', 0.06);
  }
}
