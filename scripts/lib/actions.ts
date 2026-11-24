import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Cause, Config, Console, Context, Effect, FileSystem, Layer } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';

// Workflow commands treat %, CR, and LF as syntax; see "Workflow commands for GitHub Actions".
const escapeCommand = (text: string) => text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');

/** Writes a warning or error annotation onto the workflow run. */
export const annotate = (level: 'notice' | 'warning' | 'error', message: string) =>
  Console.log(`::${level}::${escapeCommand(message)}`);

/** A step's outputs: `GITHUB_OUTPUT` in a workflow, a map in tests. */
export class StepOutputs extends Context.Service<
  StepOutputs,
  { readonly set: (name: string, value: string) => Effect.Effect<void, Error> }
>()('scripts/StepOutputs') {
  static readonly layer = Layer.effect(
    StepOutputs,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Config.String('GITHUB_OUTPUT');
      return StepOutputs.of({
        // The delimiter form keeps any value, even one with newlines, a single output.
        set: (name, value) => {
          const delimiter = `EOF_${crypto.randomUUID()}`;
          return fs.writeFileString(path, `${name}<<${delimiter}\n${value}\n${delimiter}\n`, { flag: 'a' });
        },
      });
    })
  );

  static readonly memory = (outputs: Map<string, string>) =>
    Layer.succeed(StepOutputs, StepOutputs.of({ set: (name, value) => Effect.sync(() => void outputs.set(name, value)) }));
}

/**
 * Runs a script entry point with Bun platform services and fetch. A failure is annotated on the
 * workflow run, printed in full, and exits non-zero, like a thrown error.
 */
export const runScript = <A, E extends { readonly message: string }>(
  program: Effect.Effect<A, E, BunServices.BunServices | HttpClient.HttpClient>
) =>
  BunRuntime.runMain(
    program.pipe(
      Effect.tapError(error => annotate('error', error.message)),
      Effect.tapCause(cause => Console.error(Cause.pretty(cause))),
      Effect.provide(Layer.mergeAll(BunServices.layer, FetchHttpClient.layer))
    ),
    { disableErrorReporting: true }
  );
