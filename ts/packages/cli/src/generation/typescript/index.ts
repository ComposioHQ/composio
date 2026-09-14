/**
 * Entry module for the TypeScript generation pipeline. `composio generate ts`
 * imports it dynamically from inside its handler, because the pipeline pulls in
 * the TypeScript compiler and must stay off every other command's startup path.
 */
export { createToolkitIndex } from 'src/generation/create-toolkit-index';
export { BANNER } from 'src/generation/constants';
export { generateTypeScriptSources } from 'src/generation/typescript/generate';
export { transpileTypeScriptSources } from 'src/generation/typescript/transpile';
