import assert from 'node:assert/strict';
import { describe, expect, it } from '@effect/vitest';
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

// One `GET /connected_accounts` page as the server sends it.
const page = (
  items: ReadonlyArray<ConnectedAccountItem>,
  counts: { readonly total_items: number; readonly next_cursor: string | null } = {
    total_items: items.length,
    next_cursor: null,
  }
) =>
  Response.json({
    items,
    total_items: counts.total_items,
    total_pages: 1,
    current_page: 1,
    next_cursor: counts.next_cursor,
  });

// A transport that answers each request with the next page, in order.
const pagesInOrder = (...pages: ReadonlyArray<Response>) => {
  const queue = [...pages];
  return () => {
    const next = queue.shift();
    assert.ok(next, 'more requests than pages');
    return next;
  };
};

const toolkitSlugsQuery = (path: string) =>
  new URL(path, 'https://stub.invalid').searchParams.get('toolkit_slugs');

describe('listConnectedAccountsForToolkit', () => {
  it.effect('matches toolkit slugs the way the grouping helpers do, from the shared list', () =>
    Effect.gen(function* () {
      const { client, requests } = stubComposioClient(
        pagesInOrder(
          page([
            makeAccount({ id: 'con_github', toolkit: { slug: 'GitHub ' } }),
            makeAccount({ id: 'con_gmail', toolkit: { slug: 'gmail' } }),
          ])
        )
      );

      const accounts = yield* listConnectedAccountsForToolkit({
        client,
        userId: 'default',
        toolkitSlug: ' github',
      });

      expect(accounts.map(item => item.id)).toEqual(['con_github']);
      expect(requests).toHaveLength(1);
      expect(toolkitSlugsQuery(requests[0]!.path)).toBeNull();
    })
  );

  it.effect('derives from a short page even when total_items counts more', () =>
    Effect.gen(function* () {
      // A server that reports the all-status count must not push every call
      // onto the filtered request.
      const { client, requests } = stubComposioClient(
        pagesInOrder(
          page([makeAccount({ id: 'con_gmail', toolkit: { slug: 'gmail' } })], {
            total_items: 7,
            next_cursor: null,
          })
        )
      );

      const accounts = yield* listConnectedAccountsForToolkit({
        client,
        userId: 'default',
        toolkitSlug: 'gmail',
      });

      expect(accounts.map(item => item.id)).toEqual(['con_gmail']);
      expect(requests).toHaveLength(1);
    })
  );

  it.effect('derives from every page of the shared list, following next_cursor', () =>
    Effect.gen(function* () {
      // The server serves at most 50 accounts per page, so the toolkit's
      // account can sit past the first page.
      const firstPage = Array.from({ length: 50 }, (_, index) =>
        makeAccount({ id: `con_slack_${index}`, toolkit: { slug: 'slack' } })
      );
      const { client, requests } = stubComposioClient(
        pagesInOrder(
          page(firstPage, { total_items: 51, next_cursor: 'page-2' }),
          page([makeAccount({ id: 'con_gmail', toolkit: { slug: 'gmail' } })])
        )
      );

      const accounts = yield* listConnectedAccountsForToolkit({
        client,
        userId: 'default',
        toolkitSlug: 'gmail',
      });

      expect(accounts.map(item => item.id)).toEqual(['con_gmail']);
      expect(requests).toHaveLength(2);
      const query = (path: string) => new URL(path, 'https://stub.invalid').searchParams;
      expect(query(requests[0]!.path).get('limit')).toBe('50');
      expect(query(requests[1]!.path).get('cursor')).toBe('page-2');
      expect(requests.map(request => toolkitSlugsQuery(request.path))).toEqual([null, null]);
    })
  );
});

