import { Effect } from 'effect';
import type { HttpServerError } from 'src/services/composio-clients';
import type { TerminalUI } from 'src/services/terminal-ui';

export interface Suggestion {
  readonly label: string;
  readonly command: string;
}

const noSuggestions: ReadonlyArray<Suggestion> = [];

/**
 * Create an HttpServerError handler that logs the structured error details
 * (or a fallback message) and a contextual hint, then returns a fallback value.
 *
 * Used by info/delete/create commands that share the same error-handling shape.
 *
 * When `searchForSuggestions` is provided, the handler will attempt to find
 * similar items and display "Did you mean?" suggestions instead of the generic hint.
 * Suggestion search failures are silently swallowed — the handler always completes.
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
      readonly searchForSuggestions?: () => Effect.Effect<
        ReadonlyArray<Suggestion>,
        unknown,
        never
      >;
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

      if (opts.searchForSuggestions) {
        const suggestions = yield* opts
          .searchForSuggestions()
          .pipe(Effect.catchAll(() => Effect.succeed(noSuggestions)));

        const [first] = suggestions;
        if (first) {
          const lines = suggestions.map(s => `  ${s.label}`).join('\n');
          yield* ui.log.step(`Did you mean?\n${lines}\n\n${first.command}`);
          return opts.fallbackValue;
        }
      }

      yield* ui.log.step(opts.hint);
      return opts.fallbackValue;
    });
