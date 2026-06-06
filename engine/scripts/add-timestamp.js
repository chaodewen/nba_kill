/**
 * 给 dist/index.html 中的静态资源加时间戳，避免浏览器缓存。
 *
 * 注意：只改 dist/index.html（构建产物），不动源 engine/index.html。
 * webpack.config.js 里的 CopyIndexPlugin 已经在 afterEmit 把源 index.html 复制到 dist/，
 * 这里再追加 cache-busting 时间戳。源文件保持干净，npm run build 不再污染 git。
 */
const fs = require('fs');
const path = require('path');

const timestamp = Date.now();
const distIndex = path.join(__dirname, '..', 'dist', 'index.html');

if (!fs.existsSync(distIndex)) {
  console.error('❌ dist/index.html 不存在 — 请先跑 webpack 构建');
  process.exit(1);
}

let html = fs.readFileSync(distIndex, 'utf8');
html = html.replace(/game\.bundle\.js(\?v=\d+)?/g, `game.bundle.js?v=${timestamp}`);
fs.writeFileSync(distIndex, html);

console.log(`✅ 已添加时间戳到 dist/index.html: v=${timestamp}`);
