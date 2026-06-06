/**
 * 技能系统 - 处理球员技能触发和效果
 */
import { SUITS } from '../config/cards';

export class SkillSystem {
  constructor(game) {
    this.game = game;
  }

  // 检查技能触发
  checkTrigger(player, trigger, context = {}) {
    const characterKey = player.character.key;
    const skillHandler = this[characterKey];
    
    if (skillHandler && typeof skillHandler === 'function') {
      return skillHandler.call(this, player, trigger, context);
    }
    
    return null;
  }

  // ========== 魏国球员 ==========

  // 曹操 - 奸雄
  caocao(player, trigger, context) {
    if (trigger === 'damaged' && context.card) {
      return {
        name: '奸雄',
        effect: 'gain_card',
        description: '获得造成伤害的牌',
        card: context.card
      };
    }
    return null;
  }

  // 司马懿 - 反馈
  simayi(player, trigger, context) {
    if (trigger === 'damaged' && context.source) {
      return {
        name: '反馈',
        effect: 'steal_card',
        description: '获得伤害来源的一张牌',
        source: context.source
      };
    }
    return null;
  }

  // 夏侯惇 - 刚烈
  xiahoudun(player, trigger, context) {
    if (trigger === 'damaged' && context.source) {
      const judge = this.game.deck.judge();
      const result = this.game.deck.getJudgeResult(judge);
      if (result.isBlack) {
        return {
          name: '刚烈',
          effect: 'force_choice',
          description: '判定为黑，伤害来源选择弃两张牌或受1点伤害',
          source: context.source,
          choices: ['discard_2', 'take_damage']
        };
      }
    }
    return null;
  }

  // 许褚 - 裸衣
  xuzhu(player, trigger, context) {
    if (trigger === 'draw_phase') {
      return {
        name: '裸衣',
        effect: 'draw_less',
        description: '少摸一张牌，投或决斗伤害+1',
        canChoose: true
      };
    }
    if (trigger === 'calculate_damage' && context.isNaked) {
      return {
        name: '裸衣',
        effect: 'damage_plus_1',
        value: 1
      };
    }
    return null;
  }

  // 郭嘉 - 遗计
  guojia(player, trigger, context) {
    if (trigger === 'damaged') {
      return {
        name: '遗计',
        effect: 'draw_and_distribute',
        description: '摸两张牌，分配给任意角色',
        count: 2
      };
    }
    return null;
  }

  // 甄姬 - 洛神
  zhenji(player, trigger, context) {
    if (trigger === 'prepare_phase') {
      return {
        name: '洛神',
        effect: 'judge_loop',
        description: '判定直到出现红色牌，获得所有黑色牌'
      };
    }
    return null;
  }

  // ========== 蜀国球员 ==========

  // 刘备 - 仁德
  liubei(player, trigger, context) {
    if (trigger === 'play_phase') {
      return {
        name: '仁德',
        effect: 'give_cards',
        description: '给出任意张牌，每两张回复1点体能',
        canUse: true
      };
    }
    return null;
  }

  // 关羽 - 武圣
  guanyu(player, trigger, context) {
    if (trigger === 'need_sha') {
      const redCards = player.handCards.filter(c => {
        const suit = SUITS[c.suit];
        return suit && (suit.name === '红桃' || suit.name === '方片');
      });
      if (redCards.length > 0) {
        return {
          name: '武圣',
          effect: 'red_as_sha',
          description: '红色牌可以当投使用',
          cards: redCards
        };
      }
    }
    return null;
  }

  // 张飞 - 咆哮
  zhangfei(player, trigger, context) {
    if (trigger === 'use_sha_limit') {
      return {
        name: '咆哮',
        effect: 'no_sha_limit',
        description: '使用投无次数限制'
      };
    }
    return null;
  }

  // 诸葛亮 - 观星
  zhugeliang(player, trigger, context) {
    if (trigger === 'prepare_phase') {
      return {
        name: '观星',
        effect: 'view_and_rearrange',
        description: '观看牌堆顶X张牌并调整顺序',
        count: this.game.getAlivePlayers().length
      };
    }
    return null;
  }

