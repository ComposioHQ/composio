import { Args, Command, Options } from '@effect/cli';
import util from 'node:util';
import { Effect, Option, Either } from 'effect';
import { FileSystem } from '@effect/platform';
import { JSONParse } from 'src/effects/json';
import { redact } from 'src/ui/redact';
import { readStdin, readStdinIfPiped } from 'src/effects/read-stdin';
import { requireAuth } from 'src/effects/require-auth';
import { TerminalUI } from 'src/services/terminal-ui';
import {
  ActionExecuteConnectedAccountNotFoundError,
  ToolsExecutor,
} from 'src/services/tools-executor';
import type { ToolExecuteParams } from 'src/services/tools-executor';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';
import {
  extractApiErrorDetails,
  extractMessage,
  extractSlug,
} from 'src/utils/api-error-extraction';
import { bold } from 'src/ui/colors';
import { handleHttpServerError } from 'src/effects/handle-http-error';
import { formatToolInputParameters } from '../format';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import {
  resolveCommandProject,
  formatResolveCommandProjectError,
} from 'src/services/command-project';

const slug = Args.text({ name: 'slug' }).pipe(
  Args.withDescription('Tool slug (e.g. "GITHUB_CREATE_ISSUE")')
);

const data = Options.text('data').pipe(
  Options.withAlias('d'),
  Options.withDescription('JSON arguments, @file, or - for stdin'),
  Options.optional
);

const userId = Options.text('user-id').pipe(
  Options.optional,
  Options.withDescription('Developer-project user ID override')
);

const projectName = Options.text('project-name').pipe(
  Options.optional,
  Options.withDescription('Developer project name override for this command')
);

const resolveInput = (input: Option.Option<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    if (Option.isSome(input)) {
      const value = input.value.trim();
      if (value === '-') {
        return yield* readStdin;
      }
      if (value.startsWith('@')) {
        const filePath = value.slice(1).trim();
        if (!filePath) {
          return yield* Effect.fail(new Error('Missing file path after "@" in --data'));
        }
        return yield* fs.readFileString(filePath, 'utf-8');
      }
      return value;
    }

    const piped = yield* readStdinIfPiped;
    if (Option.isSome(piped)) {
      return piped.value;
    }

    // Default to empty object when no data provided (e.g. tools with no required args)
    return '{}';
  });

const parseArguments = (raw: string) =>
  Effect.gen(function* () {
    const parsed = (yield* JSONParse(raw).pipe(
      Effect.mapError(
        () =>
          new Error('Invalid JSON input. Provide a JSON object, e.g. -d "{\\"key\\":\\"value\\"}"')
      )
    )) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return yield* Effect.fail(
        new Error('Expected a JSON object for tool arguments, e.g. -d "{\\"key\\":\\"value\\"}"')
      );
    }
    return parsed as Record<string, unknown>;
  });

const toolkitFromToolSlug = (toolSlug: string): string | undefined => {
  const idx = toolSlug.indexOf('_');
  if (idx <= 0) return toolSlug.toLowerCase();
  const prefix = toolSlug.slice(0, idx).toLowerCase();
  if (prefix === 'composio') return undefined;
  return prefix;
};

const connectionTips = (toolSlug: string, surface: 'root' | 'manage') => {
  const toolkit = toolkitFromToolSlug(toolSlug);
  if (!toolkit) {
    return `Retry: ${bold(`composio execute ${toolSlug} ...`)}`;
  }
  return [
    `Link the toolkit first: ${bold(
      surface === 'root'
        ? `composio link ${toolkit}`
        : `composio manage connected-accounts link ${toolkit} --user-id "<user-id>"`
    )}`,
    `Then retry:             ${bold(
      surface === 'root'
        ? `composio execute ${toolSlug} ...`
        : `composio manage tools execute ${toolSlug} ...`
    )}`,
  ].join('\n');
};

