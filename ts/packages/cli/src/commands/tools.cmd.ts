import { Args, Command, Options } from '@effect/cli';
import { Console, Effect, Option } from 'effect';
import { ComposioEntitiesRepository } from 'src/services/composio-entities';
import { parseCsvOption } from './_shared/parse-csv-options';
import { parseLimitOption } from './_shared/parse-limit-option';
import { renderTable } from './_shared/render-table';
import { renderSchemaTree } from './_shared/render-schema-tree';
import { parseJsonObjectOption } from './_shared/parse-json-option';
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

function getToolkitSlugFromTool(tool: Record<string, unknown>): string {
  const toolkit = asRecord(tool['toolkit']);
  const toolkitSlug = toolkit !== null ? asString(toolkit['slug']) : undefined;
  const fromSlug = deriveToolkitSlugFromActionSlug(asString(tool['slug']) ?? '');
  return toolkitSlug ?? fromSlug ?? '-';
}

const toolSlugArg = Args.text({ name: 'tool_slug' });
const queryArg = Args.text({ name: 'query' });

const toolkitsOpt = Options.optional(Options.text('toolkits')).pipe(
  Options.withDescription('Comma-separated toolkit slugs')
);

const tagsOpt = Options.optional(Options.text('tags')).pipe(
  Options.withDescription('Comma-separated tool tags')
);

const queryOpt = Options.optional(Options.text('query')).pipe(
  Options.withDescription('Full text query for tool listing')
);

const limitOpt = Options.optional(Options.text('limit')).pipe(
  Options.withDescription('Maximum number of tools to return')
);

const jsonOpt = Options.boolean('json').pipe(
  Options.withDefault(false),
  Options.withDescription('Print JSON output')
);

const paramsOpt = Options.optional(Options.text('params')).pipe(
  Options.withDescription('JSON object containing tool arguments')
);

const userIdOpt = Options.optional(Options.text('user_id'));
const connectedAccountIdOpt = Options.optional(Options.text('connected_account_id'));
const versionOpt = Options.optional(Options.text('version'));
const textOpt = Options.optional(Options.text('text'));
const allowTracingOpt = Options.boolean('allow_tracing').pipe(Options.withDefault(false));

const toolsListCmd = Command.make(
  'list',
  { toolkitsOpt, tagsOpt, queryOpt, limitOpt },
  ({ toolkitsOpt, tagsOpt, queryOpt, limitOpt }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioEntitiesRepository;
      const toolkitSlugs = parseCsvOption(toolkitsOpt);
      const tags = parseCsvOption(tagsOpt);
      const limit = yield* parseLimitOption(limitOpt);
      const toolkitVersions = yield* getToolkitVersionQueryParam(toolkitSlugs);

      const response = yield* repo.toolsList({
        toolkit_slug: toolkitSlugs.length > 0 ? toolkitSlugs.join(',') : undefined,
        tags: tags.length > 0 ? tags : undefined,
        search: Option.getOrUndefined(queryOpt),
        limit,
        toolkit_versions: toolkitVersions,
      });

      const countMessage =
        toolkitSlugs.length === 1
          ? `Fetched ${response.items.length} tools from ${toolkitSlugs[0]}`
          : `Fetched ${response.items.length} tools`;
      yield* Console.log(countMessage);
      yield* Console.log('');

      const table = renderTable(response.items, [
        { header: 'Name', value: tool => asString(tool['name']) ?? '-' },
        { header: 'Slug', value: tool => asString(tool['slug']) ?? '-' },
        { header: 'Toolkit', value: getToolkitSlugFromTool },
        {
          header: 'Description',
          maxWidth: 80,
          value: tool => asString(tool['description']) ?? '-',
        },
      ]);

      yield* Console.log(table);
      yield* Console.log('');
      yield* Console.log('To view details of a tool: composio tools info "<TOOL_SLUG>"');
    })
).pipe(Command.withDescription('List and discover available tools'));

