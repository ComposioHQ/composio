/**
 * Keeps the fake backend honest against `@composio/client`.
 *
 * Every route named after a client operation is called once per sample below,
 * and its answer is decoded with the response schema the client itself ships
 * for that operation. A fake response the real client would reject fails here,
 * before any CLI suite builds on it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { schemaLoaders } from '@composio/client/effect/schemas';
import * as Schema from 'effect/Schema';
import {
  CONSUMER_PROJECT,
  CONSUMER_USER_ID,
  DEVELOPER_PROJECT,
  GLOBAL_TEST_USER_ID,
  ORG,
  ROUTES,
  startFakeComposio,
  USER_API_KEY,
  type FakeComposio,
  type World,
} from './src/index';

type OperationName = keyof typeof schemaLoaders;

const isOperationName = (name: string): name is OperationName => name in schemaLoaders;

/** Decodes like the client does when a call asks for validation; throws on the first mismatch. */
const decodeWith = (schema: Schema.Codec<unknown, unknown, never, never>, json: unknown): unknown =>
  Schema.decodeUnknownSync(schema)(json);

interface Sample {
  /** The operation whose route the request must reach. */
  readonly operation: OperationName;
  /** What makes this sample different from another one of the same operation. */
  readonly variant: string;
  readonly method: 'GET' | 'POST';
  /** May read ids from state the `prepare` step created. */
  readonly path: (world: World) => string;
  readonly body?: unknown;
  readonly project?: 'consumer' | 'developer';
  readonly expectStatus?: number;
  /** Seeds what the request needs and is undone by the next sample's fresh world. */
  readonly prepare?: (world: World) => void;
}

const SLACK_ARGUMENTS = { channel: 'general', text: 'hello' };

const withConsumerSession = (world: World) => {
  world.createToolRouterSession(CONSUMER_PROJECT.label, CONSUMER_USER_ID);
};

