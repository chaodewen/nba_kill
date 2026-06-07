const path = require('path');
const webpack = require('webpack');
const fs = require('fs');

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
      // index.html
      fs.copyFileSync(
        path.resolve(__dirname, 'index.html'),
        path.resolve(__dirname, 'dist', 'index.html')
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
  entry: './src/main.js',
  output: {
    filename: 'game.bundle.js',
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
      }))
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
