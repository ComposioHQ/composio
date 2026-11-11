/**
 * Journey containers: one CLI container that stays up while a test runs
 * several commands in it, so state written by one command (a login, a linked
 * account, a cache file) is there for the next.
 *
 * `runCmd` gives every command a fresh container, which suits single commands.
 * A journey also differs in what it lets in: nothing from the host. No host
 * `~/.composio` mount and no API key passthrough, so a journey can only reach
 * what its test points it at.
 */

import { $ } from 'bun';
import { writeFile } from 'node:fs/promises';
import { getRepoRoot, resolveCliVersionMetaList } from './config';
import { ensureCliImage } from './image-lifecycle';
import type { E2ETestResult } from './types';

export interface JourneyOptions {
  /** Environment of every command in the journey. */
  env?: Record<string, string>;
  /**
   * Home directory inside the container. It does not exist until the journey
   * starts, so the CLI meets it the way a first run does.
   */
  home?: string;
  /** Short name used in the container name, to tell journeys apart in `docker ps`. */
  label?: string;
}

export interface JourneyExecOptions {
  /** Extra environment for this command only. */
  env?: Record<string, string>;
  /** Text piped to the command's stdin. Without it stdin is `/dev/null`. */
  stdin?: string;
  /** Working directory; defaults to the journey's home. */
  cwd?: string;
  /** Kills the command after this long and reports exit code 124. Defaults to 60 seconds. */
  timeoutSeconds?: number;
  /** Runs the command as this `uid:gid` instead of root, so file permissions apply to it. */
  user?: string;
}

export interface JourneyStep {
  readonly command: string;
  readonly result: E2ETestResult;
  readonly durationMs: number;
}

export interface JourneyContainer {
  readonly name: string;
  readonly home: string;
  /** Runs a POSIX `sh` command line in the container. */
  exec(command: string, options?: JourneyExecOptions): Promise<E2ETestResult>;
  /** Writes a file inside the container, creating its directory. */
  writeFile(path: string, content: string): Promise<void>;
  /** Reads a file from the container; rejects when it does not exist. */
  readFile(path: string): Promise<string>;
  /** Every command run so far, in order. */
  steps(): ReadonlyArray<JourneyStep>;
  /** Writes the steps to a log file on the host, for reading after a failure. */
  writeDebugLog(path: string): Promise<void>;
  /** Removes the container. */
  stop(): Promise<void>;
}

const DEFAULT_HOME = '/home/journey';
const DEFAULT_TIMEOUT_SECONDS = 60;

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

const envArgs = (env: Record<string, string> = {}): string[] =>
  Object.entries(env).flatMap(([name, value]) => ['-e', `${name}=${value}`]);

const formatStep = (step: JourneyStep, index: number): string =>
  [
    `--- Step ${index + 1} ---`,
    `Command: ${step.command}`,
    `Duration: ${(step.durationMs / 1000).toFixed(2)}s`,
    `Exit Code: ${step.result.exitCode}`,
    '',
    '[stdout]',
    step.result.stdout.trim() || '(empty)',
    '',
    '[stderr]',
    step.result.stderr.trim() || '(empty)',
    '',
  ].join('\n');

let imageTagPromise: Promise<string> | undefined;

/** The CLI image of the current checkout, ensured once per test process. */
const currentCliImage = (): Promise<string> => {
  imageTagPromise ??= (() => {
    const [cliVersion] = resolveCliVersionMetaList(['current']);
    return ensureCliImage(cliVersion.value, { repoRoot: getRepoRoot() });
  })();
  return imageTagPromise;
};

/**
 * Starts a container from the CLI image of the current checkout and keeps it
 * running until `stop()`.
 */
export async function startJourneyContainer(
  options: JourneyOptions = {}
): Promise<JourneyContainer> {
  const imageTag = await currentCliImage();
  const home = options.home ?? DEFAULT_HOME;
  const name = `e2e-journey-${options.label ?? 'cli'}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const steps: JourneyStep[] = [];

  const started =
    await $`docker run -d --rm --name ${name} --label composio.e2e=true --label composio.runtime=cli --add-host host.docker.internal:host-gateway -e HOME=${home} ${envArgs(options.env)} --workdir / ${imageTag} sleep infinity`
      .nothrow()
      .quiet();
  if (started.exitCode !== 0) {
    throw new Error(`Failed to start journey container: ${started.stderr.toString().trim()}`);
  }

  const run = async (
    command: string,
    execOptions: JourneyExecOptions = {}
  ): Promise<E2ETestResult> => {
    const timeout = execOptions.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
    // `timeout` lives in the container so the limit also stops the processes
    // the command started; a host-side kill would only end `docker exec`.
    const bounded = `timeout --kill-after=5 ${timeout} sh -c ${shellQuote(command)}`;
    const process = Bun.spawn(
      [
        'docker',
        'exec',
        '-i',
        ...envArgs(execOptions.env),
        ...(execOptions.user ? ['--user', execOptions.user] : []),
        '--workdir',
        execOptions.cwd ?? home,
        name,
        'sh',
        '-c',
        bounded,
      ],
      {
        stdin: new TextEncoder().encode(execOptions.stdin ?? ''),
        stdout: 'pipe',
        stderr: 'pipe',
      }
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ]);
    return { exitCode, stdout, stderr };
  };

  const prepared = await run(`mkdir -p ${shellQuote(home)}`, { cwd: '/' });
  if (prepared.exitCode !== 0) {
    await $`docker rm -f ${name}`.nothrow().quiet();
    throw new Error(`Failed to create journey home ${home}: ${prepared.stderr.trim()}`);
  }

  return {
    name,
    home,
    exec: async (command, execOptions) => {
      const startedAt = Date.now();
      const result = await run(command, execOptions);
      steps.push({ command, result, durationMs: Date.now() - startedAt });
      return result;
    },
    writeFile: async (path, content) => {
      const directory = path.slice(0, Math.max(1, path.lastIndexOf('/')));
      const written = await run(`mkdir -p ${shellQuote(directory)} && cat > ${shellQuote(path)}`, {
        stdin: content,
        cwd: '/',
      });
      if (written.exitCode !== 0) {
        throw new Error(`Failed to write ${path} in ${name}: ${written.stderr.trim()}`);
      }
    },
    readFile: async path => {
      const read = await run(`cat ${shellQuote(path)}`, { cwd: '/' });
      if (read.exitCode !== 0) {
        throw new Error(`Failed to read ${path} in ${name}: ${read.stderr.trim()}`);
      }
      return read.stdout;
    },
    steps: () => [...steps],
    writeDebugLog: async path => {
      await writeFile(
        path,
        [`Journey container: ${name}`, `Image: ${imageTag}`, '', ...steps.map(formatStep)].join(
          '\n'
        ),
        'utf-8'
      );
    },
    stop: async () => {
      await $`docker rm -f ${name}`.nothrow().quiet();
    },
  };
}
