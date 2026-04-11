import { Effect } from 'effect';
import type { Composio } from '@composio/client';
import {
  groupCachedConnectedAccountsByToolkit,
  resolveDefaultConnectedAccountsByToolkit,
} from 'src/services/connected-account-selection';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';

type RawConnectedAccount = {
  readonly id: string;
  readonly alias?: string | null;
  readonly word_id?: string | null;
  readonly is_disabled?: boolean | null;
  readonly status?: string | null;
  readonly user_id?: string | null;
  readonly toolkit?: {
    readonly slug?: string | null;
  } | null;
  readonly auth_config?: {
    readonly id?: string | null;
    readonly is_composio_managed?: boolean | null;
  } | null;
  readonly updated_at?: string | null;
  readonly created_at?: string | null;
};

export type ToolRouterSessionConnectionContext = {
  readonly connectedToolkits: ReadonlyArray<string>;
  readonly authConfigs?: Record<string, string>;
  readonly connectedAccounts?: Record<string, string>;
  readonly availableConnectedAccounts?: Record<
    string,
    ReadonlyArray<{
      readonly id: string;
      readonly alias: string | null;
      readonly wordId: string | null;
      readonly updatedAt: string;
      readonly createdAt: string;
    }>
  >;
};

const parseTimestamp = (value?: string | null): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeConnectedAccountStatus = (
  status?: string | null
): ConnectedAccountItem['status'] => {
  switch (status) {
    case 'INITIALIZING':
    case 'INITIATED':
    case 'ACTIVE':
    case 'FAILED':
    case 'EXPIRED':
    case 'INACTIVE':
      return status;
    default:
      return 'INACTIVE';
  }
};

const isNewerAccount = (candidate: RawConnectedAccount, current: RawConnectedAccount): boolean => {
  const candidateTimestamp = Math.max(
    parseTimestamp(candidate.updated_at),
    parseTimestamp(candidate.created_at)
  );
  const currentTimestamp = Math.max(
    parseTimestamp(current.updated_at),
    parseTimestamp(current.created_at)
  );
  return candidateTimestamp > currentTimestamp;
};

export const resolveToolRouterSessionConnections = (
  client: Composio,
  userId: string,
  options?: {
    readonly toolkits?: ReadonlyArray<string>;
  }
) =>
  Effect.tryPromise(() =>
    client.connectedAccounts.list({
      user_ids: [userId],
      statuses: ['ACTIVE'],
      toolkit_slugs:
        options?.toolkits && options.toolkits.length > 0 ? [...options.toolkits] : undefined,
      limit: 1000,
    })
  ).pipe(
    Effect.map(response => {
      const items = (response.items ?? []) as ReadonlyArray<RawConnectedAccount>;
      const normalizedItems: ConnectedAccountItem[] = items.map(
        item =>
          ({
            id: item.id,
            alias: item.alias ?? null,
            word_id: item.word_id ?? null,
            status: normalizeConnectedAccountStatus(item.status),
            status_reason: null,
            is_disabled: item.is_disabled ?? false,
            user_id: item.user_id ?? '',
            toolkit: {
              slug: item.toolkit?.slug ?? '',
            },
            auth_config: {
              id: item.auth_config?.id ?? '',
              auth_scheme: '',
              is_composio_managed: item.auth_config?.is_composio_managed ?? true,
              is_disabled: false,
            },
            created_at: item.created_at ?? '',
            updated_at: item.updated_at ?? '',
            test_request_endpoint: '',
          }) satisfies ConnectedAccountItem
      );
      const connectedToolkits = new Set<string>();
      const explicitAccountsByToolkit = new Map<string, RawConnectedAccount>();

      for (const item of items) {
        const toolkit = item.toolkit?.slug?.toLowerCase().trim();
        if (!toolkit || item.is_disabled) continue;

        connectedToolkits.add(toolkit);

        // Tool Router already handles Composio-managed auth well.
        // Explicitly pin non-managed auth configs/accounts so consumer sessions
        // can execute against custom-auth toolkits like PostHog.
        if (item.auth_config?.is_composio_managed !== false) {
          continue;
        }

        const current = explicitAccountsByToolkit.get(toolkit);
        if (!current || isNewerAccount(item, current)) {
          explicitAccountsByToolkit.set(toolkit, item);
        }
      }

      const authConfigs: Record<string, string> = {};
      for (const [toolkit, item] of explicitAccountsByToolkit) {
        const authConfigId = item.auth_config?.id?.trim();
        if (!authConfigId) continue;
        authConfigs[toolkit] = authConfigId;
      }

      return {
        connectedToolkits: [...connectedToolkits],
        authConfigs: Object.keys(authConfigs).length > 0 ? authConfigs : undefined,
        connectedAccounts: (() => {
          const selected = resolveDefaultConnectedAccountsByToolkit(normalizedItems);
          return Object.keys(selected).length > 0 ? selected : undefined;
        })(),
        availableConnectedAccounts: (() => {
          const grouped = groupCachedConnectedAccountsByToolkit(normalizedItems);
          return Object.keys(grouped).length > 0 ? grouped : undefined;
        })(),
      } satisfies ToolRouterSessionConnectionContext;
    }),
    Effect.catchAll(() =>
      Effect.succeed({
        connectedToolkits: [],
        authConfigs: undefined,
        connectedAccounts: undefined,
        availableConnectedAccounts: undefined,
      } satisfies ToolRouterSessionConnectionContext)
    )
  );
