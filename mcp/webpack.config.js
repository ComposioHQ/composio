const path = require('path');
const webpack = require('webpack');
const fs = require('fs');

// Common configuration for both bundles
const commonConfig = {
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
  optimization: {
    minimize: false
  },
  externals: {
    'process/browser': 'commonjs process/browser'
  }
};

// Main CLI bundle
const mainConfig = {
  ...commonConfig,
  entry: './src/cli/index.ts',
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
  ]
};

// Commands bundle for export
const commandsConfig = {
  ...commonConfig,
  entry: './src/cli/commands/index.ts',
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'dist/cli/commands'),
    library: {
      type: 'umd',
      name: 'commands'
    },
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  target: 'node',
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process'
    })
  ]
};

module.exports = [mainConfig, commandsConfig];