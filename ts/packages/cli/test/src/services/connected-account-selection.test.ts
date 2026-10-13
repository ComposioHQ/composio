import { describe, expect, it } from 'vitest';
import { it as effectIt } from '@effect/vitest';
import { Effect, Option } from 'effect';
import {
  ConnectedAccountResolutionError,
  formatConnectedAccountChoices,
  groupCachedConnectedAccountsByToolkit,
  listConnectedAccountsForToolkit,
  resolveConnectedAccountForToolkit,
  resolveConnectedAccountSelection,
  resolveDefaultConnectedAccountsByToolkit,
} from 'src/services/connected-account-selection';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { stubComposioClient } from 'test/__utils__/services/stub-composio-client';
import { TerminalUITest } from 'test/__utils__/services/terminal-ui-test';

const makeAccount = (overrides: Partial<ConnectedAccountItem>): ConnectedAccountItem => ({
  id: 'con_default',
  alias: null,
  word_id: null,
  status: 'ACTIVE',
  status_reason: null,
  is_disabled: false,
  user_id: 'default',
  toolkit: { slug: 'gmail' },
  auth_config: {
    id: 'ac_gmail',
    auth_scheme: 'OAUTH2',
    is_composio_managed: true,
    is_disabled: false,
  },
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  test_request_endpoint: '',
  ...overrides,
});

describe('connected-account-selection', () => {
  it('prefers alias=default when no selector is provided', () => {
    const selected = resolveConnectedAccountSelection([
      makeAccount({
        id: 'con_newer',
        updated_at: '2026-01-03T00:00:00.000Z',
      }),
      makeAccount({
        id: 'con_default_alias',
        alias: 'default',
        updated_at: '2026-01-02T00:00:00.000Z',
      }),
    ]);

    expect(selected?.id).toBe('con_default_alias');
  });

  it('matches explicit selectors by alias, word_id, and id', () => {
    const items = [
      makeAccount({ id: 'con_alpha', alias: 'work', word_id: 'castle' }),
      makeAccount({ id: 'con_beta', alias: 'default', word_id: 'forest' }),
    ];

    expect(resolveConnectedAccountSelection(items, 'work')?.id).toBe('con_alpha');
    expect(resolveConnectedAccountSelection(items, 'castle')?.id).toBe('con_alpha');
    expect(resolveConnectedAccountSelection(items, 'con_beta')?.id).toBe('con_beta');
  });

  it('builds default account mappings and grouped cache payloads', () => {
    const items = [
      makeAccount({ id: 'con_default_gmail', alias: 'default' }),
      makeAccount({
        id: 'con_alt_gmail',
        alias: 'secondary',
        word_id: 'castle',
        updated_at: '2026-01-02T00:00:00.000Z',
      }),
      makeAccount({
        id: 'con_default_slack',
        alias: 'default',
        toolkit: { slug: 'slack' },
      }),
    ];

    expect(resolveDefaultConnectedAccountsByToolkit(items)).toEqual({
      gmail: 'con_default_gmail',
      slack: 'con_default_slack',
    });

    expect(groupCachedConnectedAccountsByToolkit(items)).toMatchObject({
      gmail: [
        expect.objectContaining({ id: 'con_alt_gmail', alias: 'secondary', wordId: 'castle' }),
        expect.objectContaining({ id: 'con_default_gmail', alias: 'default', wordId: null }),
      ],
      slack: [expect.objectContaining({ id: 'con_default_slack', alias: 'default', wordId: null })],
    });
  });

  it('formats available account choices for CLI error messages', () => {
    expect(
      formatConnectedAccountChoices([
        makeAccount({ id: 'con_default', alias: 'default', word_id: 'castle' }),
      ])
    ).toEqual(['default / castle (con_default)']);
  });
});

type ListParams = {
  readonly toolkit_slugs?: ReadonlyArray<string>;
  readonly limit?: number;
};

