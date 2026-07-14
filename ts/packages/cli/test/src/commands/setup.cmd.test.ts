import { Command, CommandExecutor } from '@effect/platform';
import { describe, expect, layer } from '@effect/vitest';
import { Cause, Effect, Exit, Fiber, TestClock } from 'effect';
import { afterEach, vi } from 'vitest';
import { CommandRunner } from 'src/services/command-runner';
import { SetupSkillInstaller } from 'src/services/setup-skill-installer';
import { cli, TestLive } from 'test/__utils__';

type AgentHost = 'claude' | 'codex';
type MarketplaceState = 'missing' | 'canonical' | 'conflict';
type PluginState = 'missing' | 'disabled' | 'enabled';

interface FakeHostState {
  available: boolean;
  marketplace: MarketplaceState;
  plugin: PluginState;
  pluginScope: 'user' | 'project';
}

interface HostOutputFormatter {
  readonly version: string;
  readonly marketplace: (state: MarketplaceState, source: string) => unknown;
  readonly plugin: (installed: boolean, enabled: boolean, scope: 'user' | 'project') => unknown;
}

const MARKETPLACE_SOURCES: Readonly<Record<AgentHost, string>> = {
  claude: 'https://github.com/ComposioHQ/composio-plugin-cc.git',
  codex: 'ComposioHQ/composio-plugin-openai',
};

const HOST_OUTPUT_FORMATTERS: Readonly<Record<AgentHost, HostOutputFormatter>> = {
  claude: {
    version: '2.1.0',
    marketplace: (state, source) => {
      if (state === 'missing') return [];
      return [{ name: 'composio', source: { source: 'github', repo: source } }];
    },
    plugin: (installed, enabled, scope) => {
      if (!installed) return [];
      return [{ id: 'composio@composio', scope, enabled }];
    },
  },
  codex: {
    version: 'codex-cli 0.144.1',
    marketplace: (state, source) => {
      if (state === 'missing') return { marketplaces: [] };
      return {
        marketplaces: [
          {
            name: 'composio',
            marketplaceSource: { sourceType: 'git', source },
          },
        ],
      };
    },
    plugin: (installed, enabled) => {
      if (!installed) return { installed: [], available: [] };
      return {
        installed: [{ pluginId: 'composio@composio', installed, enabled }],
        available: [],
      };
    },
  },
};

const commandParts = (command: Command.Command): ReadonlyArray<string> => {
  const first = Command.flatten(command)[0];
  return [first.command, ...first.args];
};

const makeRunner = (
  respond: (parts: ReadonlyArray<string>) => {
    readonly exitCode?: number;
    readonly stdout?: string;
    readonly stderr?: string;
  }
) =>
  new CommandRunner({
    run: () => Effect.succeed(CommandExecutor.ExitCode(0)),
    capture: command => {
      const result = respond(commandParts(command));
      return Effect.succeed({
        exitCode: result.exitCode ?? 0,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
      });
    },
  });

const makeSkillInstaller = (initiallyReady = false, failInstall = false) => {
  let ready = initiallyReady;
  const ensureClaudeSkill = () => {
    if (failInstall) return Effect.fail(new Error('skill download failed'));
    return Effect.sync(() => {
      const changed = !ready;
      ready = true;
      return changed;
    });
  };
  return new SetupSkillInstaller({
    isClaudeSkillReady: Effect.sync(() => ready),
    ensureClaudeSkill: ensureClaudeSkill(),
  });
};

const defaultHostState = (): FakeHostState => ({
  available: false,
  marketplace: 'missing',
  plugin: 'missing',
  pluginScope: 'user',
});

