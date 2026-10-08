import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serve, type ServerType } from '@hono/node-server';
import { Hono } from 'hono';
import { z } from 'zod/v3';
import { BadRequestError } from '@composio/client';
import { Composio } from '../../src/composio';
import { ComposioSessionConfigConflictError } from '../../src/errors/ToolRouterErrors';

// Production rejects unknown PATCH keys. Keep this boundary independent of
// the SDK's input schema so accidental additions fail through the HTTP client.
const patchSchema = z.union([
  z.object({ experimental: z.object({ session_config_id: z.string() }).strict() }).strict(),
  z.object({ toolkits: z.object({ enable: z.array(z.string()) }).strict() }).strict(),
]);

describe('Session configs over HTTP', () => {
  let server: ServerType;
  let composio: Composio;
  let patchRequests: unknown[];
  let listQueries: Record<string, string>[];
  let conflict: boolean;
  const originalConfig = {
    user_id: 'session-config-test',
    toolkits: { enabled: ['github'] },
    preload: { tools: [] },
  };
  const updatedConfig = {
    ...originalConfig,
    toolkits: { enabled: ['gmail'] },
    tags: { enabled: ['readOnlyHint'] },
  };

  beforeEach(async () => {
    patchRequests = [];
    listQueries = [];
    conflict = false;
    const app = new Hono();
    app.get('/api/v3.1/session_configs', c => {
      listQueries.push(c.req.query());
      return c.json({ items: [], next_cursor: null });
    });
    const sessionPath = '/api/v3.1/tool_router/session/trs_test';
    app.get(sessionPath, c =>
      c.json({
        session_id: 'trs_test',
        config_version: 7,
        config: originalConfig,
        tool_router_tools: [],
        mcp: { type: 'http', url: new URL('/mcp', c.req.url).href },
      })
    );
    app.patch(sessionPath, async c => {
      const payload: unknown = await c.req.json();
      patchRequests.push(payload);
      const parsed = patchSchema.safeParse(payload);
      if (!parsed.success || conflict) {
        return c.json(
          { error: { message: conflict ? 'Config changed' : 'Unrecognized PATCH field' } },
          conflict ? 409 : 400
        );
      }
      return c.json({
        session_id: 'trs_test',
        config_version: 8,
        config: updatedConfig,
        warnings: [],
        ...('experimental' in parsed.data && {
          experimental: {
            source_session_config: { id: parsed.data.experimental.session_config_id },
          },
        }),
      });
    });
    app.notFound(c => c.json({ error: { message: 'Unexpected endpoint' } }, 404));
    const baseURL = await new Promise<string>(resolve => {
      server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, address =>
        resolve(`http://127.0.0.1:${address.port}`)
      );
    });
    composio = new Composio({
      apiKey: 'test-key',
      baseURL,
      allowTracking: false,
      allowTracing: false,
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
  });

  it('omits undefined list parameters while preserving false', async () => {
    await composio.sessionConfigs.list({
      search: undefined,
      archived: false,
      limit: undefined,
      cursor: undefined,
    });

    expect(listQueries).toEqual([{ archived: 'false' }]);
  });

  it('applies the documented saved-config update without extra wire fields', async () => {
    const session = await composio.sessions.use('trs_test');

    await session.update({ experimental: { sessionConfigId: 'sc_test' } });

    expect(patchRequests).toEqual([{ experimental: { session_config_id: 'sc_test' } }]);
    expect(session.config).toEqual(updatedConfig);
    expect(session.configVersion).toBe(8);
    expect(session.experimental.sourceSessionConfig).toEqual({ id: 'sc_test' });
  });

  it('also applies inline updates without an implicit precondition', async () => {
    const session = await composio.sessions.use('trs_test');

    await session.update({ toolkits: ['gmail'] });

    expect(patchRequests).toEqual([{ toolkits: { enable: ['gmail'] } }]);
    expect(session.config.toolkits).toEqual({ enabled: ['gmail'] });
  });

  it('preserves an explicit version check and surfaces rejection without retrying', async () => {
    const session = await composio.sessions.use('trs_test');
    const before = session.config;

    await expect(
      session.update({
        experimental: { sessionConfigId: 'sc_test' },
        expectedConfigVersion: 7,
      })
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(patchRequests).toEqual([
      {
        experimental: { session_config_id: 'sc_test' },
        expected_config_version: 7,
      },
    ]);
    expect(session.config).toBe(before);
    expect(session.configVersion).toBe(7);
    expect(session.experimental.sourceSessionConfig).toBeUndefined();
  });

  it('surfaces an apply-time conflict without retrying or refreshing local state', async () => {
    const session = await composio.sessions.use('trs_test');
    const before = session.config;
    conflict = true;

    await expect(
      session.update({ experimental: { sessionConfigId: 'sc_test' } })
    ).rejects.toBeInstanceOf(ComposioSessionConfigConflictError);

    expect(patchRequests).toHaveLength(1);
    expect(session.config).toBe(before);
    expect(session.configVersion).toBe(7);
    expect(session.experimental.sourceSessionConfig).toBeUndefined();
  });
});
