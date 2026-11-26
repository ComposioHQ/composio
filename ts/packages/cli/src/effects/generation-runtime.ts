import { loadInstalledCompanionModule } from 'src/services/run-companion-modules';

// Type-only reference: it leaves no import behind, so the compiler stays out of
// the executable. The module itself is loaded from disk on first use.
export type GenerationRuntime = typeof import('src/services/generation-runtime');

/**
 * The `generation-runtime` companion module (the TypeScript compiler and the
 * `composio run` source rewrites), loaded on demand.
 */
export const loadGenerationRuntime = loadInstalledCompanionModule<GenerationRuntime>(
  'generation-runtime',
  ['extractInlineExecuteToolSlugs', 'wrapFileSourceForRun', 'wrapInlineCodeForRun']
);