const withConnectedConsumerSession = (world: World) => {
  withConsumerSession(world);
  world.connect(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack');
};

const SESSION = '/api/v3.1/tool_router/session/trs_e2e0001';

const SAMPLES: ReadonlyArray<Sample> = [
  {
    operation: 'auth.session.retrieveInfo',
    variant: 'user key',
    method: 'GET',
    path: () => '/api/v3.1/auth/session/info',
  },
  { operation: 'org.list', variant: 'two orgs', method: 'GET', path: () => '/api/v3.1/org/list' },
  {
    operation: 'org.project.list',
    variant: 'developer projects',
    method: 'GET',
    path: () => '/api/v3.1/org/project/list',
  },
  {
    operation: '_internal.org.consumer.project.resolve',
    variant: 'consumer project',
    method: 'POST',
    path: () => '/api/v3.1/org/consumer/project/resolve',
  },
  {
    operation: '_internal.org.consumer.listConnectedToolkits',
    variant: 'one connected toolkit',
    method: 'GET',
    path: () => `/api/v3.1/org/consumer/connected_toolkits?user_id=${CONSUMER_USER_ID}`,
    prepare: world => void world.connect(CONSUMER_PROJECT.label, CONSUMER_USER_ID, 'slack'),
  },
  {
    operation: '_internal.org.consumer.retrieveConfig',
    variant: 'defaults',
    method: 'GET',
    path: () => '/api/v3.1/org/consumer/config',
  },
  {
    operation: '_internal.consumer.permissions.resolve',
    variant: 'allow all',
    method: 'POST',
    path: () => '/api/v3.1/consumer/permissions/resolve',
    body: {},
  },
  {
    operation: '_internal.cli.createSession',
    variant: 'pending',
    method: 'POST',
    path: () => '/api/v3.1/cli/create-session',
    body: { scope: 'user' },
  },
  {
    operation: '_internal.cli.getSession',
    variant: 'pending',
    method: 'GET',
    path: world => `/api/v3.1/cli/get-session?id=${world.loginSessions[0]?.id}`,
    prepare: world => void world.createLoginSession(),
  },
  {
    operation: '_internal.cli.getSession',
    variant: 'linked',
    method: 'GET',
    path: world => `/api/v3.1/cli/get-session?id=${world.loginSessions[0]?.id}`,
    prepare: world => {
      world.createLoginSession();
      world.linkLoginSession();
    },
  },
  {
    operation: 'toolkits.list',
    variant: 'all toolkits',
    method: 'GET',
    path: () => '/api/v3.1/toolkits',
  },
  {
    operation: 'toolkits.retrieve',
    variant: 'oauth toolkit',
    method: 'GET',
    path: () => '/api/v3.1/toolkits/slack',
  },
  {
    operation: 'toolkits.retrieve',
    variant: 'no-auth toolkit',
    method: 'GET',
    path: () => '/api/v3.1/toolkits/hackernews',
  },
  { operation: 'tools.list', variant: 'all tools', method: 'GET', path: () => '/api/v3.1/tools' },
  {
    operation: 'tools.retrieve',
    variant: 'one tool',
    method: 'GET',
    path: () => '/api/v3.1/tools/SLACK_SEND_MESSAGE',
  },
  {
    operation: 'toolRouter.session.create',
    variant: 'consumer user',
    method: 'POST',
    path: () => '/api/v3.1/tool_router/session',
    body: { user_id: CONSUMER_USER_ID },
    project: 'consumer',
    expectStatus: 201,
  },
  {
    operation: 'toolRouter.session.search',
    variant: 'not connected',
    method: 'POST',
    path: () => `${SESSION}/search`,
    body: { queries: [{ use_case: 'send a slack message' }] },
    project: 'consumer',
    prepare: withConsumerSession,
  },
  {
    operation: 'toolRouter.session.search',
    variant: 'connected',
    method: 'POST',
    path: () => `${SESSION}/search`,
    body: { queries: [{ use_case: 'send a slack message' }] },
    project: 'consumer',
    prepare: withConnectedConsumerSession,
  },
  {
    operation: 'toolRouter.session.execute',
    variant: 'completed',
    method: 'POST',
    path: () => `${SESSION}/execute`,
    body: { tool_slug: 'SLACK_SEND_MESSAGE', arguments: SLACK_ARGUMENTS },
    project: 'consumer',
    prepare: withConnectedConsumerSession,
  },
  {
    operation: 'toolRouter.session.executeMeta',
    variant: 'completed',
    method: 'POST',
    path: () => `${SESSION}/execute_meta`,
    body: { slug: 'COMPOSIO_SEARCH_TOOLS', arguments: {} },
    project: 'consumer',
    prepare: withConsumerSession,
  },
  {
    operation: 'toolRouter.session.link',
    variant: 'new connection',
    method: 'POST',
    path: () => `${SESSION}/link`,
    body: { toolkit: 'slack' },
    project: 'consumer',
    expectStatus: 201,
    prepare: withConsumerSession,
  },
  {
    operation: 'toolRouter.session.toolkits',
    variant: 'one connected',
    method: 'GET',
    path: () => `${SESSION}/toolkits`,
    project: 'consumer',
    prepare: withConnectedConsumerSession,
  },
  {
    operation: 'authConfigs.list',
    variant: 'managed configs',
    method: 'GET',
    path: () => '/api/v3.1/auth_configs',
    project: 'developer',
  },
  {
    operation: 'authConfigs.retrieve',
    variant: 'managed config',
    method: 'GET',
    path: world => `/api/v3.1/auth_configs/${world.authConfigs[0]?.id}`,
    project: 'developer',
  },
  {
    operation: 'connectedAccounts.list',
    variant: 'active and pending',
    method: 'GET',
    path: () => '/api/v3.1/connected_accounts',
    project: 'developer',
    prepare: world => {
      world.connect(DEVELOPER_PROJECT.label, GLOBAL_TEST_USER_ID, 'slack');
      world.linkCompletesAfterPolls = null;
      world.beginConnection({
        projectLabel: DEVELOPER_PROJECT.label,
        userId: GLOBAL_TEST_USER_ID,
        toolkit: 'github',
      });
    },
  },
  {
    operation: 'connectedAccounts.retrieve',
    variant: 'active',
    method: 'GET',
    path: world => `/api/v3.1/connected_accounts/${world.connections[0]?.id}`,
    project: 'developer',
    prepare: world => void world.connect(DEVELOPER_PROJECT.label, GLOBAL_TEST_USER_ID, 'slack'),
  },
  {
    operation: 'link.create',
    variant: 'new connection',
    method: 'POST',
    path: () => '/api/v3.1/connected_accounts/link',
    body: { auth_config_id: 'ac_e2e0001', user_id: GLOBAL_TEST_USER_ID },
    project: 'developer',
    expectStatus: 201,
  },
  {
    operation: 'tools.execute',
    variant: 'successful',
    method: 'POST',
    path: () => '/api/v3.1/tools/execute/SLACK_SEND_MESSAGE',
    body: { user_id: GLOBAL_TEST_USER_ID, arguments: SLACK_ARGUMENTS },
    project: 'developer',
    prepare: world => void world.connect(DEVELOPER_PROJECT.label, GLOBAL_TEST_USER_ID, 'slack'),
  },
];

const PROJECT_IDS = {
  consumer: CONSUMER_PROJECT.nanoId,
  developer: DEVELOPER_PROJECT.nanoId,
} as const;

describe('fake backend contract', () => {
  let fake: FakeComposio;

  const call = async (sample: Sample): Promise<Response> => {
    // A fresh world per sample: ids in sample paths assume nothing ran before.
    await fake?.close();
    fake = await startFakeComposio();
    sample.prepare?.(fake.world);
    return fetch(`${fake.host.http}${sample.path(fake.world)}`, {
      method: sample.method,
      headers: {
        'content-type': 'application/json',
        'x-user-api-key': USER_API_KEY,
        'x-org-id': ORG.id,
        ...(sample.project ? { 'x-project-id': PROJECT_IDS[sample.project] } : {}),
      },
      body: sample.body === undefined ? undefined : JSON.stringify(sample.body),
    });
  };

  beforeAll(async () => {
    fake = await startFakeComposio();
  });

  afterAll(async () => {
    await fake.close();
  });

  for (const sample of SAMPLES) {
    it(`${sample.operation} (${sample.variant}) decodes with the client's schema`, async () => {
      const response = await call(sample);
      const json: unknown = await response.json();
      expect({ status: response.status, json }).toMatchObject({
        status: sample.expectStatus ?? 200,
      });
      expect(fake.journal.entries().at(-1)?.route).toBe(sample.operation);

      const schema = await schemaLoaders[sample.operation]();
      // Throws with the path of the first field the client would reject.
      decodeWith(schema, json);
    });
  }

  it('has a sample for every route that claims a client operation', () => {
    const sampled = new Set<string>(SAMPLES.map(sample => sample.operation));
    const unsampled = ROUTES.filter(route => route.typed && !sampled.has(route.name)).map(
      route => route.name
    );
    expect(unsampled).toEqual([]);
  });

  it('names only real client operations on typed routes', () => {
    const unknown = ROUTES.filter(route => route.typed && !isOperationName(route.name)).map(
      route => route.name
    );
    expect(unknown).toEqual([]);
  });

  it('rejects a response that drifts from the client schema', async () => {
    // Guards the guard: a decoder that accepts anything would make this file vacuous.
    const schema = await schemaLoaders['toolRouter.session.link']();
    expect(() => decodeWith(schema, { link_token: 'lt_1' })).toThrow();
  });
});
