import { Argument, Command } from 'effect/cli';
import { runToolkitsVersion } from './toolkits.version.handler';

const slug = Argument.String('slug').pipe(Argument.withDescription('Toolkit slug (e.g. "gmail")'));

/**
 * Show toolkit version information: the latest available version and the last
 * 20 available versions.
 *
 * @example
 * ```bash
 * composio dev toolkits version "gmail"
 * ```
 */
export const toolkitsCmd$Version = Command.make('version', { slug }, runToolkitsVersion).pipe(
  Command.withDescription('Show latest and recent versions for a toolkit.')
);
