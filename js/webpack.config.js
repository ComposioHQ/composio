/**
 * Webpack configuration file for bundling src/index.ts as a library
 * that works in CommonJS, ESM, and TypeScript environments.
 */

const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  entry: './src/index.ts',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    library: {
      name: 'Composio',
      type: 'umd',
    },
    globalObject: 'this'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  plugins: [
    new CleanWebpackPlugin(),
    new ForkTsCheckerWebpackPlugin({
      async: false,
      typescript: {
        configFile: path.resolve(__dirname, 'tsconfig.json'),
      },
    })
  ],
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()],
  },
  devtool: 'source-map',
  mode: 'production'
};