  // 赵云 - 龙胆
  zhaoyun(player, trigger, context) {
    if (trigger === 'need_sha' && player.hasCard('shan')) {
      return {
        name: '龙胆',
        effect: 'shan_as_sha',
        description: '盖可以当投使用'
      };
    }
    if (trigger === 'need_shan' && player.hasCard('sha')) {
      return {
        name: '龙胆',
        effect: 'sha_as_shan',
        description: '投可以当盖使用'
      };
    }
    return null;
  }

  // 黄忠 - 烈弓
  huangzhong(player, trigger, context) {
    if (trigger === 'use_sha' && context.target) {
      const targetHp = context.target.hp;
      const myHp = player.hp;
      const range = player.getAttackRange();
      
      const effects = [];
      if (targetHp >= myHp) {
        effects.push('cannot_dodge');
      }
      if (targetHp <= range) {
        effects.push('damage_plus_1');
      }
      
      if (effects.length > 0) {
        return {
          name: '烈弓',
          effect: effects,
          description: '目标体能>=你则不可盖避，<=攻击范围则伤害+1'
        };
      }
    }
    return null;
  }

  // ========== 吴国球员 ==========

  // 孙权 - 制衡
  sunquan(player, trigger, context) {
    if (trigger === 'play_phase') {
      return {
        name: '制衡',
        effect: 'discard_and_draw',
        description: '弃置任意张牌，摸等量的牌',
        canUse: true,
        used: false
      };
    }
    return null;
  }

  // 周瑜 - 反间
  zhouyu(player, trigger, context) {
    if (trigger === 'play_phase') {
      return {
        name: '反间',
        effect: 'guess_suit',
        description: '令一名角色猜花色，猜错受1点伤害',
        canUse: true,
        used: false
      };
    }
    return null;
  }

  // 陆逊 - 连营
  luxun(player, trigger, context) {
    if (trigger === 'last_card_lost') {
      return {
        name: '连营',
        effect: 'draw_one',
        description: '失去最后手牌时摸一张牌'
      };
    }
    return null;
  }

  // 黄盖 - 苦肉
  huanggai(player, trigger, context) {
    if (trigger === 'play_phase') {
      return {
        name: '苦肉',
        effect: 'lose_hp_draw',
        description: '失去1点体能，摸两张牌',
        canUse: true
      };
    }
    return null;
  }

  // 大乔 - 国色
  daqiao(player, trigger, context) {
    if (trigger === 'play_phase') {
      const diamondCards = player.handCards.filter(c => c.suit === 'diamond');
      if (diamondCards.length > 0) {
        return {
          name: '国色',
          effect: 'diamond_as_lebu',
          description: '方片牌可以当乐不思蜀使用',
          cards: diamondCards
        };
      }
    }
    return null;
  }

  // 小乔 - 天香
  xiaoqiao(player, trigger, context) {
    if (trigger === 'about_to_damage') {
      const heartCards = player.handCards.filter(c => c.suit === 'heart');
      if (heartCards.length > 0) {
        return {
          name: '天香',
          effect: 'redirect_damage',
          description: '弃置红桃牌转移伤害',
          cards: heartCards
        };
      }
    }
    return null;
  }

  // 甘宁 - 奇袭
  ganning(player, trigger, context) {
    if (trigger === 'play_phase') {
      const blackCards = player.handCards.filter(c => {
        const suit = SUITS[c.suit];
        return suit && (suit.name === '黑佳得乐' || suit.name === '梅花');
      });
      if (blackCards.length > 0) {
        return {
          name: '奇袭',
          effect: 'black_as_guohe',
          description: '黑色牌可以当过河拆桥使用',
          cards: blackCards
        };
      }
    }
    return null;
  }

  // ========== 群雄球员 ==========

