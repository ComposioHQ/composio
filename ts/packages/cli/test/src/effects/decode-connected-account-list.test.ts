import type { ConnectedAccountListResponse as ApiConnectedAccountListResponse } from '@composio/client/resources/connected-accounts';
import { describe, expect, layer } from '@effect/vitest';
import { Console, Effect, Layer, Schema } from 'effect';
import {
  decodeConnectedAccountItems,
  decodeConnectedAccountList,
} from 'src/effects/decode-connected-account-list';
import { MockConsole } from 'test/__utils__';
import { TerminalUITest } from 'test/__utils__/services/terminal-ui-test';

const TestLayer = Layer.mergeAll(Layer.effect(Console.Console, MockConsole.make), TerminalUITest);

// The server can send what the client's types do not describe (a newer status, a
// missing field, credentials under `state`); these fixtures model that payload.
const serverItems = (items: ReadonlyArray<unknown>) =>
  items as ApiConnectedAccountListResponse['items'];
const serverResponse = (response: unknown) => response as ApiConnectedAccountListResponse;

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
        const items = yield* decodeConnectedAccountItems(serverItems([makeItem()]));

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

        const items = yield* decodeConnectedAccountItems(serverItems([raw]));

        expect(items).toStrictEqual([makeItem({ status: 'QUANTUM_LINKED' })]);
        expect(JSON.stringify(items)).not.toContain('must-not-leak');

        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain('QUANTUM_LINKED');
        expect(output).toContain('composio upgrade');
        expect(output).not.toContain('must-not-leak');
      })
    );
  });

  layer(TestLayer)('[Given] a state carrying a provider identity next to credentials', it => {
    it.effect('keeps only the trimmed display name from state', () =>
      Effect.gen(function* () {
        const raw = makeItem({
          state: {
            authScheme: 'OAUTH2',
            val: {
              displayName: '  ada@example.com  ',
              access_token: 'must-not-leak',
              refresh_token: 'must-not-leak',
            },
          },
          data: { access_token: 'must-not-leak' },
        });

        const items = yield* decodeConnectedAccountItems(serverItems([raw]));

        expect(items).toStrictEqual([makeItem({ display_name: 'ada@example.com' })]);
        expect(JSON.stringify(items)).not.toContain('must-not-leak');
      })
    );

    it.effect('keeps a display name of exactly 200 characters', () =>
      Effect.gen(function* () {
        const displayName = 'a'.repeat(200);

        const items = yield* decodeConnectedAccountItems(
          serverItems([makeItem({ state: { val: { displayName } } })])
        );

        expect(items).toStrictEqual([makeItem({ display_name: displayName })]);
      })
    );
  });

  layer(TestLayer)('[Given] no usable state.val.displayName', it => {
    it.effect.each([
      ['state is null', { state: null }],
      ['state is not an object', { state: 'opaque' }],
      ['state has no val', { state: { authScheme: 'OAUTH2' } }],
      ['val has no displayName', { state: { val: { access_token: 'must-not-leak' } } }],
      ['displayName is blank', { state: { val: { displayName: '   ' } } }],
      ['displayName is not a string', { state: { val: { displayName: 42 } } }],
      ['displayName is over 200 characters', { state: { val: { displayName: 'a'.repeat(201) } } }],
      ['only a top-level display_name is sent', { display_name: 'ada@example.com' }],
    ] as const)('leaves display_name out when %s', ([, overrides]) =>
      Effect.gen(function* () {
        const items = yield* decodeConnectedAccountItems(serverItems([makeItem(overrides)]));

        expect(items).toStrictEqual([makeItem()]);
      })
    );
  });

  layer(TestLayer)('[Given] a malformed payload', it => {
    it.effect('fails with SchemaError', () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          decodeConnectedAccountItems(serverItems([{ definitely: 'not-an-account' }]))
        );

        expect(Schema.isSchemaError(error)).toBe(true);
      })
    );
  });
});

describe('decodeConnectedAccountList', () => {
  layer(TestLayer)('[Given] a response with a status newer than this CLI build', it => {
    it.effect('decodes and warns', () =>
      Effect.gen(function* () {
        const result = yield* decodeConnectedAccountList(
          serverResponse({
            items: [makeItem({ status: 'QUANTUM_LINKED' })],
            total_items: 1,
            total_pages: 1,
            current_page: 1,
            next_cursor: null,
          })
        );

        expect(result.items).toStrictEqual([makeItem({ status: 'QUANTUM_LINKED' })]);

        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain('QUANTUM_LINKED');
        expect(output).toContain('composio upgrade');
      })
    );
  });

  layer(TestLayer)('[Given] a response whose envelope does not match', it => {
    it.effect('fails naming the mismatched field', () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          decodeConnectedAccountList(
            serverResponse({
              items: [makeItem()],
              total_items: '3',
              total_pages: 1,
              current_page: 1,
              next_cursor: null,
            })
          )
        );

        expect(error._tag).toBe('effects/ConnectedAccountListShapeError');
        expect(error.message).toContain('total_items');
        expect(error.message).not.toContain('"3"');
      })
    );
  });

  layer(TestLayer)('[Given] a shape-skewed response carrying credential fields', it => {
    it.effect('fails without echoing payload values', () =>
      Effect.gen(function* () {
        // `items` is not an array: the decode fails at the container level,
        // where an unredacted formatter would print the whole actual value.
        const error = yield* Effect.flip(
          decodeConnectedAccountList(
            serverResponse({
              items: { 0: makeItem({ state: { access_token: 'must-not-leak' } }) },
              total_items: 1,
              total_pages: 1,
              current_page: 1,
              next_cursor: null,
            })
          )
        );

        expect(error.message).toContain('items');
        expect(error.message).not.toContain('must-not-leak');
        expect((yield* MockConsole.getLines()).join('\n')).not.toContain('must-not-leak');
      })
    );
  });
});
