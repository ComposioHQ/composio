import { describe, expect, it } from 'vitest';
import {
  formatConnectedAccountChoices,
  groupCachedConnectedAccountsByToolkit,
  resolveConnectedAccountSelection,
  resolveDefaultConnectedAccountsByToolkit,
} from 'src/services/connected-account-selection';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';

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
