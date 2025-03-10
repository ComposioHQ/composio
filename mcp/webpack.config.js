const path = require('path');
const webpack = require('webpack');
const fs = require('fs');

module.exports = {
  entry: './src/cli/index.ts',
  target: 'node',
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.m?js/,
        resolve: {
          fullySpecified: false
        }
      }
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.mjs'],
    fallback: {
      'stream': false,
      'buffer': false,
      'util': false,
      'assert': false,
      'http': false,
      'url': false,
      'https': false,
      'os': false,
      'path': false,
      'process': false,
      'fs': false,
      'crypto': false
    }
  },
  output: {
    filename: 'index',
    path: path.resolve(__dirname, 'dist'),
    clean: {
      keep: /package\.dist\.json/
    },
  },
  plugins: [
    new webpack.BannerPlugin({ 
      banner: '#!/usr/bin/env node\n'+'process.env.YARGS_MIN_NODE_VERSION = "10";\n',
      raw: true
    }),
    new webpack.ProvidePlugin({
      process: 'process'
    }),
    {
      apply: (compiler) => {
        compiler.hooks.afterEmit.tap('CopyPackageJson', () => {
          fs.copyFileSync(
            path.resolve(__dirname, 'package.dist.json'),
            path.resolve(__dirname, 'dist/package.json')
          );
        });
      }
    }
  ],
  optimization: {
    minimize: false
  },
  externals: {
    'process/browser': 'commonjs process/browser'
  }
}; 