const ciRedactReplacer = (_key: string, value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  if (_key === 'logId') return redact({ value, prefix: 'log_' });
  if (_key === 'id' || _key.endsWith('Id') || _key.endsWith('_id')) {
    return redact({ value });
  }
  return value;
};

const formatUnknownObject = (value: object): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return util.inspect(value, { depth: 5, breakLength: 120 });
  }
};

const redactRequestId = (value: object): object => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  const requestId = record.request_id;
  if (typeof requestId !== 'string') {
    return value;
  }
  return {
    ...record,
    request_id: redact({ value: requestId }),
  };
};

const normalizeError = (error: unknown): unknown => {
  let current: unknown = error;
  const seen = new Set<unknown>();

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);

    if (current instanceof Error) {
      return current;
    }

    if ('error' in current) {
      current = (current as { error?: unknown }).error;
      continue;
    }
    if ('cause' in current) {
      current = (current as { cause?: unknown }).cause;
      continue;
    }
    break;
  }

  return current;
};

export const showToolsExecuteInputHelp = (toolSlug: string) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    const toolOpt = yield* ui
      .withSpinner(`Fetching input parameters for "${toolSlug}"...`, repo.getToolDetailed(toolSlug))
      .pipe(
        Effect.asSome,
        Effect.catchTag(
          'services/HttpServerError',
          handleHttpServerError(ui, {
            fallbackMessage: `Tool "${toolSlug}" not found.`,
            hint: 'Browse available tools:\n> composio manage tools list',
            fallbackValue: Option.none(),
            searchForSuggestions: () =>
              repo.searchTools({ search: toolSlug, limit: 3 }).pipe(
                Effect.map(r =>
                  r.items.map(s => ({
                    label: `${s.slug} — ${s.description}`,
                    command: `> composio execute "${s.slug}" --help`,
                  }))
                )
              ),
          })
        )
      );

    if (Option.isNone(toolOpt)) return;
    const tool = toolOpt.value;

    yield* ui.note(formatToolInputParameters(tool), `Execute Help: ${tool.slug}`);
    yield* ui.log.step(`Run:\n> composio execute "${tool.slug}" -d '{"key":"value"}'`);
    yield* ui.output(
      JSON.stringify({ slug: tool.slug, input_parameters: tool.input_parameters }, null, 2)
    );
  });

const handleExecutionError = (
  ui: TerminalUI,
  error: unknown,
  context: { toolSlug: string; surface: 'root' | 'manage' }
) =>
  Effect.gen(function* () {
    const normalized = normalizeError(error);
    const connAccountDetails =
      normalized instanceof ActionExecuteConnectedAccountNotFoundError
        ? normalized.details
        : undefined;

    const apiDetails =
      extractApiErrorDetails(error) ??
      extractApiErrorDetails(normalized) ??
      extractApiErrorDetails(connAccountDetails);
    const slugValue = apiDetails?.slug ?? extractSlug(error) ?? extractSlug(connAccountDetails);
    const message = extractMessage(apiDetails) ?? extractMessage(normalized) ?? 'Unknown error';

    yield* ui.log.error(message);

    const detailsObject =
      apiDetails ??
      (normalized instanceof ActionExecuteConnectedAccountNotFoundError &&
      normalized.details &&
      typeof normalized.details === 'object'
        ? (normalized.details as object)
        : undefined);
    if (detailsObject) {
      yield* ui.note(formatUnknownObject(redactRequestId(detailsObject)), 'Error details');
    }

    if (normalized instanceof ActionExecuteConnectedAccountNotFoundError) {
      yield* ui.note(connectionTips(context.toolSlug, context.surface), 'Tips');
    }

    return { error: message, slug: slugValue };
  });

class ToolExecutionError {
  readonly _tag = 'ToolExecutionError';
  constructor(readonly message: string) {}
}

