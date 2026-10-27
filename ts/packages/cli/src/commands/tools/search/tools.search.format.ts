import type { SessionSearchResponse } from '@composio/client/resources/tool-router';
import { Effect } from 'effect';
import type { Tool } from 'src/models/tools';
import type { TerminalUI } from 'src/services/terminal-ui';
import type { CommandTree } from 'src/commands/surface';
import { commandHintExample, commandHintStep } from 'src/services/command-hints';
import { formatToolsTable } from '../format';

export type SearchToolSchema = NonNullable<SessionSearchResponse['tool_schemas'][string]>;
export type SearchResultRecord = SessionSearchResponse['results'][number];
export type SearchResponseRecord = Pick<
  SessionSearchResponse,
  'results' | 'toolkit_connection_statuses' | 'tool_schemas' | 'next_steps_guidance' | 'error'
>;

export const stripSearchResultMetadata = <
  T extends { reference_workbench_snippets?: unknown; plan_id?: unknown },
>(
  result: T
) => {
  const {
    reference_workbench_snippets: _referenceWorkbenchSnippets,
    plan_id: _planId,
    ...rest
  } = result;
  return rest;
};

export const TOOL_SCHEMA_PATH_FORMAT = '~/.composio/tool_definitions/<TOOL_SLUG>.json';

export const toHomeRelativePath = (cacheDir: string, absolutePath: string) =>
  absolutePath.startsWith(cacheDir) ? absolutePath.replace(cacheDir, '~/.composio') : absolutePath;

export const collectToolsForResult = (params: {
  result: {
    primary_tool_slugs: string[];
    related_tool_slugs: string[];
  };
  toolSchemas: Record<string, SearchToolSchema>;
  toolkitSet?: Set<string>;
  limit: number;
}): Tool[] => {
  const mergedSlugs: string[] = [];
  const seen = new Set<string>();
  for (const slug of [...params.result.primary_tool_slugs, ...params.result.related_tool_slugs]) {
    if (!seen.has(slug)) {
      seen.add(slug);
      mergedSlugs.push(slug);
    }
  }

  const toolsList: Tool[] = [];
  for (const slug of mergedSlugs) {
    const schema = params.toolSchemas[slug];
    if (!schema) continue;
    if (params.toolkitSet && !params.toolkitSet.has(schema.toolkit.toLowerCase())) continue;

    toolsList.push({
      slug: schema.tool_slug,
      name: schema.tool_slug,
      description: schema.description ?? '',
      tags: [],
      available_versions: [],
      input_parameters: schema.input_schema ?? {},
      output_parameters: schema.output_schema ?? {},
    });

    if (toolsList.length >= params.limit) break;
  }

  return toolsList;
};

export const buildSearchNextSteps = (params: {
  firstSlug?: string;
  firstToolkit?: string;
  firstDataArg: string;
  tree: CommandTree;
}) => {
  const steps: Array<{ action: string; command: string }> = [];
  if (params.firstToolkit) {
    steps.push({
      action: 'Link a user account',
      command:
        params.tree === 'root'
          ? commandHintExample('root.link', { toolkit: String(params.firstToolkit).toLowerCase() })
          : commandHintExample('dev.connectedAccounts.link', {
              toolkit: String(params.firstToolkit).toLowerCase(),
              userId: '<user-id>',
            }),
    });
  }
  if (params.firstSlug) {
    steps.push({
      action: 'Execute a tool',
      command:
        params.tree === 'root'
          ? commandHintExample('root.execute', {
              slug: params.firstSlug,
              data: params.firstDataArg,
            })
          : commandHintExample('dev.playgroundExecute', {
              slug: params.firstSlug,
              userId: '<user-id>',
              data: params.firstDataArg,
            }),
    });
  }
  return steps;
};

export const emitHumanSearchOutput = (params: {
  ui: TerminalUI;
  queries: ReadonlyArray<string>;
  resultsWithTools: Array<{ result: SearchResultRecord; tools: Tool[] }>;
  nextStepsGuidance: ReadonlyArray<string>;
  firstSlug?: string;
  firstDataArg: string;
  tree: CommandTree;
  error: string | null;
}) =>
  Effect.gen(function* () {
    for (const { result, tools } of params.resultsWithTools) {
      if (params.queries.length > 1) {
        yield* params.ui.log.info(`Results for "${result.use_case}"`);
      }

      if (tools.length === 0) {
        yield* params.ui.log.warn(`No tools found for "${result.use_case}".`);
        continue;
      }

      yield* params.ui.log.info(`Found ${tools.length} tools\n\n${formatToolsTable(tools)}`);

      const planSteps = Array.from(new Set(result.recommended_plan_steps ?? []));
      if (planSteps.length > 0) {
        yield* params.ui.log.info(
          `Plan:\n${planSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`
        );
      } else if (params.queries.length === 1 && params.nextStepsGuidance.length > 0) {
        yield* params.ui.log.info(
          `Plan:\n${params.nextStepsGuidance.map((step, i) => `${i + 1}. ${step}`).join('\n')}`
        );
      }
    }

    if (params.firstSlug) {
      const linkHint =
        params.tree === 'root'
          ? commandHintStep('Link an account', 'root.link', { toolkit: '<toolkit>' })
          : commandHintStep('Link an account', 'dev.connectedAccounts.link', {
              toolkit: '<toolkit>',
              userId: '<user-id>',
            });
      const executeHint =
        params.tree === 'root'
          ? commandHintStep('Execute a tool', 'root.execute', {
              slug: params.firstSlug,
              data: params.firstDataArg,
            })
          : commandHintStep('Test a tool against a playground user', 'dev.playgroundExecute', {
              slug: params.firstSlug,
              userId: '<user-id>',
              data: params.firstDataArg,
            });
      const steps = params.firstSlug.startsWith('LOCAL_') ? [executeHint] : [linkHint, executeHint];
      yield* params.ui.log.step(steps.join('\n'));
    }

    if (params.error) {
      yield* params.ui.log.warn(params.error);
    }
  });
