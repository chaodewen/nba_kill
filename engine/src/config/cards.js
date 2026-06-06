// NBA Kill 卡包。包含基本牌（投/盖/佳得乐/封闭针）、战术牌、装备（武器/防具/+-1 战靴）。
export const CARDS = {
  // ========== 基本牌 (56 张) ==========
  sha: {
    name: '投',
    type: 'basic',
    suit: 'spade',
    count: 30,
    color: '#e74c3c',
    description: '对攻击范围内一名角色使用，令其选择一项：1.使用【盖】抵消之 2.受到 1 点体能伤害',
    image: 'sha'
  },
  shan: {
    name: '盖',
    type: 'basic',
    suit: 'diamond',
    count: 15,
    color: '#3498db',
    description: '抵消【投】的效果',
    image: 'shan'
  },
  tao: {
    name: '佳得乐',
    type: 'basic',
    suit: 'heart',
    count: 8,
    color: '#2ecc71',
    description: '出牌阶段使用，回复 1 点体能；或濒死时使用，回复 1 点体能',
    image: 'tao'
  },
  ji: {
    name: '封闭针',
    type: 'basic',
    suit: 'spade',
    count: 5,
    color: '#9b59b6',
    description: '出牌阶段使用，本回合你使用的下一张【投】造成的伤害 +1；或濒死时自救 1 点体能',
    image: 'jiu'
  },

  // ========== 普通战术 (36 张) ==========
  wuzhong: {
    name: '战术板',
    type: 'scroll',
    suit: 'heart',
    count: 4,
    color: '#f39c12',
    description: '出牌阶段使用，摸两张牌',
    image: 'wuzhongshengyou'
  },
  juedou: {
    name: '单挑',
    type: 'scroll',
    suit: 'spade',
    count: 3,
    color: '#e67e22',
    description: '出牌阶段对一名其他角色使用，该角色选择一项：1.对你使用一张【投】2.受到 1 点体能伤害',
    image: 'juedou'
  },
  shunshou: {
    name: '抢断',
    type: 'scroll',
    suit: 'spade',
    count: 5,
    color: '#1abc9c',
    description: '出牌阶段对距离为 1 的一名其他角色使用，获得其一张牌（NBA：断球抢断）',
    image: 'shunshouqianyang'
  },
  guoheshuang: {
    name: '迫使失误',
    type: 'scroll',
    suit: 'spade',
    count: 3,
    color: '#34495e',
    description: '出牌阶段对一名其他角色使用，弃置其一张牌（NBA：施压逼迫对手失误丢球）',
    image: 'guohechaiqiao'
  },
  jiedao: {
    name: '做球',
    type: 'scroll',
    suit: 'spade',
    count: 2,
    color: '#95a5a6',
    description: '出牌阶段对装备武器的一名其他角色使用，令其对你指定的一名角色使用【投】，否则弃置武器',
    image: 'jiedaosharen'
  },
  wanjian: {
    name: '三分雨',
    type: 'scroll',
    suit: 'spade',
    count: 1,
    color: '#e74c3c',
    description: '出牌阶段使用，所有其他角色选择一项：1.使用【盖】2.受到 1 点体能伤害',
    image: 'wanjianqifa'
  },
  nanman: {
    name: '全场紧逼',
    type: 'scroll',
    suit: 'spade',
    count: 1,
    color: '#c0392b',
    description: '出牌阶段使用，所有其他角色选择一项：1.使用【投】2.受到 1 点体能伤害',
    image: 'nanmanruqin'
  },
  taoyuan: {
    name: '官方暂停',
    type: 'scroll',
    suit: 'heart',
    count: 1,
    color: '#2ecc71',
    description: '出牌阶段使用，所有角色回复 1 点体能',
    image: 'taoyuanjieyi'
  },
  wuke: {
    name: '裁判回看',
    type: 'scroll',
    suit: 'spade',
    count: 3,
    color: '#8e44ad',
    description: '抵消一张战术牌的效果',
    image: 'wuxiekeji'
  },

  // ========== 延时战术 (7 张) ==========
  lebusishu: {
    name: '犯规麻烦',
    type: 'delay',
    suit: 'heart',
    count: 3,
    color: '#f39c12',
    description: '延时战术。判定阶段若结果不为红桃，跳过其出牌阶段',
    image: 'lebusishu'
  },
  bingliangcunduan: {
    name: '体能危机',
    type: 'delay',
    suit: 'spade',
    count: 2,
    color: '#d35400',
    description: '延时战术。判定阶段若结果不为梅花，跳过其摸牌阶段',
    image: 'bingliangcunduan'
  },
  shandian: {
    name: '伤病隐患',
    type: 'delay',
    suit: 'spade',
    count: 2,
    color: '#3498db',
    description: '延时战术。判定命中时受到 3 点伤病伤害，否则移动到下家',
    image: 'shandian'
  },

  // ========== 装备牌（武器/防具/战靴 — 全是真实存在的篮球物品） ==========
  // 武器（Range 1-5）— 训练或比赛真实存在的物理工具
  zhugelian: {
    name: '投篮训练机',
    type: 'weapon',
    suit: 'spade',
    count: 2,
    color: '#95a5a6',
    description: '【简介】Dr. Dish / Shoot-A-Way 投篮训练机 —— 自动喂球的训练设备，让你连续出手不用捡球。\n\n【攻击范围】1\n\n【效果】出牌阶段你可以使用任意张【投】，不再受每回合 1 张的限制。',
    image: 'zhugelian',
    range: 1
  },
  qinggang: {
    name: '罚球线',
    type: 'weapon',
    suit: 'spade',
    count: 1,
    color: '#34495e',
    description: '【简介】罚球线 —— 干净利落的中距离投篮，对手就算护筐再厚，也防不住空位罚球。\n\n【攻击范围】2\n\n【效果】你使用【投】指定目标后，无视其防具。',
    image: 'qinggangjian',
    range: 2
  },
  cidao: {
    name: '挡拆战术板',
    type: 'weapon',
    suit: 'spade',
    count: 1,
    color: '#8e44ad',
    description: '【简介】教练手中的战术板 —— 挡拆错位制造的不对位优势，对方要么吃亏要么补给你。\n\n【攻击范围】2\n\n【效果】你使用【投】指定一名不同位置的角色后，其选择一项：\n  ① 弃置一张手牌\n  ② 令你摸一张牌',
    image: 'cixiongshuanggujian',
    range: 2
  },
  guandin: {
    name: '运动护腕',
    type: 'weapon',
    suit: 'spade',
    count: 1,
    color: '#d35400',
    description: '【简介】Nike 运动护腕 —— AND-1 完成的标志，对方的盖帽变成额外代价。\n\n【攻击范围】3\n\n【效果】你使用【投】被抵消后，可弃置两张牌，令此【投】依然造成伤害。',
    image: 'guanshifu',
    range: 3
  },
  fangtian: {
    name: '半场标志线',
    type: 'weapon',
    suit: 'spade',
    count: 1,
    color: '#e74c3c',
    description: '【简介】半场中线 —— 错位单打范围全场，最后一颗子弹反而能打三个人。\n\n【攻击范围】4\n\n【效果】你使用的【投】是你的最后一张手牌时，可额外指定至多两个目标。',
    image: 'fangtianhuaji',
    range: 4
  },
  qilin: {
    name: '比赛用球',
    type: 'weapon',
    suit: 'heart',
    count: 1,
    color: '#e74c3c',
    description: '【简介】Spalding 官方比赛用球 —— 这一记全场长传出手把对方的 AJ 11 / Kobe 6 都拍掉了。\n\n【攻击范围】5\n\n【效果】你使用【投】对目标角色造成伤害时，可弃置其装备区里的战靴。',
    image: 'qilingong',
    range: 5
  },

  // 防具
  bagua: {
    name: '运动眼镜',
    type: 'armor',
    suit: 'spade',
    count: 1,
    color: '#3498db',
    description: '【简介】Kareem 同款运动眼镜 —— 视野更清楚，关键防守瞬间能精准盖到对方出手。\n\n【类型】防具 · 锁定技\n\n【效果】当你需要使用【盖】时，可进行一次判定；若结果为红色，视为使用一张【盖】。',
    image: 'baguazhen'
  },
  renwang: {
    name: '护齿',
    type: 'armor',
    suit: 'spade',
    count: 1,
    color: '#2c3e50',
    description: '【简介】Steph Curry 同款护齿 —— 死磕篮下也咬牙不松口，对方常规黑色出手都打不进。\n\n【类型】防具 · 锁定技\n\n【效果】黑色的【投】对你无效。',
    image: 'renwangdun'
  },

  // +1 鞋（防守战靴，count 2 — 两个不同名字同效果）
  horse_plus_aj11: {
    name: 'Air Jordan 11',
    type: 'defense_horse',
    suit: 'spade',
    count: 1,
    color: '#8e44ad',
    description: '【简介】Nike Air Jordan 11（1995-96，三连冠战靴）—— 高帮锁踝侧滑拉开空间。\n\n【类型】+1 防守战靴 · 锁定技\n\n【效果】其他角色计算与你的距离时 +1（更难追到你）。',
    image: 'dawanma'
  },
  horse_plus_lebron8: {
    name: 'LeBron 8',
    type: 'defense_horse',
    suit: 'spade',
    count: 1,
    color: '#8e44ad',
    description: '【简介】Nike LeBron 8 "南海岸"（2010）—— 大体型护框型战靴，对手追不到你。\n\n【类型】+1 防守战靴 · 锁定技\n\n【效果】其他角色计算与你的距离时 +1（更难追到你）。',
    image: 'dawanma'
  },

  // -1 鞋（进攻战靴，count 2 — 两个不同名字同效果）
  horse_minus_kobe6: {
    name: 'Kobe 6',
    type: 'offense_horse',
    suit: 'spade',
    count: 1,
    color: '#27ae60',
    description: '【简介】Nike Kobe 6 Protro（蛇纹经典）—— 曼巴突破利刃，一步过。\n\n【类型】-1 进攻战靴 · 锁定技\n\n【效果】你计算与其他角色的距离时 -1（更容易突破到对方）。',
    image: 'chitu'
  },
  horse_minus_kyrie1: {
    name: 'Kyrie 1',
    type: 'offense_horse',
    suit: 'spade',
    count: 1,
    color: '#27ae60',
    description: '【简介】Nike Kyrie 1（2014）—— 欧文绝杀战靴，变向加速贴身突破。\n\n【类型】-1 进攻战靴 · 锁定技\n\n【效果】你计算与其他角色的距离时 -1（更容易突破到对方）。',
    image: 'chitu'
  }
};

