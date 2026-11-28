// Entry point of the `generation-runtime` companion module: the `composio run`
// source rewrites, which need the TypeScript compiler, bundled into
// `dist/generation-runtime.mjs` next to the executable rather than into the
// executable itself, so that only `composio run` parses the compiler. See
// `RUN_COMPANION_MODULE_BASENAMES`.
//
// The CLI loads this file with `loadInstalledCompanionModule('generation-runtime')`.
// The module keeps its name, which released clients look for in upgrade
// archives; the code generation pipeline is part of the executable
// (`src/generation/pipeline.ts`) and does not use the compiler.
export {
  extractInlineExecuteToolSlugs,
  wrapFileSourceForRun,
  wrapInlineCodeForRun,
} from 'src/commands/run-source-transforms';
