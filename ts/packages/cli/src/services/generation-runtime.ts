// Entry point of the `generation-runtime` companion module: everything in the
// CLI that needs the TypeScript compiler, bundled into `dist/generation-runtime.mjs`
// next to the executable rather than into the executable itself. The compiler is
// ~3.7MB of minified JavaScript that every invocation used to parse at startup
// (about 74ms on the pinned toolchain) even though only `composio generate` and
// `composio run` call it. See `RUN_COMPANION_MODULE_BASENAMES`.
//
// The CLI loads this file with `loadInstalledCompanionModule('generation-runtime')`.
// Because the bundle carries its own copy of `effect`, nothing Effect-shaped may
// cross the boundary: a fiber cannot run primitives built by another copy of the
// runtime. So this module exposes plain functions and promises, runs the Effect
// pipelines on its own runtime, and reports failures as values that
// `rehydrateGenerationError` turns back into the CLI's error classes. Results
// stay object references (same process), no serialization happens.
import * as BunPath from '@effect/platform-bun/BunPath';
import type * as Path from 'effect/Path';
import { Effect, Result } from 'effect';
import type { ToolkitIndex } from 'src/generation/create-toolkit-index';
import type { GenerationError } from 'src/generation/errors';
import { generatePythonSources } from 'src/generation/python/generate';
import type { SourceFile } from 'src/generation/types';
import { generateTypeScriptSources } from 'src/generation/typescript/generate';
import { transpileTypeScriptSources } from 'src/generation/typescript/transpile';

export { BANNER } from 'src/generation/constants';
export { createToolkitIndex } from 'src/generation/create-toolkit-index';
export type { ToolkitIndex } from 'src/generation/create-toolkit-index';
export {
  extractInlineExecuteToolSlugs,
  wrapFileSourceForRun,
  wrapInlineCodeForRun,
} from 'src/commands/run-source-transforms';

/** Outcome of a generation step, as a value the CLI's own runtime can consume. */
export type GenerationOutcome<A> =
  | { readonly _tag: 'Success'; readonly value: A }
  | { readonly _tag: 'Failure'; readonly error: GenerationError };

// Failures become `GenerationOutcome`; a defect (an unexpected throw inside the
// pipeline) still rejects the promise, so the CLI treats it as a defect too.
const runOutcome = <A, E extends GenerationError>(
  effect: Effect.Effect<A, E, Path.Path>
): Promise<GenerationOutcome<A>> =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(BunPath.layer),
      Effect.result,
      Effect.map((result): GenerationOutcome<A> =>
        Result.isSuccess(result)
          ? { _tag: 'Success', value: result.success }
          : { _tag: 'Failure', error: result.failure }
      )
    )
  );

export type GenerateTypeScriptSourcesParams = Parameters<typeof generateTypeScriptSources>[0];
export type TranspileTypeScriptSourcesParams = Parameters<typeof transpileTypeScriptSources>[0];
export type GeneratePythonSourcesParams = Parameters<typeof generatePythonSources>[0];

export const generateTypeScriptSourceFiles = (
  params: GenerateTypeScriptSourcesParams,
  index: ToolkitIndex
): Promise<GenerationOutcome<Array<SourceFile>>> =>
  runOutcome(generateTypeScriptSources(params)(index));

export const transpileTypeScriptSourceFiles = (
  params: TranspileTypeScriptSourcesParams
): Promise<GenerationOutcome<void>> => runOutcome(transpileTypeScriptSources(params));

export const generatePythonSourceFiles = (
  params: GeneratePythonSourcesParams,
  index: ToolkitIndex
): Promise<GenerationOutcome<Array<SourceFile>>> =>
  runOutcome(generatePythonSources(params)(index));
