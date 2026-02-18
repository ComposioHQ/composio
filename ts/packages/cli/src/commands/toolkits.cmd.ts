import { Args, Command, Options } from '@effect/cli';
import { Console, Effect, Option } from 'effect';
import { ComposioEntitiesRepository } from 'src/services/composio-entities';
import { parseCsvOption } from './_shared/parse-csv-options';
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

function asNumber(input: unknown): number | undefined {
  return typeof input === 'number' ? input : undefined;
}

function renderAuthFieldGroups(toolkit: Record<string, unknown>): string {
  const authConfigDetails = Array.isArray(toolkit['auth_config_details'])
    ? toolkit['auth_config_details']
    : [];
  if (authConfigDetails.length === 0) {
    return '  <no auth config details available>';
  }

  const lines: Array<string> = [];

  for (const detail of authConfigDetails) {
    const detailRecord = asRecord(detail);
    if (detailRecord === null) {
      continue;
    }

    const mode = asString(detailRecord['mode']) ?? 'UNKNOWN';
    lines.push(`${mode}:`);

    const fields = asRecord(detailRecord['fields']);
    const authConfigCreation = fields ? asRecord(fields['auth_config_creation']) : null;
    const connectedAccountInitiation = fields
      ? asRecord(fields['connected_account_initiation'])
      : null;

    lines.push('  Auth config creation fields:');
    const requiredForConfig = authConfigCreation
      ? ((authConfigCreation['required'] as ReadonlyArray<unknown> | undefined) ?? [])
      : [];
    if (requiredForConfig.length === 0) {
      lines.push('    - None');
    } else {
      for (const field of requiredForConfig) {
        const fieldRecord = asRecord(field);
        const fieldName = fieldRecord ? (asString(fieldRecord['name']) ?? '-') : '-';
        const fieldType = fieldRecord ? (asString(fieldRecord['type']) ?? 'unknown') : 'unknown';
        lines.push(`    - ${fieldName} (${fieldType})`);
      }
    }

    lines.push('  Connected account initiation fields:');
    const requiredForConnection = connectedAccountInitiation
      ? ((connectedAccountInitiation['required'] as ReadonlyArray<unknown> | undefined) ?? [])
      : [];
    if (requiredForConnection.length === 0) {
      lines.push('    - None');
    } else {
      for (const field of requiredForConnection) {
        const fieldRecord = asRecord(field);
        const fieldName = fieldRecord ? (asString(fieldRecord['name']) ?? '-') : '-';
        const fieldType = fieldRecord ? (asString(fieldRecord['type']) ?? 'unknown') : 'unknown';
        lines.push(`    - ${fieldName} (${fieldType})`);
      }
    }
  }

  return lines.join('\n');
}

const queryOpt = Options.optional(Options.text('query')).pipe(
  Options.withDescription('Search query')
);

const limitOpt = Options.optional(Options.text('limit')).pipe(
  Options.withDescription('Maximum number of toolkits to return')
);

const categoriesOpt = Options.optional(Options.text('categories')).pipe(
  Options.withDescription('Comma-separated toolkit categories')
);

const versionOpt = Options.optional(Options.text('version')).pipe(
  Options.withDescription('Specific toolkit version')
);

const jsonOpt = Options.boolean('json').pipe(
  Options.withDefault(false),
  Options.withDescription('Print JSON output')
);

const toolkitSlugArg = Args.text({ name: 'toolkit_slug' });
const queryArg = Args.text({ name: 'query' });

const toolkitsListCmd = Command.make(
  'list',
  { queryOpt, limitOpt, categoriesOpt },
  ({ queryOpt, limitOpt, categoriesOpt }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioEntitiesRepository;
      const limit = yield* parseLimitOption(limitOpt);
      const categories = parseCsvOption(categoriesOpt);

      const response = yield* repo.toolkitsList({
        search: Option.getOrUndefined(queryOpt),
        category: categories.length === 1 ? categories[0] : undefined,
        limit,
      });

      const filtered =
        categories.length > 1
          ? response.items.filter(item => {
              const meta = asRecord(item['meta']);
              const categoriesValue = meta ? meta['categories'] : undefined;
              if (!Array.isArray(categoriesValue)) {
                return false;
              }

              const matched = categoriesValue
                .map(asRecord)
                .filter((x): x is Record<string, unknown> => x !== null)
                .map(category =>
                  (asString(category['id']) ?? asString(category['slug']) ?? '').toLowerCase()
                );

              return categories.every(category => matched.includes(category.toLowerCase()));
            })
          : response.items;

      yield* Console.log(`Listing ${filtered.length} toolkits`);
      yield* Console.log('');
      yield* Console.log(
        renderTable(filtered, [
          { header: 'Name', value: toolkit => asString(toolkit['name']) ?? '-' },
          { header: 'Slug', value: toolkit => asString(toolkit['slug']) ?? '-' },
          {
            header: 'Latest Version',
            value: toolkit => {
              const meta = asRecord(toolkit['meta']);
              return asString(meta?.['version']) ?? '-';
            },
          },
          {
            header: 'Tools',
            value: toolkit => {
              const meta = asRecord(toolkit['meta']);
              const count = asNumber(meta?.['tools_count']);
              return count !== undefined ? String(count) : '-';
            },
          },
          {
            header: 'Triggers',
            value: toolkit => {
              const meta = asRecord(toolkit['meta']);
              const count = asNumber(meta?.['triggers_count']);
              return count !== undefined ? String(count) : '-';
            },
          },
          {
            header: 'Description',
            maxWidth: 70,
            value: toolkit => {
              const meta = asRecord(toolkit['meta']);
              return asString(meta?.['description']) ?? '-';
            },
          },
        ])
      );
      yield* Console.log('');
      yield* Console.log('To view details of a toolkit: composio toolkits info "<TOOLKIT_SLUG>"');
    })
).pipe(Command.withDescription('List available toolkits'));