  // 吕布 - 无双
  lvbu(player, trigger, context) {
    if (trigger === 'use_sha') {
      return {
        name: '无双',
        effect: 'require_double_shan',
        description: '目标需要两张盖才能抵消'
      };
    }
    if (trigger === 'be_juedou') {
      return {
        name: '无双',
        effect: 'require_double_sha',
        description: '决斗时需要两张投'
      };
    }
    return null;
  }

  // 貂蝉 - 闭月
  diaochan(player, trigger, context) {
    if (trigger === 'end_phase') {
      return {
        name: '闭月',
        effect: 'draw_one',
        description: '结束阶段摸一张牌'
      };
    }
    return null;
  }

  // 华佗 - 急救
  huatuo(player, trigger, context) {
    if (trigger === 'need_tao' && context.isOtherPlayer) {
      const redCards = player.handCards.filter(c => {
        const suit = SUITS[c.suit];
        return suit && (suit.name === '红桃' || suit.name === '方片');
      });
      if (redCards.length > 0) {
        return {
          name: '急救',
          effect: 'red_as_tao',
          description: '红色牌可以当佳得乐使用',
          cards: redCards
        };
      }
    }
    return null;
  }

  // 张角 - 雷击
  zhangjiao(player, trigger, context) {
    if (trigger === 'use_shan') {
      return {
        name: '雷击',
        effect: 'lightning_strike',
        description: '使用盖时可进行判定，黑佳得乐则造成雷电伤害'
      };
    }
    return null;
  }

  // ========== NBA Kill players ==========

  // LeBron James - 全能 / 组织
  lebron_james(player, trigger, context) {
    // 全能：出牌阶段限一次，将一张手牌当投/盖/佳得乐使用
    if (trigger === 'play_phase') {
      return {
        name: '全能',
        effect: 'card_as_basic',
        description: '出牌阶段限一次，将一张手牌当投/盖/佳得乐使用',
        canUse: true,
        used: false,
        targets: ['sha', 'shan', 'tao']
      };
    }
    // 组织：投造成伤害后，令一名其他角色摸一张牌
    if (trigger === 'damaged' && context.source === player && context.card?.key === 'sha') {
      return {
        name: '组织',
        effect: 'ally_draw_one',
        description: '投造成伤害后，令一名其他角色摸一张牌',
        count: 1
      };
    }
    return null;
  }

  // Kobe Bryant - 曼巴 / 绝杀
  kobe_bryant(player, trigger, context) {
    // 曼巴：出牌阶段第一张投被盖抵消后，弃一张牌再对同一目标使用一张投
    if (trigger === 'sha_dodged' && context.target && !context.mambaUsed) {
      return {
        name: '曼巴',
        effect: 'discard_resha',
        description: '弃一张牌后视为再对同一目标使用一张投',
        target: context.target
      };
    }
    // 绝杀：体能为1时，使用投无视距离
    if (trigger === 'use_sha' && player.hp === 1) {
      return {
        name: '绝杀',
        effect: 'no_sha_limit',
        description: '体能为1时，投无视距离'
      };
    }
    return null;
  }

  // Stephen Curry - 射程 / 三分雨
  stephen_curry(player, trigger, context) {
    // 射程：使用投的距离 +1（被动）
    if (trigger === 'calculate_range') {
      return {
        name: '射程',
        effect: 'range_plus_1',
        description: '使用投的距离 +1',
        value: 1
      };
    }
    // 三分雨：出牌阶段限一次，弃两张同花色手牌视为万箭齐发
    if (trigger === 'play_phase') {
      // group hand cards by suit
      const bySuit = {};
      for (const c of player.handCards) {
        bySuit[c.suit] = bySuit[c.suit] || [];
        bySuit[c.suit].push(c);
      }
      const eligibleSuits = Object.keys(bySuit).filter(s => bySuit[s].length >= 2);
      if (eligibleSuits.length > 0) {
        return {
          name: '三分雨',
          effect: 'discard_as_wanjian',
          description: '弃两张同花色手牌视为万箭齐发',
          canUse: true,
          used: false,
          eligibleSuits
        };
      }
    }
    return null;
  }

