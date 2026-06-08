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
  equip: ['排兵布阵！', '战术板！教练写了好东西！'],
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
      console.log(`[SoundFx] ✓ 杨毅风男声 mp3 已加载（${count} 句）— 仅播男声 mp3，未命中静默`);
      this._broadcastVoiceStatus({ ok: true, count, baseAbs });
      // flush 在 manifest 加载前排队的 speak 调用
      this._flushPendingSpeak();
    } catch (e) {
      console.warn('[SoundFx] voice manifest fetch 失败 — 整局静音（不 fallback 女声）：', e?.message || e);
      this._broadcastVoiceStatus({ ok: false, message: e?.message || String(e) });
      this.mp3Manifest = null;
      this._manifestLoadFailed = true;
      this._pendingSpeak = null;
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
  // iOS Safari 的关键技巧：用一个**共享 Audio 元素**切 src 而非每次 new Audio
  // 这样只需 unlock 一次（用户手势内 play 一次），后续 setTimeout 内切 src + play 都能用
  unlock() {
    const ctx = this._ensureCtx();
    if (ctx && ctx.state === 'suspended' && !this._unlocked) {
      ctx.resume().catch(() => {});
      this._unlocked = true;
    }
    if (this.synth && !this._speechWarmed) {
      try {
        const warm = new SpeechSynthesisUtterance('');
        warm.volume = 0;
        this.synth.speak(warm);
        this._speechWarmed = true;
      } catch (e) {}
    }
    // 共享 Audio 元素 — iOS Safari unlock 必须用户手势内触发一次 play
    if (!this._sharedAudio) {
      try {
        this._sharedAudio = new Audio();
        // 极短无声 wav (44 bytes) — 直接 base64，不依赖外部资源；iOS 必须有合法音频数据才 unlock
        // RIFF header + 1 sample silent PCM
        this._sharedAudio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
        this._sharedAudio.volume = 0;
        const p = this._sharedAudio.play();
        if (p && p.then) p.then(() => { this._audioWarmed = true; }).catch(() => {});
        else this._audioWarmed = true;
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

  // 喊牌名 / 解说语：杨毅风格 — 仅播预生成的 zh-CN-YunjianNeural 男声 mp3
  // 用户明确要求：女声 SpeechSynthesis 完全删除，宁可静默也不混女声
  // mp3 manifest 还在加载（fetch 中）时 → 排队，加载完 flush
  // mp3 manifest 加载完命中失败 → 静默
  speak(text, lang = 'zh') {
    if (!this.enabled || !text) return;
    if (lang !== 'zh') return; // 不再支持英文 voiceName SS（统一男声 mp3）
    const key = String(text).trim();

    // manifest 还在 fetch 中 — 排队等加载完
    if (this.mp3Manifest === null && !this._manifestLoadFailed) {
      this._pendingSpeak = this._pendingSpeak || [];
      if (this._pendingSpeak.length < 30) this._pendingSpeak.push(key);
      return;
    }
    // manifest 已就绪：命中播男声 mp3，否则静默
    if (this.mp3Manifest && this.mp3Manifest[key]) {
      this._playMp3(this.mp3Manifest[key]);
      return;
    }
    // 未命中：log 一次，静默（不再 fallback SS 女声）
    if (this.mp3Manifest) {
      this._missLogged = this._missLogged || new Set();
      if (!this._missLogged.has(key)) {
        this._missLogged.add(key);
        console.debug(`[SoundFx] mp3 未命中静默："${key}"`);
      }
    }
  }

  _flushPendingSpeak() {
    if (!this._pendingSpeak?.length || !this.mp3Manifest) return;
    const queue = this._pendingSpeak;
    this._pendingSpeak = null;
    for (const key of queue) {
      if (this.mp3Manifest[key]) this._playMp3(this.mp3Manifest[key]);
    }
  }

  _speakSS(text, lang = 'zh') {
    if (!this.synth) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      const isEn = lang === 'en';
      u.lang = isEn ? 'en-US' : 'zh-CN';
      u.rate = isEn ? 1.05 : 0.92;
      // pitch 推到极限低（0.1）让女声听起来尽量像男声 — 用户痛点："手机不能用男声"
      // 浏览器实际对 pitch 范围解释不一，0.1 是合法值；过低浏览器会 clamp 到自己最低
      u.pitch = isEn ? 1.0 : (this.zhVoiceIsMale ? 0.95 : 0.1);
      u.volume = 1.0;
      const v = isEn ? this.enVoice : this.zhVoice;
      if (v) u.voice = v;
      this.synth.speak(u);
    } catch (e) {}
  }

  _playMp3(url) {
    try {
      // iOS Safari 必须用共享 Audio 元素 + src 切换；new Audio 每次重新 unlock 失败
      let audio = this._sharedAudio;
      if (!audio) {
        // 还没 unlock — 退路（电脑能用，手机大概率失败 → 静默不 fallback SS）
        audio = new Audio(url);
        audio.preload = 'auto';
      } else {
        audio.src = url;
        audio.volume = 1;
      }
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise && playPromise.catch) {
        playPromise.catch((err) => {
          if (!this._mp3FailLogged) {
            console.warn(`[SoundFx] mp3 播放失败（${err?.name || err}）— 静默，不 fallback SS`);
            this._mp3FailLogged = true;
          }
          // 不 fallback — 用户要求："女声直接删除"
        });
      }
    } catch (e) {
      // 同上：不 fallback
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
