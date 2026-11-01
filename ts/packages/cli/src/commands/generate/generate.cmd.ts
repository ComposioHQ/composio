import { Command, Flag } from 'effect/cli';
import { runGenerate } from './generate.handler';
import { generateCmd$Py } from './py/generate.py.cmd';
import { generateCmd$Ts } from './ts/generate.ts.cmd';
import { withRegisteredSubcommands } from 'src/commands/registration';

const outputDir = Flag.optional(Flag.Directory('output-dir')).pipe(
  Flag.withAlias('o'),
  Flag.withDescription('Output directory for type stubs')
);

const typeTools = Flag.Boolean('type-tools').pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    'Generate typed input/output schemas for each tool (TypeScript only, slower)'
  )
);

const toolkits = Flag.String('toolkits').pipe(
  Flag.atLeast(0),
  Flag.withDescription(
    'Only generate types for specific toolkits (e.g., --toolkits gmail --toolkits slack)'
  )
);

/**
 * CLI entry point for code generation commands.
 *
 * When invoked without a subcommand, auto-detects the project language.
 * Subcommands `py` and `ts` allow explicit language selection.
 *
 * @example
 * ```bash
 * composio generate
 * composio generate py
 * composio generate ts
 * composio generate ts --type-tools
 * ```
 */
export const generateCmd = Command.make(
  'generate',
  { outputDir, typeTools, toolkits },
  runGenerate
).pipe(
  Command.withDescription(
    'Generate type stubs for toolkits, tools, and triggers, auto-detecting project language (TypeScript | Python)'
  ),
  withRegisteredSubcommands([generateCmd$Py, generateCmd$Ts], { ownAction: true })
);
