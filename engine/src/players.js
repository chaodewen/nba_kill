// 球员图鉴独立页：列出 16 球员，按位置（后卫 / 锋线 / 内线）分组
// 入口：players.html（独立 webpack bundle，不依赖 main.js）
import { CHARACTERS, POSITIONS, getCharacterAvatar } from './config/characters';

const escape = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function cardHtml(ch) {
  const avatarUrl = getCharacterAvatar(ch);
  const initial = (ch.cnName || ch.name || '?').charAt(0);
  const photoTransform = ch.photoTransform ? `style="transform: ${escape(ch.photoTransform)}"` : '';
  const avatarHtml = avatarUrl
    ? `<img class="roster-avatar" src="${escape(avatarUrl)}" ${photoTransform} alt="${escape(ch.name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><span class="roster-avatar-fallback" style="display:none">${escape(initial)}</span>`
    : `<span class="roster-avatar-fallback">${escape(initial)}</span>`;
  const skillsHtml = (ch.skills || []).map(sk => `
    <div class="roster-skill">
      <div class="roster-skill-name">${escape(sk.name)}</div>
      <div class="roster-skill-desc">${escape(sk.description)}</div>
    </div>`).join('');
  return `
    <div class="roster-card">
      <div class="roster-card-head">
        ${avatarHtml}
        <div style="flex:1;min-width:0;">
          <div class="roster-name">${escape(ch.cnName || ch.name)} <span class="roster-name-en">${escape(ch.name)}</span></div>
          <div class="roster-tag-row">
            ${ch.nickname ? `<span class="roster-tag nick">「${escape(ch.nickname)}」</span>` : ''}
            <span class="roster-tag hp-tag">❤ ${ch.hp}</span>
          </div>
        </div>
      </div>
      ${ch.bio ? `<div class="roster-bio">${escape(ch.bio)}</div>` : ''}
      <div class="roster-skills">${skillsHtml}</div>
    </div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  const body = document.getElementById('roster-page-body');
  if (!body) return;
  const groups = [
    { key: 'guard', title: '后场操盘 · 后卫', icon: '🎯' },
    { key: 'forward', title: '锋线尖刃 · 锋线', icon: '⚡' },
    { key: 'inside', title: '禁区铁壁 · 内线', icon: '🛡️' },
  ];
  body.innerHTML = groups.map(g => {
    const list = CHARACTERS.filter(c => c.position === g.key);
    if (!list.length) return '';
    return `
      <div class="roster-group">
        <div class="roster-group-title pos-${g.key}">${g.icon} ${g.title}（${list.length} 人）</div>
        <div class="roster-group-grid">${list.map(cardHtml).join('')}</div>
      </div>`;
  }).join('');
  // 顶部统计
  const total = document.getElementById('roster-total');
  if (total) total.textContent = `${CHARACTERS.length} 人`;
});
