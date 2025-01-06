import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import dts from 'rollup-plugin-dts';
import json from '@rollup/plugin-json'; // Import the @rollup/plugin-json to handle JSON files
import { visualizer } from 'rollup-plugin-visualizer'; // Import the bundle analyzer plugin

const IS_VISUALIZE_BUNDLE = process.env.IS_VISUALIZE_BUNDLE === 'true';
const generateBundleAndTypeBundles = (file) => {
  return [{
    input: `src/${file}.ts`,
    output: [
      // CommonJS bundle
      {
        file: `dist/${file}.js`,
        format: 'cjs',
        sourcemap: false
      },
    ],
    plugins: [
      // resolve({
      //   extensions: ['.ts', '.js', '.json', '.node',"node_modules"],
      //   resolveOnly: [/node_modules/]
      // }), // Resolve node_modules
      commonjs(), // Convert CommonJS modules to ES6
      typescript({
        tsconfig: './tsconfig.json',
        compilerOptions: { 
          declaration: false, // Handled separately by dts plugin
          module: 'esnext' // Ensure TypeScript produces ES Modules
        }
      }),
      json(), // Add the json plugin to handle JSON files
      ...(IS_VISUALIZE_BUNDLE ? [visualizer({ filename: `dist/${file}-bundle-analysis.html` })] : []) // Add the bundle analyzer plugin
    ],
    external: [
    ]
  },
  // // Type Definitions
  {
    input: `src/${file}.ts`,
    output: { 
      file: `dist/${file}.d.ts`, // Set the output directory for multiple chunks
    },
    plugins: [dts()]
  }]

}
export default [
  {
    input: 'src/cli/index.ts',
    output: {
      file: 'dist/cli/index.js',
      format: 'cjs',
      sourcemap: false,
    },
    plugins: [
      resolve({
        extensions: ['.ts', '.js', '.json', '.node',"node_modules"],
        resolveOnly: [/node_modules/]
      }), // Resolve node_modules
      commonjs(), // Convert CommonJS modules to ES6
      typescript({
        tsconfig: './tsconfig.json',
        compilerOptions: { 
          declaration: false, // Handled separately by dts plugin
          module: 'esnext' // Ensure TypeScript produces ES Modules
        }
      }),
      json() // Add the json plugin to handle JSON files
    ],
    external: [
      // List any external dependencies here
    ]
  },
  ...generateBundleAndTypeBundles('index')
];
