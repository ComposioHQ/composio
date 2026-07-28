import { Command, CommandExecutor } from '@effect/platform';
import { describe, expect, layer } from '@effect/vitest';
import { Cause, Effect, Exit, Fiber, TestClock } from 'effect';
import { afterEach, vi } from 'vitest';
import { SkillInstallError } from 'src/effects/install-skill';
import { CommandRunner } from 'src/services/command-runner';
import { SetupCommandError, SetupProcessError } from 'src/services/setup';
import { SetupSkillInstaller } from 'src/services/setup-skill-installer';
import { cli, MockConsole, TestLive } from 'test/__utils__';

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
    if (failInstall) {
      return Effect.fail(
        new SkillInstallError({
          message: 'skill download failed',
          phase: 'download',
        })
      );
    }
    return Effect.sync(() => {
      const changed = !ready;
      ready = true;
      return changed;
    });
  };
  return new SetupSkillInstaller({
    isClaudeSkillReady: Effect.sync(() => ready),
    hasManagedClaudeSkill: Effect.sync(() => ready),
    ensureClaudeSkill: ensureClaudeSkill(),
    removeClaudeSkill: Effect.sync(() => {
      const changed = ready;
      ready = false;
      return changed;
    }),
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
    readonly claudeJsonInspection?: boolean;
    readonly codexJsonInspection?: boolean;
    readonly codexVersion?: string;
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
      return {
        stdout:
          host === 'codex' && options.codexVersion
            ? options.codexVersion
            : HOST_OUTPUT_FORMATTERS[host].version,
      };
    }
    if (
      command === `${host} plugin marketplace list --help` ||
      command === `${host} plugin list --help`
    ) {
      const supportsJson =
        host === 'claude'
          ? options.claudeJsonInspection !== false
          : options.codexJsonInspection !== false;
      return {
        stdout: supportsJson
          ? `Usage: ${command.replace(' --help', ' [OPTIONS]')}\n\n      --json`
          : `Usage: ${command.replace(' --help', ' [OPTIONS]')}`,
      };
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
      (command === 'claude plugin uninstall composio@composio --scope user --yes' ||
        command === 'codex plugin remove composio@composio --json')
    ) {
      state[host].plugin = 'missing';
      return {};
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

        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain('Claude Code detected.');
        expect(output).toContain(
          'Successfully installed and enabled the Composio plugin for Claude Code.'
        );
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

  const existingClaudeWithStaleSkill = makeFakeHosts({
    claude: { available: true, marketplace: 'canonical', plugin: 'enabled' },
  });
  let staleSkillRepaired = false;
  let staleSkillReady = false;
  const staleSkillInstaller = new SetupSkillInstaller({
    isClaudeSkillReady: Effect.sync(() => staleSkillReady),
    hasManagedClaudeSkill: Effect.succeed(true),
    ensureClaudeSkill: Effect.sync(() => {
      staleSkillRepaired = true;
      staleSkillReady = true;
      return true;
    }),
    removeClaudeSkill: Effect.sync(() => {
      const changed = staleSkillReady;
      staleSkillReady = false;
      return changed;
    }),
  });
  layer(
    TestLive({
      commandRunner: existingClaudeWithStaleSkill.runner,
      setupSkillInstaller: staleSkillInstaller,
    })
  )('existing Claude plugin with stale skill', it => {
    it.scoped('requires approval, then repairs the skill without extra output', () =>
      Effect.gen(function* () {
        const withoutApproval = yield* Effect.exit(cli(['setup', '--target', 'claude']));
        expect(Exit.isFailure(withoutApproval)).toBe(true);
        expect(staleSkillRepaired).toBe(false);

        yield* cli(['setup', '--target', 'claude', '--yes']);

        expect(staleSkillRepaired).toBe(true);
        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain(
          'The Composio plugin for Claude Code is already installed and enabled.'
        );
        expect(output).not.toContain('skill');
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

        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain('Claude Code detected.');
        expect(output).toContain('Codex not detected.');
      })
    );
  });

  const autoCodex = makeFakeHosts({ codex: { available: true } });
  layer(TestLive({ commandRunner: autoCodex.runner }))(
    'automatic setup with only supported Codex',
    it => {
      it.scoped('installs Codex when Claude is not detected', () =>
        Effect.gen(function* () {
          yield* cli(['setup', '--target', 'auto', '--yes']);

          expect(autoCodex.state.codex).toMatchObject({
            marketplace: 'canonical',
            plugin: 'enabled',
          });
          const output = (yield* MockConsole.getLines()).join('\n');
          expect(output).toContain('Codex detected.');
          expect(output).toContain('Claude Code not detected.');
        })
      );
    }
  );

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
    it.scoped('selects both detected hosts and reports only plugin status', () =>
      Effect.gen(function* () {
        yield* cli(['setup', '--target', 'auto']);

        expect(autoBoth.commands.some(parts => parts[0] === 'claude')).toBe(true);
        expect(autoBoth.commands.some(parts => parts[0] === 'codex')).toBe(true);

        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain('Claude Code and Codex detected.');
        expect(output).toContain(
          'The Composio plugin for Claude Code is already installed and enabled.'
        );
        expect(output).toContain('The Composio plugin for Codex is already installed and enabled.');
        expect(output).not.toContain('composio-cli skill');
      })
    );
  });

  const autoClaudeWithLegacyCodex = makeFakeHosts(
    {
      claude: { available: true },
      codex: { available: true },
    },
    { codexJsonInspection: false, codexVersion: 'codex-cli 0.137.0' }
  );
  layer(
    TestLive({
      commandRunner: autoClaudeWithLegacyCodex.runner,
      setupSkillInstaller: makeSkillInstaller(),
    })
  )('automatic setup with Claude and unsupported Codex', it => {
    it.scoped('installs Claude and reports that Codex was skipped', () =>
      Effect.gen(function* () {
        yield* cli(['setup', '--target', 'auto', '--yes']);

        expect(autoClaudeWithLegacyCodex.state.claude).toMatchObject({
          marketplace: 'canonical',
          plugin: 'enabled',
        });
        expect(autoClaudeWithLegacyCodex.state.codex).toMatchObject({
          marketplace: 'missing',
          plugin: 'missing',
        });
        expect(
          autoClaudeWithLegacyCodex.commands.some(
            parts => parts[0] === 'codex' && parts.includes('--json')
          )
        ).toBe(false);

        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain('Claude Code and Codex detected.');
        expect(output).toContain('Codex plugin setup skipped.');
        expect(output).toContain('requires Codex 0.139.0 or newer');
        expect(output).toContain(
          'Successfully installed and enabled the Composio plugin for Claude Code.'
        );
      })
    );
  });

  const autoCodexWithLegacyClaude = makeFakeHosts(
    {
      claude: { available: true },
      codex: { available: true },
    },
    { claudeJsonInspection: false }
  );
  layer(TestLive({ commandRunner: autoCodexWithLegacyClaude.runner }))(
    'automatic setup with unsupported Claude and Codex',
    it => {
      it.scoped('installs Codex and reports that Claude was skipped', () =>
        Effect.gen(function* () {
          yield* cli(['setup', '--target', 'auto', '--yes']);

          expect(autoCodexWithLegacyClaude.state.claude).toMatchObject({
            marketplace: 'missing',
            plugin: 'missing',
          });
          expect(autoCodexWithLegacyClaude.state.codex).toMatchObject({
            marketplace: 'canonical',
            plugin: 'enabled',
          });
          expect(
            autoCodexWithLegacyClaude.commands.some(
              parts => parts[0] === 'claude' && parts.includes('--json')
            )
          ).toBe(false);

          const output = (yield* MockConsole.getLines()).join('\n');
          expect(output).toContain('Claude Code and Codex detected.');
          expect(output).toContain('Claude Code plugin setup skipped.');
          expect(output).toContain('Run `claude update`');
          expect(output).toContain(
            'Successfully installed and enabled the Composio plugin for Codex.'
          );
        })
      );
    }
  );

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

  const partialAllTargets = makeFakeHosts({ claude: { available: true } });
  layer(TestLive({ commandRunner: partialAllTargets.runner }))(
    'explicit all-host setup with a missing host',
    it => {
      it.scoped('fails before mutating the detected host', () =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(cli(['setup', '--target', 'all', '--yes']));

          expect(Exit.isFailure(exit)).toBe(true);
          expect(partialAllTargets.state.claude).toMatchObject({
            marketplace: 'missing',
            plugin: 'missing',
          });
          expect(
            partialAllTargets.commands.some(parts =>
              ['add', 'install', 'enable'].some(operation => parts.includes(operation))
            )
          ).toBe(false);
        })
      );
    }
  );

  const allWithLegacyCodex = makeFakeHosts(
    {
      claude: { available: true },
      codex: { available: true },
    },
    { codexJsonInspection: false, codexVersion: 'codex-cli 0.137.0' }
  );
  layer(
    TestLive({
      commandRunner: allWithLegacyCodex.runner,
      setupSkillInstaller: makeSkillInstaller(),
    })
  )('explicit all-host setup with unsupported Codex', it => {
    it.scoped('fails before mutating Claude', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(cli(['setup', '--target', 'all', '--yes']));

        expect(Exit.isFailure(exit)).toBe(true);
        expect(allWithLegacyCodex.state.claude).toMatchObject({
          marketplace: 'missing',
          plugin: 'missing',
        });
      })
    );
  });

  const uninstallBoth = makeFakeHosts({
    claude: { available: true, marketplace: 'canonical', plugin: 'enabled' },
    codex: { available: true, marketplace: 'canonical', plugin: 'enabled' },
  });
  layer(
    TestLive({
      commandRunner: uninstallBoth.runner,
      setupSkillInstaller: makeSkillInstaller(true),
    })
  )('uninstall from both hosts', it => {
    it.scoped('uses native removal commands and is idempotent', () =>
      Effect.gen(function* () {
        yield* cli(['setup', '--uninstall', '--target', 'all', '--yes']);
        yield* cli(['setup', '--uninstall', '--target', 'all', '--yes']);

        expect(uninstallBoth.commands).toContainEqual([
          'claude',
          'plugin',
          'uninstall',
          'composio@composio',
          '--scope',
          'user',
          '--yes',
        ]);
        expect(uninstallBoth.commands).toContainEqual([
          'codex',
          'plugin',
          'remove',
          'composio@composio',
          '--json',
        ]);
        expect(
          uninstallBoth.commands.filter(
            parts =>
              parts.join(' ') === 'claude plugin uninstall composio@composio --scope user --yes'
          )
        ).toHaveLength(1);
        expect(
          uninstallBoth.commands.filter(
            parts => parts.join(' ') === 'codex plugin remove composio@composio --json'
          )
        ).toHaveLength(1);
        expect(uninstallBoth.state.claude.plugin).toBe('missing');
        expect(uninstallBoth.state.codex.plugin).toBe('missing');

        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain('Successfully uninstalled the Composio plugin for Claude Code.');
        expect(output).toContain('Successfully uninstalled the Composio plugin for Codex.');
        expect(output).not.toContain('skill');
      })
    );
  });

  const uninstallMissing = makeFakeHosts({
    claude: { available: true, marketplace: 'canonical', plugin: 'missing' },
    codex: { available: true, marketplace: 'canonical', plugin: 'missing' },
  });
  layer(TestLive({ commandRunner: uninstallMissing.runner }))(
    'uninstall when plugins are absent',
    it => {
      it.scoped('reports the idempotent state without requiring approval', () =>
        Effect.gen(function* () {
          yield* cli(['setup', '--uninstall', '--target', 'all']);

          const output = (yield* MockConsole.getLines()).join('\n');
          expect(output).toContain('The Composio plugin for Claude Code is not installed.');
          expect(output).toContain('The Composio plugin for Codex is not installed.');
        })
      );
    }
  );

  const orphanedClaudeSkill = makeFakeHosts({
    claude: { available: true, marketplace: 'canonical', plugin: 'missing' },
  });
  let managedClaudeSkill = true;
  layer(
    TestLive({
      commandRunner: orphanedClaudeSkill.runner,
      setupSkillInstaller: new SetupSkillInstaller({
        isClaudeSkillReady: Effect.sync(() => managedClaudeSkill),
        hasManagedClaudeSkill: Effect.sync(() => managedClaudeSkill),
        ensureClaudeSkill: Effect.succeed(false),
        removeClaudeSkill: Effect.sync(() => {
          const changed = managedClaudeSkill;
          managedClaudeSkill = false;
          return changed;
        }),
      }),
    })
  )('uninstall with an orphaned managed Claude skill', it => {
    it.scoped('requires approval before removing the managed skill', () =>
      Effect.gen(function* () {
        const withoutApproval = yield* Effect.exit(
          cli(['setup', '--uninstall', '--target', 'claude'])
        );
        expect(Exit.isFailure(withoutApproval)).toBe(true);
        expect(managedClaudeSkill).toBe(true);

        yield* cli(['setup', '--uninstall', '--target', 'claude', '--yes']);
        expect(managedClaudeSkill).toBe(false);
      })
    );
  });

  const uninstallWithUnmanagedClaudeSkill = makeFakeHosts({
    claude: { available: true, marketplace: 'canonical', plugin: 'enabled' },
  });
  layer(
    TestLive({
      commandRunner: uninstallWithUnmanagedClaudeSkill.runner,
      setupSkillInstaller: new SetupSkillInstaller({
        isClaudeSkillReady: Effect.succeed(true),
        hasManagedClaudeSkill: Effect.succeed(false),
        ensureClaudeSkill: Effect.succeed(false),
        removeClaudeSkill: Effect.succeed(false),
      }),
    })
  )('uninstall with an unmanaged Claude skill', it => {
    it.scoped('preserves the skill without treating plugin removal as a failure', () =>
      Effect.gen(function* () {
        yield* cli(['setup', '--uninstall', '--target', 'claude', '--yes']);

        expect(uninstallWithUnmanagedClaudeSkill.state.claude.plugin).toBe('missing');
        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain('Successfully uninstalled the Composio plugin for Claude Code.');
      })
    );
  });

  const nonInteractiveUninstall = makeFakeHosts({
    claude: { available: true, marketplace: 'canonical', plugin: 'enabled' },
  });
  layer(
    TestLive({
      commandRunner: nonInteractiveUninstall.runner,
      setupSkillInstaller: makeSkillInstaller(true),
    })
  )('non-interactive uninstall approval', it => {
    it.scoped('requires --yes before removing an installed plugin', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(cli(['setup', '--uninstall', '--target', 'claude']));

        expect(Exit.isFailure(exit)).toBe(true);
        expect(nonInteractiveUninstall.commands.some(parts => parts.includes('uninstall'))).toBe(
          false
        );
      })
    );
  });

  const conflictingUninstall = makeFakeHosts({
    claude: { available: true, marketplace: 'conflict', plugin: 'enabled' },
  });
  layer(
    TestLive({
      commandRunner: conflictingUninstall.runner,
      setupSkillInstaller: makeSkillInstaller(true),
    })
  )('uninstall with a conflicting marketplace', it => {
    it.scoped('removes the installed plugin without replacing the marketplace', () =>
      Effect.gen(function* () {
        yield* cli(['setup', '--uninstall', '--target', 'claude', '--yes']);

        expect(conflictingUninstall.state.claude.plugin).toBe('missing');
        expect(conflictingUninstall.state.claude.marketplace).toBe('conflict');
      })
    );
  });

  const failedUninstall = makeFakeHosts(
    { claude: { available: true, marketplace: 'canonical', plugin: 'enabled' } },
    { failOn: 'plugin uninstall' }
  );
  layer(
    TestLive({
      commandRunner: failedUninstall.runner,
      setupSkillInstaller: makeSkillInstaller(true),
    })
  )('native uninstall failure', it => {
    it.scoped('fails without reporting the plugin as removed', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          cli(['setup', '--uninstall', '--target', 'claude', '--yes'])
        );

        expect(Exit.isFailure(exit)).toBe(true);
        expect(failedUninstall.state.claude.plugin).toBe('enabled');
        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).not.toContain('Successfully uninstalled');
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

    it.scoped('can skip automatic setup for installer integration', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          cli(['setup', '--target', 'auto', '--yes', '--if-present'])
        );
        expect(Exit.isSuccess(exit)).toBe(true);

        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain('Claude Code and Codex not detected.');
      })
    );

    it.scoped('does not skip an explicitly requested missing host', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          cli(['setup', '--target', 'claude', '--yes', '--if-present'])
        );
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          expect(Cause.pretty(exit.cause)).toContain(
            'claude is not installed or not available on PATH'
          );
        }
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

  const legacyCodex = makeFakeHosts(
    { codex: { available: true } },
    { codexJsonInspection: false, codexVersion: 'codex-cli 0.137.0' }
  );

  const legacyClaude = makeFakeHosts(
    { claude: { available: true } },
    { claudeJsonInspection: false }
  );
  layer(TestLive({ commandRunner: legacyClaude.runner }))(
    'Claude without JSON plugin inspection',
    it => {
      it.scoped('fails automatic setup with actionable update instructions', () =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(cli(['setup', '--target', 'auto', '--yes']));

          expect(Exit.isFailure(exit)).toBe(true);
          if (Exit.isFailure(exit)) {
            const renderedCause = Cause.pretty(exit.cause);
            expect(renderedCause).toContain('requires JSON plugin inspection');
            expect(renderedCause).toContain('claude update');
          }
          expect(legacyClaude.commands.some(parts => parts.includes('--json'))).toBe(false);
          expect(
            legacyClaude.commands.some(parts =>
              ['add', 'install', 'enable', 'uninstall'].some(operation => parts.includes(operation))
            )
          ).toBe(false);
        })
      );
    }
  );
  layer(TestLive({ commandRunner: legacyCodex.runner }))(
    'Codex without JSON marketplace inspection',
    it => {
      it.scoped('fails automatic setup when no supported host remains', () =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(cli(['setup', '--target', 'auto', '--yes']));

          expect(Exit.isFailure(exit)).toBe(true);
          if (Exit.isFailure(exit)) {
            expect(Cause.pretty(exit.cause)).toContain('requires Codex 0.139.0 or newer');
          }
        })
      );

      it.scoped('skips cleanly for installer integration when no supported host remains', () =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            cli(['setup', '--target', 'auto', '--yes', '--if-present'])
          );

          expect(Exit.isSuccess(exit)).toBe(true);
          const output = (yield* MockConsole.getLines()).join('\n');
          expect(output).toContain('Codex plugin setup skipped.');
          expect(output).toContain('No supported agent host detected; plugin setup skipped.');
          expect(legacyCodex.commands.some(parts => parts.includes('--json'))).toBe(false);
        })
      );

      it.scoped('fails with an actionable upgrade message before running setup mutations', () =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(cli(['setup', '--target', 'codex', '--yes']));

          expect(Exit.isFailure(exit)).toBe(true);
          if (Exit.isFailure(exit)) {
            const renderedCause = Cause.pretty(exit.cause);
            expect(renderedCause).toContain('requires Codex 0.139.0 or newer');
            expect(renderedCause).toContain('codex update');
            expect(renderedCause).not.toContain("unexpected argument '--json'");
          }
          expect(legacyCodex.commands.some(parts => parts.includes('--json'))).toBe(false);
          expect(
            legacyCodex.commands.some(parts =>
              ['add', 'install', 'enable', 'remove'].some(operation => parts.includes(operation))
            )
          ).toBe(false);
        })
      );
    }
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
    it.scoped('inspects first but requires --yes before mutating hosts', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(cli(['setup', '--target', 'claude']));

        expect(Exit.isFailure(exit)).toBe(true);
        expect(nonInteractive.commands).toContainEqual(['claude', '--version']);
        expect(nonInteractive.commands).toContainEqual(['claude', 'plugin', 'list', '--json']);
        expect(
          nonInteractive.commands.some(parts =>
            ['add', 'install', 'enable'].some(operation => parts.includes(operation))
          )
        ).toBe(false);
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
          expect(renderedCause).toContain(
            'The `claude --version` command timed out after 2 minutes'
          );
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
    it.scoped('preserves the structured setup process failure as the command cause', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(cli(['setup', '--target', 'claude', '--yes']));
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          const failure = Cause.squash(exit.cause);
          expect(failure).toBeInstanceOf(SetupCommandError);
          if (failure instanceof SetupCommandError) {
            expect(failure.operation).toBe('setup');
            expect(failure.cause).toBeInstanceOf(SetupProcessError);
            if (failure.cause instanceof SetupProcessError) {
              expect(failure.cause).toMatchObject({ target: 'claude', stage: 'mutate' });
            }
          }
        }
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
