import { Argument, Command, Flag } from 'effect/cli';
import { withCommandMeta } from 'src/invocation/command-identity';
import { runListen } from './listen.handler';

const slug = Argument.String('slug').pipe(
  Argument.withDescription(
    'Trigger slug (e.g. "GMAIL_NEW_GMAIL_MESSAGE") or project event type (e.g. "composio.connected_account.expired")'
  )
);

const params = Flag.String('params').pipe(
  Flag.withAlias('p'),
  Flag.withDescription(
    'Trigger create params as JSON/JS object, @file, or - for stdin. Only valid for trigger slugs.'
  ),
  Flag.optional
);

const maxEvents = Flag.Int('max-events').pipe(
  Flag.withDescription('Stop after receiving N matching events'),
  Flag.optional
);

const timeout = Flag.String('timeout').pipe(
  Flag.withDescription('Stop after a duration such as "5m", "1hr", or "30s"'),
  Flag.optional
);

const stream = Flag.String('stream').pipe(
  Flag.withDescription(
    'Also stream each event payload inline. Pass an optional jq-like path such as ".thread.id" or ".data[0].id".'
  ),
  Flag.optional
);
const account = Flag.String('account').pipe(
  Flag.withDescription(
    'Connected account selector. Matches alias, word_id, or connected account id for the inferred toolkit.'
  ),
  Flag.optional
);

const failFast = Flag.Boolean('fail-fast').pipe(
  Flag.withDescription('Stop at the first event that fails to save, and exit 1'),
  Flag.withDefault(false)
);

const debug = Flag.Boolean('debug').pipe(
  Flag.withDescription(
    'Print verbose debug information (raw events, filter results, Pusher state)'
  ),
  Flag.withDefault(false)
);

export const listenCmd = Command.make(
  'listen',
  { slug, params, maxEvents, timeout, stream, account, failFast, debug },
  runListen
).pipe(
  Command.withDescription(
    'Listen to consumer-project realtime events. Trigger slugs create a temporary trigger; top-level composio.* event types subscribe directly.'
  ),
  Command.withExamples([
    {
      command: 'composio listen GMAIL_NEW_GMAIL_MESSAGE',
    },
    {
      command: 'composio listen GMAIL_NEW_GMAIL_MESSAGE -p @trigger.json --max-events 5',
    },
    {
      command: 'composio listen GMAIL_NEW_GMAIL_MESSAGE --account work --timeout 5m',
    },
    {
      command: 'composio listen GMAIL_NEW_GMAIL_MESSAGE --max-events 5 --fail-fast',
    },
    {
      command: "composio listen GMAIL_NEW_GMAIL_MESSAGE --timeout 1hr --stream '.data.threadId'",
    },
    {
      command:
        'composio listen SLACK_CHANNEL_MESSAGE_RECEIVED -p \'{ trigger_config: { channel_id: "C123" } }\'',
    },
    {
      command: 'composio listen GMAIL_NEW_GMAIL_MESSAGE -p @trigger.json --stream',
    },
    {
      command: "composio listen GMAIL_NEW_GMAIL_MESSAGE -p @trigger.json --stream '.data.threadId'",
    },
  ]),
  withCommandMeta({ requiresLogin: true })
);