const toolkitsSearchCmd = Command.make('search', { queryArg, limitOpt }, ({ queryArg, limitOpt }) =>
  Effect.gen(function* () {
    const repo = yield* ComposioEntitiesRepository;
    const limit = yield* parseLimitOption(limitOpt);
    const response = yield* repo.toolkitsList({ search: queryArg, limit });

    yield* Console.log(`Found ${response.items.length} toolkits`);
    yield* Console.log('');
    yield* Console.log(
      renderTable(response.items, [
        { header: 'Name', value: toolkit => asString(toolkit['name']) ?? '-' },
        { header: 'Slug', value: toolkit => asString(toolkit['slug']) ?? '-' },
        {
          header: 'Tools',
          value: toolkit => {
            const meta = asRecord(toolkit['meta']);
            const count = asNumber(meta?.['tools_count']);
            return count !== undefined ? String(count) : '-';
          },
        },
        {
          header: 'Triggers',
          value: toolkit => {
            const meta = asRecord(toolkit['meta']);
            const count = asNumber(meta?.['triggers_count']);
            return count !== undefined ? String(count) : '-';
          },
        },
        {
          header: 'Description',
          maxWidth: 70,
          value: toolkit => {
            const meta = asRecord(toolkit['meta']);
            return asString(meta?.['description']) ?? '-';
          },
        },
      ])
    );
  })
).pipe(Command.withDescription('Search toolkits by query'));

const toolkitsInfoCmd = Command.make(
  'info',
  { toolkitSlugArg, versionOpt, jsonOpt },
  ({ toolkitSlugArg, versionOpt, jsonOpt }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioEntitiesRepository;
      const toolkit = yield* repo.toolkitsRetrieve(toolkitSlugArg, {
        version: Option.getOrUndefined(versionOpt),
      });

      if (jsonOpt) {
        yield* Console.log(JSON.stringify(toolkit, null, 2));
        return;
      }

      const meta = asRecord(toolkit['meta']);
      const authSchemes = Array.isArray(toolkit['auth_schemes']) ? toolkit['auth_schemes'] : [];
      const composioManagedAuthSchemes = Array.isArray(toolkit['composio_managed_auth_schemes'])
        ? toolkit['composio_managed_auth_schemes']
        : [];
      const availableVersions = Array.isArray(meta?.['available_versions'])
        ? (meta?.['available_versions'] as ReadonlyArray<unknown>)
        : [];

      yield* Console.log(`Name: ${asString(toolkit['name']) ?? '-'}`);
      yield* Console.log(`Slug: ${asString(toolkit['slug']) ?? '-'}`);
      yield* Console.log(`Description: ${asString(meta?.['description']) ?? '-'}`);
      yield* Console.log(`Version: ${asString(meta?.['version']) ?? '-'}`);
      yield* Console.log(`Tools: ${asNumber(meta?.['tools_count']) ?? 0}`);
      yield* Console.log(`Triggers: ${asNumber(meta?.['triggers_count']) ?? 0}`);
      yield* Console.log(`Auth Schemes: ${authSchemes.map(String).join(', ') || 'None'}`);
      yield* Console.log(
        `Composio Managed Auth Schemes: ${composioManagedAuthSchemes.map(String).join(', ') || 'None'}`
      );
      yield* Console.log('');
      yield* Console.log('Fields Required for AuthConfig and Connected Account creation:');
      yield* Console.log(renderAuthFieldGroups(toolkit));
      yield* Console.log('');
      yield* Console.log('Available Versions:');
      if (availableVersions.length === 0) {
        yield* Console.log('  - latest');
      } else {
        for (const version of availableVersions) {
          yield* Console.log(`  - ${String(version)}`);
        }
      }
    })
).pipe(Command.withDescription('View details of a specific toolkit'));

export const toolkitsCmd = Command.make('toolkits').pipe(
  Command.withDescription('Discover available Composio toolkits'),
  Command.withSubcommands([toolkitsListCmd, toolkitsSearchCmd, toolkitsInfoCmd])
);
