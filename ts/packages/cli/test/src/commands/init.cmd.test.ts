import path from 'node:path';
import { describe, expect, layer } from '@effect/vitest';
import { vi, afterEach } from 'vitest';
import { Effect } from 'effect';
import { CommandExecutor, FileSystem } from '@effect/platform';
import { NodeProcess } from 'src/services/node-process';
import { CommandRunner } from 'src/services/command-runner';
import { cli, TestLive, MockConsole } from 'test/__utils__';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeSessionInfoBody = () => ({
  project: {
    name: 'test-project',
    id: 'proj_test_123',
    org_id: 'org_test_456',
    nano_id: 'pr_nano_789',
    email: 'test@composio.dev',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    org: { name: 'Test Org', id: 'org_test_456', plan: 'free' },
  },
  org_member: {
    id: 'org_test_456',
    email: 'test@composio.dev',
    name: 'Test User',
    role: 'admin',
  },
  api_key: {
    name: 'default',
    project_id: 'proj_test_123',
    id: 'ak_test',
    org_member_id: 'org_test_456',
  },
});

function mockFetchResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const makeCommandRunnerSuccess = () =>
  new CommandRunner({
    run: () => Effect.succeed(CommandExecutor.ExitCode(0)),
  });

const makeCommandRunnerFail = (exitCode = 1) =>
  new CommandRunner({
    run: () => Effect.succeed(CommandExecutor.ExitCode(exitCode)),
  });

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CLI: composio init', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('[Given] --org-id + --project-id flags with TS project', () => {
    layer(TestLive({ fixture: 'typescript-project', commandRunner: makeCommandRunnerSuccess() }))(
      it => {
        it.scoped('[Then] detects TS project and installs dependency', () =>
          Effect.gen(function* () {
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(
              mockFetchResponse(makeSessionInfoBody())
            );

            const args = ['init', '--org-id', 'org1', '--project-id', 'proj1', '--yes'];
            yield* cli(args);

            const lines = yield* MockConsole.getLines();
            const output = lines.join('\n');

            expect(output).toContain('typescript');
            expect(output).toContain('Installed @composio/core');
          })
        );
      }
    );
  });

  describe('[Given] --org-id + --project-id flags with Python project', () => {
    layer(TestLive({ fixture: 'python-project', commandRunner: makeCommandRunnerSuccess() }))(
      it => {
        it.scoped('[Then] detects Python project and shows correct install command', () =>
          Effect.gen(function* () {
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(
              mockFetchResponse(makeSessionInfoBody())
            );

            const args = ['init', '--org-id', 'org1', '--project-id', 'proj1', '--dry-run'];
            yield* cli(args);

            const lines = yield* MockConsole.getLines();
            const output = lines.join('\n');

            expect(output).toContain('python');
            expect(output).toContain('pip install composio');
            expect(output).toContain('Dry run complete.');
          })
        );
      }
    );
  });

  describe('[Given] --dry-run flag with TS project', () => {
    layer(TestLive({ fixture: 'typescript-project' }))(it => {
      it.scoped('[Then] prints install command without executing', () =>
        Effect.gen(function* () {
          vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse(makeSessionInfoBody()));

          const args = ['init', '--org-id', 'org1', '--project-id', 'proj1', '--dry-run'];
          yield* cli(args);

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');

          expect(output).toContain('npm install -S @composio/core');
          expect(output).toContain('Dry run complete.');
          expect(output).not.toContain('Installed @composio/core');
        })
      );
    });
  });

  describe('[Given] @composio/core already in node_modules', () => {
    layer(
      TestLive({
        fixture: 'typescript-project-with-composio-core',
        commandRunner: makeCommandRunnerSuccess(),
      })
    )(it => {
      it.scoped('[Then] skips install', () =>
        Effect.gen(function* () {
          vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse(makeSessionInfoBody()));

          const args = ['init', '--org-id', 'org1', '--project-id', 'proj1'];
          yield* cli(args);

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');

          expect(output).toContain('Dependency already installed');
          expect(output).not.toContain('Installed @composio/core');
        })
      );
    });
  });

  describe('[Given] --force flag with dependency installed', () => {
    layer(
      TestLive({
        fixture: 'typescript-project-with-composio-core',
        commandRunner: makeCommandRunnerSuccess(),
      })
    )(it => {
      it.scoped('[Then] reinstalls', () =>
        Effect.gen(function* () {
          vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse(makeSessionInfoBody()));

          const args = ['init', '--org-id', 'org1', '--project-id', 'proj1', '--force', '--yes'];
          yield* cli(args);

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');

          expect(output).toContain('Reinstalling due to --force');
          expect(output).toContain('Installed @composio/core');
        })
      );
    });
  });

  describe('[Given] install command fails', () => {
    layer(
      TestLive({
        fixture: 'typescript-project',
        commandRunner: makeCommandRunnerFail(1),
      })
    )(it => {
      it.scoped('[Then] shows error and suggests manual install', () =>
        Effect.gen(function* () {
          vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse(makeSessionInfoBody()));

          const args = ['init', '--org-id', 'org1', '--project-id', 'proj1', '--yes'];
          yield* cli(args);

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');

          expect(output).toContain('Install failed');
          expect(output).toContain('install manually');
        })
      );
    });
  });

  describe('[Given] pnpm monorepo fixture', () => {
    layer(
      TestLive({
        fixture: 'typescript-pnpm-monorepo',
        commandRunner: makeCommandRunnerSuccess(),
      })
    )(it => {
      it.scoped('[Then] detects pnpm and uses pnpm add', () =>
        Effect.gen(function* () {
          vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse(makeSessionInfoBody()));

          const args = ['init', '--org-id', 'org1', '--project-id', 'proj1', '--dry-run'];
          yield* cli(args);

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');

          expect(output).toContain('pnpm');
          expect(output).toContain('pnpm add @composio/core');
        })
      );
    });
  });

  describe('[Given] config files are written', () => {
    layer(TestLive({ fixture: 'typescript-project', commandRunner: makeCommandRunnerSuccess() }))(
      it => {
        it.scoped('[Then] config.json includes detection info', () =>
          Effect.gen(function* () {
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(
              mockFetchResponse(makeSessionInfoBody())
            );

            const proc = yield* NodeProcess;
            const fs = yield* FileSystem.FileSystem;
            const args = ['init', '--org-id', 'org1', '--project-id', 'proj1', '--yes'];
            yield* cli(args);

            const configPath = path.join(proc.cwd, '.composio', 'config.json');
            const configContent = yield* fs.readFileString(configPath);
            const config = JSON.parse(configContent);

            expect(config.detected_language).toBeDefined();
            expect(config.package_manager).toBeDefined();
          })
        );
      }
    );
  });
});
