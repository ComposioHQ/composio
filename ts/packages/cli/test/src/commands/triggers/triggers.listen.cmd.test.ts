import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { createServer, type IncomingMessage } from 'node:http';
import { Composio } from '@composio/core';

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

const mockV3TriggerEvent = {
  id: 'msg-123',
  timestamp: '2026-02-23T12:00:00Z',
  type: 'composio.trigger.message',
  metadata: {
    log_id: 'log-123',
    trigger_slug: 'GMAIL_NEW_GMAIL_MESSAGE',
    trigger_id: 'trg_123',
    connected_account_id: 'con_123',
    auth_config_id: 'ac_123',
    user_id: 'user_123',
  },
  data: {
    subject: 'Hello',
    from: 'hello@example.com',
  },
} as const;

type CapturedWebhookRequest = {
  body: string;
  headers: {
    webhookId: string;
    webhookTimestamp: string;
    webhookSignature: string;
    webhookVersion: string;
  };
};

const startWebhookServer = async (): Promise<{
  url: string;
  waitForRequest: Promise<CapturedWebhookRequest>;
  close: () => Promise<void>;
}> => {
  let resolveRequest: ((value: CapturedWebhookRequest) => void) | undefined;
  let rejectRequest: ((reason?: unknown) => void) | undefined;

  const waitForRequest = new Promise<CapturedWebhookRequest>((resolve, reject) => {
    resolveRequest = resolve;
    rejectRequest = reject;
  });

  const readBody = (req: IncomingMessage): Promise<string> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', chunk => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      req.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
      req.on('error', reject);
    });

  const server = createServer(async (req, res) => {
    try {
      const body = await readBody(req);
      resolveRequest?.({
        body,
        headers: {
          webhookId: (req.headers['webhook-id'] as string | undefined) ?? '',
          webhookTimestamp: (req.headers['webhook-timestamp'] as string | undefined) ?? '',
          webhookSignature: (req.headers['webhook-signature'] as string | undefined) ?? '',
          webhookVersion: (req.headers['webhook-version'] as string | undefined) ?? '',
        },
      });
      res.statusCode = 200;
      res.end('ok');
    } catch (error) {
      rejectRequest?.(error);
      res.statusCode = 500;
      res.end('error');
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind webhook test server');
  }

  return {
    url: `http://127.0.0.1:${address.port}/webhook`,
    waitForRequest,
    close: () =>
      new Promise((resolve, reject) => {
        server.close(error => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
};

describe('CLI: composio manage triggers listen', () => {
  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      realtimeData: {
        events: [mockV3TriggerEvent],
      },
    })
  )('[Given] one realtime event [Then] prints normalized event output', it => {
    it.scoped('prints event summary and payload', () =>
      Effect.gen(function* () {
        yield* cli(['manage', 'triggers', 'listen', '--max-events', '1']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('Listening for realtime trigger events');
        expect(output).not.toContain('Writing matching events to:');
        expect(output).toContain('GMAIL_NEW_GMAIL_MESSAGE');
        expect(output).toContain('"subject":"Hello"');
        expect(output).toContain('Stopped after receiving 1 matching events');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      realtimeData: {
        events: [mockV3TriggerEvent],
      },
    })
  )('[Given] composio listen alias [Then] works like composio manage triggers listen', it => {
    it.scoped('alias expands to triggers listen', () =>
      Effect.gen(function* () {
        yield* cli(['listen', '--max-events', '1']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('Listening for realtime trigger events');
        expect(output).toContain('GMAIL_NEW_GMAIL_MESSAGE');
        expect(output).toContain('Stopped after receiving 1 matching events');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      realtimeData: {
        events: [mockV3TriggerEvent],
      },
    })
  )('[Given] --table [Then] prints compact table rows', it => {
    it.scoped('prints table header and event row', () =>
      Effect.gen(function* () {
        yield* cli(['manage', 'triggers', 'listen', '--table', '--max-events', '1']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('Timestamp');
        expect(output).toContain('Trigger Id');
        expect(output).toContain('Trigger Slug');
        expect(output).toContain('Toolkit');
        expect(output).toContain('User Id');
        expect(output).toContain('Connected Account Id');
        expect(output).not.toContain('Event #1');
        expect(output).not.toContain('Trigger:');
        expect(output).toContain('trg_123');
        expect(output).toContain('GMAIL_NEW_GMAIL_');
        expect(output).toContain('GMAIL');
        expect(output).toContain('user_123');
        expect(output).toContain('con_123');
      })
    );
  });

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.scoped('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['manage', 'triggers', 'listen']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');
        expect(output).toContain('not logged in');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      realtimeData: { events: [mockV3TriggerEvent] },
    })
  )(
    '[Given] --forward without COMPOSIO_WEBHOOK_SECRET [Then] generates session signing secret',
    it => {
      it.scoped('shows generated signing secret for forward mode', () =>
        Effect.gen(function* () {
          delete process.env.COMPOSIO_WEBHOOK_SECRET;
          yield* cli([
            'manage',
            'triggers',
            'listen',
            '--forward',
            'http://localhost:8080/webhook',
            '--max-events',
            '1',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          expect(output).toContain('No COMPOSIO_WEBHOOK_SECRET found');
          expect(output).toContain('Forward URL: http://localhost:8080/webhook');
          expect(output).toContain('Generated signing secret: composio-forward-secret-');
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      realtimeData: { events: [mockV3TriggerEvent] },
    })
  )('[Given] --forward [Then] sends signed webhook verifiable by composio/core', it => {
    it.scoped('forwards request with headers and valid signature', () => {
      const previousSecret = process.env.COMPOSIO_WEBHOOK_SECRET;
      const restoreWebhookSecret = () => {
        if (previousSecret === undefined) {
          delete process.env.COMPOSIO_WEBHOOK_SECRET;
          return;
        }
        process.env.COMPOSIO_WEBHOOK_SECRET = previousSecret;
      };

      return Effect.gen(function* () {
        process.env.COMPOSIO_WEBHOOK_SECRET = 'test-webhook-secret';

        const server = yield* Effect.acquireRelease(
          Effect.tryPromise(() => startWebhookServer()),
          resource =>
            Effect.tryPromise(() => resource.close()).pipe(Effect.catchAll(() => Effect.void))
        );

        yield* cli(['manage', 'triggers', 'listen', '--forward', server.url, '--max-events', '1']);

        const request = yield* Effect.tryPromise({
          try: () =>
            Promise.race([
              server.waitForRequest,
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Timed out waiting for forwarded webhook')), 3000)
              ),
            ]),
          catch: error => new Error(String(error)),
        });

        expect(request.headers.webhookId).not.toEqual('');
        expect(request.headers.webhookTimestamp).not.toEqual('');
        expect(request.headers.webhookSignature).toContain('v1,');
        expect(request.headers.webhookVersion).toEqual('V3');

        const composio = new Composio({
          apiKey: 'test-api-key',
          disableVersionCheck: true,
          allowTracking: false,
        });

        const verification = yield* Effect.tryPromise(() =>
          composio.triggers.verifyWebhook({
            payload: request.body,
            id: request.headers.webhookId,
            timestamp: request.headers.webhookTimestamp,
            signature: request.headers.webhookSignature,
            secret: 'test-webhook-secret',
          })
        );

        expect(verification.rawPayload).toEqual(mockV3TriggerEvent);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            restoreWebhookSecret();
          })
        )
      );
    });
  });
});
