import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, layer } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { afterEach, beforeEach, vi } from 'vitest';
import { CommandRunner } from 'src/services/command-runner';
import { NodeOs } from 'src/services/node-os';
import { SetupSkillInstaller } from 'src/services/setup-skill-installer';
import { getTerminalCapabilities, TerminalUI } from 'src/services/terminal-ui';
import { cli, TestLive } from 'test/__utils__';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';
import { eventsNamed, trackedEvents } from 'test/__utils__/tracked-events';

vi.mock('src/analytics/dispatch', async importOriginal => {
  const { recordTrackedEvent } = await import('test/__utils__/tracked-events');
  return {
    ...(await importOriginal<typeof import('src/analytics/dispatch')>()),
    trackCliEventEffect: recordTrackedEvent,
  };
});

type AgentHost = 'claude' | 'codex';

interface FakeHostState {
  available: boolean;
  marketplace: boolean;
  plugin: boolean;
}

const makeFakeHosts = (
  initial: Partial<Record<AgentHost, Partial<FakeHostState>>>,
  options: {
    readonly failOn?: string;
    readonly codexVersion?: string;
  } = {}
) => {
  const state: Record<AgentHost, FakeHostState> = {
    claude: { available: false, marketplace: false, plugin: false, ...initial.claude },
    codex: { available: false, marketplace: false, plugin: false, ...initial.codex },
  };

  const marketplaceOutput = (host: AgentHost): string => {
    if (!state[host].marketplace) return host === 'claude' ? '[]' : '{"marketplaces":[]}';
    if (host === 'claude') {
      return JSON.stringify([
        {
          name: 'composio',
          source: {
            source: 'github',
            repo: 'https://github.com/ComposioHQ/composio-plugin-cc.git',
          },
        },
      ]);
    }
    return JSON.stringify({
      marketplaces: [
        {
          name: 'composio',
          marketplaceSource: { sourceType: 'git', source: 'ComposioHQ/composio-plugin-openai' },
        },
      ],
    });
  };

  const pluginOutput = (host: AgentHost): string => {
    if (host === 'claude') {
      if (!state.claude.plugin) return '[]';
      return JSON.stringify([{ id: 'composio@composio', scope: 'user', enabled: true }]);
    }
    if (!state.codex.plugin) return '{"installed":[],"available":[]}';
    return JSON.stringify({
      installed: [{ pluginId: 'composio@composio', installed: true, enabled: true }],
      available: [],
    });
  };

  const runner = CommandRunner.of({
    run: () => Effect.succeed(ChildProcessSpawner.ExitCode(0)),
    capture: rawCommand => {
      if (!ChildProcess.isStandardCommand(rawCommand)) {
        throw new Error('Expected a standard command');
      }
      const parts = [rawCommand.command, ...rawCommand.args];
      const host = parts[0] as AgentHost;
      const command = parts.join(' ');
      const respond = (result: { exitCode?: number; stdout?: string; stderr?: string }) =>
        Effect.succeed({
          exitCode: result.exitCode ?? 0,
          stdout: result.stdout ?? '',
          stderr: result.stderr ?? '',
        });

      if (parts[1] === '--version') {
        if (!state[host].available) return respond({ exitCode: 127, stderr: 'not found' });
        return respond({
          stdout: host === 'claude' ? '2.1.0' : (options.codexVersion ?? 'codex-cli 0.144.1'),
        });
      }
      if (command.endsWith('--help')) {
        return respond({ stdout: `Usage: ${host} plugin\n\n      --json` });
      }
      if (options.failOn && command.includes(options.failOn)) {
        return respond({ exitCode: 2, stderr: 'native operation failed' });
      }
      if (command === `${host} plugin marketplace list --json`) {
        return respond({ stdout: marketplaceOutput(host) });
      }
      if (command === `${host} plugin list --json`) {
        return respond({ stdout: pluginOutput(host) });
      }
      if (command.includes('plugin marketplace add')) {
        state[host].marketplace = true;
        return respond({});
      }
      if (
        command === 'claude plugin uninstall composio@composio --scope user --yes' ||
        command === 'codex plugin remove composio@composio --json'
      ) {
        state[host].plugin = false;
        return respond({});
      }
      if (
        command.includes('plugin install') ||
        command.includes('plugin enable') ||
        command === 'codex plugin add composio@composio --json'
      ) {
        state[host].plugin = true;
        return respond({});
      }
      return respond({});
    },
  });

  return { runner, state };
};

