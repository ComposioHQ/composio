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
import { initCmd } from './init.cmd';
import { pyCmd } from './py/py.cmd';
import { tsCmd } from './ts/ts.cmd';
import { generateCmd } from './generate.cmd';
import { toolkitsCmd } from './toolkits/toolkits.cmd';
import { toolsCmd } from './tools/tools.cmd';
import { authConfigsCmd } from './auth-configs/auth-configs.cmd';
import { connectedAccountsCmd } from './connected-accounts/connected-accounts.cmd';
import { triggersCmd } from './triggers/triggers.cmd';
import { logsCmd } from './logs-cmd/logs.cmd';
import { orgsCmd } from './orgs/orgs.cmd';
import { projectsCmd } from './projects/projects.cmd';
import { showToolsExecuteInputHelp } from './tools/commands/tools.execute.cmd';
import { printRootHelp } from './root-help';

const $cmd = $defaultCmd.pipe(
  Command.withSubcommands([
    versionCmd,
    upgradeCmd,
    whoamiCmd,
    loginCmd,
    logoutCmd,
    initCmd,
    generateCmd,
    pyCmd,
    tsCmd,
    toolkitsCmd,
    toolsCmd,
    authConfigsCmd,
    connectedAccountsCmd,
    triggersCmd,
    logsCmd,
    orgsCmd,
    projectsCmd,
  ])
);

export const rootCommand = $cmd;

const parseExecuteInputHelpSlug = (argv: ReadonlyArray<string>): string | undefined => {
  const args = argv.slice(2);
  if (args.length < 3) return undefined;
  if (args[0] !== 'tools' || args[1] !== 'execute') return undefined;

  const hasHelp = args.includes('--help') || args.includes('-h');
  if (!hasHelp) return undefined;

  const tail = args.slice(2);
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
    if (token === '--data' || token === '-d' || token === '--user-id') {
      i += 1;
      continue;
    }
    if (token.startsWith('--data=') || token.startsWith('-d=') || token.startsWith('--user-id=')) {
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

const ALIAS_TO_PARENT: Record<string, string> = {
  search: 'tools',
  execute: 'tools',
  link: 'connected-accounts',
  listen: 'triggers',
};

const normalizeAliases = (argv: ReadonlyArray<string>): ReadonlyArray<string> => {
  const args = argv.slice(2);
  if (args.length === 0) return argv;
  const first = args[0];
  const parent = first && ALIAS_TO_PARENT[first];
  if (!parent) return argv;
  return [...argv.slice(0, 2), parent, ...args];
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
    const normalizedArgv = normalizeAliases(normalizeVersionShortFlag(argv));
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
