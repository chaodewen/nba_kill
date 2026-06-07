// NBA Kill 角色配置
// `skill` / `description` 保留作旧 UI 摘要使用；`skills` 是技能详情数组（用于技能弹窗 / 悬停查看）。
// `position` 是球场位置：inside / guard / forward —— 同位置角色互相提供协同加成（详见 POSITIONS）
// `nbaId` 是 NBA 官方球员 ID，用于生成真实球员头像（NBA CDN）
export const CHARACTERS = [
  {
    key: 'lebron_james', name: 'LeBron James', cnName: '詹姆斯', kingdom: 'wei', position: 'forward', hp: 4, nbaId: '2544',
    skill: '全能 / 组织',
    archetype: '全能核心',
    description: '全能核心。可转化基础牌，并在进攻得手后支援队友。',
    bio: '4× NBA 总冠军 + 4× FMVP，骑士/热火/湖人三队均夺冠的史诗级全能锋线。常规赛得分 NBA 历史第一（40000+），并在助攻、抢断榜单都名列前茅。',
    skills: [
      { name: '全能', description: '出牌阶段限一次，你可以将一张手牌当作"投""盖"或"佳得乐"使用。' },
      { name: '组织', description: '当你使用"投"造成伤害后，你可以令一名其他角色摸一张牌。' }
    ]
  },
  {
    key: 'kobe_bryant', name: 'Kobe Bryant', cnName: '科比', kingdom: 'shu', position: 'guard', hp: 4, nbaId: '977',
    skill: '曼巴 / 绝杀',
    archetype: '终结型单打手',
    description: '终结型单打手。首攻受阻后继续压迫，残血时无视距离。',
    bio: '5× NBA 总冠军 + 1× 常规赛 MVP（2008）+ 18× 全明星。"曼巴精神"代言人，2006 年单场 81 分仅次于张伯伦。',
    skills: [
      { name: '曼巴', description: '当你于出牌阶段使用的第一张"投"被"盖"抵消后，你可以弃一张牌，视为再对同一目标使用一张"投"。' },
      { name: '绝杀', description: '当你的体能值为 1 时，你使用"投"无视距离。' }
    ]
  },
  {
    key: 'stephen_curry', name: 'Stephen Curry', cnName: '库里', kingdom: 'shu', position: 'guard', hp: 3, nbaId: '201939',
    skill: '射程 / 三分雨',
    archetype: '三分爆发',
    description: '三分爆发。攻击距离更远，可发动群体外线进攻。',
    bio: '4× NBA 总冠军 + 2× MVP（2014-15 全票），永久改变三分时代的现代射手。生涯三分命中数 NBA 历史第一。',
    skills: [
      { name: '射程', description: '你使用"投"的距离 +1。' },
      { name: '三分雨', description: '出牌阶段限一次，你可以弃置两张同花色手牌，视为使用一张"三分雨"。' }
    ]
  },
  {
    key: 'shaquille_oneal', name: "Shaquille O'Neal", cnName: '奥尼尔', kingdom: 'wu', position: 'inside', hp: 5, nbaId: '406',
    skill: '禁区 / 罚球',
    archetype: '内线巨兽',
    description: '内线巨兽。近距离进攻伤害更高，但会给目标反制窗口。',
    bio: '4× NBA 总冠军 + 1× 常规赛 MVP（2000）+ 3× 总决赛 MVP，湖人 OK 组合内线核心。生涯 28000+ 得分，篮球史上最具统治力的内线之一。',
    skills: [
      { name: '禁区', description: '你使用"投"指定距离为 1 的角色为目标时，此"投"伤害 +1。' },
      { name: '罚球', description: '你的"投"造成伤害后，目标可以令你弃置一张牌；若如此，其防止此伤害。' }
    ]
  },
  {
    key: 'tim_duncan', name: 'Tim Duncan', cnName: '邓肯', kingdom: 'wei', position: 'inside', hp: 4, nbaId: '1495',
    skill: '基本功 / 护框',
    archetype: '稳定基石',
    description: '稳定基石。受伤后补牌，可替队友护框。',
    bio: '5× NBA 总冠军 + 3× FMVP + 2× MVP，马刺王朝基石"石佛"。19 年职业生涯只效力一队，标杆式低位大前锋。',
    skills: [
      { name: '基本功', description: '当你受到伤害后，你可以摸一张牌。' },
      { name: '护框', description: '每轮限一次，当一名其他角色成为"投"的目标时，你可以弃一张"盖"，令此"投"无效。' }
    ]
  },
  {
    key: 'kevin_durant', name: 'Kevin Durant', cnName: '杜兰特', kingdom: 'shu', position: 'forward', hp: 3, nbaId: '201142',
    skill: '错位 / 干拔',
    archetype: '无差别单打',
    description: '无差别单打。错位时压制响应，可打出无距离限制进攻。',
    bio: '2× NBA 总冠军（勇士背靠背）+ 2× FMVP + 1× 常规赛 MVP（2014）。7 尺锋线无差别投射，奥运四金的得分天才。',
    skills: [
      { name: '错位', description: '你使用"投"指定目标后，若其手牌数大于你，此"投"不可被"盖"响应。' },
      { name: '干拔', description: '出牌阶段限一次，你可以弃一张装备牌，视为使用一张无距离限制的"投"。' }
    ]
  },
  {
    key: 'dwyane_wade', name: 'Dwyane Wade', cnName: '韦德', kingdom: 'shu', position: 'guard', hp: 4, nbaId: '2548',
    skill: '突破 / 造犯',
    archetype: '突破造杀伤',
    description: '突破造杀伤。进攻得手后拆牌，被攻击时可判定摸牌。',
    bio: '3× NBA 总冠军 + 1× FMVP（2006）+ 13× 全明星，热火队史第一人。突破造杀伤的祖师爷。',
    skills: [
      { name: '突破', description: '你使用"投"造成伤害后，可以弃置目标一张牌。' },
      { name: '造犯', description: '当你成为"投"的目标后，你可以判定；若为红色，你摸一张牌。' }
    ]
  },
  {
    key: 'chris_paul', name: 'Chris Paul', cnName: '保罗', kingdom: 'wei', position: 'guard', hp: 3, nbaId: '101108',
    skill: '控场 / 抢断',
    archetype: '控场组织',
    description: '控场组织。通过传牌和摸牌调度资源，并干扰对手节奏。',
    bio: '12× 全明星 + 5× 助攻王 + 6× 抢断王，控球后卫天花板之一。组织能力与传球视野历来 NBA 第一档。',
    skills: [
      { name: '控场', description: '出牌阶段限一次，你可以将一张手牌交给一名其他角色，然后摸一张牌。' },
      { name: '抢断', description: '当一名其他角色于其出牌阶段使用第二张牌时，你可以弃一张牌，令其弃置一张手牌。' }
    ]
  },
  {
    key: 'james_harden', name: 'James Harden', cnName: '哈登', kingdom: 'shu', position: 'guard', hp: 3, nbaId: '201935',
    skill: '造犯 / 后撤步',
    archetype: '造犯规与爆发',
    description: '进攻被盖后让对方在「弃牌」与「让你摸牌」中选一项；后撤步则在你出投前用一张牌换距离自由。',
    bio: '1× 常规赛 MVP（2018）+ 3× 得分王 + 10× 全明星。造犯规与后撤步三分定义了现代单挑得分手。',
    skills: [
      { name: '造犯', description: '当你使用"投"被"盖"抵消后，你可以令目标选择一项：弃一张牌，或你摸一张牌。' },
      { name: '后撤步', description: '出牌阶段限一次，你可以弃一张牌，令本回合你下一张"投"无距离限制。' }
    ]
  },
  {
    key: 'kawhi_leonard', name: 'Kawhi Leonard', cnName: '卡哇伊', kingdom: 'wu', position: 'forward', hp: 4, nbaId: '202695',
    skill: '死亡缠绕 / 沉默',
    archetype: '攻防一体',
    description: '攻防一体。伤害后拆牌，并可取消针对自己的战术效果。',
    bio: '2× NBA 总冠军（马刺/猛龙）+ 2× FMVP + 2× DPOY。"机器人"以低调防守和中距离稳定性著称。',
    skills: [
      { name: '死亡缠绕', description: '当你对一名角色造成伤害后，你可以弃置其一张牌。' },
      { name: '沉默', description: '每轮限一次，当你成为锦囊牌目标时，你可以弃一张牌，取消之。' }
    ]
  },
  {
    key: 'kevin_garnett', name: 'Kevin Garnett', cnName: '加内特', kingdom: 'wu', position: 'inside', hp: 4, nbaId: '708',
    skill: '怒吼 / 协防',
    archetype: '激情防守',
    description: '激情防守。用盖后反压攻击者，也可协防降低伤害。',
    bio: '1× NBA 总冠军（凯尔特人三巨头）+ 2004 MVP + 2008 DPOY。森林狼到凯尔特人，激情怒吼防守招牌的传奇大前锋。',
    skills: [
      { name: '怒吼', description: '当你使用"盖"抵消一张"投"后，你可以令攻击者弃一张牌。' },
      { name: '协防', description: '其他角色在你的攻击范围内受到"投"造成的伤害时，你可以弃一张牌，令伤害 -1。' }
    ]
  },
  {
    key: 'dwight_howard', name: 'Dwight Howard', cnName: '霍华德', kingdom: 'wu', position: 'inside', hp: 4, nbaId: '2730',
    skill: '篮板 / 盖帽',
    archetype: '篮板护筐',
    description: '篮板护筐。回收弃置的基本牌，打出盖后摸牌。',
    bio: '1× NBA 总冠军（湖人）+ 3× DPOY + 8× 全明星。生涯 5 次篮板王，巅峰期是联盟运动能力最佳内线。',
    skills: [
      { name: '篮板', description: '当一张基本牌因弃置进入弃牌堆后，若此牌为本回合第一张进入弃牌堆的基本牌，你可以获得之。' },
      { name: '盖帽', description: '当你打出"盖"后，你可以摸一张牌。' }
    ]
  },
  {
    key: 'ray_allen', name: 'Ray Allen', cnName: '雷阿伦', kingdom: 'qun', position: 'guard', hp: 3, nbaId: '951',
    skill: '底角 / 绝平',
    archetype: '定点射手',
    description: '定点射手。首投难以远端响应，濒死被救后可反击。',
    bio: '2× NBA 总冠军（凯尔特人/热火）+ 10× 全明星。NBA 历史三分命中数曾排名第一，2013 年总决赛 G6 绝平三分载入史册。',
    skills: [
      { name: '底角', description: '若你本回合未移动装备区牌，你使用的第一张"投"不可被距离大于 1 的角色响应。' },
      { name: '绝平', description: '当你处于濒死状态被"佳得乐"救回后，你可以视为使用一张"投"。' }
    ]
  },
  {
    key: 'shane_battier', name: 'Shane Battier', cnName: '巴蒂尔', kingdom: 'qun', position: 'forward', hp: 3, nbaId: '2426',
    photoUrl: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/976.png&w=270&h=200',
    photoTransform: 'scaleX(1.18)',
    skill: '站位 / 底角三分',
    archetype: '3D 拼图',
    description: '黑色手牌可当盖；回合外打出盖后让当前回合角色摸一张，你也摸一张。',
    bio: '2× NBA 总冠军（热火背靠背）+ Duke 大学全美最佳防守球员。"无球无名"3D 模板，团队篮球的终极注解。',
    skills: [
      { name: '站位', description: '你可以将一张黑色手牌当"盖"使用或打出。' },
      { name: '底角三分', description: '当你于回合外打出"盖"后，你可以令当前回合角色摸一张牌，然后你摸一张牌。' }
    ]
  },
  {
    key: 'manu_ginobili', name: 'Manu Ginobili', cnName: '吉诺', kingdom: 'qun', position: 'guard', hp: 3, nbaId: '1938',
    skill: '妖刀 / 奇袭',
    archetype: '第六人妖刀',
    description: '第六人妖刀。爆发换牌，并在战术牌指定目标后施压。',
    bio: '4× NBA 总冠军（马刺）+ 2008 最佳第六人 + 阿根廷队奥运金牌。妖刀突破和欧洲步让他成为国际球员标杆。',
    skills: [
      { name: '妖刀', description: '出牌阶段限一次，你可以弃一张牌并摸两张牌，然后本阶段你使用"投"的次数上限 -1。' },
      { name: '奇袭', description: '当你使用锦囊牌指定唯一目标后，你可以令其弃一张牌。' }
    ]
  },
  {
    key: 'andre_iguodala', name: 'Andre Iguodala', cnName: '伊戈', kingdom: 'qun', position: 'forward', hp: 4, nbaId: '2738',
    skill: 'FMVP / 协防',
    archetype: '关键防守者',
    description: '关键防守者。面对强者进攻时过滤手牌，也能替队友响应盖。',
    bio: '4× NBA 总冠军（勇士王朝核心）+ 2015 FMVP（替补出场拿 FMVP 的罕见案例）。3D 锋线和团队防守典范。',
    skills: [
      { name: 'FMVP', description: '每轮限一次，当一名体能值不小于你的角色对你使用"投"时，你可以摸一张牌，然后弃一张牌；若弃置的是"盖"，此"投"无效。' },
      { name: '协防', description: '当其他角色成为"投"的目标时，若其体能值小于你，你可以打出一张"盖"替其响应。' }
    ]
  }
];

