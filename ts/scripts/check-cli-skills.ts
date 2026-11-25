#!/usr/bin/env bun
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Data, Effect, Runtime } from 'effect';
import { Command, Flag } from 'effect/cli';

const root = path.resolve(import.meta.dir, '../..');
const references = [
  '.agents/skills/effect-v4/references/cli-surface.md',
  '.agents/skills/cli-command/references/command-example.md',
];

/** Linked excerpts must still occur in the source that the compiler and behavior tests exercise. */
export const checkLinkedExamples = (
  markdown: string,
  readSource: (file: string) => string
): number => {
  const blocks = [
    ...markdown.matchAll(/^```(?:ts|typescript) no-check repo-file=(\S+)\n([\s\S]*?)^```/gm),
  ];
  if (blocks.length === 0) throw new Error('Expected at least one repo-linked TypeScript example');
  for (const [, file, code] of blocks) {
    if (!file || path.isAbsolute(file) || file.split('/').includes('..')) {
      throw new Error(`Invalid example source path: ${file}`);
    }
    const normalize = (text: string) =>
      text
        .split('\n')
        .map(line => line.trim())
        .join('\n')
        .trim();
    if (!code?.trim()) throw new Error(`Empty example from ${file}`);
    if (!normalize(readSource(file)).includes(normalize(code))) {
      throw new Error(`Example differs from ${file}`);
    }
  }
  return blocks.length;
};

export type ShellCommand = readonly string[];

const cliContractTests = [
  'test/skills/command-example.test.ts',
  'test/src/commands/registration.test.ts',
  'test/src/commands/surface.test.ts',
  'test/src/commands/surface.acting-user.test.ts',
  'test/src/invocation/invocation.test.ts',
  'test/src/invocation/command-identity.test.ts',
  'test/src/services/composio-client-singleton.test.ts',
  'test/src/services/terminal-ui.test.ts',
  'test/src/run-main.test.ts',
  'test/src/services/shutdown-signal.test.ts',
  'test/src/commands/triggers/sink-failures.test.ts',
  'test/src/commands/listen/listen.cmd.test.ts',
  'test/src/commands/triggers/triggers.listen.cmd.test.ts',
];

/**
 * Commands that certify the CLI skills after the linked excerpts match.
 * `excerptsOnly` skips the CLI package typecheck and contract tests.
 * Effect diagnostics (`pnpm --filter @composio/cli run lint:effect`) are
 * owned by `ts.typecheck.yml`, so neither mode runs them.
 */
export const cliSkillCommands = ({ excerptsOnly }: { excerptsOnly: boolean }): ShellCommand[] => {
  const standaloneExamples: ShellCommand = [
    'node',
    '.agents/skills/effect-v4/scripts/check-examples.mjs',
  ];
  if (excerptsOnly) return [standaloneExamples];
  return [
    standaloneExamples,
    ['pnpm', 'exec', 'turbo', 'run', 'typecheck', '--filter=@composio/cli'],
    ['pnpm', '--filter', '@composio/cli', 'exec', 'vitest', 'run', ...cliContractTests],
  ];
};

/** Runs commands in order and returns the first failing exit code, or 0. */
export const runCommands = (
  commands: readonly ShellCommand[],
  spawn: (command: ShellCommand) => number | null
): number => {
  for (const command of commands) {
    const exitCode = spawn(command);
    if (exitCode !== 0) return exitCode || 1;
  }
  return 0;
};

export class CommandFailedError extends Data.TaggedError('CommandFailedError')<{
  readonly exitCode: number;
}> {
  readonly [Runtime.errorReported] = false;
  get [Runtime.errorExitCode](): number {
    return this.exitCode;
  }
}

const checkRepoExcerpts = (): number => {
  let count = 0;
  for (const file of references) {
    count += checkLinkedExamples(readFileSync(path.join(root, file), 'utf8'), source =>
      readFileSync(path.join(root, source), 'utf8')
    );
  }
  return count;
};

const spawnInRoot = (command: ShellCommand): number | null => {
  console.log(`Checking: ${command.join(' ')}`);
  return Bun.spawnSync([...command], { cwd: root, stdout: 'inherit', stderr: 'inherit' }).exitCode;
};

const excerptsOnlyFlag = Flag.Boolean('excerpts-only').pipe(
  Flag.withDescription(
    'Only check linked excerpts and standalone Effect examples, skipping CLI package typecheck and contract tests.'
  ),
  Flag.withDefault(false)
);

export interface CheckCliSkillsDeps {
  readonly checkExcerpts?: () => number;
  readonly spawn?: (command: ShellCommand) => number | null;
}

export const makeCheckCliSkillsCommand = (deps: CheckCliSkillsDeps = {}) => {
  const checkExcerpts = deps.checkExcerpts ?? checkRepoExcerpts;
  const spawn = deps.spawn ?? spawnInRoot;

  return Command.make('check-cli-skills', { excerptsOnly: excerptsOnlyFlag }, ({ excerptsOnly }) =>
    Effect.gen(function* () {
      const count = yield* Effect.try({
        try: () => checkExcerpts(),
        catch: error => (error instanceof Error ? error : new Error(String(error))),
      });
      yield* Console.log(`${count} CLI skill excerpts match repo source`);
      const exitCode = runCommands(cliSkillCommands({ excerptsOnly }), spawn);
      if (exitCode !== 0) {
        return yield* Effect.fail(new CommandFailedError({ exitCode }));
      }
      yield* Console.log(
        excerptsOnly
          ? 'CLI skill excerpts and standalone Effect examples verified. CLI package contracts skipped (--excerpts-only).'
          : 'CLI skill examples compile and satisfy the selected invocation contracts. Agent task performance is not measured.'
      );
    })
  ).pipe(
    Command.withDescription(
      'Certify CLI skill linked excerpts, standalone Effect examples, and selected CLI invocation contracts.'
    )
  );
};

export const checkCliSkillsCommand = makeCheckCliSkillsCommand();

if (import.meta.main) {
  Command.run(checkCliSkillsCommand, { version: '0.0.0' }).pipe(
    Effect.provide(BunServices.layer),
    BunRuntime.runMain
  );
}
