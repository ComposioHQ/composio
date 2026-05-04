import { Args, Command } from '@effect/cli';
import { Effect, Schema } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import {
  ComposioClientSingleton,
  ConnectedAccountListResponse,
} from 'src/services/composio-clients';
import {
  formatResolveCommandProjectError,
  resolveCommandProject,
} from 'src/services/command-project';
import { TerminalUI } from 'src/services/terminal-ui';
import { bold } from 'src/ui/colors';
import { redact } from 'src/ui/redact';

const account = Args.text({ name: 'account' }).pipe(
  Args.withDescription('Connection selector: toolkit slug, alias, word_id, or connected account ID')
);

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
  if (idMatches.length === 1) {
    return idMatches[0]!;
  }

  if (matches.length === 1) {
    return matches[0]!;
  }

  return {
    error: [
      `Multiple connections matched "${params.selector}". Use a unique alias, word_id, or connected account ID.`,
      '',
      ...matches.map(item => `- ${formatAccountChoice(item)}`),
    ].join('\n'),
  };
};

export const connectionsCmd$Remove = Command.make('remove', { account }, ({ account }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const clientSingleton = yield* ComposioClientSingleton;
    const resolvedProject = yield* resolveCommandProject({
      mode: 'consumer',
    }).pipe(Effect.mapError(formatResolveCommandProjectError));

    const consumerUserId = resolvedProject.consumerUserId;
    if (!consumerUserId) {
      return yield* Effect.fail(
        new Error('Missing consumer user id. Run `composio login` and try again.')
      );
    }

    const client = yield* clientSingleton.getFor({
      orgId: resolvedProject.orgId,
      projectId: resolvedProject.projectId,
    });
    const rawResult = yield* ui.withSpinner(
      'Fetching connections...',
      Effect.tryPromise(() =>
        client.connectedAccounts.list({
          user_ids: [consumerUserId],
          limit: 1000,
        })
      )
    );
    const result = yield* Schema.decodeUnknown(ConnectedAccountListResponse)(rawResult);
    const resolved = resolveAccount({ accounts: result.items, selector: account });

    if ('error' in resolved) {
      yield* ui.log.warn(resolved.error);
      return;
    }

    yield* ui.note(
      `${formatAccountSummary(resolved)}\n\nThis will remove the connection from Composio and tools will no longer be able to use it.`,
      'Remove Connection'
    );

    const confirmed = yield* ui.confirm(`Remove ${resolved.toolkit.slug} connection?`, {
      defaultValue: false,
    });
    if (!confirmed) {
      yield* ui.log.warn('No connection removed.');
      return;
    }

    yield* ui.withSpinner(
      `Removing ${resolved.toolkit.slug} connection...`,
      Effect.tryPromise(() => client.connectedAccounts.delete(resolved.id)),
      {
        successMessage: `Removed ${resolved.toolkit.slug} connection.`,
        errorMessage: `Failed to remove ${resolved.toolkit.slug} connection.`,
      }
    );
  })
).pipe(
  Command.withDescription(
    'Interactively remove a connection by toolkit slug, alias, word_id, or connected account ID.'
  )
);
