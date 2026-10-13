import process from 'node:process';
import { isAPIError } from '@composio/client/effect';
import { Effect } from 'effect';
import type { HttpServerError } from 'src/services/composio-clients';
import type { TerminalUI } from 'src/services/terminal-ui';
import {
  describeDecodeError,
  isClientApiError,
  isClientDecodeError,
  type ClientApiError,
} from 'src/utils/api-error-extraction';

export interface Suggestion {
  readonly label: string;
  readonly command: string;
}

const noSuggestions: ReadonlyArray<Suggestion> = [];

export interface HandleHttpServerErrorOptions<A> {
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

const reportOf = (e: HttpServerError | ClientApiError): ErrorReport => {
  if (!isClientApiError(e)) {
    return { message: e.details?.message, suggestedFix: e.details?.suggestedFix };
  }
  if (isClientDecodeError(e)) return describeDecodeError(e);
  if (isAPIError(e)) {
    return { message: e.details?.message, suggestedFix: e.details?.suggested_fix };
  }
  return {};
};

/**
 * Create a handler for an HttpServerError or a client API error that logs the
 * structured error details (or a fallback message) and a contextual hint, then
 * returns a fallback value.
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
 * @example
 * ```ts
 * .pipe(
 *   Effect.catchTag('services/HttpServerError',
 *     handleHttpServerError(ui, {
 *       fallbackMessage: `Failed to fetch auth config "${id}".`,
 *       hint: 'Browse available auth configs:\n> composio dev auth-configs list',
 *       fallbackValue: Option.none(),
 *     })
 *   )
 * )
 * ```
 */
export const handleHttpServerError =
  <A>(ui: TerminalUI, opts: HandleHttpServerErrorOptions<A>) =>
  (e: HttpServerError | ClientApiError) =>
    Effect.gen(function* () {
      process.exitCode = 1;

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

/**
 * Recover from any client API error (a non-success status, a connection
 * failure, a timeout, or a response that failed decoding) with
 * `handleHttpServerError`. Every other failure passes through.
 *
 * @example
 * ```ts
 * .pipe(
 *   catchClientApiError(ui, {
 *     fallbackMessage: `Failed to fetch auth config "${id}".`,
 *     hint: 'Browse available auth configs:\n> composio dev auth-configs list',
 *     fallbackValue: Option.none(),
 *   })
 * )
 * ```
 */
export const catchClientApiError =
  <B>(ui: TerminalUI, opts: HandleHttpServerErrorOptions<B>) =>
  <A, E, R>(
    self: Effect.Effect<A, E, R>
  ): Effect.Effect<A | B, Exclude<E, Extract<E, ClientApiError>>, R> =>
    Effect.catchIf<A, E, R, Extract<E, ClientApiError>, B, never, never>(
      self,
      (e): e is Extract<E, ClientApiError> => isClientApiError(e),
      handleHttpServerError(ui, opts)
    );