// The client over a transport that serves one page of accounts, plus a log of
// every `GET /connected_accounts` query so a test can see which path ran.
const makeListClient = (
  items: ReadonlyArray<ConnectedAccountItem>,
  page?: { readonly total_items?: number; readonly next_cursor?: string | null }
) => {
  const calls: ListParams[] = [];
  const { client } = stubComposioClient(request => {
    const query = new URL(request.path, 'https://stub.invalid').searchParams;
    const slugs = query.get('toolkit_slugs')?.split(',');
    const limit = Number(query.get('limit') ?? 30);
    calls.push({ ...(slugs ? { toolkit_slugs: slugs } : {}), limit });
    const filtered = slugs
      ? items.filter(item =>
          slugs.some(slug => slug.trim().toLowerCase() === item.toolkit.slug.trim().toLowerCase())
        )
      : items;
    return Response.json({
      items: filtered.slice(0, limit),
      total_items: page?.total_items ?? filtered.length,
      total_pages: 1,
      current_page: 1,
      next_cursor: page?.next_cursor ?? null,
    });
  });
  return { client, calls };
};

describe('listConnectedAccountsForToolkit', () => {
  effectIt.effect('matches toolkit slugs the way the grouping helpers do, on both paths', () =>
    Effect.gen(function* () {
      const items = [
        makeAccount({ id: 'con_github', toolkit: { slug: 'GitHub ' } }),
        makeAccount({ id: 'con_gmail', toolkit: { slug: 'gmail' } }),
      ];

      const derived = makeListClient(items);
      const fromSharedList = yield* listConnectedAccountsForToolkit({
        client: derived.client,
        userId: 'default',
        toolkitSlug: ' github',
      });
      expect(fromSharedList.map(item => item.id)).toEqual(['con_github']);
      expect(derived.calls).toHaveLength(1);

      const fallback = makeListClient(items, { next_cursor: 'more' });
      const fromServer = yield* listConnectedAccountsForToolkit({
        client: fallback.client,
        userId: 'default',
        toolkitSlug: ' github',
      });
      expect(fromServer.map(item => item.id)).toEqual(['con_github']);
      expect(fallback.calls[1]?.toolkit_slugs).toEqual(['github']);
    })
  );

  effectIt.effect('derives from a short page even when total_items counts more', () =>
    Effect.gen(function* () {
      // A server that reports the all-status count must not push every call
      // onto the filtered request.
      const { client, calls } = makeListClient(
        [makeAccount({ id: 'con_gmail', toolkit: { slug: 'gmail' } })],
        { total_items: 7 }
      );

      const accounts = yield* listConnectedAccountsForToolkit({
        client,
        userId: 'default',
        toolkitSlug: 'gmail',
      });

      expect(accounts.map(item => item.id)).toEqual(['con_gmail']);
      expect(calls).toHaveLength(1);
    })
  );

  effectIt.effect('falls back to the filtered request when the shared page is full', () =>
    Effect.gen(function* () {
      const items = Array.from({ length: 1000 }, (_, index) =>
        makeAccount({ id: `con_slack_${index}`, toolkit: { slug: 'slack' } })
      );
      const { client, calls } = makeListClient([
        ...items,
        makeAccount({ id: 'con_gmail', toolkit: { slug: 'gmail' } }),
      ]);

      const accounts = yield* listConnectedAccountsForToolkit({
        client,
        userId: 'default',
        toolkitSlug: 'gmail',
      });

      expect(accounts.map(item => item.id)).toEqual(['con_gmail']);
      expect(calls).toHaveLength(2);
      expect(calls[1]?.toolkit_slugs).toEqual(['gmail']);
    })
  );
});

describe('resolveConnectedAccountForToolkit', () => {
  effectIt.effect('reports a rejected account listing in the wording it has always used', () =>
    Effect.gen(function* () {
      const body = {
        error: { message: 'Invalid user id', code: 301, slug: 'Invalid_UserId', status: 400 },
      };
      const { client } = stubComposioClient(() => Response.json(body, { status: 400 }));

      const failure = yield* resolveConnectedAccountForToolkit({
        client,
        toolkitSlug: 'gmail',
        userId: 'default',
        selector: Option.none(),
      }).pipe(Effect.flip, Effect.provide(TerminalUITest));

      expect(failure).toBeInstanceOf(ConnectedAccountResolutionError);
      expect(failure.message).toBe(
        `Failed to load connected accounts for toolkit "gmail": Error: 400 ${JSON.stringify(body)}`
      );
    })
  );
});
