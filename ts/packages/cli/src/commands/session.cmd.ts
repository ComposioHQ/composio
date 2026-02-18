import { Args, Command, Options } from '@effect/cli';
import { Console, Effect, Option } from 'effect';
import { ComposioEntitiesRepository } from 'src/services/composio-entities';
import { parseBooleanOption } from './_shared/parse-boolean-option';
import { parseCsvOption } from './_shared/parse-csv-options';
import { parseLimitOption } from './_shared/parse-limit-option';
import { renderTable } from './_shared/render-table';

function asString(input: unknown): string | undefined {
  return typeof input === 'string' ? input : undefined;
}

function asRecord(input: unknown): Record<string, unknown> | null {
  if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }

  return null;
}

const sessionIdArg = Args.text({ name: 'session_id' });

const toolkitOpt = Options.text('toolkit').pipe(
  Options.withDescription('Toolkit slug for which an auth link should be created (example: gmail).')
);

const userIdOpt = Options.text('user_id').pipe(
  Options.withDescription('User id used to create auth link context (example: user_123).')
);

const callbackUrlOpt = Options.optional(Options.text('callback_url')).pipe(
  Options.withDescription('Optional callback URL used after the toolkit auth flow completes.')
);

const toolkitsOpt = Options.optional(Options.text('toolkits')).pipe(
  Options.withDescription('Optional comma-separated toolkit slug filter (example: "gmail,slack").')
);

const limitOpt = Options.optional(Options.text('limit')).pipe(
  Options.withDescription('Maximum number of toolkit records to return.')
);

const cursorOpt = Options.optional(Options.text('cursor')).pipe(
  Options.withDescription('Optional pagination cursor returned by a previous request.')
);

const isConnectedOpt = Options.optional(Options.text('is_connected')).pipe(
  Options.withDescription(
    'Connection status filter for toolkits. Accepted values: true, false, 1, 0.'
  )
);

const searchOpt = Options.optional(Options.text('search')).pipe(
  Options.withDescription('Search query to match toolkit name, slug, or description.')
);

const jsonOpt = Options.boolean('json').pipe(
  Options.withDefault(false),
  Options.withDescription('Print machine-readable JSON output for agent/tool consumption.')
);

const sessionLinkCmd = Command.make(
  'link',
  { sessionIdArg, userIdOpt, toolkitOpt, callbackUrlOpt, jsonOpt },
  ({ sessionIdArg, userIdOpt, toolkitOpt, callbackUrlOpt, jsonOpt }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioEntitiesRepository;

      const response = yield* repo.toolRouterSessionLink(sessionIdArg, {
        toolkit: toolkitOpt,
        user_id: userIdOpt,
        callback_url: Option.getOrUndefined(callbackUrlOpt),
      });

      if (jsonOpt) {
        yield* Console.log(
          JSON.stringify(
            {
              session_id: sessionIdArg,
              toolkit: toolkitOpt,
              user_id: userIdOpt,
              ...response,
            },
            null,
            2
          )
        );
        return;
      }

      yield* Console.log('Auth link created successfully');
      yield* Console.log(`Session Id: ${sessionIdArg}`);
      yield* Console.log(`User Id: ${userIdOpt}`);
      yield* Console.log(`Toolkit: ${toolkitOpt}`);
      yield* Console.log(
        `Connected Account Id: ${asString(response['connected_account_id']) ?? '-'}`
      );
      yield* Console.log(`Redirect URL: ${asString(response['redirect_url']) ?? '-'}`);
      yield* Console.log(`Link Token: ${asString(response['link_token']) ?? '-'}`);
    })
).pipe(
  Command.withDescription(
    'Create an authentication link for a toolkit inside an existing Tool Router session. Usage: composio session link <session_id> --user_id <user_id> --toolkit <toolkit>.'
  )
);

const sessionToolkitsCmd = Command.make(
  'toolkits',
  { sessionIdArg, toolkitsOpt, limitOpt, cursorOpt, isConnectedOpt, searchOpt, jsonOpt },
  ({ sessionIdArg, toolkitsOpt, limitOpt, cursorOpt, isConnectedOpt, searchOpt, jsonOpt }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioEntitiesRepository;
      const limit = yield* parseLimitOption(limitOpt);
      const toolkits = parseCsvOption(toolkitsOpt);
      const isConnected = yield* parseBooleanOption('is_connected', isConnectedOpt);

      const response = yield* repo.toolRouterSessionToolkits(sessionIdArg, {
        limit,
        cursor: Option.getOrUndefined(cursorOpt),
        toolkits: toolkits.length > 0 ? toolkits : undefined,
        is_connected: isConnected,
        search: Option.getOrUndefined(searchOpt),
      });

      if (jsonOpt) {
        yield* Console.log(
          JSON.stringify(
            {
              session_id: sessionIdArg,
              ...response,
            },
            null,
            2
          )
        );
        return;
      }

      yield* Console.log(`Found ${response.items.length} toolkits in session ${sessionIdArg}`);
      yield* Console.log('');
      yield* Console.log(
        renderTable(response.items, [
          {
            header: 'Toolkit',
            value: item => asString(item['slug']) ?? '-',
          },
          {
            header: 'Name',
            value: item => asString(item['name']) ?? '-',
          },
          {
            header: 'Connected',
            value: item => {
              const connectedAccount = asRecord(item['connected_account']);
              return connectedAccount ? 'yes' : 'no';
            },
          },
          {
            header: 'Account Id',
            value: item => {
              const connectedAccount = asRecord(item['connected_account']);
              return asString(connectedAccount?.['id']) ?? '-';
            },
          },
          {
            header: 'Status',
            value: item => {
              const connectedAccount = asRecord(item['connected_account']);
              return asString(connectedAccount?.['status']) ?? '-';
            },
          },
        ])
      );
    })
).pipe(
  Command.withDescription(
    'List toolkits in a Tool Router session. Supports filters: --toolkits, --limit, --cursor, --is_connected, --search.'
  )
);

export const sessionCmd = Command.make('session').pipe(
  Command.withDescription('Manage Tool Router session workflows and account linking.'),
  Command.withSubcommands([sessionLinkCmd, sessionToolkitsCmd])
);
