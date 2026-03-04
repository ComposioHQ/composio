import { Console, Effect } from 'effect';
import { Command, HelpDoc } from '@effect/cli';
import * as HashSet from 'effect/HashSet';
import { bold } from 'src/ui/colors';

/** Strip ANSI escape codes from a string. */
const stripAnsi = (str: string) =>
  str.replace(
    /[\u001B\u009B][[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PRZcf-ntqry=><~]))/g,
    ''
  );

/** Recursively get the description HelpDoc from a command descriptor. */
function getDescriptionFromDescriptor(descriptor: {
  _tag?: string;
  description?: HelpDoc.HelpDoc;
  command?: unknown;
  parent?: unknown;
}): HelpDoc.HelpDoc {
  if (descriptor._tag === 'Map' && descriptor.command) {
    return getDescriptionFromDescriptor(descriptor.command as typeof descriptor);
  }
  if (descriptor._tag === 'Subcommands' && descriptor.parent) {
    return getDescriptionFromDescriptor(descriptor.parent as typeof descriptor);
  }
  return descriptor.description ?? HelpDoc.empty;
}

/** CLI command type accepted by Command.getNames. */
type CliCommand = Parameters<typeof Command.getNames>[0];

/** Derive root help entries from subcommands in display order. */
function getRootHelpEntries(
  subcommands: ReadonlyArray<CliCommand>
): ReadonlyArray<{ name: string; description: string }> {
  return subcommands.map(cmd => {
    const names = HashSet.toValues(Command.getNames(cmd));
    const name = names[0] ?? '';
    const helpDoc = getDescriptionFromDescriptor(
      cmd.descriptor as Parameters<typeof getDescriptionFromDescriptor>[0]
    );
    const raw = HelpDoc.toAnsiText(helpDoc);
    const description = stripAnsi(raw).trim() || '';
    return { name, description };
  });
}

/**
 * Prints the root-level help output in gh-style format.
 * Derives command list from the actual subcommand definitions (single source of truth).
 */
export function printRootHelp(subcommands: ReadonlyArray<CliCommand>): Effect.Effect<void> {
  const name = 'composio';
  const entries = getRootHelpEntries(subcommands);
  const maxNameLen = Math.max(...entries.map(c => c.name.length), 10);

  const lines: string[] = [
    '',
    'Connect AI agents to external tools. Link accounts, discover tools, and execute them.',
    '',
    bold('USAGE'),
    `  ${name} <command> [options]`,
    '',
    bold('COMMANDS'),
    ...entries.map(cmd => `  ${cmd.name.padEnd(maxNameLen)}  ${cmd.description}`),
    '',
    bold('FLAGS'),
    `  -h, --help     Show help for command`,
    `  --version      Show ${name} version`,
    '',
    bold('LEARN MORE'),
    `  Use \`${name} <command> --help\` for more information about a command.`,
    `  Documentation: https://docs.composio.dev`,
    '',
  ];

  return Console.log(lines.join('\n'));
}
