#!/usr/bin/env python3
"""
NBA Kill — 杨毅风格解说语音批量生成
使用 Microsoft Edge TTS（免费）的 zh-CN-YunjianNeural（体育解说男声）
为所有解说语句一次性生成 mp3，配 manifest.json 供 SoundFx.js 命中加载。

依赖：pip install edge-tts
运行：python3 scripts/generate-voice.py
输出：engine/voice/*.mp3 + engine/voice/manifest.json

VOICE 备选（按低音 / 解说感排序）：
- zh-CN-YunjianNeural   体育解说男声 ⭐ 默认
- zh-CN-YunyangNeural   新闻男声
- zh-CN-YunxiNeural     成熟男声
- zh-CN-YunzeNeural     沉稳男声
"""

import asyncio
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

VOICE = os.environ.get('NBA_VOICE', 'zh-CN-YunjianNeural')
RATE = os.environ.get('NBA_VOICE_RATE', '+0%')   # -50% .. +100%
PITCH = os.environ.get('NBA_VOICE_PITCH', '-2Hz')  # 略微压低更像杨毅
ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'voice'
MANIFEST = OUT_DIR / 'manifest.json'

NICKS = ['小皇帝', '黑曼巴', '萌神', '大鲨鱼', '石佛', '死神', '闪电侠',
         '保罗', '大胡子', '可怕', '狼王', '魔兽', '雷神', '蝙蝠侠', '妖刀', 'FMVP']


def all_phrases():
    s = set()
    static = [
        '比赛开始！', '结束回合', '阵亡!', '胜利!', '无效!',
        # 出牌 / 防守解说梗
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
        # 判定通用（昵称无关）
        '躲过一劫！这雷转给下家！',
    ]
    s.update(static)

    # 弃牌 1..7 张
    for i in range(1, 8):
        s.add(f'弃牌{i}张')

    # 球员昵称回合开始 4 模板
    for n in NICKS:
        s.add(f'{n} 上场！')
        s.add(f'轮到 {n} 了！')
        s.add(f'{n} 的回合！')
        s.add(f'看 {n} 这一波！')

    # 判定结果（含昵称）
    for n in NICKS:
        s.add(f'炸雷了！{n} 直接受伤三点！')
        s.add(f'梅花！补给到位，{n} 摸牌！')
        s.add(f'体能告急！{n} 这回合摸不到牌了！')
        s.add(f'红桃！{n} 状态在线，正常出牌！')
        s.add(f'犯规了！{n} 这回合上不了场！')

    return sorted(s)


def slug(text):
    return hashlib.md5(text.encode('utf-8')).hexdigest()[:12]


async def gen_one(text, out_path, sem):
    async with sem:
        proc = await asyncio.create_subprocess_exec(
            'edge-tts',
            '--voice', VOICE,
            '--rate', RATE,
            '--pitch', PITCH,
            '--text', text,
            '--write-media', str(out_path),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, err = await proc.communicate()
        if proc.returncode != 0 or not out_path.exists() or out_path.stat().st_size < 200:
            raise RuntimeError(f'edge-tts failed: "{text[:30]}" → {err.decode()[:200]}')


async def main():
    if not shutil.which('edge-tts'):
        print('需要先安装 edge-tts：\n  pip install edge-tts\n或 pipx install edge-tts', file=sys.stderr)
        sys.exit(1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    phrases = all_phrases()
    manifest = {}
    sem = asyncio.Semaphore(4)
    skipped = 0
    failed = []

    print(f'语音：{VOICE}（rate {RATE} / pitch {PITCH}）')
    print(f'目标：{len(phrases)} 条 → {OUT_DIR}\n')

    async def task(text):
        nonlocal skipped
        sl = slug(text)
        out_path = OUT_DIR / f'{sl}.mp3'
        manifest[text] = f'./voice/{sl}.mp3'
        if out_path.exists() and out_path.stat().st_size > 200:
            skipped += 1
            return
        try:
            await gen_one(text, out_path, sem)
            print(f'  ✓ {text[:36]}')
        except Exception as e:
            failed.append((text, str(e)))
            print(f'  ✗ {text[:36]}  ({e})')

    await asyncio.gather(*[task(p) for p in phrases])

    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    total = len(phrases)
    new = total - skipped - len(failed)
    print(f'\n完成：新生成 {new} / 缓存命中 {skipped} / 失败 {len(failed)} / 总计 {total}')
    print(f'manifest: {MANIFEST}')
    if failed:
        print('\n失败列表：')
        for t, e in failed[:5]:
            print(f'  - {t}  ({e[:80]})')
        sys.exit(2)


if __name__ == '__main__':
    asyncio.run(main())
