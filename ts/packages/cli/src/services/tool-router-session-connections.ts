import { Effect } from 'effect';
import type { Composio } from '@composio/client';

type RawConnectedAccount = {
  readonly id: string;
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
};

const parseTimestamp = (value?: string | null): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
      const connectedToolkits = new Set<string>();
      const explicitAccountsByToolkit = new Map<string, RawConnectedAccount>();

      for (const item of items) {
        const toolkit = item.toolkit?.slug?.toLowerCase().trim();
        if (!toolkit) continue;

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
      } satisfies ToolRouterSessionConnectionContext;
    }),
    Effect.catchAll(() =>
      Effect.succeed({
        connectedToolkits: [],
        authConfigs: undefined,
      } satisfies ToolRouterSessionConnectionContext)
    )
  );