// 球场位置：3 个篮球位置，作为「势力 / 国家」类的归属。同位置存活的角色互相提供加成。
export const POSITIONS = {
  inside: {
    key: 'inside',
    name: '禁区铁壁',
    short: '内线',
    icon: '🛡️',
    color: '#16a34a',
    synergy: '禁区轮转：同位置队友存活时，你受到的伤害 -1（最低 0）'
  },
  guard: {
    key: 'guard',
    name: '后场操盘',
    short: '后卫',
    icon: '🎯',
    color: '#2f80ed',
    synergy: '挡拆传切：同位置队友存活时，你的摸牌阶段额外摸 1 张'
  },
  forward: {
    key: 'forward',
    name: '锋线尖刃',
    short: '锋线',
    icon: '⚡',
    color: '#e11d48',
    synergy: '前后夹击：同位置队友存活时，你"投"造成伤害后，额外弃置目标 1 张牌'
  }
};

// 旧的 4 色映射保留，用作 UI 装饰色（避免破坏老逻辑）
export const KINGDOM_COLORS = {
  wei: { primary: '#2f80ed', name: '核心', gradient: ['#1d4ed8', '#2f80ed'] },
  shu: { primary: '#e11d48', name: '得分手', gradient: ['#be123c', '#e11d48'] },
  wu: { primary: '#059669', name: '防守内线', gradient: ['#047857', '#059669'] },
  qun: { primary: '#f59e0b', name: '拼图', gradient: ['#d97706', '#f59e0b'] }
};

// 真实 NBA 球员头像：先看角色是否定义了 photoUrl 覆盖，否则用 NBA 官方 CDN（260×190）
// 失败时由 onerror 降级到首字母
export function getCharacterAvatar(character) {
  if (typeof character === 'string') {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${character}&backgroundColor=transparent`;
  }
  if (character?.photoUrl) {
    return character.photoUrl;
  }
  if (character?.nbaId) {
    return `https://cdn.nba.com/headshots/nba/latest/260x190/${character.nbaId}.png`;
  }
  return null;
}


