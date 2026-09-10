import { layer } from '@effect/vitest';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { buildRootCommand } from 'src/commands';
import {
  getCommandHelpText,
  matchSubcommandHelp,
  printSubcommandHelp,
} from 'src/commands/root-help';
import { MockConsole, TestLive } from 'test/__utils__';

const stableVisibility = {
  isDevModeEnabled: true,
  isExperimentalFeatureEnabled: () => false,
};

const getVisibleRootCommandNames = () =>
  buildRootCommand(stableVisibility).subcommands.flatMap(group =>
    group.commands.map(cmd => cmd.name)
  );

describe('subcommand help registry consistency', () => {
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

  it('renders the curated orgs page', () =>
    Effect.gen(function* () {
      yield* printSubcommandHelp('orgs', stableVisibility);
      const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

      expect(output).toContain('USAGE');
      expect(output).toContain('composio orgs <subcommand>');
      expect(output).toContain('SEE ALSO');
      expect(output).toContain('composio orgs list');
      expect(output).toContain('composio orgs switch');
    }));

  it('renders curated pages for formerly raw-fallback groups', () =>
    Effect.gen(function* () {
      for (const cmd of ['connections', 'triggers', 'tools', 'artifacts', 'install']) {
        yield* printSubcommandHelp(cmd, stableVisibility);
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output, `\`composio ${cmd}\` help page`).toContain('USAGE');
      }
    }));

  it('uses the current orgs description in contextual help', () => {
    expect(getCommandHelpText('orgs', stableVisibility)).toContain(
      'Manage default global organization/project context.'
    );
  });
});