// 花色
export const SUITS = {
  spade: { name: '黑桃', color: '#2c3e50', symbol: '♠' },
  heart: { name: '红桃', color: '#e74c3c', symbol: '♥' },
  club: { name: '梅花', color: '#27ae60', symbol: '♣' },
  diamond: { name: '方片', color: '#3498db', symbol: '♦' }
};

// 卡牌类型
export const CARD_TYPES = {
  basic: { name: '基本牌', color: '#95a5a6' },
  scroll: { name: '战术牌', color: '#f39c12' },
  delay: { name: '延时战术', color: '#e67e22' },
  weapon: { name: '进攻装备', color: '#e74c3c' },
  armor: { name: '防守装备', color: '#3498db' },
  defense_horse: { name: '空间装备', color: '#9b59b6' },
  offense_horse: { name: '突破装备', color: '#27ae60' }
};

// 卡牌图片 URL（使用 BWIKI 资源）
export const CARD_IMAGE_BASE = 'https://patchwiki.biligame.com/images/msgs/';

// 卡牌图片映射
const CARD_IMAGE_MAP = {
  sha: '投',
  shan: '盖',
  tao: '佳得乐',
  ji: '封闭针',
  wuzhong: '无中生有',
  juedou: '决斗',
  shunshou: '顺手牵羊',
  guoheshuang: '过河拆桥',
  nanman: '南蛮入侵',
  wanjian: '万箭齐发',
  lebusishu: '乐不思蜀',
  bingliangcunduan: '兵粮寸断',
  shandian: '伤病隐患',
  zhugelian: '诸葛连弩',
  bagua: '八卦阵'
};