const runToolsExecute = (params: {
  slug: string;
  data: Option.Option<string>;
  userId: Option.Option<string>;
  projectName: Option.Option<string>;
  rootOnly: boolean;
}) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const executor = yield* ToolsExecutor;
    const clientSingleton = yield* ComposioClientSingleton;
    const userContext = yield* ComposioUserContext;

    const input = yield* resolveInput(params.data);
    const args = yield* parseArguments(input);
    const resolvedProject = yield* resolveCommandProject({
      mode: 'consumer',
      projectName: params.rootOnly ? undefined : Option.getOrUndefined(params.projectName),
    }).pipe(Effect.mapError(formatResolveCommandProjectError));
    const resolvedUserId =
      resolvedProject.projectType === 'CONSUMER'
        ? Option.fromNullable(resolvedProject.consumerUserId)
        : Option.match(params.userId, {
            onSome: value => Option.some(value),
            onNone: () => userContext.data.testUserId,
          });
    if (Option.isNone(resolvedUserId)) {
      return yield* Effect.fail(
        new Error(
          'Missing user id. Provide --user-id or run composio login to set global test_user_id.'
        )
      );
    }
    const client = yield* clientSingleton.getFor({
      orgId: resolvedProject.orgId,
      projectId: resolvedProject.projectId,
    });

    const executeParams: ToolExecuteParams = {
      userId: resolvedUserId.value,
      arguments: args,
      client,
    };

    yield* ui.useMakeSpinner(`Executing tool "${params.slug}"...`, spinner =>
      Effect.gen(function* () {
        const resultEither = yield* executor
          .execute(params.slug, executeParams)
          .pipe(Effect.either);

        if (Either.isLeft(resultEither)) {
          yield* spinner.error();
          const summary = yield* handleExecutionError(ui, resultEither.left, {
            toolSlug: params.slug,
            surface: params.rootOnly ? 'root' : 'manage',
          });
          yield* ui.output(JSON.stringify({ successful: false, ...summary }, ciRedactReplacer, 2));
          return yield* Effect.fail(new ToolExecutionError(summary.error));
        }

        const result = resultEither.right;

        if (!result.successful) {
          const logId = result.logId
            ? ` (logId: ${redact({ value: result.logId, prefix: 'log_' })})`
            : '';
          yield* spinner.error(`Execution failed${logId}`);

          const summary = yield* handleExecutionError(ui, result.error ?? result, {
            toolSlug: params.slug,
            surface: params.rootOnly ? 'root' : 'manage',
          });
          yield* ui.output(JSON.stringify(result, ciRedactReplacer, 2));
          return yield* Effect.fail(new ToolExecutionError(summary.error));
        }

        const logId = result.logId
          ? ` (logId: ${redact({ value: result.logId, prefix: 'log_' })})`
          : '';
        yield* spinner.stop(`Execution successful${logId}`);
        yield* ui.log.message(`Response\n${JSON.stringify(result, ciRedactReplacer, 2)}`);
        yield* ui.output(JSON.stringify(result, ciRedactReplacer, 2));
      })
    );
  });

export const toolsCmd$Execute = Command.make(
  'execute',
  { slug, data, userId, projectName },
  ({ slug, data, userId, projectName }) =>
    runToolsExecute({ slug, data, userId, projectName, rootOnly: false })
).pipe(
  Command.withDescription(
    [
      'Execute a tool by slug with JSON arguments.',
      '',
      'Related:',
      '  composio search "<query>"',
      '  composio link <toolkit>',
    ].join('\n')
  )
);

export const rootToolsCmd$Execute = Command.make('execute', { slug, data }, ({ slug, data }) =>
  runToolsExecute({
    slug,
    data,
    userId: Option.none(),
    projectName: Option.none(),
    rootOnly: true,
  })
).pipe(
  Command.withDescription(
    [
      'Execute a tool by slug with JSON arguments.',
      '',
      'Related:',
      '  composio search "<query>"',
      '  composio link <toolkit>',
    ].join('\n')
  )
);
