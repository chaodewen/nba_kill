/**
 * 核心游戏逻辑
 */
import { SUITS } from '../config/cards';

// ========== 距离计算 ==========

/**
 * 计算两名角色之间的距离
 */
export function calculateDistance(source, target, players) {
  if (source === target) return 0;
  
  const alivePlayers = players.filter(p => p.isAlive);
  const sourceIndex = alivePlayers.indexOf(source);
  const targetIndex = alivePlayers.indexOf(target);
  
  if (sourceIndex === -1 || targetIndex === -1) return Infinity;
  
  // 座位距离
  const total = alivePlayers.length;
  const clockwise = (targetIndex - sourceIndex + total) % total;
  const counterClockwise = (sourceIndex - targetIndex + total) % total;
  let distance = Math.min(clockwise, counterClockwise);
  
  // +1 马
  if (target.equipment.defenseHorse) {
    distance += 1;
  }
  
  // -1 马
  if (source.equipment.offenseHorse) {
    distance = Math.max(1, distance - 1);
  }
  
  return distance;
}

/**
 * 检查是否可以攻击
 */
export function canAttack(source, target, players) {
  if (!target.isAlive || source === target) return false;
  
  const distance = calculateDistance(source, target, players);
  const range = source.getAttackRange();
  
  return distance <= range;
}

export function isEnemy(source, target) {
  if (!source?.identity || !target?.identity) return source !== target;
  if (source.identity.key === 'solo') return target.identity.key !== 'solo';
  if (target.identity.key === 'solo') return true;
  return source.identity.team !== target.identity.team;
}

// ========== 卡牌效果 ==========

/**
 * 获取投的伤害值
 * @param {Player} player - 攻击者
 * @param {Player} target - 目标
 * @param {Player[]} [players] - 全部玩家列表（用于距离判定，可选）
 */
export function getShaDamage(player, target, players) {
  let damage = 1;

  // 封闭针
  if (player.drunken) {
    damage += 1;
    player.drunken = false;
  }

  // Shaquille O'Neal · 禁区：对距离 1 的目标投伤害 +1
  if (player.character?.key === 'shaquille_oneal' && Array.isArray(players)) {
    if (calculateDistance(player, target, players) === 1) {
      damage += 1;
    }
  }

  return damage;
}

/**
 * 检查投是否可以被盖避
 */
export function canDodgeSha(player, target) {
  // 检查烈弓等技能
  // 这里简化处理
  return true;
}

/**
 * 需要几张盖
 */
export function getRequiredShanCount(attacker, target) {
  // 默认 1 张盖；后续 NBA 球员的施压技能在技能系统中处理
  return 1;
}

// ========== 判定相关 ==========

/**
 * 检查判定结果
 */
export function checkJudgeResult(card, condition) {
  const suit = SUITS[card.suit];
  const isRed = suit.name === '红桃' || suit.name === '方片';
  const number = Math.floor(Math.random() * 13) + 1;  // 简化，实际应该有牌面点数
  
  switch (condition) {
    case 'red':
      return isRed;
    case 'black':
      return !isRed;
    case 'heart':
      return card.suit === 'heart';
    case 'spade':
      return card.suit === 'spade';
    case 'club':
      return card.suit === 'club';
    case 'diamond':
      return card.suit === 'diamond';
    case 'spade_2_9':
      return card.suit === 'spade' && number >= 2 && number <= 9;
    default:
      return false;
  }
}

// ========== 游戏状态检查 ==========

/**
 * 检查游戏是否结束
 */
export function checkGameOver(players) {
  const alive = players.filter(p => p.isAlive);
  const core = players.find(p => p.identity?.key === 'core');
  const coreAlive = core?.isAlive;
  const opponentsAlive = players.some(p => p.isAlive && p.identity?.key === 'opponent');
  const soloAlive = players.some(p => p.isAlive && p.identity?.key === 'solo');
  const teammateAlive = players.some(p => p.isAlive && p.identity?.key === 'teammate');

  if (!coreAlive) {
    const soloWins = soloAlive && !opponentsAlive && !teammateAlive && alive.length === 1;
    return {
      over: true,
      winner: soloWins ? alive[0] : alive.find(p => p.identity?.key === 'opponent') || null,
      winnerName: soloWins ? '独狼' : '对手',
      reason: soloWins ? '独狼击败核心完成残局' : '核心被击败'
    };
  }

  if (!opponentsAlive && !soloAlive) {
    return {
      over: true,
      winner: core,
      winnerName: '核心阵营',
      reason: '对手和独狼全部出局'
    };
  }
  
  if (alive.length <= 1) {
    return {
      over: true,
      winner: alive[0] || null,
      reason: alive.length === 0 ? '全员阵亡' : '最后存活'
    };
  }
  
  return { over: false };
}

