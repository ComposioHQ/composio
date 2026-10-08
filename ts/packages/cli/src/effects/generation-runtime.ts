import { Effect } from 'effect';
import { rehydrateGenerationError, type GenerationError } from 'src/generation/errors';
import { loadInstalledCompanionModule } from 'src/services/run-companion-modules';
import type { GenerationOutcome } from 'src/services/generation-runtime';

// Type-only reference: it leaves no import behind, so the compiler stays out of
// the executable. The module itself is loaded from disk on first use.
export type GenerationRuntime = typeof import('src/services/generation-runtime');

/**
 * The `generation-runtime` companion module (TypeScript compiler, generation
 * pipeline, `composio run` source rewrites), loaded on demand. See
 * `src/services/generation-runtime.ts` for why its API is Effect-free.
 */
export const loadGenerationRuntime = loadInstalledCompanionModule<GenerationRuntime>(
  'generation-runtime',
  [
    'BANNER',
    'createToolkitIndex',
    'extractInlineExecuteToolSlugs',
    'wrapFileSourceForRun',
    'wrapInlineCodeForRun',
    'generateTypeScriptSourceFiles',
    'transpileTypeScriptSourceFiles',
    'generatePythonSourceFiles',
  ]
);

/**
 * Lifts a companion-module outcome into the CLI's runtime: successes succeed,
 * failures fail with the CLI's own instance of the error, and a rejected promise
 * (a defect inside the pipeline) stays a defect.
 */
export const generationOutcome = <A>(
  run: () => Promise<GenerationOutcome<A>>
): Effect.Effect<A, GenerationError> =>
  Effect.promise(run).pipe(
    Effect.flatMap(outcome =>
      outcome._tag === 'Success'
        ? Effect.succeed(outcome.value)
        : Effect.fail(rehydrateGenerationError(outcome.error))
    )
  );
