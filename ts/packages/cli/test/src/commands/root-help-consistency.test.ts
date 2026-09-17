import { layer } from '@effect/vitest';
import { Effect } from 'effect';
import { teardown } from 'src/cli-main';
import { afterEach, describe, expect, it } from 'vitest';
import { buildRootCommand } from 'src/commands';
import {
  getCommandHelpText,
  matchSubcommandHelp,
  printSubcommandHelp,
} from 'src/commands/root-help';
import { cli, MockConsole, TestLive } from 'test/__utils__';

const stableVisibility = {
  isDevModeEnabled: true,
  isExperimentalFeatureEnabled: () => false,
};

// Beta builds expose experimental commands, so the registry check covers that surface too.
const allFeaturesVisibility = {
  isDevModeEnabled: true,
  isExperimentalFeatureEnabled: () => true,
};

const getVisibleRootCommandNames = (visibility: typeof stableVisibility) =>
  buildRootCommand(visibility).subcommands.flatMap(group => group.commands.map(cmd => cmd.name));

/** Runs the CLI and returns the exit code `cli-main` would hand the process, plus split streams. */
const runCapturingExit = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(cli(args));
    let exitCode = 0;
    teardown(exit, code => {
      exitCode = code;
    });
    const stdout = (yield* MockConsole.getLines({ stripAnsi: true, stream: 'stdout' })).join('\n');
    const stderr = (yield* MockConsole.getLines({ stripAnsi: true, stream: 'stderr' })).join('\n');
    return { exitCode, stdout, stderr };
  });