/**
 * 获取存活玩家
 */
export function getAlivePlayers(players) {
  return players.filter(p => p.isAlive);
}

/**
 * 获取下一个存活玩家
 */
export function getNextAlivePlayer(players, currentIndex) {
  let nextIndex = (currentIndex + 1) % players.length;
  let count = 0;
  
  while (!players[nextIndex].isAlive && count < players.length) {
    nextIndex = (nextIndex + 1) % players.length;
    count++;
  }
  
  return nextIndex;
}

// ========== AI 相关 ==========

/**
 * AI 选择目标
 * 评分维度：是否敌人 → 身份关键性（核心 / 独狼优先级高）→ 体能（残血优先）→ 距离（近优先，无范围限制时忽略）
 */
export function aiSelectTarget(source, players, filter = () => true) {
  const targets = players.filter(p =>
    p !== source &&
    p.isAlive &&
    isEnemy(source, p) &&
    filter(p)
  );

  if (targets.length === 0) return null;

  const scoreOf = (t) => {
    let s = 0;
    // 身份倾向：对手 / 独狼 当核心 → 优先打核心；核心当对手 / 独狼 → 优先打对手
    const sId = source.identity?.key;
    const tId = t.identity?.key;
    if (sId === 'core' || sId === 'teammate') {
      // 核心阵营：优先打对手 → 独狼 → 其他
      if (tId === 'opponent') s += 30;
      else if (tId === 'solo') s += 22;
    } else if (sId === 'opponent') {
      // 对手：优先打核心
      if (tId === 'core') s += 40;
      else if (tId === 'solo') s += 12;  // 防止独狼坐收渔利
    } else if (sId === 'solo') {
      // 独狼：人少时打核心收尾，人多时打对手 / 队友消耗
      const aliveCnt = players.filter(p => p.isAlive).length;
      if (aliveCnt <= 3) {
        if (tId === 'core') s += 50;
      } else {
        if (tId === 'opponent' || tId === 'teammate') s += 18;
      }
    }
    // 残血加分：HP 越低越优先（致命一击 / 收尾）
    s += Math.max(0, 6 - t.hp) * 8;
    // 距离加分：近的优先（攻击牌效率高，且对方装备少更危险）
    s += Math.max(0, 5 - calculateDistance(source, t, players)) * 2;
    return s;
  };

  targets.sort((a, b) => scoreOf(b) - scoreOf(a));
  return targets[0];
}

/**
 * AI 决定出牌
 */
