import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import dts from 'rollup-plugin-dts';
import json from '@rollup/plugin-json'; // Import the @rollup/plugin-json to handle JSON files

export default [
  {
    input: 'src/cli/index.ts',
    output: {
      file: 'dist/cli/index.js',
      format: 'esm'
    },
    plugins: [
      resolve(), // Resolve node_modules
      commonjs(), // Convert CommonJS modules to ES6
      typescript({
        tsconfig: './tsconfig.json',
        compilerOptions: { 
          declaration: false, // Handled separately by dts plugin
          module: 'esnext' // Ensure TypeScript produces ES Modules
        }
      }),
      json() // Add the json plugin to handle JSON files
    ]
  },
  // JavaScript Bundles
  {
    input: 'src/index.ts',
    output: [
      // CommonJS bundle
      {
        file: `dist/index.js`,
        format: 'cjs',
        sourcemap: true
      }
    ],
    plugins: [
      resolve(), // Resolve node_modules
      commonjs(), // Convert CommonJS modules to ES6
       typescript({
        tsconfig: './tsconfig.json',
        compilerOptions: { 
          declaration: false, // Handled separately by dts plugin
          module: 'esnext' // Ensure TypeScript produces ES Modules
        }
      }),
      json()
    ],
    external: [
      // List any external dependencies here
    ]
  },
  // // Type Definitions
  {
    input: 'src/index.ts',
    output: { 
      file: 'dist/index.d.ts', // Set the output directory for multiple chunks
      format: 'esm' 
    },
    plugins: [dts()]
  }
];
