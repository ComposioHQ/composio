import { Command, Flag } from 'effect/cli';
import { runTriggersStatus } from './triggers.status.handler';

const userIds = Flag.String('user-ids').pipe(
  Flag.withDescription('Filter by user IDs, comma-separated'),
  Flag.optional
);

const connectedAccountIds = Flag.String('connected-account-ids').pipe(
  Flag.withDescription('Filter by connected account IDs, comma-separated'),
  Flag.optional
);

const toolkits = Flag.String('toolkits').pipe(
  Flag.withDescription('Filter by toolkit slugs, comma-separated (e.g. "gmail" or "gmail,slack")'),
  Flag.optional
);

const triggerIds = Flag.String('trigger-ids').pipe(
  Flag.withDescription('Filter by trigger instance IDs, comma-separated'),
  Flag.optional
);

const triggerNames = Flag.String('trigger-names').pipe(
  Flag.withDescription(
    'Filter by trigger names, comma-separated (case-insensitive; normalized to uppercase)'
  ),
  Flag.optional
);

const showDisabled = Flag.Boolean('show-disabled').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Include disabled triggers in the response')
);

const limit = Flag.Int('limit').pipe(
  Flag.withDefault(30),
  Flag.withDescription('Number of results per page (1-1000)')
);

export const triggersCmd$Status = Command.make(
  'status',
  {
    userIds,
    connectedAccountIds,
    toolkits,
    triggerIds,
    triggerNames,
    showDisabled,
    limit,
  },
  runTriggersStatus
).pipe(Command.withDescription('Show active triggers with optional filters.'));
