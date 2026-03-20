import { Effect } from 'effect';
import { Command } from '@effect/cli';
import * as constants from 'src/constants';
import { $defaultCmd } from './$default.cmd';
import { getVersion } from 'src/effects/version';
import { versionCmd } from './version.cmd';
import { upgradeCmd } from './upgrade.cmd';
import { whoamiCmd } from './whoami.cmd';
import { loginCmd } from './login.cmd';
import { logoutCmd } from './logout.cmd';
import { installCmd } from './install.cmd';
import { initCmd } from './init.cmd';
import { generateCmd } from './generate/generate.cmd';
import { manageCmd } from './manage/manage.cmd';
import { showToolsExecuteInputHelp } from './tools/commands/tools.execute.cmd';
import { printRootHelp } from './root-help';
import { rootToolsCmd$Search } from './tools/commands/tools.search.cmd';
import { rootToolsCmd$Execute } from './tools/commands/tools.execute.cmd';
import { rootConnectedAccountsCmd$Link } from './connected-accounts/commands/connected-accounts.link.cmd';
import { triggersCmd$Listen } from './triggers/commands/triggers.listen.cmd';

const $cmd = $defaultCmd.pipe(
  Command.withSubcommands([
    versionCmd,
    upgradeCmd,
    whoamiCmd,
    loginCmd,
    logoutCmd,
    installCmd,
    initCmd,
    rootToolsCmd$Search,
    rootConnectedAccountsCmd$Link,
    rootToolsCmd$Execute,
    triggersCmd$Listen,
    generateCmd,
    manageCmd,
  ])
);
export const rootCommand = $cmd;

const parseExecuteInputHelpSlug = (argv: ReadonlyArray<string>): string | undefined => {
  const args = argv.slice(2);
  const isRootExecute = args[0] === 'execute';
  const isManageExecute = args[0] === 'manage' && args[1] === 'tools' && args[2] === 'execute';
  if (!isRootExecute && !isManageExecute) return undefined;

  const hasHelp = args.includes('--help') || args.includes('-h');
  if (!hasHelp) return undefined;

  const tail = isRootExecute ? args.slice(1) : args.slice(3);
  for (let i = 0; i < tail.length; i += 1) {
    const token = tail[i];
    if (!token) continue;

    // Stop option parsing after "--" and treat next positional as slug.
    if (token === '--') {
      const candidate = tail[i + 1];
      return candidate && !candidate.startsWith('-') ? candidate : undefined;
    }

    // Ignore help flags.
    if (token === '--help' || token === '-h') {
      continue;
    }

    // Skip known execute option values.
    if (
      token === '--data' ||
      token === '-d' ||
      token === '--user-id' ||
      token === '--project-name'
    ) {
      i += 1;
      continue;
    }
    if (
      token.startsWith('--data=') ||
      token.startsWith('-d=') ||
      token.startsWith('--user-id=') ||
      token.startsWith('--project-name=')
    ) {
      continue;
    }

    // Skip unknown flags.
    if (token.startsWith('-')) {
      continue;
    }

    // First positional token is the slug.
    return token;
  }

  return undefined;
};

const normalizeVersionShortFlag = (argv: ReadonlyArray<string>): ReadonlyArray<string> => {
  const args = argv.slice(2);
  if (args.length === 1 && args[0] === '-v') {
    return [...argv.slice(0, 2), '--version'];
  }
  return argv;
};

const isRootHelp = (argv: ReadonlyArray<string>): boolean => {
  const args = argv.slice(2);
  return args.length === 1 && (args[0] === '--help' || args[0] === '-h');
};

export const runWithConfig = Effect.gen(function* () {
  const version = yield* getVersion;
  const run = Command.run($cmd, {
    name: 'composio',
    executable: 'composio',
    version,
  });

  return (argv: ReadonlyArray<string>) => {
    const normalizedArgv = normalizeVersionShortFlag(argv);
    if (isRootHelp(normalizedArgv)) {
      return printRootHelp();
    }
    const executeHelpSlug = parseExecuteInputHelpSlug(normalizedArgv);
    if (executeHelpSlug) {
      return showToolsExecuteInputHelp(executeHelpSlug);
    }
    return run(normalizedArgv);
  };
});

export const run = Command.run($cmd, {
  name: 'composio',
  version: constants.APP_VERSION,
  executable: 'composio',
});
