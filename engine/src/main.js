import { Game } from './core/Game';

const game = new Game();
window.game = game;

// 屏幕中央 toast — voice 加载状态等关键反馈（用户不开 dev tools 也能看）
function showToast(message, type = 'info', duration = 4000) {
  const t = document.createElement('div');
  t.className = `nba-toast nba-toast-${type}`;
  t.textContent = message;
  Object.assign(t.style, {
    position: 'fixed',
    top: '12vh',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '10px 18px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '600',
    zIndex: '9999',
    background: type === 'ok' ? 'rgba(46, 204, 113, 0.95)'
              : type === 'warn' ? 'rgba(231, 76, 60, 0.95)'
              : 'rgba(52, 152, 219, 0.95)',
    color: '#fff',
    boxShadow: '0 4px 18px rgba(0, 0, 0, 0.5)',
    maxWidth: '90vw',
    textAlign: 'center',
    lineHeight: '1.4',
    whiteSpace: 'pre-line',
    transition: 'opacity 0.3s',
  });
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, duration);
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('NBA Kill engine');
  game.init();
  // 监听 voice 加载状态，屏幕浮窗反馈
  window.addEventListener('nba-voice-status', (ev) => {
    const s = ev.detail || {};
    if (s.ok) {
      showToast(`🎙️ 杨毅风男声 mp3 已加载（${s.count} 句）`, 'ok', 3500);
    } else {
      showToast(`⚠️ 男声 mp3 没加载到，会用系统女声替代\n${s.message || '未知错误'}`, 'warn', 6000);
    }
  });
  // URL ?room=ABC123 自动弹联机加入
  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  if (room) {
    setTimeout(() => {
      game.showMultiplayerModal();
      game.mpShowJoinForm();
    }, 600);
  }
  // 任何用户手势后解锁 AudioContext（浏览器自动播放策略要求）
  const unlock = () => {
    game.fx?.unlock?.();
    document.removeEventListener('click', unlock, true);
    document.removeEventListener('keydown', unlock, true);
  };
  document.addEventListener('click', unlock, true);
  document.addEventListener('keydown', unlock, true);
});
