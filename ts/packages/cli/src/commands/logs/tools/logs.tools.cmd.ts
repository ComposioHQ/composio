import { Argument, Command, Flag } from 'effect/cli';
import { runLogsTools } from './logs.tools.handler';

const cursor = Flag.String('cursor').pipe(
  Flag.optional,
  Flag.withDescription('Cursor for pagination')
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
  Flag.withDescription('Number of logs to fetch (1-100)')
);

const caseSensitive = Flag.Boolean('case-sensitive').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Unsupported by the public API; use case-insensitive search')
);

const toolkit = Flag.String('toolkit').pipe(
  Flag.withDescription('Filter by toolkit key(s), comma-separated (e.g. "gmail,slack")'),
  Flag.optional
);

const tool = Flag.String('tool').pipe(
  Flag.withDescription('Filter by tool key(s), comma-separated (e.g. "GMAIL_SEND_EMAIL")'),
  Flag.optional
);

const connectedAccountId = Flag.String('connected-account-id').pipe(
  Flag.withDescription('Filter by connected account id(s), comma-separated'),
  Flag.optional
);

const authConfigId = Flag.String('auth-config-id').pipe(
  Flag.withDescription('Filter by auth config id(s), comma-separated'),
  Flag.optional
);

const status = Flag.String('status').pipe(
  Flag.withDescription('Filter by success or failed, comma-separated'),
  Flag.optional
);

// Declared for its help row, which documents the comma-separated filter in place of the `dev`
// group's shared row. The parser hands every `--user-id` under `dev` to the shared flag, so
// the value is read from `CommandSurface`.
const userId = Flag.String('user-id').pipe(
  Flag.withDescription('Filter by user id(s), comma-separated'),
  Flag.optional
);

const logIdFilter = Flag.String('log-id').pipe(
  Flag.withDescription('Filter by log id(s), comma-separated'),
  Flag.optional
);

const toolRouterSessionId = Flag.String('tool-router-session-id').pipe(
  Flag.withDescription('Filter by tool router session id(s), comma-separated'),
  Flag.optional
);

const sessionId = Flag.String('session-id').pipe(
  Flag.withDescription('Legacy session filter (unsupported by the public API)'),
  Flag.optional
);

const logId = Argument.String('log_id').pipe(
  Argument.withDescription('Tool log ID'),
  Argument.optional
);

export const logsCmd$Tools = Command.make(
  'tools',
  {
    logId,
    cursor,
    from,
    to,
    limit,
    caseSensitive,
    toolkit,
    tool,
    connectedAccountId,
    authConfigId,
    status,
    userId,
    logIdFilter,
    toolRouterSessionId,
    sessionId,
  },
  runLogsTools
).pipe(
  Command.withDescription('List tool execution logs, or pass a log_id to fetch a specific log.')
);
