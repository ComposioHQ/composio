/**
 * Profile-guided bytecode layout for the compiled CLI (`bun build --bytecode-order`).
 *
 * Every release compile uses `--bytecode`, so JavaScriptCore's parsing and bytecode
 * generation happen at build time instead of on every start. Before that compile, the
 * build compiles a bytecode executable for the host, runs it through
 * `BYTECODE_ORDER_SCENARIOS` with `BUN_BYTECODE_ORDER_OUT` set, and passes the
 * recorded profiles to the release compile. Bun then places the bytecode those runs used
 * at the front of the payload, so a start reads and decodes less of the executable.
 *
 * A profile only changes where bytecode is placed: it names functions by a hash of their
 * syntax, Bun ignores entries that match nothing in the build, and one profile serves
 * every `--target`. That is why the host recording also lays out cross-compiled
 * binaries. Each profile is recorded by the same Bun that compiles with it, because the
 * profile format is tied to the Bun version.
 */

import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import * as path from 'node:path';
import process from 'node:process';
import { Console, Effect } from 'effect';
import { ChildProcess as Command } from 'effect/process';
import { BinaryBuildError } from './build-error';

/**
 * The invocations the layout is trained on, most common first: Bun gives the first
 * profile's functions the front of the payload. They need no network or login, so the
 * recording is the same on every build host.
 */
export const BYTECODE_ORDER_SCENARIOS: ReadonlyArray<ReadonlyArray<string>> = [
  ['--help'],
  ['--version'],
  ['execute', '--help'],
  ['search', '--help'],
  ['link', '--help'],
  ['run', '--help'],
  ['tools', '--help'],
];

const ORDER_ROOT = path.join('dist', 'bytecode-order');

const hostExecutableName = (name: string): string =>
  process.platform === 'win32' ? `${name}.exe` : name;

const scenarioName = (args: ReadonlyArray<string>): string =>
  args.map(arg => arg.replace(/^-+/, '').replace(/[^\w-]+/g, '')).join('-');

/**
 * Counts the functions a recorded profile says the run decoded (`F` lines after the
 * `v2` header). An executable without bytecode writes the header alone, so zero means
 * the profile is useless and the build is not what it claims to be.
 */
export const countRecordedFunctions = (profile: string): number => {
  const [header, ...lines] = profile.split('\n');
  if (header?.trim() !== 'v2') return 0;
  return lines.filter(line => line.startsWith('F ')).length;
};

const runScenario = (
  executable: string,
  args: ReadonlyArray<string>,
  profilePath: string,
  home: string
) =>
  Effect.gen(function* () {
    const child = yield* Command.make(executable, args, {
      extendEnv: true,
      env: {
        BUN_BYTECODE_ORDER_OUT: profilePath,
        // An empty value masks an inherited BUN_BE_BUN (a build started from a
        // `composio run` script), which would make the executable act as Bun itself.
        BUN_BE_BUN: '',
        BUN_OPTIONS: '',
        COMPOSIO_CACHE_DIR: path.join(home, '.composio'),
        COMPOSIO_DISABLE_TELEMETRY: '1',
        HOME: home,
        USERPROFILE: home,
      },
      stdout: 'ignore',
      stderr: 'inherit',
    });
    const exitCode = yield* child.exitCode;
    if (exitCode !== 0) {
      return yield* new BinaryBuildError({
        message: `Bytecode profile run \`composio ${args.join(' ')}\` exited with ${exitCode}`,
        exitCode,
      });
    }

    const profile = yield* Effect.tryPromise(() => readFile(profilePath, 'utf8'));
    const functions = countRecordedFunctions(profile);
    if (functions === 0) {
      return yield* new BinaryBuildError({
        message: `Bytecode profile run \`composio ${args.join(' ')}\` recorded no functions in ${profilePath}`,
        exitCode: 1,
      });
    }
    yield* Console.log(`Recorded ${functions} functions for \`composio ${args.join(' ')}\``);
  });

/**
 * Compiles a bytecode executable for the host, runs every scenario on it, and returns
 * the recorded profiles for `--bytecode-order`, most common first. Fails on any
 * scenario that exits non-zero or records nothing, rather than building without a
 * profile.
 *
 * Each call works in a directory of its own under `ORDER_ROOT`, removed when the
 * caller's scope closes, so overlapping builds in one checkout never share or delete
 * each other's profiles. The returned paths are relative to the package: Bun splits
 * `--bytecode-order` at every comma, and a relative path keeps the checkout's own
 * location out of the argument.
 */
export const recordBytecodeOrder = <E, R>(
  compile: (outfile: string) => Effect.Effect<unknown, E, R>
) =>
  Effect.gen(function* () {
    const workDir = yield* Effect.acquireRelease(
      Effect.tryPromise(async () => {
        await mkdir(ORDER_ROOT, { recursive: true });
        return mkdtemp(path.join(ORDER_ROOT, 'run-'));
      }),
      dir => Effect.promise(() => rm(dir, { force: true, recursive: true }))
    );
    const home = path.join(workDir, 'home');
    yield* Effect.tryPromise(() => mkdir(home, { recursive: true }));

    const executable = path.resolve(workDir, hostExecutableName('composio-profile'));
    yield* Console.log(`Compiling the bytecode profile executable ${executable}...`);
    yield* compile(executable);

    const profiles: string[] = [];
    for (const args of BYTECODE_ORDER_SCENARIOS) {
      const profile = path.join(workDir, `${scenarioName(args)}.order`);
      yield* runScenario(executable, args, path.resolve(profile), path.resolve(home));
      profiles.push(profile);
    }
    return profiles;
  });
