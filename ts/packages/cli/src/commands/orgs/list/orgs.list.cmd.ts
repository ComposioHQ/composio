import { Command, Flag } from 'effect/cli';
import { runOrgsList } from './orgs.list.handler';

const limit = Flag.Int('limit').pipe(
  Flag.withDefault(50),
  Flag.withDescription('Max organizations to fetch from API (default: 50)')
);

export const orgsCmd$List = Command.make('list', { limit }, runOrgsList).pipe(
  Command.withDescription('List organizations and show current global selection.')
);
