import { Effect, Schema } from 'effect';
import {
  ConnectedAccountListResponse,
  type ConnectedAccountListResponse as ConnectedAccountListResponseType,
} from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';

/**
 * Decodes a raw `client.connectedAccounts.list(...)` response against
 * `ConnectedAccountListResponse`, falling back to the raw payload on
 * `ParseError`.
 *
 * Forward-compat: a future Apollo status would otherwise brick the caller
 * via the closed `Schema.Literal(...)`. On decode failure we warn via
 * `ui.log.warn` (pointing the user at `composio upgrade`) and return the
 * unvalidated raw response — safe because the three current call sites
 * only render non-credential fields (`id`, `alias`, `word_id`,
 * `toolkit.slug`, `status`, ...).
 */
export const decodeConnectedAccountListWithFallback = (
  rawResult: unknown
): Effect.Effect<ConnectedAccountListResponseType, never, TerminalUI> =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    return yield* Schema.decodeUnknown(ConnectedAccountListResponse)(rawResult).pipe(
      Effect.catchTag('ParseError', error =>
        Effect.gen(function* () {
          yield* ui.log.warn(
            `Server returned a connection field this CLI does not recognize ` +
              `(likely a newly-added status). Run "composio upgrade" to pick up ` +
              `the latest schema. Continuing with raw response.\n\n` +
              `Decode error: ${error.message}`
          );
          // Safe: callers only read non-credential fields.
          return rawResult as ConnectedAccountListResponseType;
        })
      )
    );
  });
