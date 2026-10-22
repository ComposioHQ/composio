import type { ConnectedAccountListResponse as ApiConnectedAccountListResponse } from '@composio/client/resources/connected-accounts';
import { Data, Effect, Match, Schema, type SchemaIssue } from 'effect';
import {
  ConnectedAccountItems,
  ConnectedAccountListResponse,
  isKnownConnectedAccountStatus,
} from 'src/models/connected-accounts';
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

/** A command's failure when a connected-accounts response does not decode. */
export const CONNECTED_ACCOUNTS_SHAPE_MESSAGE =
  'Connected accounts response was not the shape this CLI understands; run `composio upgrade`.';

/**
 * A list response that does not match `ConnectedAccountListResponse`. The
 * message names only the mismatched paths and issue kinds, never the values,
 * so it is safe to print as the cause of a command's failure.
 */
export class ConnectedAccountListShapeError extends Data.TaggedError(
  'effects/ConnectedAccountListShapeError'
)<{
  readonly message: string;
}> {}

/**
 * Decodes a `client.connectedAccounts.list(...)` response into the CLI's
 * `ConnectedAccountListResponse`: the field allowlist that keeps
 * credential-bearing fields (`state`, `data`, ...) out, plus `display_name`
 * derived from `state`.
 *
 * `status` is an open enum (`ConnectedAccountStatus`), so a status newer than
 * this CLI build decodes and only triggers the "composio upgrade" warning.
 * Any other mismatch fails with {@link ConnectedAccountListShapeError}.
 */
export const decodeConnectedAccountList = (
  response: ApiConnectedAccountListResponse
): Effect.Effect<ConnectedAccountListResponse, ConnectedAccountListShapeError, TerminalUI> =>
  Schema.decodeEffect(ConnectedAccountListResponse)(response).pipe(
    Effect.mapError(
      error =>
        new ConnectedAccountListShapeError({
          message: `Mismatched fields: ${formatParseErrorRedacted(error)}`,
        })
    ),
    Effect.tap(result => warnOnUnknownStatuses(result.items))
  );

/**
 * Item-level variant of {@link decodeConnectedAccountList} for call sites
 * that decode `response.items` rather than the whole list response. It fails
 * with the raw `SchemaError`, which callers wrap in their own error.
 */
export const decodeConnectedAccountItems = (
  items: ApiConnectedAccountListResponse['items']
): Effect.Effect<ConnectedAccountItems, Schema.SchemaError, TerminalUI> =>
  Schema.decodeEffect(ConnectedAccountItems)(items).pipe(
    Effect.tap(decoded => warnOnUnknownStatuses(decoded))
  );
