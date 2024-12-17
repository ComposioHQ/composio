import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import dts from 'rollup-plugin-dts';
import json from '@rollup/plugin-json'; // Import the @rollup/plugin-json to handle JSON files

const generateBundleAndTypeBundles = (file) => {
  return [{
    input: `src/${file}.ts`,
    output: [
      // CommonJS bundle
      {
        file: `dist/${file}.js`,
        format: 'cjs',
        sourcemap: true
      },
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
      json() // Add the json plugin to handle JSON files
    ],
    external: [
      // List any external dependencies here
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
      sourcemap: true,
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
    ],
    external: [
      // List any external dependencies here
    ]
  },
  ...generateBundleAndTypeBundles('index'),
  ...generateBundleAndTypeBundles('sdk/index'),
];
