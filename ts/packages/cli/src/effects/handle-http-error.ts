import { isAPIError } from '@composio/client/effect';
import { Effect } from 'effect';
import type { ClientApiError } from 'src/services/composio-errors';
import type { TerminalUI } from 'src/services/terminal-ui';
import { reportFailure } from 'src/effects/report-failure';
import { describeDecodeError, isClientDecodeError } from 'src/utils/api-error-extraction';
import { isRejectedUserApiKey, rejectedUserApiKeyHint } from 'src/effects/rejected-user-api-key';

export interface Suggestion {
  readonly label: string;
  readonly command: string;
}

const noSuggestions: ReadonlyArray<Suggestion> = [];

export interface HandleClientApiErrorOptions<A> {
  readonly fallbackMessage: string;
  readonly hint: string;
  readonly fallbackValue: A;
  readonly searchForSuggestions?: () => Effect.Effect<ReadonlyArray<Suggestion>, unknown, never>;
}

interface ErrorReport {
  readonly message?: string;
  readonly suggestedFix?: string;
  // Set when the failure has its own remedy, which replaces the caller's hint.
  readonly hint?: string;
}

const reportOf = (e: ClientApiError): Effect.Effect<ErrorReport> => {
  if (isClientDecodeError(e)) return Effect.succeed(describeDecodeError(e));
  if (isAPIError(e)) {
    return isRejectedUserApiKey(e)
      ? Effect.map(rejectedUserApiKeyHint, hint => ({ message: e.details?.message, hint }))
      : Effect.succeed({ message: e.details?.message, suggestedFix: e.details?.suggested_fix });
  }
  return Effect.succeed({});
};

/**
 * Create a handler for a client API error that logs the structured error
 * details (or a fallback message) and a contextual hint, then returns a
 * fallback value.
 *
 * The final rendering is `reportFailure`'s (`src/effects/report-failure.ts`):
 * the exit code is set to 1 so callers such as scripts and agents can detect
 * the failure, and the message and hint reach stderr as plain lines when it is
 * not a TTY.
 *
 * Used by info/delete/create commands that share the same error-handling shape.
 *
 * When `searchForSuggestions` is provided, the handler will attempt to find
 * similar items and display "Did you mean?" suggestions instead of the generic hint.
 * Suggestion search failures are silently swallowed — the handler always completes.
 *
 * A response that failed client decoding is reported by operation and request
 * id with an upgrade hint, in place of the fallback message and the hint.
 *
 * Recover from every client API error (a non-success status, a connection
 * failure, a timeout, or a response that failed decoding) with
 * `Effect.catchTag(CLIENT_API_ERROR_TAGS, ...)`; every other failure passes
 * through. A single tag narrows the recovery to that status.
 *
 * @example
 * ```ts
 * .pipe(
 *   Effect.catchTag(CLIENT_API_ERROR_TAGS,
 *     handleClientApiError(ui, {
 *       fallbackMessage: `Failed to fetch auth config "${id}".`,
 *       hint: 'Browse available auth configs:\n> composio dev auth-configs list',
 *       fallbackValue: Option.none(),
 *     })
 *   )
 * )
 * ```
 */
export const handleClientApiError =
  <A>(ui: TerminalUI, opts: HandleClientApiErrorOptions<A>) =>
  (e: ClientApiError) =>
    Effect.gen(function* () {
      const report = yield* reportOf(e);
      const message = report.message ?? opts.fallbackMessage;
      const hint = report.hint ?? opts.hint;
      // The API's own suggested fix comes first, then the caller's hint — or the
      // "Did you mean?" suggestions that replace it.
      const withHint = (suffix: string) =>
        report.suggestedFix === undefined ? suffix : `${report.suggestedFix}\n\n${suffix}`;

      if (opts.searchForSuggestions && report.hint === undefined) {
        const suggestions = yield* opts
          .searchForSuggestions()
          .pipe(Effect.catch(() => Effect.succeed(noSuggestions)));

        const [first] = suggestions;
        if (first) {
          const lines = suggestions.map(s => `  ${s.label}`).join('\n');
          yield* reportFailure(
            ui,
            message,
            withHint(`Did you mean?\n${lines}\n\n${first.command}`)
          );
          return opts.fallbackValue;
        }
      }

      yield* reportFailure(ui, message, withHint(hint));
      return opts.fallbackValue;
    });
