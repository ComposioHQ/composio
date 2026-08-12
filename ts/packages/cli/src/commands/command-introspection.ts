import { Array as Arr, Effect, HashMap, HashSet, Match, Option } from 'effect';
import { CliConfig, CommandDescriptor, Usage } from '@effect/cli';
import { ComposioCliConfig } from 'src/cli-config';

/**
 * The only module in `src/` allowed to import `CommandDescriptor` or `Usage`
 * from `@effect/cli`. Those modules are the redesign seam for Effect CLI v4's
 * public command tree, so every descriptor walk must stay behind the small
 * CLI-domain-shaped operations exported here — the v4 migration should only
 * ever reimplement this file. An Oxlint `no-restricted-imports` override in
 * the repo-root `.oxlintrc.json` keeps the seam sealed.
 */

export type AnyCommandDescriptor = CommandDescriptor.Command<unknown>;

export type AnyCommand = { readonly descriptor: AnyCommandDescriptor };

const collectValueOptionNamesFromUsage = (usage: Usage.Usage, acc: Set<string>): void =>
  Match.valueTags(usage, {
    Named: usage => {
      if (Option.isSome(usage.acceptedValues)) {
        for (const name of usage.names) {
          if (name.startsWith('-')) {
            acc.add(name);
          }
        }
      }
    },
    Optional: usage => {
      collectValueOptionNamesFromUsage(usage.usage, acc);
    },
    Repeated: usage => {
      collectValueOptionNamesFromUsage(usage.usage, acc);
    },
    Alternation: usage => {
      collectValueOptionNamesFromUsage(usage.left, acc);
      collectValueOptionNamesFromUsage(usage.right, acc);
    },
    Concat: usage => {
      collectValueOptionNamesFromUsage(usage.left, acc);
      collectValueOptionNamesFromUsage(usage.right, acc);
    },
    Mixed: () => undefined,
    Empty: () => undefined,
  });

/**
 * Collects the names of every flag that accepts a value (e.g. `--org`)
 * across the whole command tree, so the top-level error handler can print
 * a "Tip: --flag requires a value" hint on unknown-argument failures.
 */
export const collectValueOptionNames = (command: AnyCommand): ReadonlySet<string> => {
  const names = new Set<string>();
  const visited = new Set<AnyCommandDescriptor>();
  const visit = (descriptor: AnyCommandDescriptor) => {
    if (visited.has(descriptor)) {
      return;
    }
    visited.add(descriptor);
    collectValueOptionNamesFromUsage(CommandDescriptor.getUsage(descriptor), names);
    for (const [, subcommand] of HashMap.toEntries(CommandDescriptor.getSubcommands(descriptor))) {
      visit(subcommand);
    }
  };
  visit(command.descriptor);
  return names;
};

/** Whether `name` is one of the names the command itself answers to. */
export const hasCommandName = (command: AnyCommand, name: string): boolean =>
  HashSet.has(CommandDescriptor.getNames(command.descriptor), name);

/**
 * Lists the names of a command's direct subcommands, excluding the
 * command's own names (the descriptor's subcommand map includes those).
 */
export const listSubcommandNames = (descriptor: AnyCommandDescriptor): ReadonlyArray<string> => {
  const ownNames = CommandDescriptor.getNames(descriptor);
  return Array.from(HashMap.keys(CommandDescriptor.getSubcommands(descriptor))).filter(
    name => !HashSet.has(ownNames, name)
  );
};

/**
 * Parses `argv` (a full `process.argv`) against the command tree without
 * running it, using the CLI's own config — a pre-flight check that surfaces
 * `ValidationError`s (e.g. command mismatches) before the command executes.
 */
export const preflightParse = (command: AnyCommand, argv: ReadonlyArray<string>) =>
  CommandDescriptor.parse(
    command.descriptor,
    Arr.prepend(Arr.drop(argv, 2), 'composio'),
    CliConfig.make(ComposioCliConfig)
  ).pipe(Effect.asVoid);
