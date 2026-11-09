import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Cause, Console, Data, Effect, FileSystem, Layer, Option, Schema, Stream } from 'effect';
import { Digest } from 'effect/crypto';
import { FetchHttpClient } from 'effect/http';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** An SDK release invariant that does not hold. */
export class ReleaseError extends Data.TaggedError('ReleaseError')<{ readonly message: string }> {}

export const fail = (message: string) => Effect.fail(new ReleaseError({ message }));
export const ensure = (condition: boolean, message: string) =>
  condition ? Effect.void : fail(message);

/** A failure raised by a Promise-based library such as Changesets. */
export class LibraryError extends Data.TaggedError('LibraryError')<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export const fromPromise = <A>(evaluate: () => PromiseLike<A>) =>
  Effect.tryPromise({
    try: evaluate,
    catch: cause =>
      new LibraryError({
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
  });

export class CommandError extends Data.TaggedError('CommandError')<{
  readonly message: string;
  readonly exitCode: number;
}> {}

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CommandOptions {
  readonly cwd?: string;
  readonly env?: Record<string, string | undefined>;
  readonly output?: 'pipe' | 'inherit';
}

/** Commands that build or inspect untrusted release inputs never receive controller tokens. */
export const withoutReleaseTokens = {
  SDK_RELEASE_TOKEN: undefined,
  GH_TOKEN: undefined,
  GITHUB_TOKEN: undefined,
} as const;

const text = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  stream.pipe(Stream.decodeText(), Stream.mkString);

/** Runs a command to completion and reports its exit code without failing on it. */
export const spawn = (command: string, args: ReadonlyArray<string>, options: CommandOptions = {}) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const output = options.output ?? 'pipe';
      const handle = yield* spawner.spawn(
        ChildProcess.make(command, args, {
          cwd: options.cwd,
          env: options.env,
          extendEnv: true,
          stdin: 'ignore',
          stdout: output,
          stderr: output,
        })
      );
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [text(handle.stdout), text(handle.stderr), handle.exitCode],
        { concurrency: 'unbounded' }
      );
      return { exitCode: Number(exitCode), stdout, stderr } satisfies CommandResult;
    })
  );

/** Runs a command and returns stdout, failing with its output when it exits non-zero. */
export const run = (command: string, args: ReadonlyArray<string>, options: CommandOptions = {}) =>
  spawn(command, args, options).pipe(
    Effect.flatMap(result =>
      result.exitCode === 0
        ? Effect.succeed(result.stdout)
        : Effect.fail(
            new CommandError({
              message: `${command} failed: ${result.stderr || result.stdout || result.exitCode}`,
              exitCode: result.exitCode,
            })
          )
    )
  );

export const inDirectory =
  (cwd: string, extraEnv: Record<string, string> = {}) =>
  (command: string, args: ReadonlyArray<string>) =>
    run(command, args, { cwd, env: { ...withoutReleaseTokens, ...extraEnv } });

/** Reads a file as text; fails when it does not exist (see `readOptionalFile`). */
export const readFile = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(path);
  });

export const readOptionalFile = (path: string) =>
  readFile(path).pipe(
    Effect.map(Option.some),
    Effect.catchReason('PlatformError', 'NotFound', () => Effect.succeedNone)
  );

export const writeFile = (path: string, contents: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(path, contents);
  });

export const appendFile = (path: string, text: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(path, text, { flag: 'a' });
  });

export const parseJson = <S extends Schema.Top>(schema: S, contents: string) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(contents);

export const readJson = <S extends Schema.Top>(schema: S, path: string) =>
  readFile(path).pipe(Effect.flatMap(contents => parseJson(schema, contents)));

export const sameJson = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

export const formatJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export const writeJson = (path: string, value: unknown) => writeFile(path, formatJson(value));

export const sha256Hex = (bytes: Uint8Array | string) =>
  Effect.gen(function* () {
    const digest = yield* Digest.Digest;
    return yield* digest.digestHex(
      Digest.sha256,
      typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
    );
  });

export const ReleaseServices = Layer.mergeAll(
  BunServices.layer,
  FetchHttpClient.layer,
  Digest.layerWebCrypto
);

export type ReleaseServices = Layer.Success<typeof ReleaseServices>;

/** Runs a release entry point; failures go to stderr and exit non-zero, like a thrown error. */
export const runMain = <A, E>(program: Effect.Effect<A, E, ReleaseServices>) =>
  BunRuntime.runMain(
    program.pipe(
      Effect.tapCause(cause => Console.error(Cause.pretty(cause))),
      Effect.provide(ReleaseServices)
    ),
    { disableErrorReporting: true }
  );
