import { Command, CommandExecutor } from '@effect/platform';
import { describe, expect, layer } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import { afterEach, vi } from 'vitest';
import { CommandRunner } from 'src/services/command-runner';
import { SetupSkillInstaller } from 'src/services/setup-skill-installer';
import { cli, MockConsole, TestLive } from 'test/__utils__';

type AgentHost = 'claude' | 'codex';
type MarketplaceState = 'missing' | 'canonical' | 'conflict';
type PluginState = 'missing' | 'disabled' | 'enabled';

interface FakeHostState {
  available: boolean;
  marketplace: MarketplaceState;
  plugin: PluginState;
}

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
  return new SetupSkillInstaller({
    isClaudeSkillInstalled: Effect.sync(() => ready),
    ensureClaudeSkill: failInstall
      ? Effect.fail(new Error('skill download failed'))
      : Effect.sync(() => {
          const changed = !ready;
          ready = true;
          return changed;
        }),
  });
};

const defaultHostState = (): FakeHostState => ({
  available: false,
  marketplace: 'missing',
  plugin: 'missing',
});

const makeFakeHosts = (
  initial: Partial<Record<AgentHost, Partial<FakeHostState>>>,
  options: { readonly noOp?: boolean; readonly failOn?: string } = {}
) => {
  const state: Record<AgentHost, FakeHostState> = {
    claude: { ...defaultHostState(), ...initial.claude },
    codex: { ...defaultHostState(), ...initial.codex },
  };
  const commands: string[][] = [];

  const marketplaceOutput = (host: AgentHost): string => {
    const current = state[host].marketplace;
    const source =
      current === 'canonical'
        ? host === 'claude'
          ? 'https://github.com/ComposioHQ/composio-plugin-cc.git'
          : 'ComposioHQ/composio-plugin-openai'
        : 'someone-else/not-composio';
    if (host === 'claude') {
      return current === 'missing'
        ? '[]'
        : JSON.stringify([{ name: 'composio', source: { source: 'github', repo: source } }]);
    }
    return JSON.stringify({
      marketplaces:
        current === 'missing'
          ? []
          : [
              {
                name: 'composio',
                marketplaceSource: { sourceType: 'git', source },
              },
            ],
    });
  };

  const pluginOutput = (host: AgentHost): string => {
    const current = state[host].plugin;
    const installed = current !== 'missing';
    const enabled = current === 'enabled';
    return host === 'claude'
      ? JSON.stringify(installed ? [{ id: 'composio@composio', installed, enabled }] : [])
      : JSON.stringify({
          installed: installed ? [{ pluginId: 'composio@composio', installed, enabled }] : [],
          available: [],
        });
  };

  const runner = makeRunner(parts => {
    commands.push([...parts]);
    const host = parts[0] as AgentHost;
    const command = parts.join(' ');
    if (parts[1] === '--version') {
      return state[host].available
        ? { stdout: host === 'claude' ? '2.1.0' : 'codex-cli 0.144.1' }
        : { exitCode: 127, stderr: 'not found' };
    }
    if (command === `${host} plugin marketplace list --json`) {
      return { stdout: marketplaceOutput(host) };
    }
    if (command === `${host} plugin list --json`) {
      return { stdout: pluginOutput(host) };
    }
    if (options.failOn && command.includes(options.failOn)) {
      return { exitCode: 2, stderr: 'native operation failed' };
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
        expect((yield* MockConsole.getLines()).join('\n')).toContain('"success":true');
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
        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain('"changed":false');
        expect(output).toContain('"success":true');
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
          expect((yield* MockConsole.getLines()).join('\n')).toContain('"plugin_enabled":true');
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

        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain('"target":"claude"');
        expect(output).not.toContain('"target":"codex"');
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

        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain('"target":"claude"');
        expect(output).toContain('"target":"codex"');
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
