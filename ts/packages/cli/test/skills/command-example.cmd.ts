import { Command, Flag } from 'effect/cli';
import { withCommandMeta } from 'src/invocation/command-identity';
import { listAccounts } from './command-example.handler';

const toolkit = Flag.String('toolkit').pipe(
  Flag.withDescription('Filter by toolkit slug'),
  Flag.optional
);

/** Teaching example, substituted for connections list only by its test. */
export const connectionsCmd$List = Command.make('list', { toolkit }, listAccounts).pipe(
  Command.withDescription('List connected accounts.'),
  withCommandMeta({ requiresLogin: true })
);
