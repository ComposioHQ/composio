import { Args, Command, Options } from '@effect/cli';
import { Console, Effect, Option } from 'effect';
import { ComposioEntitiesRepository } from 'src/services/composio-entities';
import { parseCsvOption } from './_shared/parse-csv-options';
import { parseLimitOption } from './_shared/parse-limit-option';
import { parseJsonObjectOption } from './_shared/parse-json-option';
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

function asNumber(input: unknown): number | undefined {
  return typeof input === 'number' ? input : undefined;
}

const authConfigIdArg = Args.text({ name: 'auth_config_id' });
const nameArg = Args.text({ name: 'name' });

const toolkitOpt = Options.text('toolkit').pipe(
  Options.withDescription('Toolkit slug for auth config creation')
);

const toolkitsOpt = Options.optional(Options.text('toolkits')).pipe(
  Options.withDescription('Comma-separated toolkit slugs for filtering')
);

const queryOpt = Options.optional(Options.text('query')).pipe(
  Options.withDescription('Search query')
);
const limitOpt = Options.optional(Options.text('limit')).pipe(
  Options.withDescription('Maximum number of auth configs to return')
);

const authSchemeOpt = Options.optional(Options.text('auth_scheme')).pipe(
  Options.withDescription('Auth scheme (required for custom credentials)')
);

const scopesOpt = Options.optional(Options.text('scopes')).pipe(
  Options.withDescription('Comma-separated OAuth scopes')
);

const configOpt = Options.optional(Options.text('config')).pipe(
  Options.withDescription('JSON object with auth config credentials')
);

const customCredentialsOpt = Options.optional(Options.text('custom_credentials')).pipe(
  Options.withDescription('JSON object with custom credentials')
);

const jsonOpt = Options.boolean('json').pipe(
  Options.withDefault(false),
  Options.withDescription('Print JSON output')
);

const authConfigsListCmd = Command.make(
  'list',
  { toolkitsOpt, queryOpt, limitOpt },
  ({ toolkitsOpt, queryOpt, limitOpt }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioEntitiesRepository;
      const toolkitSlugs = parseCsvOption(toolkitsOpt);
      const limit = yield* parseLimitOption(limitOpt);

      const response = yield* repo.authConfigsList({
        toolkit_slug: toolkitSlugs.length > 0 ? toolkitSlugs.join(',') : undefined,
        search: Option.getOrUndefined(queryOpt),
        limit,
      });

      yield* Console.log(`Found ${response.items.length} auth configs`);
      yield* Console.log('');
      yield* Console.log(
        renderTable(response.items, [
          { header: 'Name', value: item => asString(item['name']) ?? '-' },
          { header: 'Id', value: item => asString(item['id']) ?? '-' },
          {
            header: 'Toolkit',
            value: item => {
              const toolkit = asRecord(item['toolkit']);
              return asString(toolkit?.['slug']) ?? '-';
            },
          },
          { header: 'Auth Scheme', value: item => asString(item['auth_scheme']) ?? '-' },
          {
            header: 'Connected Accounts',
            value: item => {
              const count = asNumber(item['no_of_connections']);
              return count !== undefined ? String(count) : '-';
            },
          },
        ])
      );
    })
).pipe(Command.withDescription('List existing auth configs'));

const authConfigsInfoCmd = Command.make(
  'info',
  { authConfigIdArg, jsonOpt },
  ({ authConfigIdArg, jsonOpt }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioEntitiesRepository;
      const authConfig = yield* repo.authConfigsRetrieve(authConfigIdArg);

      if (jsonOpt) {
        yield* Console.log(JSON.stringify(authConfig, null, 2));
        return;
      }

      const toolkit = asRecord(authConfig['toolkit']);
      const credentials = asRecord(authConfig['credentials']);

      yield* Console.log(`Id: ${asString(authConfig['id']) ?? '-'}`);
      yield* Console.log(`Name: ${asString(authConfig['name']) ?? '-'}`);
      yield* Console.log(`Toolkit: ${asString(toolkit?.['slug']) ?? '-'}`);
      yield* Console.log(`Auth Scheme: ${asString(authConfig['auth_scheme']) ?? '-'}`);
      yield* Console.log(`Status: ${asString(authConfig['status']) ?? '-'}`);
      yield* Console.log('');
      yield* Console.log('Credentials:');
      yield* Console.log(JSON.stringify(credentials ?? {}, null, 2));
    })
).pipe(Command.withDescription('View details about an auth config'));

const authConfigsCreateCmd = Command.make(
  'create',
  { nameArg, toolkitOpt, authSchemeOpt, scopesOpt, configOpt, customCredentialsOpt },
  ({ nameArg, toolkitOpt, authSchemeOpt, scopesOpt, configOpt, customCredentialsOpt }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioEntitiesRepository;
      const scopes = parseCsvOption(scopesOpt);
      const config = Option.isSome(configOpt)
        ? yield* parseJsonObjectOption('config', configOpt.value)
        : {};
      const customCredentials = Option.isSome(customCredentialsOpt)
        ? yield* parseJsonObjectOption('custom_credentials', customCredentialsOpt.value)
        : undefined;

      const credentials = {
        ...config,
        ...(scopes.length > 0 ? { scopes } : {}),
      };

      const authScheme = Option.getOrUndefined(authSchemeOpt);
      const auth_config = customCredentials
        ? {
            type: 'use_custom_auth' as const,
            name: nameArg,
            authScheme:
              authScheme ??
              (yield* Effect.fail(
                new Error('--auth_scheme is required when --custom_credentials is provided')
              )),
            credentials: {
              ...credentials,
              ...customCredentials,
            },
          }
        : {
            type: 'use_composio_managed_auth' as const,
            name: nameArg,
            credentials,
          };

      const response = yield* repo.authConfigsCreate({
        toolkit: { slug: toolkitOpt },
        auth_config,
      });

      yield* Console.log('Auth config created successfully');
      yield* Console.log(JSON.stringify(response, null, 2));
    })
).pipe(Command.withDescription('Create a new auth config'));

const authConfigsDeleteCmd = Command.make('delete', { authConfigIdArg }, ({ authConfigIdArg }) =>
  Effect.gen(function* () {
    const repo = yield* ComposioEntitiesRepository;
    yield* repo.authConfigsDelete(authConfigIdArg);
    yield* Console.log(`Deleted auth config ${authConfigIdArg}`);
  })
).pipe(Command.withDescription('Delete an auth config'));

export const authConfigsCmd = Command.make('auth_configs').pipe(
  Command.withDescription('Manage authentication configurations'),
  Command.withSubcommands([
    authConfigsListCmd,
    authConfigsInfoCmd,
    authConfigsCreateCmd,
    authConfigsDeleteCmd,
  ])
);
