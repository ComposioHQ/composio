import { Argument, Command } from 'effect/cli';
import { runAuthConfigsInfo } from './auth-configs.info.handler';

const id = Argument.String('id').pipe(
  Argument.withDescription('Auth config ID (nanoid)'),
  Argument.optional
);

/**
 * View details of a specific auth config.
 *
 * @example
 * ```bash
 * composio dev auth-configs info "ac_1232323"
 * ```
 */
export const authConfigsCmd$Info = Command.make('info', { id }, runAuthConfigsInfo).pipe(
  Command.withDescription('View details of a specific auth config.')
);
