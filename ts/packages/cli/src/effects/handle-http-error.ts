import { Effect } from 'effect';
import type { HttpServerError } from 'src/services/composio-clients';
import type { TerminalUI } from 'src/services/terminal-ui';

/**
 * Create an HttpServerError handler that logs the structured error details
 * (or a fallback message) and a contextual hint, then returns a fallback value.
 *
 * Used by info/delete/create commands that share the same error-handling shape.
 *
 * @example
 * ```ts
 * .pipe(
 *   Effect.catchTag('services/HttpServerError',
 *     handleHttpServerError(ui, {
 *       fallbackMessage: `Failed to fetch auth config "${id}".`,
 *       hint: 'Browse available auth configs:\n> composio auth-configs list',
 *       fallbackValue: Option.none(),
 *     })
 *   )
 * )
 * ```
 */
export const handleHttpServerError =
  <A>(
    ui: TerminalUI,
    opts: {
      readonly fallbackMessage: string;
      readonly hint: string;
      readonly fallbackValue: A;
    }
  ) =>
  (e: HttpServerError) =>
    Effect.gen(function* () {
      if (e.details) {
        yield* ui.log.error(e.details.message);
        yield* ui.log.step(e.details.suggestedFix);
      } else {
        yield* ui.log.error(opts.fallbackMessage);
      }

      yield* ui.log.step(opts.hint);
      return opts.fallbackValue;
    });
