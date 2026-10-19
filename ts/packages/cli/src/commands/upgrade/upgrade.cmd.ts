import { Argument, Command, Flag } from 'effect/cli';
import { runUpgrade } from './upgrade.handler';

const betaOpt = Flag.Boolean('beta').pipe(
  Flag.withAlias('b'),
  Flag.withDefault(false),
  Flag.withDescription('Upgrade to the latest beta CLI release instead of the stable channel')
);

const versionArg = Argument.String('version').pipe(
  Argument.withDescription(
    'Install a specific CLI release (e.g. "0.13.1", "0.13.1-beta.42", or full tag "@composio/cli@0.13.1"). If omitted, installs the latest release.'
  ),
  Argument.optional
);

/**
 * CLI command to upgrade the CLI to the latest available version,
 * or to install a specific version when one is provided.
 *
 * @example
 * ```bash
 * composio upgrade
 * composio upgrade 0.13.1
 * composio upgrade 0.13.1-beta.42
 * composio upgrade --beta
 * ```
 */
export const upgradeCmd = Command.make(
  'upgrade',
  { beta: betaOpt, version: versionArg },
  runUpgrade
).pipe(
  Command.withDescription(
    'Upgrade your Composio CLI. Pass a version (e.g. "0.13.1" or "0.13.1-beta.42") to install a specific release, or omit it to install the latest.'
  )
);
