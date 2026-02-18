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
import { pyCmd } from './py/py.cmd';
import { tsCmd } from './ts/ts.cmd';
import { generateCmd } from './generate.cmd';
import { toolsCmd } from './tools.cmd';
import { toolkitsCmd } from './toolkits.cmd';
import { authConfigsCmd } from './auth-configs.cmd';
import { connectedAccountsCmd } from './connected-accounts.cmd';
import { triggersCmd } from './triggers.cmd';

const $cmd = $defaultCmd.pipe(
  Command.withSubcommands([
    versionCmd,
    upgradeCmd,
    whoamiCmd,
    loginCmd,
    logoutCmd,
    generateCmd,
    toolsCmd,
    toolkitsCmd,
    authConfigsCmd,
    connectedAccountsCmd,
    triggersCmd,
    pyCmd,
    tsCmd,
  ])
);

export const runWithConfig = Effect.gen(function* () {
  const version = yield* getVersion;

  return Command.run($cmd, {
    name: 'composio',
    executable: 'composio',
    version,
  });
});

export const run = Command.run($cmd, {
  name: 'composio',
  version: constants.APP_VERSION,
  executable: 'composio',
});
