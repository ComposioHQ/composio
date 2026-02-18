import { Args, Command, Options } from '@effect/cli';
import { Console, Effect, Option } from 'effect';
import { ComposioEntitiesRepository } from 'src/services/composio-entities';
import { parseCsvOption, parseCsvOptionUppercase } from './_shared/parse-csv-options';
import { parseLimitOption } from './_shared/parse-limit-option';
import { parseJsonObjectOption } from './_shared/parse-json-option';
import { renderSchemaTree } from './_shared/render-schema-tree';
import { renderTable } from './_shared/render-table';
import { deriveToolkitSlugFromActionSlug } from './_shared/derive-toolkit-from-slug';
import { getToolkitVersionQueryParam } from './_shared/toolkit-version-options';

function asRecord(input: unknown): Record<string, unknown> | null {
  if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }

  return null;
}

function asString(input: unknown): string | undefined {
  return typeof input === 'string' ? input : undefined;
}

function includesIgnoreCase(values: ReadonlyArray<string>, candidate: string | undefined): boolean {
  if (candidate === undefined) {
    return false;
  }

  return values.some(value => value.toLowerCase() === candidate.toLowerCase());
}

function matchesToolkitFilter(
  toolkitFilters: ReadonlyArray<string>,
  triggerName: string | undefined
): boolean {
  if (toolkitFilters.length === 0) {
    return true;
  }

  const toolkitFromSlug = triggerName ? deriveToolkitSlugFromActionSlug(triggerName) : undefined;
  return includesIgnoreCase(toolkitFilters, toolkitFromSlug);
}

const triggerSlugArg = Args.text({ name: 'trigger_slug' });
const triggerIdArg = Args.text({ name: 'trigger_id' });

const queryOpt = Options.optional(Options.text('query')).pipe(
  Options.withDescription('Full text query for trigger listing')
);

const toolkitsOpt = Options.optional(Options.text('toolkits')).pipe(
  Options.withDescription('Comma-separated toolkit filters')
);

const slugsOpt = Options.optional(Options.text('slugs')).pipe(
  Options.withDescription('Comma-separated trigger slug filters')
);

const statusesOpt = Options.optional(Options.text('statuses')).pipe(
  Options.withDescription('Comma-separated status filters')
);

const connectedAccountsOpt = Options.optional(Options.text('connected_accounts')).pipe(
  Options.withDescription('Comma-separated connected account ids')
);

const userIdsOpt = Options.optional(Options.text('user_ids')).pipe(
  Options.withDescription('Comma-separated user ids')
);

const limitOpt = Options.optional(Options.text('limit')).pipe(
  Options.withDescription('Maximum number of rows to return')
);

const jsonOpt = Options.boolean('json').pipe(
  Options.withDefault(false),
  Options.withDescription('Print JSON output')
);

const connectedAccountOpt = Options.text('connected_account').pipe(
  Options.withDescription('Connected account id for trigger creation')
);

const configOpt = Options.optional(Options.text('config')).pipe(
  Options.withDescription('JSON object trigger config')
);

const triggersListCmd = Command.make(
  'list',
  { toolkitsOpt, queryOpt, limitOpt },
  ({ toolkitsOpt, queryOpt, limitOpt }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioEntitiesRepository;
      const toolkitSlugs = parseCsvOption(toolkitsOpt);
      const limit = yield* parseLimitOption(limitOpt);
      const toolkitVersions = yield* getToolkitVersionQueryParam(toolkitSlugs);

      const response = yield* repo.triggerTypesList({
        toolkit_slugs: toolkitSlugs.length > 0 ? toolkitSlugs : undefined,
        limit,
        toolkit_versions: toolkitVersions,
      });

      const query = Option.getOrUndefined(queryOpt)?.toLowerCase();
      const filtered = query
        ? response.items.filter(item => {
            const name = asString(item['name']) ?? '';
            const slug = asString(item['slug']) ?? '';
            const description = asString(item['description']) ?? '';
            const haystack = `${name} ${slug} ${description}`.toLowerCase();
            return haystack.includes(query);
          })
        : response.items;

      yield* Console.log(`Found ${filtered.length} triggers`);
      yield* Console.log('');
      yield* Console.log(
        renderTable(filtered, [
          { header: 'Name', value: item => asString(item['name']) ?? '-' },
          { header: 'Slug', value: item => asString(item['slug']) ?? '-' },
          {
            header: 'Toolkit',
            value: item => {
              const toolkit = asRecord(item['toolkit']);
              return asString(toolkit?.['slug']) ?? '-';
            },
          },
          {
            header: 'Description',
            maxWidth: 80,
            value: item => asString(item['description']) ?? '-',
          },
        ])
      );
      yield* Console.log('');
      yield* Console.log('To view details of a trigger: composio triggers info "<TRIGGER_SLUG>"');
    })
).pipe(Command.withDescription('List available trigger types'));

