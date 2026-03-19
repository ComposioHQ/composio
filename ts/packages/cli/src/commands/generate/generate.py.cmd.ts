import { Command } from '@effect/cli';
import { generatePythonTypeStubs, outputOpt, toolkitsOpt } from '../py/commands/py.generate.cmd';

/**
 * `composio generate py` — Generate Python type stubs.
 */
export const generateCmd$Py = Command.make('py', { outputOpt, toolkitsOpt }).pipe(
  Command.withDescription('Generate Python type stubs for toolkits, tools, and triggers.'),
  Command.withHandler(generatePythonTypeStubs)
);
