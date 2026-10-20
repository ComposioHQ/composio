import { Argument, Command, Flag } from 'effect/cli';
import { runLogsTriggers } from './logs.triggers.handler';

const cursor = Flag.String('cursor').pipe(
  Flag.withDescription('Cursor for pagination'),
  Flag.optional
);

// Declared for its help row, which documents the comma-separated filter in place of the `dev`
// group's shared row. The parser hands every `--user-id` under `dev` to the shared flag, so
// the value is read from `CommandSurface`.
const userId = Flag.String('user-id').pipe(
  Flag.withDescription('Filter by user id'),
  Flag.optional
);

const connectedAccountId = Flag.String('connected-account-id').pipe(
  Flag.withDescription('Filter by connected account id'),
  Flag.optional
);

const trigger = Flag.String('trigger').pipe(
  Flag.withDescription('Filter by trigger name'),
  Flag.optional
);

const triggerId = Flag.String('trigger-id').pipe(
  Flag.withDescription('Filter by trigger id'),
  Flag.optional
);

const logIdFilter = Flag.String('log-id').pipe(
  Flag.withDescription('Filter by log id'),
  Flag.optional
);

const logId = Argument.String('log_id').pipe(
  Argument.withDescription('Trigger log ID'),
  Argument.optional
);

const from = Flag.Int('from').pipe(
  Flag.withDescription('Start timestamp (epoch milliseconds)'),
  Flag.optional
);

const to = Flag.Int('to').pipe(
  Flag.withDescription('End timestamp (epoch milliseconds)'),
  Flag.optional
);

const limit = Flag.Int('limit').pipe(
  Flag.withDefault(30),
  Flag.withDescription('Number of logs to fetch (1-1000)')
);

const time = Flag.Literals('time', ['5m', '30m', '6h', '1d', '1w', '1month', '1y'] as const).pipe(
  Flag.optional,
  Flag.withDescription('Show logs from a relative time window')
);

const search = Flag.String('search').pipe(
  Flag.withDescription('Full-text search query'),
  Flag.optional
);

const includePayload = Flag.Boolean('include-payload').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Include payload fields in response')
);

export const logsCmd$Triggers = Command.make(
  'triggers',
  {
    logId,
    cursor,
    userId,
    connectedAccountId,
    trigger,
    triggerId,
    logIdFilter,
    from,
    to,
    limit,
    time,
    search,
    includePayload,
  },
  runLogsTriggers
).pipe(Command.withDescription('List trigger logs.'));
