import path from 'node:path';
import { describe, expect, layer } from '@effect/vitest';
import { vi, afterEach, beforeAll, afterAll } from 'vitest';
import { Console, Effect, Exit } from 'effect';
import { CommandExecutor, FileSystem } from '@effect/platform';
import { NodeProcess } from 'src/services/node-process';
import { CommandRunner } from 'src/services/command-runner';
import { TerminalUI } from 'src/services/terminal-ui';
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

/**
 * Creates a TerminalUI where specific `select()` calls return custom values.
 * `selectOverrides` maps call index (0-based) to the option index to pick.
 * Calls without overrides default to picking the first option (index 0).
 */
const makeTerminalUIWithSelectOverrides = (selectOverrides: Record<number, number>): TerminalUI => {
  let selectCallIndex = 0;

  return TerminalUI.of({
    output: data => Console.log(data),
    intro: title => Console.log(`-- ${title} --`),
    outro: message => Console.log(`-- ${message} --`),
    log: {
      info: message => Console.log(message),
      success: message => Console.log(message),
      warn: message => Console.warn(message),
      error: message => Console.error(message),
      step: message => Console.log(message),
      message: message => Console.log(message),
    },
    note: (message, title) => Console.log(title ? `[${title}] ${message}` : message),
    select: (_message, options) => {
      const idx = selectCallIndex++;
      const optionIdx = selectOverrides[idx] ?? 0;
      return Effect.succeed(options[optionIdx].value);
    },
    confirm: (_message, options) => Effect.succeed(options?.defaultValue ?? true),
    withSpinner: (message, effect, options) =>
      Effect.gen(function* () {
        const result = yield* effect;
        const successMsg =
          typeof options?.successMessage === 'function'
            ? options.successMessage(result)
            : (options?.successMessage ?? message);
        yield* Console.log(successMsg);
        return result;
      }),
    useMakeSpinner: (message, use) =>
      Effect.gen(function* () {
        let stopped = false;
        const handle = {
          message: (_msg: string) => Effect.void,
          stop: (msg?: string) =>
            Effect.gen(function* () {
              stopped = true;
              if (msg) yield* Console.log(msg);
            }),
          error: (msg?: string) =>
            Effect.gen(function* () {
              stopped = true;
              if (msg) yield* Console.error(msg);
            }),
        };
        const exit = yield* Effect.exit(use(handle));
        if (Exit.isFailure(exit) && !stopped) {
          yield* Console.error(message);
        }
        return yield* exit;
      }),
  });
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CLI: composio init', () => {
  let savedUserAgent: string | undefined;

  beforeAll(() => {
    savedUserAgent = process.env.npm_config_user_agent;
    delete process.env.npm_config_user_agent;
  });

  afterAll(() => {
    if (savedUserAgent !== undefined) {
      process.env.npm_config_user_agent = savedUserAgent;
    } else {
      delete process.env.npm_config_user_agent;
    }
  });

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

  // ── Skills installation tests ──────────────────────────────────────────────

  describe('[Given] skills install with --yes flag', () => {
    layer(TestLive({ fixture: 'typescript-project', commandRunner: makeCommandRunnerSuccess() }))(
      it => {
        it.scoped('[Then] installs Composio skills', () =>
          Effect.gen(function* () {
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(
              mockFetchResponse(makeSessionInfoBody())
            );

            const args = ['init', '--org-id', 'org1', '--project-id', 'proj1', '--yes'];
            yield* cli(args);

            const lines = yield* MockConsole.getLines();
            const output = lines.join('\n');

            expect(output).toContain('Installed Composio skills');
          })
        );
      }
    );
  });

  describe('[Given] --dry-run flag shows skills command', () => {
    layer(TestLive({ fixture: 'typescript-project' }))(it => {
      it.scoped('[Then] prints skills install command without executing', () =>
        Effect.gen(function* () {
          vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse(makeSessionInfoBody()));

          const args = ['init', '--org-id', 'org1', '--project-id', 'proj1', '--dry-run'];
          yield* cli(args);

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');

          expect(output).toContain('npx skills add composiohq/skills');
          expect(output).not.toContain('Installed Composio skills');
        })
      );
    });
  });

  describe('[Given] skills install command fails', () => {
    layer(
      TestLive({
        fixture: 'typescript-project',
        commandRunner: makeCommandRunnerFail(1),
      })
    )(it => {
      it.scoped('[Then] shows error and suggests manual skills install', () =>
        Effect.gen(function* () {
          vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse(makeSessionInfoBody()));

          const args = ['init', '--org-id', 'org1', '--project-id', 'proj1', '--yes'];
          yield* cli(args);

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');

          expect(output).toContain('Skills install failed');
          expect(output).toContain('npx skills add composiohq/skills');
        })
      );
    });
  });

  // ── --no-skills flag tests ─────────────────────────────────────────────────

  describe('[Given] --no-skills flag', () => {
    layer(TestLive({ fixture: 'typescript-project', commandRunner: makeCommandRunnerSuccess() }))(
      it => {
        it.scoped('[Then] skips skills prompt and does not install skills', () =>
          Effect.gen(function* () {
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(
              mockFetchResponse(makeSessionInfoBody())
            );

            const proc = yield* NodeProcess;
            const fs = yield* FileSystem.FileSystem;
            const args = [
              'init',
              '--org-id',
              'org1',
              '--project-id',
              'proj1',
              '--yes',
              '--no-skills',
            ];
            yield* cli(args);

            const lines = yield* MockConsole.getLines();
            const output = lines.join('\n');

            // Should NOT install skills
            expect(output).not.toContain('Installed Composio skills');
            // Should still install the core dependency
            expect(output).toContain('Installed @composio/core');

            // config.json should have install_skills: false
            const configPath = path.join(proc.cwd, '.composio', 'config.json');
            const configContent = yield* fs.readFileString(configPath);
            const config = JSON.parse(configContent);
            expect(config.install_skills).toBe(false);
          })
        );
      }
    );
  });

  // ── MCP mode and PM-skip tests ─────────────────────────────────────────────

  describe('[Given] MCP usage mode selected', () => {
    // Select overrides: 0th select (usage mode) → index 1 ("Composio MCP")
    const mcpUI = makeTerminalUIWithSelectOverrides({ 0: 1 });

    layer(
      TestLive({
        fixture: 'typescript-project',
        commandRunner: makeCommandRunnerSuccess(),
        terminalUI: mcpUI,
      })
    )(it => {
      it.scoped('[Then] skips env detection and dependency install', () =>
        Effect.gen(function* () {
          vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse(makeSessionInfoBody()));

          const proc = yield* NodeProcess;
          const fs = yield* FileSystem.FileSystem;
          const args = ['init', '--org-id', 'org1', '--project-id', 'proj1', '--yes'];
          yield* cli(args);

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');

          // Should NOT detect environment or install dependency in MCP mode
          expect(output).not.toContain('Detected:');
          expect(output).not.toContain('Installed @composio/core');
          expect(output).toContain('Project initialized');

          // config.json should not have detected_language or package_manager
          const configPath = path.join(proc.cwd, '.composio', 'config.json');
          const configContent = yield* fs.readFileString(configPath);
          const config = JSON.parse(configContent);
          expect(config.usage_mode).toBe('mcp');
          expect(config.detected_language).toBeUndefined();
          expect(config.package_manager).toBeUndefined();
        })
      );
    });
  });

  describe('[Given] native mode but user skips PM confirmation', () => {
    // Select overrides:
    //   0th select (usage mode)     → index 0 ("Native tools")
    //   1st select (framework)      → index 0 ("Skip")
    //   2nd select (PM confirm)     → index 1 ("Skip")
    const skipPmUI = makeTerminalUIWithSelectOverrides({ 2: 1 });

    layer(
      TestLive({
        fixture: 'typescript-project',
        commandRunner: makeCommandRunnerSuccess(),
        terminalUI: skipPmUI,
      })
    )(it => {
      it.scoped('[Then] detects env but skips dependency install', () =>
        Effect.gen(function* () {
          vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse(makeSessionInfoBody()));

          const args = ['init', '--org-id', 'org1', '--project-id', 'proj1', '--yes'];
          yield* cli(args);

          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');

          // Should detect environment but NOT install dependency
          expect(output).toContain('Detected:');
          expect(output).not.toContain('Installed @composio/core');
          expect(output).toContain('Project initialized');
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
