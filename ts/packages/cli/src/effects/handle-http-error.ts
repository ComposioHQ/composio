import { isAPIError } from '@composio/client/effect';
import { Effect } from 'effect';
import type { ClientApiError } from 'src/services/composio-errors';
import { NodeProcess } from 'src/services/node-process';
import type { TerminalUI } from 'src/services/terminal-ui';
import { describeDecodeError, isClientDecodeError } from 'src/utils/api-error-extraction';

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

const reportOf = (e: ClientApiError): ErrorReport => {
  if (isClientDecodeError(e)) return describeDecodeError(e);
  if (isAPIError(e)) {
    return { message: e.details?.message, suggestedFix: e.details?.suggested_fix };
  }
  return {};
};

/**
 * Create a handler for a client API error that logs the structured error
 * details (or a fallback message) and a contextual hint, then returns a
 * fallback value.
 *
 * The process exit code is set to 1 so callers such as scripts and agents can
 * detect the failure. Decorated logs only render when stderr is a TTY, so the
 * error message and hint are also written plainly to stderr when it is not.
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
      const proc = yield* NodeProcess;
      yield* proc.setExitCode(1);

      const report = reportOf(e);
      const message = report.message ?? opts.fallbackMessage;
      const hint = report.hint ?? opts.hint;

      const { canDecorate } = yield* ui.capabilities;
      if (!canDecorate) {
        yield* ui.error(message);
        yield* ui.error(hint);
      }

      yield* ui.log.error(message);
      if (report.suggestedFix !== undefined) {
        yield* ui.log.step(report.suggestedFix);
      }

      if (opts.searchForSuggestions && report.hint === undefined) {
        const suggestions = yield* opts
          .searchForSuggestions()
          .pipe(Effect.catch(() => Effect.succeed(noSuggestions)));

        const [first] = suggestions;
        if (first) {
          const lines = suggestions.map(s => `  ${s.label}`).join('\n');
          yield* ui.log.step(`Did you mean?\n${lines}\n\n${first.command}`);
          return opts.fallbackValue;
        }
      }

      yield* ui.log.step(hint);
      return opts.fallbackValue;
    });
