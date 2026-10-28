import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { routeRequests, stubClientResources } from 'test/__utils__/services/stub-composio-client';

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
});

const enableListen = Effect.gen(function* () {
  const config = yield* ComposioCliUserConfig;
  yield* config.update({
    experimentalFeatures: {
      ...config.raw.experimentalFeatures,
      listen: true,
    },
  });
});

const TRIGGER_ID = 'trg_gmail_new_gmail_message_con_gmail_test';

const testLayer = TestLive({
  baseConfigProvider: testConfigProvider,
  fixture: 'global-test-user-id',
  connectedAccountsData: {
    items: [
      {
        id: 'con_gmail_test',
        status: 'ACTIVE',
        status_reason: null,
        is_disabled: false,
        user_id: 'consumer-user-org_test',
        toolkit: { slug: 'gmail' },
        auth_config: {
          id: 'auth_gmail_test',
          auth_scheme: 'OAUTH2',
          is_composio_managed: true,
          is_disabled: false,
        },
        created_at: '2026-04-06T17:59:00.000Z',
        updated_at: '2026-04-06T18:00:00.000Z',
        test_request_endpoint: '',
      },
    ],
  },
  realtimeData: {
    events: [
      {
        id: 'evt_trigger_1',
        type: 'composio.trigger.message',
        timestamp: '2026-04-06T18:00:00.000Z',
        metadata: {
          log_id: 'log_1',
          trigger_slug: 'GMAIL_NEW_GMAIL_MESSAGE',
          trigger_id: TRIGGER_ID,
          connected_account_id: 'con_gmail_test',
          auth_config_id: 'auth_gmail_test',
          user_id: 'consumer-user-org_test',
        },
        data: { threadId: 'thread_123' },
      },
    ],
  },
});

const invalidConfig = {
  error: {
    message: 'Invalid trigger config',
    code: 1401,
    slug: 'Trigger_InvalidConfig',
    status: 400,
  },
};
const invalidConfigText = `400 ${JSON.stringify(invalidConfig)}`;

const notFound = {
  error: {
    message: 'Trigger type not found',
    code: 1404,
    slug: 'TriggerType_NotFound',
    status: 404,
  },
};

const TRIGGER_TYPES = '/api/v3.1/triggers_types/';
const TRIGGER_UPSERT = '/api/v3.1/trigger_instances/';

describe('CLI: composio listen over the API client', () => {
  layer(testLayer)('[Given] the API rejects the temporary trigger', it => {
    it.effect('[Then] the failure quotes the status and response body', () =>
      Effect.gen(function* () {
        const stub = stubClientResources(
          ['triggerInstances', 'triggersTypes'],
          routeRequests(
            [
              {
                method: 'GET',
                path: TRIGGER_TYPES,
                respond: () => Response.json({ slug: 'GMAIL_NEW_GMAIL_MESSAGE' }),
              },
            ],
            () => Response.json(invalidConfig, { status: 400 })
          )
        );
        yield* enableListen;
        const failure = yield* cli(['listen', 'GMAIL_NEW_GMAIL_MESSAGE']).pipe(
          Effect.provide(stub.layer),
          Effect.flip
        );

        expect(failure).toMatchObject({
          _tag: 'commands/ListenCommandError',
          reason: 'create_trigger',
          message: `Failed to create temporary trigger "GMAIL_NEW_GMAIL_MESSAGE": Error: ${invalidConfigText}`,
        });
        expect(stub.requests.map(request => request.method)).toEqual(['POST', 'GET']);
      })
    );

    it.effect('[Then] a trigger type the API does not know is reported as unknown', () =>
      Effect.gen(function* () {
        const stub = stubClientResources(
          ['triggerInstances', 'triggersTypes'],
          routeRequests(
            [
              {
                method: 'GET',
                path: TRIGGER_TYPES,
                respond: () => Response.json(notFound, { status: 404 }),
              },
            ],
            () => Response.json(invalidConfig, { status: 400 })
          )
        );
        yield* enableListen;
        const failure = yield* cli(['listen', 'GMAIL_NEW_GMAIL_MESAGE']).pipe(
          Effect.provide(stub.layer),
          Effect.flip
        );

        expect(failure).toMatchObject({
          _tag: 'commands/ListenCommandError',
          reason: 'unknown_trigger',
          message:
            'Unknown trigger slug "GMAIL_NEW_GMAIL_MESAGE". List available slugs with `composio triggers list <toolkit>`.',
        });
      })
    );
  });

  layer(testLayer)('[Given] the temporary trigger cannot be disabled', it => {
    it.effect('[Then] the warning quotes the status and response body', () =>
      Effect.gen(function* () {
        const stub = stubClientResources(
          ['triggerInstances'],
          routeRequests(
            [
              {
                method: 'POST',
                path: TRIGGER_UPSERT,
                respond: () => Response.json({ trigger_id: TRIGGER_ID }),
              },
            ],
            () => Response.json(invalidConfig, { status: 400 })
          )
        );
        yield* enableListen;
        yield* cli(['listen', 'GMAIL_NEW_GMAIL_MESSAGE', '--max-events', '1']).pipe(
          Effect.provide(stub.layer)
        );
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(lines.join('\n')).toContain(
          `Failed to disable temporary trigger "${TRIGGER_ID}": Error: ${invalidConfigText}`
        );
      })
    );
  });

  layer(testLayer)('[Given] the connected accounts cannot be listed', it => {
    it.effect('[Then] the failure quotes the status and response body', () =>
      Effect.gen(function* () {
        const stub = stubClientResources(['connectedAccounts'], () =>
          Response.json(invalidConfig, { status: 400 })
        );
        yield* enableListen;
        const failure = yield* cli(['listen', 'GMAIL_NEW_GMAIL_MESSAGE']).pipe(
          Effect.provide(stub.layer),
          Effect.flip
        );

        // The same failure `composio execute` and `composio proxy` report.
        expect(failure).toMatchObject({
          _tag: 'services/ConnectedAccountResolutionError',
          toolkitSlug: 'gmail',
          message: `Failed to load connected accounts for toolkit "gmail": Error: ${invalidConfigText}`,
        });
      })
    );
  });
});