describe('resolveConnectedAccountForToolkit', () => {
  it.effect('reports a rejected account listing in the wording it has always used', () =>
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

  // #4745: with several usable accounts and none aliased `default`, picking the
  // newest silently could act on the wrong mailbox; the caller must choose.
  it.effect(
    'fails instead of silently picking one, when several accounts are connected and none is alias=default',
    () =>
      Effect.gen(function* () {
        const { client } = stubComposioClient(() =>
          page([
            makeAccount({ id: 'con_work', alias: 'work', toolkit: { slug: 'gmail' } }),
            makeAccount({
              id: 'con_personal',
              alias: 'personal',
              toolkit: { slug: 'gmail' },
              updated_at: '2026-01-02T00:00:00.000Z',
            }),
          ])
        );

        const error = yield* resolveConnectedAccountForToolkit({
          client,
          toolkitSlug: 'gmail',
          userId: 'default',
          selector: Option.none(),
        }).pipe(Effect.flip, Effect.provide(TerminalUITest));

        expect(error).toBeInstanceOf(ConnectedAccountResolutionError);
        expect(error.message).toContain('Multiple connected accounts exist');
        expect(error.message).toContain('work');
        expect(error.message).toContain('personal');
        expect(error.message).toContain('Pass --account <alias or id> to choose one.');
      })
  );

  it.effect(
    'still picks the alias=default account automatically when one exists, even with several accounts connected',
    () =>
      Effect.gen(function* () {
        const { client } = stubComposioClient(() =>
          page([
            makeAccount({ id: 'con_work', alias: 'work', toolkit: { slug: 'gmail' } }),
            makeAccount({ id: 'con_main', alias: 'default', toolkit: { slug: 'gmail' } }),
          ])
        );

        const selected = yield* resolveConnectedAccountForToolkit({
          client,
          toolkitSlug: 'gmail',
          userId: 'default',
          selector: Option.none(),
        }).pipe(Effect.provide(TerminalUITest));

        expect(selected).toBe('con_main');
      })
  );

  it.effect('still picks the only account automatically when exactly one is connected', () =>
    Effect.gen(function* () {
      const { client } = stubComposioClient(() =>
        page([makeAccount({ id: 'con_only', toolkit: { slug: 'gmail' } })])
      );

      const selected = yield* resolveConnectedAccountForToolkit({
        client,
        toolkitSlug: 'gmail',
        userId: 'default',
        selector: Option.none(),
      }).pipe(Effect.provide(TerminalUITest));

      expect(selected).toBe('con_only');
    })
  );

  it.effect(
    'an explicit --account selector still matches as before, even with several accounts',
    () =>
      Effect.gen(function* () {
        const { client } = stubComposioClient(() =>
          page([
            makeAccount({ id: 'con_work', alias: 'work', toolkit: { slug: 'gmail' } }),
            makeAccount({ id: 'con_personal', alias: 'personal', toolkit: { slug: 'gmail' } }),
          ])
        );

        const selected = yield* resolveConnectedAccountForToolkit({
          client,
          toolkitSlug: 'gmail',
          userId: 'default',
          selector: Option.some('personal'),
        }).pipe(Effect.provide(TerminalUITest));

        expect(selected).toBe('con_personal');
      })
  );

  it.effect(
    'an empty or whitespace-only --account value is treated as no selector, not a bypass',
    () =>
      Effect.gen(function* () {
        const { client } = stubComposioClient(() =>
          page([
            makeAccount({ id: 'con_work', alias: 'work', toolkit: { slug: 'gmail' } }),
            makeAccount({
              id: 'con_personal',
              alias: 'personal',
              toolkit: { slug: 'gmail' },
              updated_at: '2026-01-02T00:00:00.000Z',
            }),
          ])
        );

        const error = yield* resolveConnectedAccountForToolkit({
          client,
          toolkitSlug: 'gmail',
          userId: 'default',
          selector: Option.some('   '),
        }).pipe(Effect.flip, Effect.provide(TerminalUITest));

        expect(error).toBeInstanceOf(ConnectedAccountResolutionError);
        expect(error.message).toContain('Multiple connected accounts exist');
      })
  );
});
