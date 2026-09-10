import { Effect, Match, Schema, type SchemaIssue } from 'effect';
import {
  ConnectedAccountItems,
  isKnownConnectedAccountStatus,
} from 'src/models/connected-accounts';
import {
  ConnectedAccountListResponse,
  type ConnectedAccountListResponse as ConnectedAccountListResponseType,
} from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';

/**
 * Flattens a schema issue tree into `path: kind` pairs only — never the
 * failing values. The built-in formatters may echo reported input, and a
 * container-level failure would otherwise print the raw payload, which can
 * include credential-bearing fields (`state`, `data`, ...) the
 * connected-account schemas deliberately exclude.
 */
const collectIssueKinds = (
  issue: SchemaIssue.Issue,
  path: ReadonlyArray<PropertyKey>
): ReadonlyArray<string> =>
  Match.value(issue).pipe(
    Match.tag('Pointer', pointer => collectIssueKinds(pointer.issue, [...path, ...pointer.path])),
    Match.tag('Composite', 'AnyOf', composite =>
      composite.issues.flatMap(inner => collectIssueKinds(inner, path))
    ),
    Match.tag('Filter', 'Encoding', wrapper => collectIssueKinds(wrapper.issue, path)),
    Match.orElse(leaf => [`${path.map(String).join('.') || '(root)'}: ${leaf._tag}`])
  );

const formatParseErrorRedacted = (error: Schema.SchemaError): string =>
  collectIssueKinds(error.issue, []).join(', ');

/**
 * Warns when the server returned `status` values newer than this CLI build's
 * known set. Status values are non-credential by design, so printing them
 * verbatim is safe — and exactly what the user needs to act on.
 */
const warnOnUnknownStatuses = (
  items: ReadonlyArray<{ readonly status: string }>
): Effect.Effect<void, never, TerminalUI> =>
  Effect.gen(function* () {
    const unknown = [
      ...new Set(items.map(item => item.status).filter(s => !isKnownConnectedAccountStatus(s))),
    ];
    if (unknown.length === 0) return;
    const ui = yield* TerminalUI;
    yield* ui.log.warn(
      `Server returned connected account status(es) this CLI does not ` +
        `recognize: ${unknown.join(', ')}. Run "composio upgrade" to pick up ` +
        `the latest CLI.`
    );
  });

/**
 * Decodes a raw `client.connectedAccounts.list(...)` response against
 * `ConnectedAccountListResponse`, falling back to the raw payload on
 * `SchemaError`.
 *
 * `status` is an open enum (`ConnectedAccountStatus`), so a status newer than
 * this CLI build decodes fine and only triggers the "composio upgrade"
 * warning. The raw fallback remains for other shape skew (pagination fields,
 * renames, ...) — safe because the three current call sites only render
 * non-credential fields (`id`, `alias`, `word_id`, `toolkit.slug`,
 * `status`, ...).
 */
export const decodeConnectedAccountListWithFallback = (
  rawResult: unknown
): Effect.Effect<ConnectedAccountListResponseType, never, TerminalUI> =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    return yield* Schema.decodeUnknownEffect(ConnectedAccountListResponse)(rawResult).pipe(
      Effect.tap(result => warnOnUnknownStatuses(result.items)),
      Effect.catchTag('SchemaError', error =>
        Effect.gen(function* () {
          yield* ui.log.warn(
            `Server response did not match the shape this CLI expects. Run ` +
              `"composio upgrade" to pick up the latest CLI. Continuing with ` +
              `raw response.\n\n` +
              `Mismatched fields: ${formatParseErrorRedacted(error)}`
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
 * response.
 *
 * `status` is an open enum, so a status newer than this CLI build decodes
 * instead of failing — we just warn, pointing at `composio upgrade`. Unlike
 * the list-response helper above, this one must NOT fall back to the raw
 * payload: `link --list` JSON-dumps the decoded items to stdout, so the
 * schema's field allowlist is what keeps credential-bearing fields (`state`,
 * `data`, ...) out of pipeable output. Truly malformed data fails with
 * `SchemaError`.
 */
export const decodeConnectedAccountItems = (
  rawItems: unknown
): Effect.Effect<ConnectedAccountItems, Schema.SchemaError, TerminalUI> =>
  Schema.decodeUnknownEffect(ConnectedAccountItems)(rawItems).pipe(
    Effect.tap(items => warnOnUnknownStatuses(items))
  );
