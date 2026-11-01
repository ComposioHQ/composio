import { Command, Flag } from 'effect/cli';
import { runGeneratePy } from './generate.py.handler';

const outputDir = Flag.optional(Flag.Directory('output-dir')).pipe(
  Flag.withAlias('o'),
  Flag.withDescription('Output directory for the generated Python type stubs')
);

const toolkits = Flag.String('toolkits').pipe(
  Flag.atLeast(0),
  Flag.withDescription(
    'Only generate types for specific toolkits (e.g., --toolkits gmail --toolkits slack)'
  )
);

/**
 * `composio generate py` — Generate Python type stubs.
 */
export const generateCmd$Py = Command.make('py', { outputDir, toolkits }, runGeneratePy).pipe(
  Command.withDescription('Generate Python type stubs for toolkits, tools, and triggers.')
);
