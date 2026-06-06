const path = require('path');
const webpack = require('webpack');
const fs = require('fs');

class CopyIndexPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap('CopyIndexPlugin', () => {
      fs.copyFileSync(
        path.resolve(__dirname, 'index.html'),
        path.resolve(__dirname, 'dist', 'index.html')
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
    new CopyIndexPlugin()
  ],
  devServer: {
    static: {
      directory: __dirname,
    },
    port: 3006,
    hot: true,
    open: false
  },
  resolve: {
    extensions: ['.js']
  }
};