const triggersInfoCmd = Command.make(
  'info',
  { triggerSlugArg, jsonOpt },
  ({ triggerSlugArg, jsonOpt }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioEntitiesRepository;
      const toolkitSlug = deriveToolkitSlugFromActionSlug(triggerSlugArg);
      const toolkitVersions = yield* getToolkitVersionQueryParam(toolkitSlug ? [toolkitSlug] : []);
      const trigger = yield* repo.triggerTypesRetrieve(triggerSlugArg, {
        toolkit_versions: toolkitVersions,
      });

      if (jsonOpt) {
        yield* Console.log(JSON.stringify(trigger, null, 2));
        return;
      }

      yield* Console.log(`Name: ${asString(trigger['name']) ?? '-'}`);
      yield* Console.log(`Slug: ${asString(trigger['slug']) ?? '-'}`);
      yield* Console.log(`Description: ${asString(trigger['description']) ?? '-'}`);
      yield* Console.log(`Type: ${asString(trigger['type']) ?? '-'}`);
      yield* Console.log('');
      yield* Console.log('Fields:');
      yield* Console.log(renderSchemaTree(trigger['config']));
    })
).pipe(Command.withDescription('View detailed trigger type information'));

const triggersCreateCmd = Command.make(
  'create',
  { triggerSlugArg, connectedAccountOpt, configOpt },
  ({ triggerSlugArg, connectedAccountOpt, configOpt }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioEntitiesRepository;
      const triggerConfig = Option.isSome(configOpt)
        ? yield* parseJsonObjectOption('config', configOpt.value)
        : undefined;

      const response = yield* repo.triggerInstancesUpsert(triggerSlugArg, {
        connected_account_id: connectedAccountOpt,
        trigger_config: triggerConfig,
      });

      yield* Console.log('Trigger created/updated successfully');
      yield* Console.log(JSON.stringify(response, null, 2));
    })
).pipe(Command.withDescription('Create a trigger instance'));

const triggersStatusCmd = Command.make(
  'status',
  { toolkitsOpt, slugsOpt, statusesOpt, connectedAccountsOpt, userIdsOpt, limitOpt },
  ({ toolkitsOpt, slugsOpt, statusesOpt, connectedAccountsOpt, userIdsOpt, limitOpt }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioEntitiesRepository;
      const toolkitFilters = parseCsvOption(toolkitsOpt);
      const slugFilters = parseCsvOptionUppercase(slugsOpt);
      const statusFilters = parseCsvOptionUppercase(statusesOpt);
      const connectedAccountIds = parseCsvOption(connectedAccountsOpt);
      const userIds = parseCsvOption(userIdsOpt);
      const limit = yield* parseLimitOption(limitOpt);

      const response = yield* repo.triggerInstancesListActive({
        connected_account_ids: connectedAccountIds.length > 0 ? connectedAccountIds : undefined,
        user_ids: userIds.length > 0 ? userIds : undefined,
        trigger_names: slugFilters.length > 0 ? slugFilters : undefined,
        limit,
        show_disabled: true,
      });

      const filtered = response.items.filter(item => {
        const triggerName = asString(item['trigger_name']);
        const isDisabled = asString(item['disabled_at']) !== undefined;
        const status = isDisabled ? 'DISABLED' : 'ACTIVE';
        const statusMatch =
          statusFilters.length === 0 ||
          statusFilters.includes(status) ||
          statusFilters.includes('ALL');

        return matchesToolkitFilter(toolkitFilters, triggerName) && statusMatch;
      });

      yield* Console.log(`Found ${filtered.length} trigger instances`);
      yield* Console.log('');
      yield* Console.log(
        renderTable(filtered, [
          { header: 'Id', value: item => asString(item['id']) ?? '-' },
          { header: 'Slug', value: item => asString(item['trigger_name']) ?? '-' },
          {
            header: 'Connected Account',
            value: item => asString(item['connected_account_id']) ?? '-',
          },
          { header: 'User Id', value: item => asString(item['user_id']) ?? '-' },
          {
            header: 'Status',
            value: item => (asString(item['disabled_at']) ? 'DISABLED' : 'ACTIVE'),
          },
        ])
      );
    })
).pipe(Command.withDescription('List active trigger instances and statuses'));

