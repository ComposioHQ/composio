import { Command, Flag } from 'effect/cli';
import { runGenerateTs } from './generate.ts.handler';

const outputDir = Flag.optional(Flag.Directory('output-dir')).pipe(
  Flag.withAlias('o'),
  Flag.withDescription('Output directory for the generated TypeScript type stubs.')
);

const compact = Flag.Boolean('compact').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Emit a single TypeScript file')
);

const transpiled = Flag.Boolean('transpiled').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Whether to emit transpiled JavaScript alongside TypeScript files')
);

const typeTools = Flag.Boolean('type-tools').pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    'Generate typed input/output schemas for each tool (slower, fetches full tool definitions)'
  )
);

const toolkits = Flag.String('toolkits').pipe(
  Flag.atLeast(0),
  Flag.withDescription(
    'Only generate types for specific toolkits (e.g., --toolkits gmail --toolkits slack)'
  )
);

/**
 * `composio generate ts` — Generate TypeScript type stubs.
 */
export const generateCmd$Ts = Command.make(
  'ts',
  { outputDir, compact, transpiled, typeTools, toolkits },
  runGenerateTs
).pipe(
  Command.withDescription('Generate TypeScript type stubs for toolkits, tools, and triggers.')
);
