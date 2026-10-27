import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { buildRootCommand } from 'src/commands';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { exitCodeOf } from 'test/__utils__/exit-code';

const capture = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const exitCode = exitCodeOf(yield* Effect.exit(cli(args)));
    const stdout = (yield* MockConsole.getLines({ stripAnsi: true, stream: 'stdout' })).join('\n');
    const stderr = (yield* MockConsole.getLines({ stripAnsi: true, stream: 'stderr' })).join('\n');
    return { exitCode, stdout, stderr };
  }).pipe(Effect.provide(TestLive()));

const commandPaths = (
  command: ReturnType<typeof buildRootCommand> | import('effect/cli').Command.Command.Any,
  prefix: ReadonlyArray<string> = []
): ReadonlyArray<ReadonlyArray<string>> =>
  command.subcommands
    .flatMap(group => group.commands)
    .filter(child => child.name !== 'help' && !child.unlisted)
    .flatMap(child => {
      const path = [...prefix, child.name];
      return [path, ...commandPaths(child, path)];
    });

// Experimental commands in the test config must be enabled independently of the graph.
const visibleCommandPaths = commandPaths(
  buildRootCommand({ isDevModeEnabled: true, isExperimentalFeatureEnabled: () => true })
)
  .filter(path => path[0] !== 'listen')
  .map(path => ({ path, command: path.join(' ') }));

describe('framework command help', () => {
  layer(TestLive())(it => {
    it.effect.each(visibleCommandPaths)(
      'renders $command from the same definitions used by parsing',
      ({ path }) =>
        Effect.gen(function* () {
          const flag = yield* capture([...path, '--help']);
          const alias = yield* capture(['help', ...path]);
          expect(flag.exitCode).toBe(0);
          expect(alias.exitCode).toBe(0);
          expect(alias.stdout).toBe(flag.stdout);
          expect(flag.stdout).toContain('USAGE');
          expect(flag.stderr).toBe('');
          expect(alias.stderr).toBe('');
        })
    );

    it.effect('includes flags previously missing from the hand-written pages', () =>
      Effect.gen(function* () {
        expect((yield* capture(['version', '--help'])).stdout).toContain('--check');
        const run = yield* capture(['run', '--help']);
        expect(run.stdout).toContain('--skip-checks');
        expect(run.stdout).not.toContain('--logs-off');
        expect(run.stdout).not.toContain('--perf-debug');
      })
    );

    it.effect.each([
      { args: ['help', 'frobnicate'] },
      { args: ['help', 'orgz'] },
      { args: ['tools', 'frobnicate'] },
    ])('keeps errors for $args on stderr with a failing exit code', ({ args }) =>
      Effect.gen(function* () {
        const output = yield* capture(args);
        expect(output.exitCode).toBe(1);
        expect(output.stdout).toBe('');
        expect(output.stderr).toContain('Unknown subcommand');
      })
    );

    it.effect('suggests the closest subcommand on stderr', () =>
      Effect.gen(function* () {
        expect((yield* capture(['help', 'orgz'])).stderr).toContain('Did you mean');
      })
    );

    it.effect.each([
      { args: [] },
      { args: ['help'] },
      { args: ['help', '--help'] },
      { args: ['--help'] },
      { args: ['-h'] },
    ])('supports bare help, help aliases, and redundant help flags: $args', ({ args }) =>
      Effect.gen(function* () {
        const output = yield* capture(args);
        expect(output.exitCode).toBe(0);
        expect(output.stdout).toContain('Documentation:');
        expect(output.stderr).toBe('');
      })
    );

    it.effect.each([
      { path: ['login'], flag: '--agent' },
      { path: ['search'], flag: '--json' },
      { path: ['dev', 'connected-accounts', 'link'], flag: '--auth-config' },
      { path: ['dev', 'connected-accounts', 'link'], flag: '--user-id' },
      { path: ['dev', 'triggers', 'listen'], flag: '--user-id' },
      { path: ['dev', 'triggers', 'listen'], flag: '--forward' },
      { path: ['dev', 'triggers', 'listen'], flag: '--max-events' },
      { path: ['dev', 'triggers', 'disable'], flag: '--dangerously-allow' },
    ])('documents $flag on the previously unreachable $path page', ({ path, flag }) =>
      Effect.gen(function* () {
        const output = yield* capture([...path, '--help']);
        expect(output.exitCode).toBe(0);
        expect(output.stdout).toContain(flag);
      })
    );

    it.effect('documents the previously unreachable dev projects switch page', () =>
      Effect.gen(function* () {
        const projectSwitch = yield* capture(['dev', 'projects', 'switch', '--help']);
        expect(projectSwitch.stdout).toContain('composio dev projects switch');
        expect(projectSwitch.stdout).toContain('Switch the developer project');
      })
    );

    it.effect('keeps hidden commands and flags off the root help page', () =>
      Effect.gen(function* () {
        const root = yield* capture(['--help']);
        expect(root.stdout).not.toContain('composio files');
        expect(root.stdout).not.toContain('MODE');
        expect(root.stdout).not.toContain('api-info');
        expect(root.stdout).not.toContain('--tool-debug');
      })
    );

    it.effect.each([{ path: ['execute'] }, { path: ['dev', 'playground-execute'] }])(
      'renders $path parallel help through the framework before executing any tools',
      ({ path }) =>
        Effect.gen(function* () {
          const help = yield* capture([
            ...path,
            '--parallel',
            'GMAIL_SEND_EMAIL',
            '-d',
            '{}',
            'GITHUB_CREATE_ISSUE',
            '--help',
          ]);
          expect(help.exitCode).toBe(0);
          expect(help.stdout).toContain('--parallel');
          expect(help.stdout).toContain('--get-schema');
          expect(help.stderr).toBe('');
        })
    );

    it.effect('preserves native help after a value-taking option', () =>
      Effect.gen(function* () {
        const output = yield* capture(['orgs', '--log-level', 'Debug', 'list', '--help']);
        expect(output.exitCode).toBe(0);
        expect(output.stdout).toContain('composio orgs list');
        expect(output.stdout).toContain('--limit');
        expect(output.stderr).toBe('');
      })
    );
  });
});
