import { describe, expect, layer } from '@effect/vitest';
import { Console, Effect, Layer, Schema } from 'effect';
import {
  decodeConnectedAccountItems,
  decodeConnectedAccountListWithFallback,
} from 'src/effects/decode-connected-account-list';
import { CONNECTED_ACCOUNT_DISPLAY_NAME_MAX_LENGTH } from 'src/models/connected-accounts';
import { MockConsole } from 'test/__utils__';
import { TerminalUITest } from 'test/__utils__/services/terminal-ui-test';

const TestLayer = Layer.mergeAll(Layer.effect(Console.Console, MockConsole.make), TerminalUITest);

const makeItem = (overrides?: Record<string, unknown>) => ({
  id: 'con_decode_test',
  alias: 'default',
  word_id: 'castle',
  status: 'ACTIVE',
  status_reason: null,
  is_disabled: false,
  user_id: 'user_test',
  toolkit: { slug: 'gmail' },
  auth_config: {
    id: 'ac_gmail_oauth',
    auth_scheme: 'OAUTH2',
    is_composio_managed: true,
    is_disabled: false,
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-15T00:00:00Z',
  test_request_endpoint: '',
  ...overrides,
});

describe('decodeConnectedAccountItems', () => {
  layer(TestLayer)('[Given] items with statuses this CLI build knows', it => {
    it.effect('decodes without warning', () =>
      Effect.gen(function* () {
        const items = yield* decodeConnectedAccountItems([makeItem()]);

        expect(items).toStrictEqual([makeItem()]);
        expect(yield* MockConsole.getLines()).toStrictEqual([]);
      })
    );
  });

  layer(TestLayer)('[Given] a status newer than this CLI build', it => {
    it.effect('decodes, warns with only the status value, and still strips credential fields', () =>
      Effect.gen(function* () {
        const raw = makeItem({
          status: 'QUANTUM_LINKED',
          state: { access_token: 'must-not-leak' },
          data: { refresh_token: 'must-not-leak' },
        });

        const items = yield* decodeConnectedAccountItems([raw]);

        expect(items).toStrictEqual([makeItem({ status: 'QUANTUM_LINKED' })]);
        expect(JSON.stringify(items)).not.toContain('must-not-leak');

        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain('QUANTUM_LINKED');
        expect(output).toContain('composio upgrade');
        expect(output).not.toContain('must-not-leak');
      })
    );
  });

  layer(TestLayer)('[Given] a state with a provider identity next to credentials', it => {
    it.effect('keeps only the trimmed display name from state', () =>
      Effect.gen(function* () {
        const raw = makeItem({
          state: {
            authScheme: 'OAUTH2',
            val: {
              displayName: '  ada@example.com  ',
              access_token: 'must-not-leak',
              refresh_token: 'must-not-leak',
              scope: 'must-not-leak',
            },
          },
          data: { access_token: 'must-not-leak' },
        });

        const items = yield* decodeConnectedAccountItems([raw]);

        expect(items).toStrictEqual([makeItem({ display_name: 'ada@example.com' })]);
        expect(JSON.stringify(items)).not.toContain('must-not-leak');
      })
    );

    it.effect('keeps a display name of exactly the maximum length', () =>
      Effect.gen(function* () {
        const displayName = 'a'.repeat(CONNECTED_ACCOUNT_DISPLAY_NAME_MAX_LENGTH);

        const items = yield* decodeConnectedAccountItems([
          makeItem({ state: { val: { displayName } } }),
        ]);

        expect(items).toStrictEqual([makeItem({ display_name: displayName })]);
      })
    );
  });

  layer(TestLayer)('[Given] a state without a usable display name', it => {
    it.effect.each([
      ['state is null', null],
      ['state is not an object', 'opaque'],
      ['state has no val', { authScheme: 'OAUTH2' }],
      ['val has no displayName', { val: { access_token: 'must-not-leak' } }],
      ['displayName is blank', { val: { displayName: '   ' } }],
      ['displayName is not a string', { val: { displayName: { email: 'ada@example.com' } } }],
      [
        'displayName is over the maximum length',
        { val: { displayName: 'a'.repeat(CONNECTED_ACCOUNT_DISPLAY_NAME_MAX_LENGTH + 1) } },
      ],
    ] as const)('leaves display_name out when %s', ([, state]) =>
      Effect.gen(function* () {
        const items = yield* decodeConnectedAccountItems([makeItem({ state })]);

        expect(items).toStrictEqual([makeItem()]);
      })
    );
  });

  layer(TestLayer)('[Given] a malformed payload', it => {
    it.effect('fails with SchemaError', () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          decodeConnectedAccountItems([{ definitely: 'not-an-account' }])
        );

        expect(Schema.isSchemaError(error)).toBe(true);
      })
    );
  });
});

describe('decodeConnectedAccountListWithFallback', () => {
  layer(TestLayer)('[Given] a response with a status newer than this CLI build', it => {
    it.effect('decodes and warns instead of falling back to the raw payload', () =>
      Effect.gen(function* () {
        const result = yield* decodeConnectedAccountListWithFallback({
          items: [makeItem({ status: 'QUANTUM_LINKED' })],
          total_items: 1,
          total_pages: 1,
          current_page: 1,
          next_cursor: null,
        });

        expect(result.items).toStrictEqual([makeItem({ status: 'QUANTUM_LINKED' })]);

        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain('QUANTUM_LINKED');
        expect(output).toContain('composio upgrade');
      })
    );
  });

  layer(TestLayer)('[Given] a shape-skewed response carrying credential fields', it => {
    it.effect('falls back to raw but never echoes payload values in the warning', () =>
      Effect.gen(function* () {
        // `items` is not an array: the decode fails at the container level,
        // where an unredacted formatter would print the whole actual value.
        const raw = {
          items: { 0: makeItem({ state: { access_token: 'must-not-leak' } }) },
          total_items: 1,
          total_pages: 1,
          current_page: 1,
          next_cursor: null,
        };

        const result = yield* decodeConnectedAccountListWithFallback(raw);

        expect(result).toBe(raw);

        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain('composio upgrade');
        expect(output).toContain('items');
        expect(output).not.toContain('must-not-leak');
      })
    );
  });
});
