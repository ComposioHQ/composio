import { Args, Command, Options } from '@effect/cli';
import { Console, Effect, Option } from 'effect';
import { ComposioEntitiesRepository } from 'src/services/composio-entities';
import { parseCsvOption, parseCsvOptionUppercase } from './_shared/parse-csv-options';
import { parseLimitOption } from './_shared/parse-limit-option';
import { renderTable } from './_shared/render-table';

function asRecord(input: unknown): Record<string, unknown> | null {
  if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }

  return null;
}

function asString(input: unknown): string | undefined {
  return typeof input === 'string' ? input : undefined;
}

const connectedAccountIdArg = Args.text({ name: 'connected_account_id' });

const userIdOpt = Options.optional(Options.text('user_id')).pipe(
  Options.withDescription('Filter by user id')
);

const toolkitsOpt = Options.optional(Options.text('toolkits')).pipe(
  Options.withDescription('Comma-separated toolkit slugs')
);

const statusOpt = Options.optional(Options.text('status')).pipe(
  Options.withDescription('Comma-separated statuses')
);

const limitOpt = Options.optional(Options.text('limit')).pipe(
  Options.withDescription('Maximum number of connected accounts to return')
);

const jsonOpt = Options.boolean('json').pipe(
  Options.withDefault(false),
  Options.withDescription('Print JSON output')
);

const authConfigOpt = Options.text('auth_config').pipe(
  Options.withDescription('Auth config id used to create link')
);

const callbackUrlOpt = Options.optional(Options.text('callback_url')).pipe(
  Options.withDescription('Optional callback URL for auth link')
);

const connectedAccountsListCmd = Command.make(
  'list',
  { userIdOpt, toolkitsOpt, statusOpt, limitOpt },
  ({ userIdOpt, toolkitsOpt, statusOpt, limitOpt }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioEntitiesRepository;
      const toolkitSlugs = parseCsvOption(toolkitsOpt);
      const statuses = parseCsvOptionUppercase(statusOpt);
      const limit = yield* parseLimitOption(limitOpt);

      const response = yield* repo.connectedAccountsList({
        user_ids: Option.isSome(userIdOpt) ? [userIdOpt.value] : undefined,
        toolkit_slugs: toolkitSlugs.length > 0 ? toolkitSlugs : undefined,
        statuses: statuses.length > 0 ? statuses : undefined,
        limit,
      });

      yield* Console.log(`Found ${response.items.length} connected accounts`);
      yield* Console.log('');
      yield* Console.log(
        renderTable(response.items, [
          { header: 'Id', value: item => asString(item['id']) ?? '-' },
          { header: 'User Id', value: item => asString(item['user_id']) ?? '-' },
          {
            header: 'Toolkit',
            value: item => {
              const toolkit = asRecord(item['toolkit']);
              return asString(toolkit?.['slug']) ?? '-';
            },
          },
          {
            header: 'Auth Config',
            value: item => {
              const authConfig = asRecord(item['auth_config']);
              return asString(authConfig?.['id']) ?? '-';
            },
          },
          { header: 'Status', value: item => asString(item['status']) ?? '-' },
        ])
      );
    })
).pipe(Command.withDescription('List connected accounts'));

const connectedAccountsInfoCmd = Command.make(
  'info',
  { connectedAccountIdArg, jsonOpt },
  ({ connectedAccountIdArg, jsonOpt }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioEntitiesRepository;
      const account = yield* repo.connectedAccountsRetrieve(connectedAccountIdArg);

      if (jsonOpt) {
        yield* Console.log(JSON.stringify(account, null, 2));
        return;
      }

      const toolkit = asRecord(account['toolkit']);
      const authConfig = asRecord(account['auth_config']);

      yield* Console.log(`Id: ${asString(account['id']) ?? '-'}`);
      yield* Console.log(`Toolkit: ${asString(toolkit?.['slug']) ?? '-'}`);
      yield* Console.log(`Auth Config: ${asString(authConfig?.['id']) ?? '-'}`);
      yield* Console.log(`Status: ${asString(account['status']) ?? '-'}`);
      yield* Console.log('');
      yield* Console.log('Credentials / State:');
      yield* Console.log(JSON.stringify(account['state'] ?? {}, null, 2));
    })
).pipe(Command.withDescription('View connected account details'));

const connectedAccountsWhoamiCmd = Command.make(
  'whoami',
  { connectedAccountIdArg },
  ({ connectedAccountIdArg }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioEntitiesRepository;
      const account = yield* repo.connectedAccountsRetrieve(connectedAccountIdArg);
      const testRequestEndpoint = asString(account['test_request_endpoint']);

      if (!testRequestEndpoint) {
        return yield* Effect.fail(
          new Error(
            `Connected account ${connectedAccountIdArg} does not expose test_request_endpoint; unable to execute whoami via proxy`
          )
        );
      }

      const response = yield* repo.toolsProxy({
        endpoint: testRequestEndpoint,
        method: 'GET',
        connected_account_id: connectedAccountIdArg,
      });

      yield* Console.log('200 fetched details of the connected account');
      yield* Console.log(JSON.stringify(response, null, 2));
    })
).pipe(Command.withDescription('Test account details using proxy execute'));

const connectedAccountsLinkCmd = Command.make(
  'link',
  { authConfigOpt, userIdOpt, callbackUrlOpt },
  ({ authConfigOpt, userIdOpt, callbackUrlOpt }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioEntitiesRepository;
      const userId =
        Option.getOrUndefined(userIdOpt) ?? process.env['COMPOSIO_TEST_USER_ID'] ?? 'default';

      const response = yield* repo.connectedAccountsLink({
        auth_config_id: authConfigOpt,
        user_id: userId,
        callback_url: Option.getOrUndefined(callbackUrlOpt),
      });

      const responseRecord = asRecord(response);
      yield* Console.log('Created auth link successfully');
      yield* Console.log(
        `Connected Account Id: ${asString(responseRecord?.['connected_account_id']) ?? '-'}`
      );
      yield* Console.log(`Redirect URL: ${asString(responseRecord?.['redirect_url']) ?? '-'}`);
    })
).pipe(Command.withDescription('Create a link to connect a user account'));

const connectedAccountsDeleteCmd = Command.make(
  'delete',
  { connectedAccountIdArg },
  ({ connectedAccountIdArg }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioEntitiesRepository;
      yield* repo.connectedAccountsDelete(connectedAccountIdArg);
      yield* Console.log(`Deleted connected account ${connectedAccountIdArg}`);
    })
).pipe(Command.withDescription('Delete a connected account'));

export const connectedAccountsCmd = Command.make('connected_accounts').pipe(
  Command.withDescription('Manage connected accounts'),
  Command.withSubcommands([
    connectedAccountsListCmd,
    connectedAccountsInfoCmd,
    connectedAccountsWhoamiCmd,
    connectedAccountsLinkCmd,
    connectedAccountsDeleteCmd,
  ])
);