const makeSkillInstaller = (initiallyReady = false) => {
  let ready = initiallyReady;
  return SetupSkillInstaller.of({
    isClaudeSkillReady: Effect.sync(() => ready),
    hasManagedClaudeSkill: Effect.sync(() => ready),
    ensureClaudeSkill: Effect.sync(() => {
      const changed = !ready;
      ready = true;
      return changed;
    }),
    removeClaudeSkill: Effect.sync(() => {
      const changed = ready;
      ready = false;
      return changed;
    }),
  });
};

// The cancellation path requires an interactive terminal to reach the confirm prompt.
const decliningUI = TerminalUI.of({
  ...terminalUITestImpl,
  capabilities: Effect.succeed(
    getTerminalCapabilities({
      stdin: { isTTY: true },
      stdout: { isTTY: false },
      stderr: { isTTY: true },
    })
  ),
  confirm: () => Effect.succeed(false),
});

describe('CLI: composio setup telemetry', () => {
  beforeEach(() => {
    trackedEvents.length = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.exitCode = undefined;
  });

  const hostSignals = makeFakeHosts({ claude: { available: true } });
  layer(
    TestLive({
      commandRunner: hostSignals.runner,
      setupSkillInstaller: makeSkillInstaller(),
    })
  )('undetected host presence signals', it => {
    it.effect('reports the config dir and known binary paths only for the undetected host', () =>
      Effect.gen(function* () {
        vi.stubEnv('CODEX_HOME', '');
        const os = yield* NodeOs;
        mkdirSync(join(os.homedir, '.codex'), { recursive: true });
        mkdirSync(join(os.homedir, '.local', 'bin'), { recursive: true });
        writeFileSync(join(os.homedir, '.local', 'bin', 'codex'), '');

        yield* cli(['setup', '--target', 'auto', '--yes']);

        const detected = eventsNamed('CLI_SETUP_HOST_DETECTED');
        const codex = detected.find(event => event.properties?.agent_host === 'codex');
        const claude = detected.find(event => event.properties?.agent_host === 'claude');
        expect(codex?.properties).toMatchObject({
          available: false,
          host_config_dir_present: true,
          host_binary_in_known_paths: true,
        });
        expect(claude?.properties).toMatchObject({ available: true });
        expect(claude?.properties?.host_config_dir_present).toBeUndefined();
        expect(claude?.properties?.host_binary_in_known_paths).toBeUndefined();
      })
    );
  });

  const freshClaude = makeFakeHosts({ claude: { available: true } });
  layer(
    TestLive({
      commandRunner: freshClaude.runner,
      setupSkillInstaller: makeSkillInstaller(),
    })
  )('fresh Claude install', it => {
    it.effect('tracks per-host detection and a verified plugin install', () =>
      Effect.gen(function* () {
        yield* cli(['setup', '--target', 'auto', '--yes']);

        const detectedEvents = eventsNamed('CLI_SETUP_HOST_DETECTED');
        expect(detectedEvents).toHaveLength(2);
        expect(detectedEvents.map(event => event.properties)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              agent_host: 'claude',
              available: true,
              supported: true,
              host_version: '2.1.0',
              unsupported_reason_code: undefined,
              operation: 'setup',
              requested_target: 'auto',
              source: 'cli',
            }),
            expect.objectContaining({
              agent_host: 'codex',
              available: false,
              supported: false,
              unsupported_reason_code: undefined,
            }),
          ])
        );

        expect(eventsNamed('CLI_PLUGIN_SETUP_SUCCEEDED')).toEqual([
          expect.objectContaining({
            properties: expect.objectContaining({
              agent_host: 'claude',
              operation: 'setup',
              action: 'installed',
            }),
          }),
        ]);
        expect(eventsNamed('CLI_PLUGIN_SETUP_FAILED')).toHaveLength(0);
      })
    );
  });

  const legacyCodex = makeFakeHosts(
    { codex: { available: true } },
    { codexVersion: 'codex-cli 0.137.0' }
  );
  layer(TestLive({ commandRunner: legacyCodex.runner }))('unsupported Codex only', it => {
    it.effect('tracks the normalized reason code and the installer skip', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          cli(['setup', '--target', 'auto', '--yes', '--if-present'])
        );
        expect(Exit.isSuccess(exit)).toBe(true);

        expect(eventsNamed('CLI_SETUP_HOST_DETECTED')).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              properties: expect.objectContaining({
                agent_host: 'codex',
                available: true,
                supported: false,
                unsupported_reason_code: 'codex_too_old',
              }),
            }),
          ])
        );
        expect(eventsNamed('CLI_SETUP_SKIPPED')).toEqual([
          expect.objectContaining({
            properties: expect.objectContaining({
              operation: 'setup',
              requested_target: 'auto',
              reason: 'no_host_detected',
            }),
          }),
        ]);
      })
    );
  });

  const noHosts = makeFakeHosts({});
  layer(TestLive({ commandRunner: noHosts.runner }))('no detected host', it => {
    it.effect('tracks the installer skip when nothing is detected', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          cli(['setup', '--target', 'auto', '--yes', '--if-present'])
        );
        expect(Exit.isSuccess(exit)).toBe(true);

        expect(eventsNamed('CLI_SETUP_SKIPPED')).toEqual([
          expect.objectContaining({
            properties: expect.objectContaining({ reason: 'no_host_detected' }),
          }),
        ]);
        expect(eventsNamed('CLI_SETUP_CANCELLED')).toHaveLength(0);
      })
    );

    it.effect('reports absent config dirs for every undetected host', () =>
      Effect.gen(function* () {
        vi.stubEnv('CLAUDE_CONFIG_DIR', '');
        vi.stubEnv('CODEX_HOME', '');

        yield* cli(['setup', '--target', 'auto', '--yes', '--if-present']);

        const detected = eventsNamed('CLI_SETUP_HOST_DETECTED');
        expect(detected).toHaveLength(2);
        for (const event of detected) {
          expect(event.properties).toMatchObject({
            available: false,
            host_config_dir_present: false,
            host_binary_in_known_paths: expect.any(Boolean),
          });
        }
      })
    );
  });

  const declinedSetup = makeFakeHosts({ claude: { available: true } });
  layer(
    TestLive({
      commandRunner: declinedSetup.runner,
      setupSkillInstaller: makeSkillInstaller(),
      terminalUI: decliningUI,
    })
  )('declined interactive setup', it => {
    it.effect('tracks user cancellation without mutating the host', () =>
      Effect.gen(function* () {
        yield* cli(['setup', '--target', 'claude']);

        expect(eventsNamed('CLI_SETUP_CANCELLED')).toEqual([
          expect.objectContaining({
            properties: expect.objectContaining({
              operation: 'setup',
              requested_target: 'claude',
              reason: 'user_declined',
            }),
          }),
        ]);
        expect(declinedSetup.state.claude.plugin).toBe(false);
        expect(eventsNamed('CLI_PLUGIN_SETUP_SUCCEEDED')).toHaveLength(0);
      })
    );
  });

  const declinedUninstall = makeFakeHosts({
    claude: { available: true, marketplace: true, plugin: true },
  });
  layer(
    TestLive({
      commandRunner: declinedUninstall.runner,
      setupSkillInstaller: makeSkillInstaller(true),
      terminalUI: decliningUI,
    })
  )('declined interactive uninstall', it => {
    it.effect('tracks user cancellation for the uninstall operation', () =>
      Effect.gen(function* () {
        yield* cli(['setup', '--uninstall', '--target', 'claude']);

        expect(eventsNamed('CLI_SETUP_CANCELLED')).toEqual([
          expect.objectContaining({
            properties: expect.objectContaining({
              operation: 'uninstall',
              requested_target: 'claude',
              reason: 'user_declined',
            }),
          }),
        ]);
        expect(declinedUninstall.state.claude.plugin).toBe(true);
      })
    );
  });

  const failedInstall = makeFakeHosts(
    { claude: { available: true } },
    { failOn: 'plugin install' }
  );
  layer(
    TestLive({
      commandRunner: failedInstall.runner,
      setupSkillInstaller: makeSkillInstaller(),
    })
  )('native install failure', it => {
    it.effect('tracks the per-host failure with its phase', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(cli(['setup', '--target', 'claude', '--yes']));
        expect(Exit.isFailure(exit)).toBe(true);

        const failureEvents = eventsNamed('CLI_PLUGIN_SETUP_FAILED');
        expect(failureEvents).toEqual([
          expect.objectContaining({
            properties: expect.objectContaining({
              agent_host: 'claude',
              operation: 'setup',
              phase: 'install',
              error_name: 'services/SetupProcessError',
            }),
          }),
        ]);
        expect(failureEvents[0]?.properties).not.toHaveProperty('error_message');
        expect(eventsNamed('CLI_PLUGIN_SETUP_SUCCEEDED')).toHaveLength(0);
      })
    );
  });
});
