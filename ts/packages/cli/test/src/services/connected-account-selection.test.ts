import { describe, expect, it } from 'vitest';
import { it as effectIt } from '@effect/vitest';
import { Effect, Option } from 'effect';
import type { Composio } from '@composio/client';
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
import { TerminalUI } from 'src/services/terminal-ui';
import { terminalUITestImpl } from '../../__utils__/services/terminal-ui-test';

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

// A stand-in for the SDK client: one page of accounts, plus a log of every
// `connectedAccounts.list` call so a test can see which path ran.
const makeListClient = (
  items: ReadonlyArray<ConnectedAccountItem>,
  page?: { readonly total_items?: number; readonly next_cursor?: string | null }
) => {
  const calls: ListParams[] = [];
  const client = {
    connectedAccounts: {
      list: async (params: ListParams) => {
        calls.push(params);
        const filtered = params.toolkit_slugs
          ? items.filter(item =>
              params.toolkit_slugs!.some(
                slug => slug.trim().toLowerCase() === item.toolkit.slug.trim().toLowerCase()
              )
            )
          : items;
        return {
          items: filtered.slice(0, params.limit ?? 30),
          total_items: page?.total_items ?? filtered.length,
          total_pages: 1,
          current_page: 1,
          next_cursor: page?.next_cursor ?? null,
        };
      },
    },
  } as unknown as Composio;
  return { client, calls };
};

describe('resolveConnectedAccountForToolkit', () => {
  effectIt.effect(
    'fails instead of silently picking one, when several accounts are connected and none is alias=default',
    () =>
      Effect.gen(function* () {
        const items = [
          makeAccount({ id: 'con_work', alias: 'work', toolkit: { slug: 'gmail' } }),
          makeAccount({
            id: 'con_personal',
            alias: 'personal',
            toolkit: { slug: 'gmail' },
            updated_at: '2026-01-02T00:00:00.000Z',
          }),
        ];
        const { client } = makeListClient(items);

        const error = yield* resolveConnectedAccountForToolkit({
          client,
          toolkitSlug: 'gmail',
          userId: 'default',
          selector: Option.none(),
        }).pipe(Effect.flip);

        expect(error).toBeInstanceOf(ConnectedAccountResolutionError);
        expect(error.message).toContain('Multiple connected accounts exist');
        expect(error.message).toContain('work');
        expect(error.message).toContain('personal');
        expect(error.message).toContain('Pass --account <alias or id> to choose one.');
      }).pipe(Effect.provideService(TerminalUI, terminalUITestImpl))
  );

  effectIt.effect(
    'still picks the alias=default account automatically when one exists, even with several accounts connected',
    () =>
      Effect.gen(function* () {
        const items = [
          makeAccount({ id: 'con_work', alias: 'work', toolkit: { slug: 'gmail' } }),
          makeAccount({ id: 'con_main', alias: 'default', toolkit: { slug: 'gmail' } }),
        ];
        const { client } = makeListClient(items);

        const selected = yield* resolveConnectedAccountForToolkit({
          client,
          toolkitSlug: 'gmail',
          userId: 'default',
          selector: Option.none(),
        });

        expect(selected).toBe('con_main');
      }).pipe(Effect.provideService(TerminalUI, terminalUITestImpl))
  );

  effectIt.effect('still picks the only account automatically when exactly one is connected', () =>
    Effect.gen(function* () {
      const items = [makeAccount({ id: 'con_only', toolkit: { slug: 'gmail' } })];
      const { client } = makeListClient(items);

      const selected = yield* resolveConnectedAccountForToolkit({
        client,
        toolkitSlug: 'gmail',
        userId: 'default',
        selector: Option.none(),
      });

      expect(selected).toBe('con_only');
    }).pipe(Effect.provideService(TerminalUI, terminalUITestImpl))
  );

  effectIt.effect(
    'an explicit --account selector still matches as before, even with several accounts',
    () =>
      Effect.gen(function* () {
        const items = [
          makeAccount({ id: 'con_work', alias: 'work', toolkit: { slug: 'gmail' } }),
          makeAccount({ id: 'con_personal', alias: 'personal', toolkit: { slug: 'gmail' } }),
        ];
        const { client } = makeListClient(items);

        const selected = yield* resolveConnectedAccountForToolkit({
          client,
          toolkitSlug: 'gmail',
          userId: 'default',
          selector: Option.some('personal'),
        });

        expect(selected).toBe('con_personal');
      }).pipe(Effect.provideService(TerminalUI, terminalUITestImpl))
  );

  effectIt.effect(
    'an empty or whitespace-only --account value is treated as no selector, not a bypass',
    () =>
      Effect.gen(function* () {
        const items = [
          makeAccount({ id: 'con_work', alias: 'work', toolkit: { slug: 'gmail' } }),
          makeAccount({
            id: 'con_personal',
            alias: 'personal',
            toolkit: { slug: 'gmail' },
            updated_at: '2026-01-02T00:00:00.000Z',
          }),
        ];
        const { client } = makeListClient(items);

        const error = yield* resolveConnectedAccountForToolkit({
          client,
          toolkitSlug: 'gmail',
          userId: 'default',
          selector: Option.some('   '),
        }).pipe(Effect.flip);

        expect(error).toBeInstanceOf(ConnectedAccountResolutionError);
        expect(error.message).toContain('Multiple connected accounts exist');
      }).pipe(Effect.provideService(TerminalUI, terminalUITestImpl))
  );
});

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
