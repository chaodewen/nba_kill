# NBA Kill — Engine

webpack-based 单页 Web 应用，主仓库说明见上层 `README.md`。

## 命令

```bash
npm install
npm run dev          # http://localhost:3005
npm run build        # 产物到 dist/
```

`scripts/add-timestamp.js` 会在 build 后注入构建时间戳到 dist/index.html。

## 架构

```
src/
├── main.js             启动入口 + 全局 game 实例
├── core/
│   ├── Game.js         回合系统、出牌结算、技能派发、UI 协调
│   ├── Logic.js        距离 / 攻击范围 / AI 决策
│   ├── Skills.js       球员技能定义 + 触发分发
│   ├── Player.js       玩家状态（HP、装备、判定区、手牌）
│   └── Deck.js         牌堆 + 弃牌堆 + 判定
├── ui/Renderer.js      DOM 渲染、动效、模态弹窗、日志
└── config/
    ├── characters.js   16 名 NBA 球星 + POSITIONS（内线/后卫/锋线）
    └── cards.js        基本牌、战术牌、装备
```

## 关键约定

- 所有 UI 文案、卡牌名是 NBA 主题；内部 key 为短拼音（`sha`/`shan`/`tao`/...）
- `kingdom` 字段保留为 4 色装饰映射，玩家分组以 `position`（球场位置）为准
- 技能触发器集中在 `Skills.js`，效果由 `Game.applySkillResult` 统一派发
- 所有玩家动作 / 响应统一 2s 节奏（`PACE_MULTIPLIER = 5`）
- 日志面板自带 1.2s 节流队列（`Renderer._processLogQueue`）