describe('subcommand help registry consistency', () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  it.each([
    ['stable', stableVisibility],
    ['all experimental features', allFeaturesVisibility],
  ])('has a curated help entry for every visible root command (%s)', (_, visibility) => {
    for (const name of getVisibleRootCommandNames(visibility)) {
      const matched = matchSubcommandHelp(['bun', 'composio', name, '--help'], visibility);
      expect(matched, `missing curated help for \`composio ${name}\``).toBe(name);
    }
  });

  it('matches every orgs family invocation', () => {
    expect(matchSubcommandHelp(['bun', 'composio', 'orgs', '--help'], stableVisibility)).toBe(
      'orgs'
    );
    expect(
      matchSubcommandHelp(['bun', 'composio', 'orgs', 'list', '--help'], stableVisibility)
    ).toBe('orgs list');
    expect(
      matchSubcommandHelp(['bun', 'composio', 'orgs', 'switch', '--help'], stableVisibility)
    ).toBe('orgs switch');
    expect(
      matchSubcommandHelp(['bun', 'composio', 'orgs', '--help', 'full'], stableVisibility)
    ).toBe('orgs');
  });

  it('matches every agent family invocation', () => {
    expect(matchSubcommandHelp(['bun', 'composio', 'agent', '--help'], stableVisibility)).toBe(
      'agent'
    );
    for (const child of ['signup', 'login', 'whoami', 'inbox', 'claim']) {
      expect(
        matchSubcommandHelp(['bun', 'composio', 'agent', child, '--help'], stableVisibility),
        `missing curated help for \`composio agent ${child}\``
      ).toBe(`agent ${child}`);
    }
  });

  it('uses the current orgs description in contextual help', () => {
    expect(getCommandHelpText('orgs', stableVisibility)).toContain(
      'Manage default global organization/project context.'
    );
  });

  layer(TestLive())(it => {
    it.effect('renders the curated orgs page', () =>
      Effect.gen(function* () {
        yield* printSubcommandHelp('orgs', stableVisibility);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('USAGE');
        expect(output).toContain('composio orgs <subcommand>');
        expect(output).toContain('SEE ALSO');
        expect(output).toContain('composio orgs list');
        expect(output).toContain('composio orgs switch');
      })
    );
  });

  layer(TestLive())(it => {
    it.effect('renders curated pages for formerly raw-fallback groups', () =>
      Effect.gen(function* () {
        for (const cmd of ['connections', 'triggers', 'tools', 'artifacts', 'install']) {
          // MockConsole accumulates across renders; inspect only this page's lines.
          const before = (yield* MockConsole.getLines()).length;
          yield* printSubcommandHelp(cmd, stableVisibility);
          const output = (yield* MockConsole.getLines({ stripAnsi: true }))
            .slice(before)
            .join('\n');
          expect(output, `\`composio ${cmd}\` help page`).toContain('USAGE');
          expect(output, `\`composio ${cmd}\` help page`).toContain(`composio ${cmd}`);
        }
      })
    );
  });

  layer(TestLive())(it => {
    it.effect('renders the curated agent signup page', () =>
      Effect.gen(function* () {
        yield* printSubcommandHelp('agent signup', stableVisibility);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('USAGE');
        expect(output).toContain('composio agent signup');
        expect(output).toContain('--no-wait');
        expect(output).toContain('Sign up and optionally log in as a Composio agent.');
      })
    );
  });

  describe('composio help routing', () => {
    layer(TestLive())(it => {
      it.effect('bare `composio help` prints the root help page', () =>
        Effect.gen(function* () {
          yield* cli(['help']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

          expect(output).toContain('USAGE');
          expect(output).toContain('LEARN MORE');
        })
      );
    });

    layer(TestLive())(it => {
      it.effect('`composio help orgs` matches `composio orgs --help`', () =>
        Effect.gen(function* () {
          yield* cli(['help', 'orgs']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

          expect(output).toContain('USAGE');
          expect(output).toContain('composio orgs <subcommand>');
          expect(output).toContain('composio orgs list');
        })
      );
    });

    layer(TestLive())(it => {
      it.effect('`composio help orgs list` prints the orgs list page', () =>
        Effect.gen(function* () {
          yield* cli(['help', 'orgs', 'list']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

          expect(output).toContain('composio orgs list [--limit integer]');
        })
      );
    });

    layer(TestLive())(it => {
      it.effect('`composio help agent signup` prints the agent signup page', () =>
        Effect.gen(function* () {
          yield* cli(['help', 'agent', 'signup']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

          expect(output).toContain('composio agent signup');
          expect(output).toContain('--no-wait');
        })
      );
    });

    layer(TestLive())(it => {
      it.effect('`composio help orgs simple` applies the simple level', () =>
        Effect.gen(function* () {
          yield* cli(['help', 'orgs', 'simple']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

          expect(output).toContain('USAGE');
          expect(output).not.toContain('SEE ALSO');
        })
      );
    });

    layer(TestLive())(it => {
      it.effect('`composio help orgs full` applies the full level', () =>
        Effect.gen(function* () {
          yield* cli(['help', 'orgs', 'full']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

          expect(output).toContain('composio orgs <subcommand>');
          expect(output).toContain('SEE ALSO');
        })
      );
    });

    layer(TestLive())(it => {
      it.effect('`composio help orgs --help` tolerates a trailing help flag', () =>
        Effect.gen(function* () {
          yield* cli(['help', 'orgs', '--help']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

          expect(output).toContain('composio orgs <subcommand>');
        })
      );
    });

    layer(TestLive())(it => {
      it.effect('`composio help dev toolkits` falls back to the curated dev page', () =>
        Effect.gen(function* () {
          yield* cli(['help', 'dev', 'toolkits']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

          expect(output).toContain('GUARDED');
        })
      );
    });

    layer(TestLive())(it => {
      it.effect('`composio help <unknown>` fails like any unknown command', () =>
        Effect.gen(function* () {
          const { exitCode, stdout, stderr } = yield* runCapturingExit(['help', 'frobnicate']);

          // The framework renders its unknown-subcommand failure (stderr channel,
          // "Did you mean?", exit 1 via CliError.ShowHelp) instead of an exit-0
          // "Unknown command" line on the stdout data channel.
          expect(exitCode).toBe(1);
          expect(stdout).toBe('');
          expect(stderr).toContain('generate');
          expect(stderr).toContain('Unknown subcommand "frobnicate"');
          expect(stderr).not.toContain('Unknown subcommand "help"');
        })
      );
    });

    layer(TestLive())(it => {
      it.effect('`composio help <typo>` suggests the closest command', () =>
        Effect.gen(function* () {
          const { exitCode, stdout, stderr } = yield* runCapturingExit(['help', 'orgz']);

          expect(exitCode).toBe(1);
          expect(stdout).toBe('');
          expect(stderr).toContain('Unknown subcommand "orgz"');
          expect(stderr).toContain('Did you mean this?');
        })
      );
    });

    layer(TestLive())(it => {
      it.effect('`composio help --help` renders the curated root help', () =>
        Effect.gen(function* () {
          const { exitCode, stdout, stderr } = yield* runCapturingExit(['help', '--help']);

          expect(exitCode).toBe(0);
          expect(stdout).toContain('LEARN MORE');
          expect(stdout).not.toContain('--log-level');
          expect(stderr).not.toContain('Unknown subcommand');
        })
      );
    });

    layer(TestLive())(it => {
      it.effect('`composio help orgs full --help` keeps the requested level', () =>
        Effect.gen(function* () {
          yield* cli(['help', 'orgs', 'full', '--help']);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

          expect(output).toContain('composio orgs <subcommand>');
          expect(output).toContain('SEE ALSO');
        })
      );
    });
  });
});
