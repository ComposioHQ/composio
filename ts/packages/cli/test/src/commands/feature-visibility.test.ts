import { CommandDescriptor } from '@effect/cli';
import { layer } from '@effect/vitest';
import { Effect, HashMap } from 'effect';
import { describe, expect, it } from 'vitest';
import { buildRootCommand } from 'src/commands';
import {
  getCommandHelpText,
  matchCommandFromArgv,
  matchSubcommandHelp,
  printSubcommandHelp,
} from 'src/commands/root-help';
import { MockConsole, TestLive } from 'test/__utils__';

const stableVisibility = {
  isDevModeEnabled: true,
  isExperimentalFeatureEnabled: () => false,
};

const betaVisibility = {
  isDevModeEnabled: true,
  isExperimentalFeatureEnabled: () => true,
};

const getSubcommandNames = (visibility: typeof stableVisibility) =>
  HashMap.toEntries(CommandDescriptor.getSubcommands(buildRootCommand(visibility).descriptor)).map(
    ([name]) => name
  );

describe('CLI experimental feature visibility', () => {
  it('hides listen from the stable root command graph', () => {
    expect(getSubcommandNames(stableVisibility)).not.toContain('listen');
    expect(getSubcommandNames(betaVisibility)).toContain('listen');
  });

  it('hides listen help when the feature is disabled', () => {
    expect(matchSubcommandHelp(['bun', 'composio', 'listen', '--help'], stableVisibility)).toBe(
      undefined
    );
    expect(matchSubcommandHelp(['bun', 'composio', 'listen', '--help'], betaVisibility)).toBe(
      'listen'
    );
  });

  it('hides contextual listen help when the feature is disabled', () => {
    expect(matchCommandFromArgv(['bun', 'composio', 'listen'], stableVisibility)).toBe(undefined);
    expect(matchCommandFromArgv(['bun', 'composio', 'listen'], betaVisibility)).toBe('listen');
    expect(getCommandHelpText('listen', stableVisibility)).toBe(undefined);
    expect(getCommandHelpText('listen', betaVisibility)).toContain('composio listen');
  });

  it('accepts help mode suffixes when matching subcommand help', () => {
    expect(
      matchSubcommandHelp(['bun', 'composio', 'search', '--help', 'simple'], stableVisibility)
    ).toBe('search');
    expect(
      matchSubcommandHelp(['bun', 'composio', 'search', '--help', 'full'], stableVisibility)
    ).toBe('search');
  });
});

describe('CLI help levels', () => {
  layer(TestLive())(it => {
    it.scoped('renders compact subcommand help in simple mode', () =>
      Effect.gen(function* () {
        yield* printSubcommandHelp('run', stableVisibility, 'simple');
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain('USAGE');
        expect(output).toContain('DESCRIPTION');
        expect(output).not.toContain('EXAMPLES');
        expect(output).not.toContain('INJECTED HELPERS');
      })
    );
  });
});
