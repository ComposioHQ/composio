import { Command, Flag } from 'effect/cli';
import { runOrgsSwitch } from './orgs.switch.handler';

const orgId = Flag.String('org-id').pipe(
  Flag.optional,
  Flag.withDescription('Organization ID to use as global default')
);

const limit = Flag.Int('limit').pipe(
  Flag.withDefault(50),
  Flag.withDescription('Max orgs to fetch from API (default: 50)')
);

export const orgsCmd$Switch = Command.make('switch', { orgId, limit }, runOrgsSwitch).pipe(
  Command.withDescription('Switch current organization context.')
);
