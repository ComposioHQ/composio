import { layer } from '@effect/vitest';
import { Effect } from 'effect';
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

const getVisibleRootCommandNames = () =>
  buildRootCommand(stableVisibility).subcommands.flatMap(group =>
    group.commands.map(cmd => cmd.name)
  );

describe('subcommand help registry consistency', () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('has a curated help entry for every visible root command', () => {
    for (const name of getVisibleRootCommandNames()) {
      const matched = matchSubcommandHelp(['bun', 'composio', name, '--help'], stableVisibility);
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
          yield* printSubcommandHelp(cmd, stableVisibility);
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          expect(output, `\`composio ${cmd}\` help page`).toContain('USAGE');
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
          yield* cli(['help', 'frobnicate']).pipe(Effect.catch(() => Effect.void));
          const stdout = (yield* MockConsole.getLines({ stripAnsi: true, stream: 'stdout' })).join(
            '\n'
          );
          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

          // The framework renders its unknown-subcommand failure (stderr channel,
          // "Did you mean?", exit 1 via CliError.ShowHelp) instead of an exit-0
          // "Unknown command" line on the stdout data channel.
          expect(stdout).not.toContain('Unknown command');
          expect(output).not.toContain('Unknown command');
          expect(output).toContain('generate');
        })
      );
    });
  });
});
