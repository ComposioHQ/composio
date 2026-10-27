import { Command, Flag } from 'effect/cli';
import { withCommandMeta } from 'src/invocation/command-identity';
import { runProjectsList } from './projects.list.handler';

const orgId = Flag.String('org-id').pipe(
  Flag.optional,
  Flag.withDescription('Organization ID to list projects for (defaults to current global org)')
);

const limit = Flag.Int('limit').pipe(
  Flag.withDefault(50),
  Flag.withDescription('Max projects to fetch from API (default: 50)')
);

export const projectsCmd$List = Command.make('list', { orgId, limit }, runProjectsList).pipe(
  Command.withDescription('List developer projects for the current organization.'),
  withCommandMeta({ requiresLogin: true })
);
