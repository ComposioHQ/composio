import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { afterEach } from 'vitest';
import { buildRootCommand } from 'src/commands';
import { teardown } from 'src/cli-main';
import { cli, MockConsole, TestLive } from 'test/__utils__';

const capture = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(cli(args));
    let exitCode = 0;
    teardown(exit, code => {
      exitCode = code;
    });
    const stdout = (yield* MockConsole.getLines({ stripAnsi: true, stream: 'stdout' })).join('\n');
    const stderr = (yield* MockConsole.getLines({ stripAnsi: true, stream: 'stderr' })).join('\n');
    return { exitCode, stdout, stderr };
  }).pipe(Effect.provide(TestLive()));

const commandPaths = (
  command: ReturnType<typeof buildRootCommand> | import('effect/unstable/cli').Command.Command.Any,
  prefix: ReadonlyArray<string> = []
): ReadonlyArray<ReadonlyArray<string>> =>
  command.subcommands
    .flatMap(group => group.commands)
    .filter(child => child.name !== 'help' && !child.unlisted)
    .flatMap(child => {
      const path = [...prefix, child.name];
      return [path, ...commandPaths(child, path)];
    });

describe('framework command help', () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  layer(TestLive())(it => {
    it.effect('renders every visible command from the same definitions used by parsing', () =>
      Effect.gen(function* () {
        const root = buildRootCommand({
          isDevModeEnabled: true,
          isExperimentalFeatureEnabled: () => true,
        });
        for (const path of commandPaths(root)) {
          // Experimental commands in the test config must be enabled independently of the graph.
          if (path[0] === 'listen') continue;
          const flag = yield* capture([...path, '--help']);
          const alias = yield* capture(['help', ...path]);
          expect(flag.exitCode, path.join(' ')).toBe(0);
          expect(alias.exitCode, path.join(' ')).toBe(0);
          expect(alias.stdout, path.join(' ')).toBe(flag.stdout);
          expect(flag.stdout).toContain('USAGE');
          expect(flag.stderr).toBe('');
          expect(alias.stderr).toBe('');
        }
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

    it.effect('keeps errors and suggestions on stderr with a failing exit code', () =>
      Effect.gen(function* () {
        for (const args of [
          ['help', 'frobnicate'],
          ['help', 'orgz'],
          ['tools', 'frobnicate'],
        ]) {
          const output = yield* capture(args);
          expect(output.exitCode).toBe(1);
          expect(output.stdout).toBe('');
          expect(output.stderr).toContain('Unknown subcommand');
        }
        expect((yield* capture(['help', 'orgz'])).stderr).toContain('Did you mean');
      })
    );

    it.effect('supports bare help, help aliases, and redundant help flags', () =>
      Effect.gen(function* () {
        for (const args of [[], ['help'], ['help', '--help'], ['--help'], ['-h']]) {
          const output = yield* capture(args);
          expect(output.exitCode).toBe(0);
          expect(output.stdout).toContain('Documentation:');
          expect(output.stderr).toBe('');
        }
      })
    );

    it.effect('documents the actual flags on previously unreachable nested pages', () =>
      Effect.gen(function* () {
        for (const [path, flags] of [
          [['login'], ['--agent']],
          [['search'], ['--json']],
          [
            ['dev', 'connected-accounts', 'link'],
            ['--auth-config', '--user-id'],
          ],
          [
            ['dev', 'triggers', 'listen'],
            ['--user-id', '--forward', '--max-events'],
          ],
          [['dev', 'triggers', 'disable'], ['--dangerously-allow']],
        ] as const) {
          const output = yield* capture([...path, '--help']);
          expect(output.exitCode).toBe(0);
          for (const flag of flags) expect(output.stdout, path.join(' ')).toContain(flag);
        }
        const projectSwitch = yield* capture(['dev', 'projects', 'switch', '--help']);
        expect(projectSwitch.stdout).toContain('composio dev projects switch');
        expect(projectSwitch.stdout).toContain('Switch the developer project');
        const root = yield* capture(['--help']);
        expect(root.stdout).not.toContain('composio files');
        expect(root.stdout).not.toContain('MODE');
        expect(root.stdout).not.toContain('api-info');
        expect(root.stdout).not.toContain('--tool-debug');
      })
    );

    it.effect('renders parallel help through the framework before executing any tools', () =>
      Effect.gen(function* () {
        for (const path of [['execute'], ['dev', 'playground-execute']]) {
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
        }
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