export function aiDecideCard(player, players) {
  const handCards = player.handCards;

  // 优先级：装备 > 佳得乐(血少) > 投 > 战术 > 其他
  const priority = {
    'weapon': 100,
    'armor': 95,
    'defense_horse': 90,
    'offense_horse': 85,
    'basic': 50,
    'scroll': 40,
    'delay': 30
  };

  // 找装备：但已有同槽装备且新的不更好就先不换
  const equips = handCards.filter(c => priority[c.type] >= 85);
  if (equips.length > 0) {
    const eq = player.equipment || {};
    const slotKey = (c) => ({ weapon: 'weapon', armor: 'armor', defense_horse: 'defenseHorse', offense_horse: 'offenseHorse' })[c.type];
    const better = equips.find(c => {
      const slot = slotKey(c);
      const cur = eq[slot];
      if (!cur) return true;
      // 武器换更高 range；防具/战靴有就不换
      if (c.type === 'weapon') return (c.range || 1) > (cur.range || 1);
      return false;
    });
    if (better) return { card: better, action: 'equip' };
  }

  // 残血优先佳得乐自救（HP 1 必喝；HP <= maxHp/2 高概率喝）
  const tao = handCards.find(c => c.key === 'tao');
  if (tao && player.hp < player.maxHp) {
    if (player.hp === 1 || player.hp <= Math.ceil(player.maxHp / 2)) {
      return { card: tao, action: 'use', target: player };
    }
  }

  // 用投（如果有目标）
  if (!player.hasUsedSha || player.hasZhugeliannu()) {
    const sha = handCards.find(c => c.key === 'sha');
    if (sha) {
      const target = aiSelectTarget(player, players, t => canAttack(player, t, players));
      if (target) {
        return { card: sha, action: 'use', target };
      }
    }
  }

  // 用战术（含延时锦囊；排除裁判回看，因为它是响应牌）
  const scrolls = handCards.filter(c => (c.type === 'scroll' || c.type === 'delay') && c.key !== 'wuke');
  if (scrolls.length > 0) {
    // 优先使用非延时战术
    const normalScrolls = scrolls.filter(c => !['lebusishu', 'bingliangcunduan', 'shandian'].includes(c.key));
    if (normalScrolls.length > 0) {
      // 无目标的（战术板 / 全场紧逼 / 三分雨 / 官方暂停）直接出
      const noTarget = normalScrolls.find(c => ['wuzhong', 'nanman', 'wanjian', 'taoyuan'].includes(c.key));
      if (noTarget) return { card: noTarget, action: 'use', target: player };

      const target = aiSelectTarget(player, players);
      if (target) {
        return { card: normalScrolls[0], action: 'use', target };
      }
    }
    // 延时战术
    const delayScrolls = scrolls.filter(c => ['lebusishu', 'bingliangcunduan', 'shandian'].includes(c.key));
    if (delayScrolls.length > 0) {
      const target = aiSelectTarget(player, players);
      if (target) {
        return { card: delayScrolls[0], action: 'use', target };
      }
    }
  }

  // 即便有 tao 但血未下半，没别的想做时也喝一下回血（避免 hp = max - 1 时一直不用）
  if (tao && player.hp < player.maxHp) {
    return { card: tao, action: 'use', target: player };
  }

  return null;
}

/**
 * AI 决定是否出盖
 * 策略：HP 越低越倾向使用所有可用的盖；HP 高时省着用
 * Battier 站位：黑色手牌（黑桃/梅花）也可以当盖
 */
export function aiDecideShan(player, shaCard, attacker) {
  const needCount = getRequiredShanCount(attacker, player);
  const realShanCount = player.handCards.filter(c => c.key === 'shan').length;

  // Battier 站位：黑色手牌可当盖（黑桃 spade / 梅花 club）
  const battierBonus = player.character?.key === 'shane_battier'
    ? player.handCards.filter(c => c.key !== 'shan' && (c.suit === 'spade' || c.suit === 'club')).length
    : 0;
  const totalAvailable = realShanCount + battierBonus;

  // 联防体系（八卦）使用倾向：HP <= 2 必试；HP 高时 50%
  if (player.hasBagua()) {
    if (player.hp <= 2 || Math.random() > 0.5) {
      return { useBagua: true };
    }
  }

  if (totalAvailable < needCount) {
    return { useShan: false };
  }

  // HP = 1 必出（保命）；HP <= maxHp/2 高概率出；HP 高时存盖给后续
  if (player.hp === 1) return { useShan: true, count: needCount };
  if (player.hp <= Math.ceil((player.maxHp || 4) / 2)) return { useShan: true, count: needCount };
  // 高血时：手牌富余（>= 4）才肯出
  if (player.handCards.length >= 4) return { useShan: true, count: needCount };
  return { useShan: false };
}

/**
 * AI 决定是否出佳得乐救人
 */
export function aiDecideTao(player, dyingPlayer) {
  // 队友判定：基于身份阵营，而非角色标签
  const isAlly = player === dyingPlayer || !isEnemy(player, dyingPlayer);

  // 有佳得乐且是队友（含自己）
  if (player.hasCard('tao') && isAlly) {
    return true;
  }

  return false;
}
