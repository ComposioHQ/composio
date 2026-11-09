import { Context, Effect, Layer, Option } from 'effect';
import { formatBackendMismatch } from 'src/config/backend';
import type { InvocationHookShape } from './invocation-hook';
import { TerminalUI } from './terminal-ui';
import { ComposioUserContext } from './user-context';

export type BackendMismatchWarningShape = InvocationHookShape;

/**
 * Warns, before any request, when an env var sends the stored key to another backend: as a
 * decorated warning on a terminal, as a plain `Warning:` line on a redirected stderr.
 */
export class BackendMismatchWarning extends Context.Service<
  BackendMismatchWarning,
  BackendMismatchWarningShape
>()('services/BackendMismatchWarning') {
  static readonly Default: Layer.Layer<
    BackendMismatchWarning,
    never,
    ComposioUserContext | TerminalUI
  > = Layer.effect(
    BackendMismatchWarning,
    Effect.gen(function* () {
      const ctx = yield* ComposioUserContext;
      const ui = yield* TerminalUI;

      const warn = (message: string) =>
        Effect.gen(function* () {
          if ((yield* ui.capabilities).canDecorate) {
            yield* ui.log.warn(message);
          } else {
            yield* ui.error(`Warning: ${message}`);
          }
        });

      return BackendMismatchWarning.of({
        // `backendMismatch` is read per run: it reflects the environment and stored login now.
        run: () =>
          Effect.suspend(() =>
            Option.match(ctx.backendMismatch, {
              onNone: () => Effect.void,
              onSome: mismatch => warn(formatBackendMismatch(mismatch)),
            })
          ),
      });
    })
  );
}
