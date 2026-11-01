import type { Command } from 'effect/cli';
import { buildRootCommand } from 'src/commands';
import type { CommandVisibility } from 'src/commands/feature-tags';
import {
  childIdentity,
  type CommandIdentity,
  ROOT_IDENTITY,
} from 'src/invocation/command-identity';

/** Developer mode on and every experimental feature enabled: the whole command tree. */
export const EVERY_FEATURE: CommandVisibility = {
  isDevModeEnabled: true,
  isExperimentalFeatureEnabled: () => true,
};

/** One command registration of the tree, as `withRegisteredSubcommands` identifies it. */
export interface Registration {
  readonly identity: CommandIdentity;
  readonly command: Command.Command.Any;
  /** The registration, or a group above it, is `Command.unlisted`. */
  readonly unlisted: boolean;
}

const subcommandsOf = (command: Command.Command.Any) =>
  command.subcommands.flatMap(group => group.commands);

/**
 * Every registration under `root` (the root first, then depth first in registration order),
 * walked through the public `Command` fields only. `help`'s mirror of the tree is left out below
 * `help` itself.
 */
export const registrationsOf = (
  root: Command.Command.Any = buildRootCommand(EVERY_FEATURE)
): ReadonlyArray<Registration> => {
  const walk = (
    command: Command.Command.Any,
    identity: CommandIdentity,
    unlisted: boolean
  ): ReadonlyArray<Registration> => [
    { identity, command, unlisted },
    ...(identity.path.length === 1 && identity.path[0] === 'help'
      ? []
      : subcommandsOf(command).flatMap(child =>
          walk(child, childIdentity(identity, child), unlisted || child.unlisted)
        )),
  ];
  return walk(root, ROOT_IDENTITY, false);
};