  // Shaquille O'Neal - 禁区 / 罚球
  shaquille_oneal(player, trigger, context) {
    // 禁区：使用投指定距离为1的角色为目标时，伤害 +1（已直接 bake 进 getShaDamage 引擎层；保留 hook 以备将来再通过 trigger 控制）
    if (trigger === 'calculate_damage' && context.target && context.card?.key === 'sha') {
      const distance = player.getDistanceTo ? player.getDistanceTo(context.target) : 1;
      if (distance === 1) {
        return {
          name: '禁区',
          effect: 'damage_plus_1',
          description: '对距离1目标投伤害+1',
          value: 1
        };
      }
    }
    // 罚球：投造成伤害后，目标可令你弃一张牌防止此伤害
    if (trigger === 'about_to_damage' && context.source === player && context.card?.key === 'sha') {
      return {
        name: '罚球',
        effect: 'force_choice',
        description: '目标可令攻击者弃一张牌防止此伤害',
        choices: ['discard_attacker_card', 'take_damage']
      };
    }
    return null;
  }

  // Tim Duncan - 基本功 / 护框
  tim_duncan(player, trigger, context) {
    // 基本功：受到伤害后摸一张牌
    if (trigger === 'damaged' && context.target === player) {
      return {
        name: '基本功',
        effect: 'draw_one',
        description: '受到伤害后摸一张牌',
        count: 1
      };
    }
    // 护框：每轮限一次，其他角色成为投的目标时，弃一张盖令此投无效
    if (trigger === 'other_targeted_by_sha' && context.target !== player && player.hasCard && player.hasCard('shan')) {
      return {
        name: '护框',
        effect: 'discard_shan_cancel_sha',
        description: '弃一张盖令此投无效',
        oncePerRound: true
      };
    }
    return null;
  }

  // Kevin Durant - 错位 / 干拔
  kevin_durant(player, trigger, context) {
    // 错位：使用投指定目标后，若其手牌数大于你，此投不可被盖响应
    if (trigger === 'use_sha' && context.target) {
      if (context.target.handCards && context.target.handCards.length > player.handCards.length) {
        return {
          name: '错位',
          effect: 'unblockable_sha',
          description: '目标手牌多于你时，此投不可被盖响应'
        };
      }
    }
    // 干拔：出牌阶段限一次，弃一张装备牌视为使用一张无距离限制的投
    if (trigger === 'play_phase') {
      const equipCards = player.equipments ? Object.values(player.equipments).filter(Boolean) : [];
      if (equipCards.length > 0) {
        return {
          name: '干拔',
          effect: 'discard_equip_as_sha',
          description: '弃一张装备牌视为无距离限制的投',
          canUse: true,
          used: false,
          cards: equipCards
        };
      }
    }
    return null;
  }

  // Dwyane Wade - 突破 / 造犯
  dwyane_wade(player, trigger, context) {
    // 突破：使用投造成伤害后，可弃置目标一张牌
    if (trigger === 'damaged' && context.source === player && context.card?.key === 'sha' && context.target) {
      return {
        name: '突破',
        effect: 'discard_target_card',
        description: '投造成伤害后弃置目标一张牌',
        target: context.target,
        count: 1
      };
    }
    // 造犯：成为投的目标后，判定；若为红色，摸一张牌
    if (trigger === 'targeted_by_sha' && context.target === player) {
      const judge = this.game.deck.judge();
      const result = this.game.deck.getJudgeResult(judge);
      if (result.isRed) {
        return {
          name: '造犯',
          effect: 'draw_one',
          description: '判定红色摸一张牌',
          count: 1
        };
      }
    }
    return null;
  }

