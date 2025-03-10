import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { visualizer } from 'rollup-plugin-visualizer';

const IS_VISUALIZE_BUNDLE = process.env.IS_VISUALIZE_BUNDLE === 'true';

export default {
  input: 'src/cli/index.ts',
  output: {
    file: 'dist/cli/index',
    format: 'cjs',
    sourcemap: false,
    banner: '#!/usr/bin/env node\n' + `process.env.YARGS_MIN_NODE_VERSION = 10`
  },
  plugins: [
    resolve({
      extensions: ['.ts', '.js', '.json', '.node'],
      preferBuiltins: true
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      compilerOptions: { 
        declaration: false,
        module: 'esnext'
      }
    }),
    json(),
    ...(IS_VISUALIZE_BUNDLE ? [visualizer({ filename: 'dist/bundle-analysis.html' })] : [])
  ],
  external: [
    'yargs',
    'fs',
    'os',
    'path',
    '@composiohq/modelcontextprotocol'
  ]
}; 