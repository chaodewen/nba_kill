/**
 * 给 dist/*.html 中的静态资源加时间戳，避免浏览器缓存。
 * 只改 dist/*.html（构建产物），不动源 engine/*.html。
 */
const fs = require('fs');
const path = require('path');

const timestamp = Date.now();
const distDir = path.join(__dirname, '..', 'dist');

const targets = [
  { file: 'index.html', bundles: ['game.bundle.js'] },
  { file: 'players.html', bundles: ['players.bundle.js'] },
];

for (const { file, bundles } of targets) {
  const p = path.join(distDir, file);
  if (!fs.existsSync(p)) {
    console.warn(`⚠️ ${file} 不存在，跳过`);
    continue;
  }
  let html = fs.readFileSync(p, 'utf8');
  for (const b of bundles) {
    const re = new RegExp(b.replace('.', '\\.') + '(\\?v=\\d+)?', 'g');
    html = html.replace(re, `${b}?v=${timestamp}`);
  }
  fs.writeFileSync(p, html);
  console.log(`✅ ${file} 加时间戳: v=${timestamp}`);
}
