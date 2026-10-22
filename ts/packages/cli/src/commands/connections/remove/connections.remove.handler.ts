import { Effect } from 'effect';
import { commandInputError } from 'src/commands/errors';
import {
  CONNECTED_ACCOUNTS_SHAPE_MESSAGE,
  decodeConnectedAccountList,
} from 'src/effects/decode-connected-account-list';
import { failedWith } from 'src/effects/request-error';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { resolveCommandProject } from 'src/services/command-project';
import { TerminalUI } from 'src/services/terminal-ui';
import { bold } from 'src/ui/colors';
import { redact } from 'src/ui/redact';
import { idempotent } from 'src/services/composio-request';
import {
  ConnectionsRemovalRequestError,
  MissingConnectionRemovalConsumerUserIdError,
} from './connections.remove.errors';

/** The flags of `composio connections remove`. */
export type ConnectionsRemoveParams = {
  readonly account: string;
  readonly yes: boolean;
};

const invalidInput = commandInputError('connections remove');

/** Without a terminal to confirm on, removing needs `--yes`. */
const NEEDS_YES_MESSAGE =
  '`composio connections remove` needs --yes when not running interactively.';

const normalizeSelector = (value: string): string => value.trim().toLowerCase();

const selectorMatches = (item: ConnectedAccountItem, selector: string): boolean => {
  const normalized = normalizeSelector(selector);
  return (
    normalizeSelector(item.id) === normalized ||
    normalizeSelector(item.alias ?? '') === normalized ||
    normalizeSelector(item.word_id ?? '') === normalized ||
    normalizeSelector(item.toolkit.slug) === normalized
  );
};

const formatAccountSummary = (item: ConnectedAccountItem): string =>
  [
    `${bold('Toolkit:')} ${item.toolkit.slug}`,
    `${bold('Alias:')} ${item.alias || '-'}`,
    `${bold('Word Id:')} ${item.word_id || '-'}`,
    `${bold('Connected Account:')} ${redact({ value: item.id, prefix: 'con_' })}`,
    `${bold('Status:')} ${item.status}`,
  ].join('\n');

const formatAccountChoice = (item: ConnectedAccountItem): string => {
  const labels = [item.alias, item.word_id].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );
  const selectors = labels.length > 0 ? ` (${labels.join(' / ')})` : '';
  return `${item.toolkit.slug}${selectors}: ${redact({ value: item.id, prefix: 'con_' })}`;
};

const resolveAccount = (params: {
  readonly accounts: ReadonlyArray<ConnectedAccountItem>;
  readonly selector: string;
}): ConnectedAccountItem | { readonly error: string } => {
  const matches = params.accounts.filter(item => selectorMatches(item, params.selector));

  if (matches.length === 0) {
    return {
      error: `No connection matched "${params.selector}". Run \`composio connections list\` to inspect available connections.`,
    };
  }

  const idMatches = matches.filter(
    item => normalizeSelector(item.id) === normalizeSelector(params.selector)
  );
  const idMatch = idMatches[0];
  if (idMatch && idMatches.length === 1) {
    return idMatch;
  }

  const match = matches[0];
  if (match && matches.length === 1) {
    return match;
  }

  return {
    error: [
      `Multiple connections matched "${params.selector}". Use a unique alias, word_id, or connected account ID.`,
      '',
      ...matches.map(item => `- ${formatAccountChoice(item)}`),
    ].join('\n'),
  };
};

/**
 * Removes one connection after a confirmation. Without a terminal to confirm on, it needs `--yes`
 * and otherwise fails with a `CommandInputError` before any request; declining the prompt removes
 * nothing and exits 0.
 */
export const runConnectionsRemove = ({ account, yes }: ConnectionsRemoveParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const { canPrompt } = yield* ui.capabilities;
    if (!yes && !canPrompt) {
      return yield* invalidInput(NEEDS_YES_MESSAGE, '--yes');
    }
    const clientSingleton = yield* ComposioClientSingleton;
    const resolvedProject = yield* resolveCommandProject({
      mode: 'consumer',
    });

    const consumerUserId = resolvedProject.consumerUserId;
    if (!consumerUserId) {
      return yield* new MissingConnectionRemovalConsumerUserIdError({
        message: 'Missing consumer user id. Run `composio login` and try again.',
      });
    }

    const client = yield* clientSingleton.getFor({
      orgId: resolvedProject.orgId,
      projectId: resolvedProject.projectId,
    });
    const rawResult = yield* ui.withSpinner(
      'Fetching connections...',
      client.connectedAccounts
        .list({ user_ids: [consumerUserId], limit: 1000 }, idempotent)
        .pipe(failedWith(ConnectionsRemovalRequestError, 'Failed to list connections.'))
    );
    const result = yield* decodeConnectedAccountList(rawResult).pipe(
      failedWith(ConnectionsRemovalRequestError, CONNECTED_ACCOUNTS_SHAPE_MESSAGE)
    );
    const resolved = resolveAccount({ accounts: result.items, selector: account });

    if ('error' in resolved) {
      return yield* invalidInput(resolved.error, '<account>');
    }

    yield* ui.note(
      `${formatAccountSummary(resolved)}\n\nThis will remove the connection from Composio and tools will no longer be able to use it.`,
      'Remove Connection'
    );

    const confirmed =
      yes ||
      (yield* ui.confirm(`Remove ${resolved.toolkit.slug} connection?`, {
        defaultValue: false,
      }));
    if (!confirmed) {
      yield* ui.log.warn('No connection removed.');
      return;
    }

    yield* ui.withSpinner(
      `Removing ${resolved.toolkit.slug} connection...`,
      client.connectedAccounts
        .delete(resolved.id)
        .pipe(
          failedWith(
            ConnectionsRemovalRequestError,
            `Failed to remove connected account "${resolved.id}".`
          )
        ),
      {
        successMessage: `Removed ${resolved.toolkit.slug} connection.`,
        errorMessage: `Failed to remove ${resolved.toolkit.slug} connection.`,
      }
    );
  });