  // Chris Paul - 控场 / 抢断
  chris_paul(player, trigger, context) {
    // 控场：出牌阶段限一次，将一张手牌交给一名其他角色，然后摸一张牌
    if (trigger === 'play_phase' && player.handCards.length > 0) {
      return {
        name: '控场',
        effect: 'give_one_then_draw',
        description: '出牌阶段限一次，将一张手牌交给一名其他角色，然后摸一张牌',
        canUse: true,
        used: false
      };
    }
    // 抢断：其他角色出牌阶段使用第二张牌时，弃一张牌令其弃一张手牌
    if (trigger === 'other_uses_second_card' && context.source !== player && player.handCards.length > 0) {
      return {
        name: '抢断',
        effect: 'discard_then_force_discard',
        description: '弃一张牌令其弃置一张手牌',
        target: context.source
      };
    }
    return null;
  }

  // James Harden - 造犯 / 后撤步
  james_harden(player, trigger, context) {
    // 造犯：使用投被盖抵消后，令目标选择一项：弃一张牌，或你摸一张牌
    if (trigger === 'sha_dodged' && context.source === player && context.target) {
      return {
        name: '造犯',
        effect: 'force_choice',
        description: '目标选择弃一张牌，或你摸一张牌',
        target: context.target,
        choices: ['discard_1', 'source_draw_1']
      };
    }
    // 后撤步：出牌阶段限一次，弃一张牌令本回合下一张投无距离限制
    if (trigger === 'play_phase' && player.handCards.length > 0) {
      return {
        name: '后撤步',
        effect: 'discard_for_next_no_limit',
        description: '弃一张牌令本回合下一张投无距离限制',
        canUse: true,
        used: false
      };
    }
    return null;
  }

  // Kawhi Leonard - 死亡缠绕 / 沉默
  kawhi_leonard(player, trigger, context) {
    // 死亡缠绕：对一名角色造成伤害后，可弃置其一张牌
    if (trigger === 'damaged' && context.source === player && context.target) {
      return {
        name: '死亡缠绕',
        effect: 'discard_target_card',
        description: '造成伤害后弃置目标一张牌',
        target: context.target,
        count: 1
      };
    }
    // 沉默：每轮限一次，成为锦囊牌目标时弃一张牌取消之
    if (trigger === 'targeted_by_scroll' && context.target === player && player.handCards.length > 0) {
      return {
        name: '沉默',
        effect: 'discard_cancel_scroll',
        description: '弃一张牌取消锦囊牌目标',
        oncePerRound: true
      };
    }
    return null;
  }

  // Kevin Garnett - 怒吼 / 协防
  kevin_garnett(player, trigger, context) {
    // 怒吼：使用盖抵消一张投后，可令攻击者弃一张牌
    if (trigger === 'shan_dodged_sha' && context.defender === player && context.attacker) {
      return {
        name: '怒吼',
        effect: 'force_target_discard',
        description: '令攻击者弃一张牌',
        target: context.attacker,
        count: 1
      };
    }
    // 协防：他人在你攻击范围内受投伤害时，弃一张牌令伤害-1
    if (trigger === 'other_about_to_damage' && context.target !== player && context.card?.key === 'sha') {
      const range = player.getAttackRange ? player.getAttackRange() : 1;
      const distance = player.getDistanceTo ? player.getDistanceTo(context.target) : 99;
      if (distance <= range && player.handCards.length > 0) {
        return {
          name: '协防',
          effect: 'discard_reduce_damage',
          description: '弃一张牌令伤害-1',
          value: -1
        };
      }
    }
    return null;
  }

  // Dwight Howard - 篮板 / 盖帽
  dwight_howard(player, trigger, context) {
    // 篮板：基本牌因弃置进入弃牌堆后，若此牌为本回合第一张，获得之
    if (trigger === 'card_discarded' && context.card && context.isFirstThisTurn) {
      const isBasic = ['sha', 'shan', 'tao'].includes(context.card.name);
      if (isBasic) {
        return {
          name: '篮板',
          effect: 'gain_card',
          description: '获得本回合第一张被弃置的基本牌',
          card: context.card
        };
      }
    }
    // 盖帽：打出盖后摸一张牌
    if (trigger === 'used_shan' && context.source === player) {
      return {
        name: '盖帽',
        effect: 'draw_one',
        description: '打出盖后摸一张牌',
        count: 1
      };
    }
    return null;
  }