const makeFakeHosts = (
  initial: Partial<Record<AgentHost, Partial<FakeHostState>>>,
  options: {
    readonly noOp?: boolean;
    readonly failOn?: string;
    readonly malformedOn?: string;
    readonly marketplaceSource?: Partial<Record<AgentHost, string>>;
  } = {}
) => {
  const state: Record<AgentHost, FakeHostState> = {
    claude: { ...defaultHostState(), ...initial.claude },
    codex: { ...defaultHostState(), ...initial.codex },
  };
  const commands: string[][] = [];

  const marketplaceOutput = (host: AgentHost): string => {
    const current = state[host].marketplace;
    let source = 'someone-else/not-composio';
    if (current === 'canonical') {
      source = options.marketplaceSource?.[host] ?? MARKETPLACE_SOURCES[host];
    }
    return JSON.stringify(HOST_OUTPUT_FORMATTERS[host].marketplace(current, source));
  };

  const pluginOutput = (host: AgentHost): string => {
    const current = state[host].plugin;
    const installed = current !== 'missing';
    const enabled = current === 'enabled';
    return JSON.stringify(
      HOST_OUTPUT_FORMATTERS[host].plugin(installed, enabled, state[host].pluginScope)
    );
  };

  const runner = makeRunner(parts => {
    commands.push([...parts]);
    const host = parts[0] as AgentHost;
    const command = parts.join(' ');
    if (parts[1] === '--version') {
      if (!state[host].available) return { exitCode: 127, stderr: 'not found' };
      return { stdout: HOST_OUTPUT_FORMATTERS[host].version };
    }
    if (options.failOn && command.includes(options.failOn)) {
      return { exitCode: 2, stderr: 'native operation failed' };
    }
    if (options.malformedOn && command.includes(options.malformedOn)) {
      return { stdout: '{not-json' };
    }
    if (command === `${host} plugin marketplace list --json`) {
      return { stdout: marketplaceOutput(host) };
    }
    if (command === `${host} plugin list --json`) {
      return { stdout: pluginOutput(host) };
    }
    if (!options.noOp && command.includes('plugin marketplace add')) {
      state[host].marketplace = 'canonical';
    }
    if (
      !options.noOp &&
      (command.includes('plugin install') ||
        command.includes('plugin enable') ||
        command === 'codex plugin add composio@composio --json')
    ) {
      state[host].plugin = 'enabled';
      state[host].pluginScope = 'user';
    }
    return {};
  });

  return { commands, runner, state };
};

