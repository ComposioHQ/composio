import { CommandDescriptor } from '@effect/cli';
import { HashMap } from 'effect';
import { describe, expect, it } from 'vitest';
import { buildRootCommand } from 'src/commands';
import {
  getCommandHelpText,
  matchCommandFromArgv,
  matchSubcommandHelp,
} from 'src/commands/root-help';

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
});
