import { describe, expect, layer } from '@effect/vitest';
import { Console, Effect, Layer, ParseResult } from 'effect';
import { decodeConnectedAccountItemsWithFallback } from 'src/effects/decode-connected-account-list';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { MockConsole } from 'test/__utils__';
import { TerminalUITest } from 'test/__utils__/services/terminal-ui-test';

const TestLayer = Layer.unwrapEffect(
  Effect.map(MockConsole.make, _console =>
    Layer.mergeAll(Console.setConsole(_console), TerminalUITest)
  )
);

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

describe('decodeConnectedAccountItemsWithFallback', () => {
  layer(TestLayer)('[Given] items matching the strict schema', it => {
    it.effect('decodes without warning', () =>
      Effect.gen(function* () {
        const items = yield* decodeConnectedAccountItemsWithFallback([makeItem()]);

        expect(items).toStrictEqual([makeItem()]);
        expect(yield* MockConsole.getLines()).toStrictEqual([]);
      })
    );
  });

  layer(TestLayer)('[Given] a status newer than this CLI build', it => {
    it.effect('warns, keeps the unknown status, and still strips credential fields', () =>
      Effect.gen(function* () {
        const raw = makeItem({
          status: 'QUANTUM_LINKED',
          state: { access_token: 'must-not-leak' },
          data: { refresh_token: 'must-not-leak' },
        });

        const items = yield* decodeConnectedAccountItemsWithFallback([raw]);

        expect(items).toStrictEqual([
          makeItem({ status: 'QUANTUM_LINKED' }) as unknown as ConnectedAccountItem,
        ]);
        expect(JSON.stringify(items)).not.toContain('must-not-leak');

        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain('does not recognize');
        expect(output).toContain('composio upgrade');
      })
    );
  });

  layer(TestLayer)('[Given] a payload the permissive schema cannot decode', it => {
    it.effect('fails with ParseError instead of leaking the raw payload', () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          decodeConnectedAccountItemsWithFallback([{ definitely: 'not-an-account' }])
        );

        expect(ParseResult.isParseError(error)).toBe(true);
      })
    );
  });
});