// 获取卡牌图片 URL
export function getCardImage(cardKey) {
  // 使用本地 SVG 占位图
  return null;
}

// 生成卡牌 SVG 占位图
export function getCardPlaceholder(cardKey) {
  const card = CARDS[cardKey];
  if (!card) return '';
  
  const suit = SUITS[card.suit];
  const suitColor = suit.color;
  const bgColor = card.color;
  
  // 使用 CardUID 生成更精美的卡牌
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 110">
    <defs>
      <linearGradient id="bg-${cardKey}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${bgColor};stop-opacity:1" />
        <stop offset="100%" style="stop-color:#1a1a2e;stop-opacity:1" />
      </linearGradient>
      <filter id="shadow-${cardKey}">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/>
      </filter>
    </defs>
    <rect fill="url(#bg-${cardKey})" width="80" height="110" rx="6"/>
    <rect fill="none" stroke="rgba(255,255,255,0.3)" width="76" height="106" rx="4" x="2" y="2"/>
    <text x="12" y="22" fill="${suitColor}" font-size="20" font-weight="bold">${suit.symbol}</text>
    <text x="68" y="22" fill="${suitColor}" font-size="16" text-anchor="end">${suit.symbol}</text>
    <text x="40" y="60" fill="#fff" font-size="16" font-weight="bold" text-anchor="middle">${card.name}</text>
    <text x="40" y="78" fill="rgba(255,255,255,0.7)" font-size="9" text-anchor="middle">${CARD_TYPES[card.type].name}</text>
    <text x="40" y="98" fill="${suitColor}" font-size="14" text-anchor="middle">${suit.symbol}</text>
  </svg>`;
  
  return `data:image/svg+xml,${encodeURIComponent(svg.trim())}`;
}
