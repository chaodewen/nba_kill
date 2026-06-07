#!/usr/bin/env node
/**
 * NBA Kill — 杨毅风格解说语音批量生成（Node 版，使用 msedge-tts）
 * 用 Microsoft Edge TTS 的 zh-CN-YunjianNeural（体育解说男声）批量生成 mp3
 *
 * 安装：cd engine && npm i -D msedge-tts
 * 运行：node scripts/generate-voice.mjs
 * 输出：engine/voice/*.mp3 + engine/voice/manifest.json
 */
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { createHash } from 'crypto';
import { mkdirSync, existsSync, writeFileSync, statSync, createWriteStream } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'voice');
const MANIFEST = resolve(OUT_DIR, 'manifest.json');

const VOICE = process.env.NBA_VOICE || 'zh-CN-YunjianNeural'; // 体育解说男声
const RATE = process.env.NBA_VOICE_RATE || '+0%';
const PITCH = process.env.NBA_VOICE_PITCH || '-2Hz';

const NICKS = ['小皇帝', '黑曼巴', '萌神', '大鲨鱼', '石佛', '死神', '闪电侠',
               '保罗', '大胡子', '可怕', '狼王', '魔兽', '雷神', '蝙蝠侠', '妖刀', 'FMVP'];

function allPhrases() {
  const s = new Set([
    '比赛开始！', '结束回合', '阵亡!', '胜利!', '无效!',
    '投', '盖', '佳得乐',
    '投篮！', '强突！', '砍下两分！', '硬解！', '面框对位！', '压哨出手！',
    '防守到位！', '挡下了！', '化解！', '没让他得手！',
    '佳得乐补给！', '回血了！', '体能恢复！', '续上一口！',
    '硬碰硬！', '刺刀见红！', '斗牛！见真章！',
    '三分雨！哗啦啦！', '外线开火！', '雨下大了！',
    '全场紧逼！压迫防守！', '联防绞肉机！',
    '暂停！教练布置战术！', '伤停补时！',
    '排兵布阵！', '战术板！教练写了好东西！',
    '这战术读懂了！直接破解！',
    '手感来了！直接两连砍！',
    '抢断！漂亮的单防！',
    '迫使失误！打掉他的牌！',
    '借刀杀人！调虎离山！',
    '犯规麻烦！多打少了！',
    '体能危机！跑不起来了！',
    '伤病隐患！随时可能炸雷！',
    '装备上了！', '换装备！',
    '回合结束！换人！', '这一波打完！',
    '弃牌！', '清理手牌！',
    '进了！得手！', '打铁！', '没进！',
    '伤退！下场！',
    '终场哨响！比赛结束！',
    '这个不行！', '没用！',
    '躲过一劫！这雷转给下家！',
  ]);
  for (let i = 1; i <= 7; i++) s.add(`弃牌${i}张`);
  for (const n of NICKS) {
    s.add(`${n} 上场！`);
    s.add(`轮到 ${n} 了！`);
    s.add(`${n} 的回合！`);
    s.add(`看 ${n} 这一波！`);
    s.add(`炸雷了！${n} 直接受伤三点！`);
    s.add(`梅花！补给到位，${n} 摸牌！`);
    s.add(`体能告急！${n} 这回合摸不到牌了！`);
    s.add(`红桃！${n} 状态在线，正常出牌！`);
    s.add(`犯规了！${n} 这回合上不了场！`);
    s.add(`抢断！${n}！`);
  }
  return [...s].sort();
}

function slug(text) {
  return createHash('md5').update(text, 'utf8').digest('hex').slice(0, 12);
}

async function generate(tts, text, outPath) {
  const stream = createWriteStream(outPath);
  await new Promise((resolveP, rejectP) => {
    const audioStream = tts.toStream(text);
    let chunks = 0;
    audioStream.audioStream.on('data', (chunk) => {
      stream.write(chunk);
      chunks++;
    });
    audioStream.audioStream.on('end', () => {
      stream.end();
      if (chunks === 0) rejectP(new Error('no audio data'));
    });
    audioStream.audioStream.on('error', rejectP);
    stream.on('finish', resolveP);
    stream.on('error', rejectP);
  });
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const phrases = allPhrases();
  const manifest = {};
  let skipped = 0, ok = 0;
  const failed = [];

  console.log(`Voice: ${VOICE} (rate ${RATE} / pitch ${PITCH})`);
  console.log(`Phrases: ${phrases.length} → ${OUT_DIR}\n`);

  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {
    rate: RATE,
    pitch: PITCH,
  }).catch(async () => {
    // 老版本 msedge-tts 可能不支持 rate/pitch metadata，回退
    await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  });

  // 顺序生成（msedge-tts 的 stream 没法并发，并发会让 ws 互相干扰）
  for (const text of phrases) {
    const sl = slug(text);
    const outPath = resolve(OUT_DIR, `${sl}.mp3`);
    manifest[text] = `./voice/${sl}.mp3`;
    if (existsSync(outPath) && statSync(outPath).size > 200) {
      skipped++;
      continue;
    }
    try {
      await generate(tts, text, outPath);
      ok++;
      process.stdout.write(`  ✓ ${text.slice(0, 40)}\n`);
    } catch (e) {
      failed.push([text, String(e).slice(0, 100)]);
      process.stdout.write(`  ✗ ${text.slice(0, 40)}  (${String(e).slice(0, 60)})\n`);
    }
  }

  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`\n新生成 ${ok} / 缓存命中 ${skipped} / 失败 ${failed.length} / 总计 ${phrases.length}`);
  console.log(`manifest: ${MANIFEST}`);

  // 关闭连接
  try { tts.close(); } catch {}

  if (failed.length) {
    console.log('\n失败：');
    for (const [t, e] of failed.slice(0, 5)) console.log(`  - ${t}  (${e})`);
    process.exit(2);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
