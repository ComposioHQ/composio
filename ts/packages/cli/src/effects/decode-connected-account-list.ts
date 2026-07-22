import { Effect, Schema } from 'effect';
import {
  ConnectedAccountItems,
  ConnectedAccountItemsPermissive,
} from 'src/models/connected-accounts';
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
    return yield* Schema.decodeUnknownEffect(ConnectedAccountListResponse)(rawResult).pipe(
      Effect.catchTag('SchemaError', error =>
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

/**
 * Item-level variant of {@link decodeConnectedAccountListWithFallback} for
 * call sites that decode `response.items` rather than the whole list
 * response. Same forward-compat contract: on `ParseError` (e.g. a status
 * value newer than this CLI's closed `Schema.Literal(...)`) warn via
 * `ui.log.warn` and retry with `status` widened to `Schema.String`.
 *
 * Unlike the list-response helper above, this one must NOT fall back to the
 * raw payload: `link --list` JSON-dumps the decoded items to stdout, so the
 * schema's field allowlist is what keeps credential-bearing fields (`state`,
 * `data`, ...) out of pipeable output. The permissive re-decode preserves
 * that allowlist; truly malformed data still fails with `ParseError`.
 */
export const decodeConnectedAccountItemsWithFallback = (
  rawItems: unknown
): Effect.Effect<ConnectedAccountItems, Schema.SchemaError, TerminalUI> =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    return yield* Schema.decodeUnknownEffect(ConnectedAccountItems)(rawItems).pipe(
      Effect.catchTag('SchemaError', error =>
        Effect.gen(function* () {
          yield* ui.log.warn(
            `Server returned a connection field this CLI does not recognize ` +
              `(likely a newly-added status). Run "composio upgrade" to pick up ` +
              `the latest schema. Continuing with a permissive schema.\n\n` +
              `Decode error: ${error.message}`
          );
          const permissive = yield* Schema.decodeUnknownEffect(ConnectedAccountItemsPermissive)(
            rawItems
          );
          // Identical shape modulo the widened `status`; callers render it as text.
          return permissive as ConnectedAccountItems;
        })
      )
    );
  });
