import { Args, Command, Options } from '@effect/cli';
import util from 'node:util';
import { Effect, Option, Either } from 'effect';
import { FileSystem } from '@effect/platform';
import { ComposioError } from '@composio/core';
import type { ToolExecuteParams } from '@composio/core';
import { JSONParse } from 'src/effects/json';
import { redact } from 'src/ui/redact';
import { readStdin, readStdinIfPiped } from 'src/effects/read-stdin';
import { requireAuth } from 'src/effects/require-auth';
import { TerminalUI } from 'src/services/terminal-ui';
import {
  ActionExecuteConnectedAccountNotFoundError,
  ToolsExecutor,
} from 'src/services/tools-executor';
import {
  extractApiErrorDetails,
  extractMessage,
  extractSlug,
} from 'src/utils/api-error-extraction';
import { bold } from 'src/ui/colors';

const slug = Args.text({ name: 'slug' }).pipe(
  Args.withDescription('Tool slug (e.g. "GITHUB_CREATE_ISSUE")')
);

const data = Options.text('data').pipe(
  Options.withAlias('d'),
  Options.withDescription('JSON arguments, @file, or - for stdin'),
  Options.optional
);

const userId = Options.text('user-id').pipe(
  Options.withDefault('default'),
  Options.withDescription('User ID to execute the tool for (default: "default")')
);

const connectedAccountId = Options.text('connected-account-id').pipe(
  Options.withDescription('Connected account ID to use for authenticated tools'),
  Options.optional
);

const toolkitVersion = Options.text('toolkit-version').pipe(
  Options.withDescription('Toolkit version to execute (e.g. "20250909_00")'),
  Options.optional
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

    return yield* Effect.fail(
      new Error('Missing JSON input. Provide -d/--data or pipe JSON to stdin.')
    );
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

const formatPossibleFixes = (fixes: ReadonlyArray<string>) =>
  fixes.map(fix => `- ${fix}`).join('\n');

const connectedAccountTips = [
  `Create or find an auth config: ${bold('composio auth-configs list --toolkits <toolkit>')}`,
  `Link the account: ${bold('composio connected-accounts link --auth-config <AUTH_CONFIG_ID> --user-id <USER_ID>')}`,
  `Verify the link: ${bold('composio connected-accounts list --toolkits <toolkit> --user-id <USER_ID>')}`,
  `Retry the tool or pass ${bold('--connected-account-id <ID>')}`,
].join('\n');

/**
 * JSON.stringify replacer that redacts ID-like string values in CI.
 * Fields named "id", ending with "Id", or ending with "_id" are redacted.
 * The "logId" field preserves its "log_" prefix.
 */
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

    if (current instanceof ComposioError || current instanceof Error) {
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

/**
 * Display a user-friendly error message for tool execution failures.
 *
 * Returns a structured error summary suitable for `ui.output()` in piped mode.
 */
const handleExecutionError = (ui: TerminalUI, error: unknown) =>
  Effect.gen(function* () {
    const normalized = normalizeError(error);

    // ActionExecuteConnectedAccountNotFoundError stores the API payload in `.details`
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

    // Display the primary error message
    yield* ui.log.error(message);

    // ComposioError-specific: show code, status, cause, possible fixes
    if (normalized instanceof ComposioError) {
      if (normalized.code) {
        yield* ui.log.message(`Code: ${normalized.code}`);
      }
      const statusCode = (normalized as { statusCode?: number }).statusCode;
      if (statusCode) {
        yield* ui.log.message(`Status: ${statusCode}`);
      }
      const cause = (normalized as { cause?: unknown }).cause;
      if (cause) {
        const causeMessage = cause instanceof Error ? cause.message : String(cause);
        yield* ui.log.message(`Cause: ${causeMessage}`);
      }
      if (normalized.possibleFixes && normalized.possibleFixes.length > 0) {
        yield* ui.note(formatPossibleFixes(normalized.possibleFixes), 'Possible fixes');
      }
    }

    // Show API error details when available
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

    // Connected-account tips
    if (slugValue === 'ActionExecute_ConnectedAccountNotFound') {
      yield* ui.note(connectedAccountTips, 'Tips');
    }

    // Return structured summary for piped output
    return { error: message, slug: slugValue };
  });

class ToolExecutionError {
  readonly _tag = 'ToolExecutionError';
  constructor(readonly message: string) {}
}

/**
 * Execute a tool with JSON arguments.
 *
 * @example
 * ```bash
 * composio tools execute GITHUB_GET_REPOS -d '{"owner":"composio"}'
 * echo '{"owner":"composio"}' | composio tools execute GITHUB_GET_REPOS
 * ```
 */
export const toolsCmd$Execute = Command.make(
  'execute',
  { slug, data, userId, connectedAccountId, toolkitVersion },
  ({ slug, data, userId, connectedAccountId, toolkitVersion }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const executor = yield* ToolsExecutor;

      const input = yield* resolveInput(data);
      const args = yield* parseArguments(input);

      const versionValue = Option.getOrUndefined(toolkitVersion);
      const shouldSkipVersionCheck = !versionValue || versionValue === 'latest';

      const params: ToolExecuteParams = {
        userId,
        arguments: args,
        connectedAccountId: Option.getOrUndefined(connectedAccountId),
        version: versionValue,
        dangerouslySkipVersionCheck: shouldSkipVersionCheck ? true : undefined,
      };

      yield* ui.useMakeSpinner(`Executing tool "${slug}"...`, spinner =>
        Effect.gen(function* () {
          const resultEither = yield* executor.execute(slug, params).pipe(Effect.either);

          // Hard failure: API threw an exception
          if (Either.isLeft(resultEither)) {
            yield* spinner.error();
            const summary = yield* handleExecutionError(ui, resultEither.left);
            yield* ui.output(
              JSON.stringify({ successful: false, ...summary }, ciRedactReplacer, 2)
            );
            return yield* Effect.fail(new ToolExecutionError(summary.error));
          }

          const result = resultEither.right;

          // Soft failure: API returned { successful: false }
          if (!result.successful) {
            const logId = result.logId
              ? ` (logId: ${redact({ value: result.logId, prefix: 'log_' })})`
              : '';
            yield* spinner.error(`Execution failed${logId}`);

            const summary = yield* handleExecutionError(ui, result.error ?? result);
            yield* ui.output(JSON.stringify(result, ciRedactReplacer, 2));
            return yield* Effect.fail(new ToolExecutionError(summary.error));
          }

          // Success
          const logId = result.logId
            ? ` (logId: ${redact({ value: result.logId, prefix: 'log_' })})`
            : '';
          yield* spinner.stop(`Execution successful${logId}`);
          yield* ui.output(JSON.stringify(result, ciRedactReplacer, 2));
        })
      );
    })
).pipe(Command.withDescription('Execute a tool by slug with JSON arguments.'));
