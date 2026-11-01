import { Argument, Command, Flag } from 'effect/cli';
import { runToolkitsInfo } from './toolkits.info.handler';

const slug = Argument.String('slug').pipe(
  Argument.withDescription('Toolkit slug (e.g. "gmail")'),
  Argument.optional
);

const allDetails = Flag.Boolean('all').pipe(
  Flag.withAlias('a'),
  Flag.withDefault(false),
  Flag.withDescription('Show all available toolkit details, including auth config fields')
);

/**
 * View details of a specific toolkit including connection status.
 *
 * @example
 * ```bash
 * composio dev toolkits info "gmail"
 * composio dev toolkits info "github" --user-id "alice"
 * ```
 */
export const toolkitsCmd$Info = Command.make('info', { slug, allDetails }, runToolkitsInfo).pipe(
  Command.withDescription('View details of a specific toolkit.')
);