describe('CLI: composio setup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.exitCode = undefined;
  });

  const freshClaude = makeFakeHosts({ claude: { available: true } });
  layer(
    TestLive({
      fixture: 'user-config-example',
      commandRunner: freshClaude.runner,
      setupSkillInstaller: makeSkillInstaller(),
    })
  )('fresh Claude install', it => {
    it.scoped('uses exact native commands and verifies readiness', () =>
      Effect.gen(function* () {
        yield* cli(['setup', '--target', 'claude', '--yes']);

        expect(freshClaude.commands).toContainEqual([
          'claude',
          'plugin',
          'marketplace',
          'add',
          'https://github.com/ComposioHQ/composio-plugin-cc.git',
          '--scope',
          'user',
        ]);
        expect(freshClaude.commands).toContainEqual([
          'claude',
          'plugin',
          'install',
          'composio@composio',
          '--scope',
          'user',
        ]);
        expect(freshClaude.state.claude).toMatchObject({
          marketplace: 'canonical',
          plugin: 'enabled',
        });
      })
    );
  });

  const existingCodex = makeFakeHosts({
    codex: { available: true, marketplace: 'canonical', plugin: 'enabled' },
  });
  layer(TestLive({ commandRunner: existingCodex.runner }))('existing Codex install', it => {
    it.scoped('is idempotent', () =>
      Effect.gen(function* () {
        yield* cli(['setup', '--target', 'codex', '--yes']);

        expect(existingCodex.commands.some(parts => parts.includes('add'))).toBe(false);
      })
    );
  });

  for (const host of ['claude', 'codex'] as const) {
    const disabled = makeFakeHosts({
      [host]: { available: true, marketplace: 'canonical', plugin: 'disabled' },
    });
    layer(
      TestLive({
        commandRunner: disabled.runner,
        setupSkillInstaller: makeSkillInstaller(true),
      })
    )(`disabled ${host} plugin`, it => {
      it.scoped('repairs the plugin through the native path', () =>
        Effect.gen(function* () {
          yield* cli(['setup', '--target', host, '--yes']);

          expect(disabled.state[host].plugin).toBe('enabled');
          if (host === 'claude') {
            expect(disabled.commands).toContainEqual([
              'claude',
              'plugin',
              'enable',
              'composio@composio',
              '--scope',
              'user',
            ]);
          }
        })
      );
    });
  }

  const freshCodex = makeFakeHosts({ codex: { available: true } });
  layer(TestLive({ commandRunner: freshCodex.runner }))('fresh Codex install', it => {
    it.scoped('uses the public OpenAI marketplace and exact native commands', () =>
      Effect.gen(function* () {
        yield* cli(['setup', '--target', 'codex', '--yes']);

        expect(freshCodex.commands).toContainEqual([
          'codex',
          'plugin',
          'marketplace',
          'add',
          'https://github.com/ComposioHQ/composio-plugin-openai.git',
          '--json',
        ]);
        expect(freshCodex.commands).toContainEqual([
          'codex',
          'plugin',
          'add',
          'composio@composio',
          '--json',
        ]);
      })
    );
  });

  const autoClaude = makeFakeHosts({ claude: { available: true } });
  layer(
    TestLive({
      commandRunner: autoClaude.runner,
      setupSkillInstaller: makeSkillInstaller(),
    })
  )('automatic setup with one host', it => {
    it.scoped('installs only the detected host', () =>
      Effect.gen(function* () {
        yield* cli(['setup', '--target', 'auto', '--yes']);

        expect(autoClaude.commands.some(parts => parts[0] === 'claude')).toBe(true);
        expect(
          autoClaude.commands.some(parts => parts[0] === 'codex' && parts[1] !== '--version')
        ).toBe(false);
      })
    );
  });

  const autoBoth = makeFakeHosts({
    claude: { available: true, marketplace: 'canonical', plugin: 'enabled' },
    codex: { available: true, marketplace: 'canonical', plugin: 'enabled' },
  });
  layer(
    TestLive({
      commandRunner: autoBoth.runner,
      setupSkillInstaller: makeSkillInstaller(true),
    })
  )('automatic setup with both hosts', it => {
    it.scoped('selects both detected hosts', () =>
      Effect.gen(function* () {
        yield* cli(['setup', '--target', 'auto', '--yes']);

        expect(autoBoth.commands.some(parts => parts[0] === 'claude')).toBe(true);
        expect(autoBoth.commands.some(parts => parts[0] === 'codex')).toBe(true);
      })
    );
  });

  const allTargets = makeFakeHosts({
    claude: { available: true },
    codex: { available: true },
  });
  layer(
    TestLive({
      commandRunner: allTargets.runner,
      setupSkillInstaller: makeSkillInstaller(),
    })
  )('explicit all-host setup', it => {
    it.scoped('configures both supported hosts', () =>
      Effect.gen(function* () {
        yield* cli(['setup', '--target', 'all', '--yes']);

        expect(allTargets.state.claude).toMatchObject({
          marketplace: 'canonical',
          plugin: 'enabled',
        });
        expect(allTargets.state.codex).toMatchObject({
          marketplace: 'canonical',
          plugin: 'enabled',
        });
      })
    );
  });

  const projectScopedClaude = makeFakeHosts({
    claude: {
      available: true,
      marketplace: 'canonical',
      plugin: 'enabled',
      pluginScope: 'project',
    },
  });
  layer(
    TestLive({
      commandRunner: projectScopedClaude.runner,
      setupSkillInstaller: makeSkillInstaller(true),
    })
  )('project-scoped Claude plugin', it => {
    it.scoped('installs the required user-scoped plugin', () =>
      Effect.gen(function* () {
        yield* cli(['setup', '--target', 'claude', '--yes']);

        expect(projectScopedClaude.commands).toContainEqual([
          'claude',
          'plugin',
          'install',
          'composio@composio',
          '--scope',
          'user',
        ]);
        expect(projectScopedClaude.state.claude.pluginScope).toBe('user');
      })
    );
  });

  const missingMarketplaceWithPlugin = makeFakeHosts({
    claude: { available: true, marketplace: 'missing', plugin: 'enabled' },
  });
  layer(
    TestLive({
      commandRunner: missingMarketplaceWithPlugin.runner,
      setupSkillInstaller: makeSkillInstaller(true),
    })
  )('plugin from a removed marketplace', it => {
    it.scoped('reinstalls after restoring the canonical marketplace', () =>
      Effect.gen(function* () {
        yield* cli(['setup', '--target', 'claude', '--yes']);

        expect(missingMarketplaceWithPlugin.commands).toContainEqual([
          'claude',
          'plugin',
          'install',
          'composio@composio',
          '--scope',
          'user',
        ]);
      })
    );
  });

  const unavailable = makeFakeHosts({});
  layer(TestLive({ commandRunner: unavailable.runner }))('no supported host', it => {
    it.scoped('fails automatic setup', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(cli(['setup', '--target', 'auto', '--yes']));
        expect(Exit.isFailure(exit)).toBe(true);
      })
    );
  });

  const conflict = makeFakeHosts({
    claude: { available: true, marketplace: 'conflict' },
  });
  layer(TestLive({ commandRunner: conflict.runner }))('marketplace source conflict', it => {
    it.scoped('fails safely instead of replacing the marketplace', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(cli(['setup', '--target', 'claude', '--yes']));
        expect(Exit.isFailure(exit)).toBe(true);
        expect(conflict.state.claude.marketplace).toBe('conflict');
      })
    );
  });

  for (const unsafeSource of [
    'http://github.com/ComposioHQ/composio-plugin-cc.git',
    'https://token@github.com/ComposioHQ/composio-plugin-cc.git',
    'https://github.com/ComposioHQ/composio-plugin-cc.git?token=secret',
  ]) {
    const unsafeMarketplace = makeFakeHosts(
      { claude: { available: true, marketplace: 'canonical' } },
      { marketplaceSource: { claude: unsafeSource } }
    );
    layer(TestLive({ commandRunner: unsafeMarketplace.runner }))(
      `unsafe marketplace source: ${unsafeSource}`,
      it => {
        it.scoped('rejects a non-canonical GitHub URL', () =>
          Effect.gen(function* () {
            const exit = yield* Effect.exit(cli(['setup', '--target', 'claude', '--yes']));

            expect(Exit.isFailure(exit)).toBe(true);
            expect(
              unsafeMarketplace.commands.some(parts =>
                ['add', 'install', 'enable'].some(operation => parts.includes(operation))
              )
            ).toBe(false);
          })
        );
      }
    );
  }

  const failedInspection = makeFakeHosts(
    { claude: { available: true } },
    { failOn: 'plugin list --json' }
  );
  layer(TestLive({ commandRunner: failedInspection.runner }))('failed native inspection', it => {
    it.scoped('fails before running setup mutations', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(cli(['setup', '--target', 'claude', '--yes']));

        expect(Exit.isFailure(exit)).toBe(true);
        expect(
          failedInspection.commands.some(parts =>
            ['add', 'install', 'enable'].some(operation => parts.includes(operation))
          )
        ).toBe(false);
      })
    );
  });

  const malformedInspection = makeFakeHosts(
    { codex: { available: true } },
    { malformedOn: 'plugin marketplace list --json' }
  );
  layer(TestLive({ commandRunner: malformedInspection.runner }))(
    'malformed native inspection',
    it => {
      it.scoped('fails before running setup mutations', () =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(cli(['setup', '--target', 'codex', '--yes']));

          expect(Exit.isFailure(exit)).toBe(true);
          expect(malformedInspection.commands.some(parts => parts.includes('add'))).toBe(false);
        })
      );
    }
  );

  const preflightConflict = makeFakeHosts({
    claude: { available: true },
    codex: { available: true, marketplace: 'conflict' },
  });
  layer(
    TestLive({
      commandRunner: preflightConflict.runner,
      setupSkillInstaller: makeSkillInstaller(),
    })
  )('multi-host preflight', it => {
    it.scoped('does not mutate an earlier host when a later host conflicts', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(cli(['setup', '--target', 'all', '--yes']));

        expect(Exit.isFailure(exit)).toBe(true);
        expect(preflightConflict.state.claude).toMatchObject({
          marketplace: 'missing',
          plugin: 'missing',
        });
      })
    );
  });

  const laterMutationFailure = makeFakeHosts(
    {
      claude: { available: true },
      codex: { available: true },
    },
    { failOn: 'codex plugin add composio@composio --json' }
  );
  layer(
    TestLive({
      commandRunner: laterMutationFailure.runner,
      setupSkillInstaller: makeSkillInstaller(),
    })
  )('multi-host mutation failure', it => {
    it.scoped('reports hosts completed before a later target fails', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(cli(['setup', '--target', 'all', '--yes']));

        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          expect(Cause.pretty(exit.cause)).toContain(
            'Setup completed for claude before a later target failed'
          );
        }
        expect(laterMutationFailure.state.claude).toMatchObject({
          marketplace: 'canonical',
          plugin: 'enabled',
        });
      })
    );
  });

  const nonInteractive = makeFakeHosts({ claude: { available: true } });
  layer(TestLive({ commandRunner: nonInteractive.runner }))('non-interactive approval', it => {
    it.scoped('requires --yes before inspecting or mutating hosts', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(cli(['setup', '--target', 'claude']));

        expect(Exit.isFailure(exit)).toBe(true);
        expect(nonInteractive.commands).toHaveLength(0);
      })
    );
  });

  const hangingRunner = new CommandRunner({
    run: () => Effect.succeed(CommandExecutor.ExitCode(0)),
    capture: () => Effect.never,
  });
  layer(TestLive({ commandRunner: hangingRunner }))('hung native host', it => {
    it.scoped('times out instead of blocking setup forever', () =>
      Effect.gen(function* () {
        const fiber = yield* cli(['setup', '--target', 'claude', '--yes']).pipe(
          Effect.exit,
          Effect.fork
        );
        yield* Effect.yieldNow();
        yield* TestClock.adjust('2 minutes');
        const exit = yield* Fiber.join(fiber);

        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          const renderedCause = Cause.pretty(exit.cause);
          expect(renderedCause).toContain('claude command timed out');
          expect(renderedCause).not.toContain('not installed or not available on PATH');
        }
      })
    );
  });

  const noOp = makeFakeHosts({ claude: { available: true } }, { noOp: true });
  layer(TestLive({ commandRunner: noOp.runner, setupSkillInstaller: makeSkillInstaller() }))(
    'post-install verification',
    it => {
      it.scoped('fails when successful commands do not change native state', () =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(cli(['setup', '--target', 'claude', '--yes']));
          expect(Exit.isFailure(exit)).toBe(true);
        })
      );
    }
  );

  const failedInstall = makeFakeHosts(
    { claude: { available: true } },
    { failOn: 'plugin install' }
  );
  layer(TestLive({ commandRunner: failedInstall.runner }))('native install failure', it => {
    it.scoped('fails the command', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(cli(['setup', '--target', 'claude', '--yes']));
        expect(Exit.isFailure(exit)).toBe(true);
      })
    );
  });

  const skillFailure = makeFakeHosts({
    claude: { available: true, marketplace: 'canonical', plugin: 'enabled' },
  });
  layer(
    TestLive({
      commandRunner: skillFailure.runner,
      setupSkillInstaller: makeSkillInstaller(false, true),
    })
  )('skill install failure', it => {
    it.scoped('fails instead of reporting readiness', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(cli(['setup', '--target', 'claude', '--yes']));
        expect(Exit.isFailure(exit)).toBe(true);
      })
    );
  });
});