const toolsSearchCmd = Command.make(
  'search',
  { queryArg, toolkitsOpt, limitOpt },
  ({ queryArg, toolkitsOpt, limitOpt }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioEntitiesRepository;
      const toolkitSlugs = parseCsvOption(toolkitsOpt);
      const limit = yield* parseLimitOption(limitOpt);
      const toolkitVersions = yield* getToolkitVersionQueryParam(toolkitSlugs);

      const response = yield* repo.toolsList({
        search: queryArg,
        toolkit_slug: toolkitSlugs.length > 0 ? toolkitSlugs.join(',') : undefined,
        limit,
        toolkit_versions: toolkitVersions,
      });

      yield* Console.log(`Found ${response.items.length} tools`);
      yield* Console.log('');
      yield* Console.log(
        renderTable(response.items, [
          { header: 'Name', value: tool => asString(tool['name']) ?? '-' },
          { header: 'Slug', value: tool => asString(tool['slug']) ?? '-' },
          { header: 'Toolkit', value: getToolkitSlugFromTool },
          {
            header: 'Description',
            maxWidth: 80,
            value: tool => asString(tool['description']) ?? '-',
          },
        ])
      );
    })
).pipe(Command.withDescription('Search tools by semantic/full-text query'));

const toolsInfoCmd = Command.make('info', { toolSlugArg, jsonOpt }, ({ toolSlugArg, jsonOpt }) =>
  Effect.gen(function* () {
    const repo = yield* ComposioEntitiesRepository;
    const toolkitSlug = deriveToolkitSlugFromActionSlug(toolSlugArg);
    const toolkitVersions = yield* getToolkitVersionQueryParam(toolkitSlug ? [toolkitSlug] : []);
    const tool = yield* repo.toolsRetrieve(toolSlugArg, { toolkit_versions: toolkitVersions });

    if (jsonOpt) {
      yield* Console.log(JSON.stringify(tool, null, 2));
      return;
    }

    yield* Console.log(`Name: ${asString(tool['name']) ?? '-'}`);
    yield* Console.log(`Slug: ${asString(tool['slug']) ?? '-'}`);
    yield* Console.log(`Description: ${asString(tool['description']) ?? '-'}`);
    yield* Console.log('');
    yield* Console.log('Input Schema:');
    yield* Console.log(renderSchemaTree(tool['input_parameters']));
    yield* Console.log('');
    yield* Console.log('Output Schema:');
    yield* Console.log(renderSchemaTree(tool['output_parameters']));
  })
).pipe(Command.withDescription('View detailed tool information and schemas'));

const toolsExecuteCmd = Command.make(
  'execute',
  {
    toolSlugArg,
    userIdOpt,
    connectedAccountIdOpt,
    versionOpt,
    paramsOpt,
    textOpt,
    allowTracingOpt,
  },
  ({
    toolSlugArg,
    userIdOpt,
    connectedAccountIdOpt,
    versionOpt,
    paramsOpt,
    textOpt,
    allowTracingOpt,
  }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioEntitiesRepository;
      const params = Option.isSome(paramsOpt)
        ? yield* parseJsonObjectOption('params', paramsOpt.value)
        : undefined;

      const response = yield* repo.toolsExecute(toolSlugArg, {
        user_id: Option.getOrUndefined(userIdOpt),
        connected_account_id: Option.getOrUndefined(connectedAccountIdOpt),
        version: Option.getOrUndefined(versionOpt),
        arguments: params,
        text: Option.getOrUndefined(textOpt),
        allow_tracing: allowTracingOpt ? true : undefined,
      });

      yield* Console.log('200 Execute the tool');
      yield* Console.log('Response:');
      yield* Console.log(JSON.stringify(response, null, 2));
    })
).pipe(Command.withDescription('Execute a tool with arguments'));

export const toolsCmd = Command.make('tools').pipe(
  Command.withDescription('Discover and execute Composio tools'),
  Command.withSubcommands([toolsListCmd, toolsSearchCmd, toolsInfoCmd, toolsExecuteCmd])
);