const triggersInspectCmd = Command.make('inspect', { triggerIdArg }, ({ triggerIdArg }) =>
  Effect.gen(function* () {
    const repo = yield* ComposioEntitiesRepository;
    const response = yield* repo.triggerInstancesListActive({
      trigger_ids: [triggerIdArg],
      show_disabled: true,
      limit: 1,
    });
    const trigger = response.items[0];

    if (!trigger) {
      return yield* Effect.fail(new Error(`Trigger ${triggerIdArg} was not found`));
    }

    const status = asString(trigger['disabled_at']) ? 'DISABLED' : 'ACTIVE';

    yield* Console.log(`Id: ${asString(trigger['id']) ?? '-'}`);
    yield* Console.log(`Slug: ${asString(trigger['trigger_name']) ?? '-'}`);
    yield* Console.log(`Status: ${status}`);
    yield* Console.log(`Connected Account: ${asString(trigger['connected_account_id']) ?? '-'}`);
    yield* Console.log(`User Id: ${asString(trigger['user_id']) ?? '-'}`);
    yield* Console.log('Config:');
    yield* Console.log(JSON.stringify(trigger['trigger_config'] ?? {}, null, 2));
  })
).pipe(Command.withDescription('Inspect a trigger instance by id'));

const triggersDeleteCmd = Command.make('delete', { triggerIdArg }, ({ triggerIdArg }) =>
  Effect.gen(function* () {
    const repo = yield* ComposioEntitiesRepository;
    yield* repo.triggerInstancesDelete(triggerIdArg);
    yield* Console.log(`Deleted trigger ${triggerIdArg}`);
  })
).pipe(Command.withDescription('Delete a trigger instance'));

const triggersEnableCmd = Command.make('enable', { triggerIdArg }, ({ triggerIdArg }) =>
  Effect.gen(function* () {
    const repo = yield* ComposioEntitiesRepository;
    yield* repo.triggerInstancesPatchStatus(triggerIdArg, 'enable');
    yield* Console.log(`Enabled trigger ${triggerIdArg}`);
  })
).pipe(Command.withDescription('Enable a trigger instance'));

const triggersDisableCmd = Command.make('disable', { triggerIdArg }, ({ triggerIdArg }) =>
  Effect.gen(function* () {
    const repo = yield* ComposioEntitiesRepository;
    yield* repo.triggerInstancesPatchStatus(triggerIdArg, 'disable');
    yield* Console.log(`Disabled trigger ${triggerIdArg}`);
  })
).pipe(Command.withDescription('Disable a trigger instance'));

export const triggersCmd = Command.make('triggers').pipe(
  Command.withDescription('Explore and manage trigger types and instances'),
  Command.withSubcommands([
    triggersListCmd,
    triggersInfoCmd,
    triggersCreateCmd,
    triggersStatusCmd,
    triggersInspectCmd,
    triggersDeleteCmd,
    triggersEnableCmd,
    triggersDisableCmd,
  ])
);
