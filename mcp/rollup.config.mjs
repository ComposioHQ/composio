import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { visualizer } from 'rollup-plugin-visualizer';

const IS_VISUALIZE_BUNDLE = process.env.IS_VISUALIZE_BUNDLE === 'true';

export default {
  input: 'src/cli/index.ts',
  output: {
    file: 'dist/cli/index.js',
    format: 'cjs',
    sourcemap: false,
    banner: '#!/usr/bin/env node'
  },
  plugins: [
    resolve({
      extensions: ['.ts', '.js', '.json', '.node'],
      resolveOnly: [/node_modules/],
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