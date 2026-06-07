const path = require('path');
const webpack = require('webpack');
const fs = require('fs');
const { execSync } = require('child_process');

// 版本号：基于 git commit 总数（递增唯一）+ short sha，跟 commit 一一对应
// 例：v0.3.184 · a3f4ebe — 这个 sha 在 commit message 里也能看到
function getBuildVersion() {
  try {
    const count = execSync('git rev-list --count HEAD', { cwd: __dirname }).toString().trim();
    const sha = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim();
    return { version: `v0.3.${count}`, sha, count: parseInt(count, 10) };
  } catch (e) {
    return { version: 'v0.0.0-dev', sha: 'unknown', count: 0 };
  }
}

const BUILD_VERSION = getBuildVersion();
console.log(`📦 Build version: ${BUILD_VERSION.version} · ${BUILD_VERSION.sha}`);

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

class CopyStaticPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap('CopyStaticPlugin', () => {
      // index.html — 主页（游戏入口）
      fs.copyFileSync(
        path.resolve(__dirname, 'index.html'),
        path.resolve(__dirname, 'dist', 'index.html')
      );
      // players.html — 球员图鉴独立页（新 tab 打开）
      fs.copyFileSync(
        path.resolve(__dirname, 'players.html'),
        path.resolve(__dirname, 'dist', 'players.html')
      );
      // voice/ — Edge TTS 预生成的 mp3 包（杨毅风男声）
      copyDirSync(
        path.resolve(__dirname, 'voice'),
        path.resolve(__dirname, 'dist', 'voice')
      );
    });
  }
}

module.exports = {
  entry: {
    main: './src/main.js',          // 主页 game.bundle.js
    players: './src/players.js',    // 球员图鉴 players.bundle.js
  },
  output: {
    filename: (pathData) => pathData.chunk.name === 'main' ? 'game.bundle.js' : '[name].bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true
  },
  plugins: [
    new webpack.DefinePlugin({
      BUILD_TIME: JSON.stringify(new Date().toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })),
      BUILD_VERSION: JSON.stringify(BUILD_VERSION.version),
      BUILD_SHA: JSON.stringify(BUILD_VERSION.sha),
    }),
    new CopyStaticPlugin()
  ],
  devServer: {
    static: {
      directory: __dirname,
    },
    host: '0.0.0.0',
    port: 3006,
    allowedHosts: 'all',
    hot: true,
    open: false
  },
  resolve: {
    extensions: ['.js']
  }
};