  // Ray Allen - 底角 / 绝平
  ray_allen(player, trigger, context) {
    // 底角：本回合未移动装备区牌，使用的第一张投不可被距离>1的角色响应
    if (trigger === 'use_sha' && !player.equipMovedThisTurn && !context.shaUsedThisTurn) {
      return {
        name: '底角',
        effect: 'unblockable_by_distant',
        description: '本回合第一张投不可被距离>1的角色响应'
      };
    }
    // 绝平：濒死被佳得乐救回后，视为使用一张投
    if (trigger === 'saved_by_tao' && context.target === player) {
      return {
        name: '绝平',
        effect: 'virtual_sha',
        description: '视为使用一张投'
      };
    }
    return null;
  }

  // Shane Battier - 站位 / 底角三分
  shane_battier(player, trigger, context) {
    // 站位：黑色手牌当盖使用或打出
    if (trigger === 'need_shan') {
      const blackCards = player.handCards.filter(c => {
        const suit = SUITS[c.suit];
        return suit && (suit.name === '黑佳得乐' || suit.name === '梅花' || suit.name === '黑桃' || suit.name === '草花');
      });
      if (blackCards.length > 0) {
        return {
          name: '站位',
          effect: 'black_as_shan',
          description: '黑色手牌可以当盖使用或打出',
          cards: blackCards
        };
      }
    }
    // 底角三分：回合外打出盖后，令当前回合角色摸一张牌，然后你摸一张牌
    if (trigger === 'used_shan' && context.source === player && context.offTurn) {
      return {
        name: '底角三分',
        effect: 'turn_player_and_self_draw',
        description: '当前回合角色摸一张，然后你摸一张',
        count: 1
      };
    }
    return null;
  }

  // Manu Ginobili - 妖刀 / 奇袭
  manu_ginobili(player, trigger, context) {
    // 妖刀：出牌阶段限一次，弃一张牌摸两张牌，本阶段投上限-1
    if (trigger === 'play_phase' && player.handCards.length > 0) {
      return {
        name: '妖刀',
        effect: 'discard_draw_two_limit',
        description: '弃一张牌摸两张牌，本阶段投上限-1',
        canUse: true,
        used: false,
        drawCount: 2,
        shaLimitDelta: -1
      };
    }
    // 奇袭：使用锦囊牌指定唯一目标后，可令其弃一张牌
    if (trigger === 'used_single_target_scroll' && context.source === player && context.target) {
      return {
        name: '奇袭',
        effect: 'force_target_discard',
        description: '令唯一目标弃一张牌',
        target: context.target,
        count: 1
      };
    }
    return null;
  }

  // Andre Iguodala - FMVP / 协防
  andre_iguodala(player, trigger, context) {
    // FMVP：每轮限一次，体能值不小于你的角色对你使用投时，摸一张牌然后弃一张；若弃的是盖，此投无效
    if (trigger === 'targeted_by_sha' && context.target === player && context.source) {
      if (context.source.hp >= player.hp) {
        return {
          name: 'FMVP',
          effect: 'draw_then_discard_maybe_cancel',
          description: '摸一张弃一张，若弃盖则此投无效',
          oncePerRound: true,
          drawCount: 1,
          cancelOnDiscardShan: true
        };
      }
    }
    // 协防：他人成为投的目标时，若其体能值小于你，可打出一张盖替其响应
    if (trigger === 'other_targeted_by_sha' && context.target !== player) {
      if (context.target && context.target.hp < player.hp && player.hasCard && player.hasCard('shan')) {
        return {
          name: '协防',
          effect: 'shan_for_other',
          description: '替体能较低的他人打出盖响应',
          target: context.target
        };
      }
    }
    return null;
  }
}