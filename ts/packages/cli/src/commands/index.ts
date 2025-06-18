import { Effect } from 'effect';
import { Command } from '@effect/cli';
import * as constants from 'src/constants';
import { $defaultCmd } from './$default.cmd';
import { getVersion } from 'src/effects/version';
import { versionCmd } from './version.cmd';
import { whoamiCmd } from './whoami.cmd';
import { loginCmd } from './login.cmd';
import { pyCmd } from './py/py.cmd';
import { tsCmd } from './ts/ts.cmd';
import { generateCmd } from './generate.cmd';

const $cmd = $defaultCmd.pipe(
  Command.withSubcommands([versionCmd, whoamiCmd, loginCmd, generateCmd, pyCmd, tsCmd])
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
