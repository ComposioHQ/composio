import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from '@effect/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { APIError } from '@composio/client';
import { ConfigProvider, Effect, Exit, Option } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import * as composioClients from 'src/services/composio-clients';
import * as consumerShortTermCache from 'src/services/consumer-short-term-cache';
import * as toolPermissions from 'src/services/tool-permissions';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import {
  dashboardProcedureError,
  dashboardProcedureResult,
  type DashboardTestRequest,
  type TestLiveInput,
} from 'test/__utils__/services/test-layer';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
}));

// `src/ui/redact` reads `CI` once at import time; clear it before the imports
// above run so both transports print the same unredacted values everywhere.
vi.hoisted(() => {
  delete process.env.CI;
});

const DEFAULT_DASHBOARD = 'https://dashboard.composio.dev';

const configProvider = (env: Record<string, string> = {}) =>
  ConfigProvider.fromEnv({ env: { COMPOSIO_USER_API_KEY: 'test_api_key', ...env } }).pipe(
    extendConfigProvider
  );

/** A custom backend with no web URL: the one consumer setup that stays on the backend. */
const backendOnlyEnv = { COMPOSIO_BASE_URL: 'https://composio.internal.example' };

type ToolRouterCall = { readonly method: 'create' | 'execute' | 'executeMeta' } & Record<
  string,
  unknown
>;

/**
 * One isolated CLI world: a Dashboard that records what it is sent, and a
 * backend Tool Router that records what it is asked to do.
 */
const makeWorld = (options: {
  readonly env?: Record<string, string>;
  readonly dashboard?: (request: DashboardTestRequest) => Response | Promise<Response>;
  readonly backendExecute?: () => Promise<{
    data: Record<string, unknown>;
    error: string | null;
    log_id: string;
  }>;
  readonly input?: Partial<TestLiveInput>;
}) => {
  const dashboardRequests: Array<DashboardTestRequest> = [];
  const toolRouterCalls: Array<ToolRouterCall> = [];
  const backendResponse = async (data: Record<string, unknown>) =>
    options.backendExecute ? options.backendExecute() : { data, error: null, log_id: 'log_test' };

  const layer = TestLive({
    baseConfigProvider: configProvider(options.env),
    fixture: 'global-test-user-id',
    stdin: { isTTY: true, data: '' },
    dashboard: {
      respond: request => {
        dashboardRequests.push(request);
        return options.dashboard
          ? options.dashboard(request)
          : dashboardProcedureResult({
              ok: true,
              response: { data: { id: 'msg_1' }, error: null, log_id: 'log_test' },
            });
      },
    },
    toolRouter: {
      create: async params => {
        toolRouterCalls.push({ method: 'create', params });
        return {
          session_id: 'trs_backend_session',
          config: { user_id: params.user_id },
          mcp: { type: 'http' as const, url: 'https://mcp.test.composio.dev' },
          tool_router_tools: [],
        } as never;
      },
      execute: async (sessionId, params, requestOptions) => {
        toolRouterCalls.push({ method: 'execute', sessionId, params, requestOptions });
        return backendResponse({ id: 'msg_1' });
      },
      executeMeta: async (sessionId, params, requestOptions) => {
        toolRouterCalls.push({ method: 'executeMeta', sessionId, params, requestOptions });
        return backendResponse({ id: 'msg_1' });
      },
    },
    ...options.input,
  });

  /** Runs the CLI and returns everything it printed, plus how it exited. */
  const run = (args: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      const exit = yield* cli(args).pipe(Effect.exit);
      const lines = yield* MockConsole.getLines({ stripAnsi: true });
      return { exit, lines, output: lines.join('\n') };
    }).pipe(Effect.provide(layer), Effect.scoped);

  return { run, dashboardRequests, toolRouterCalls };
};

const lastJson = (lines: ReadonlyArray<string>): Record<string, unknown> => {
  for (const line of [...lines].reverse()) {
    if (!line.trimStart().startsWith('{')) continue;
    const parsed: unknown = JSON.parse(line);
    return parsed as Record<string, unknown>;
  }
  throw new Error('Expected JSON output but none found');
};

const requestJson = (request: DashboardTestRequest | undefined) =>
  (request?.body as { json: Record<string, unknown> } | undefined)?.json;

const EXECUTE_GMAIL = [
  'execute',
  'GMAIL_SEND_EMAIL',
  '--skip-connection-check',
  '-d',
  '{"recipient":"a"}',
] as const;

const walletExhausted = {
  message: 'Your wallet balance is too low to run this tool.',
  code: 4020,
  slug: 'Wallet_InsufficientBalance',
  status: 402,
  request_id: 'req_wallet',
  suggested_fix: 'Add credits in the dashboard, then retry.',
};

describe('CLI: composio execute transport', () => {
  beforeEach(() => {
    vi.spyOn(composioClients, 'getLatestToolVersion').mockImplementation(() =>
      Effect.fail(new composioClients.HttpServerError({}))
    );
    vi.spyOn(consumerShortTermCache, 'getFreshConsumerConnectedToolkitsFromCache').mockReturnValue(
      Effect.succeed(Option.some(['gmail', 'github']))
    );
    vi.spyOn(consumerShortTermCache, 'refreshConsumerConnectedToolkitsCache').mockImplementation(
      () => Effect.succeed(['gmail', 'github'])
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.effect('sends a consumer execution to the Dashboard and prints what the backend prints', () =>
    Effect.gen(function* () {
      const viaDashboard = makeWorld({});
      const viaBackend = makeWorld({ env: backendOnlyEnv });

      const dashboardRun = yield* viaDashboard.run(EXECUTE_GMAIL);
      const backendRun = yield* viaBackend.run(EXECUTE_GMAIL);

      expect(viaDashboard.dashboardRequests).toHaveLength(1);
      const [request] = viaDashboard.dashboardRequests;
      expect(request?.method).toBe('POST');
      expect(request?.url).toBe(`${DEFAULT_DASHBOARD}/api/cli/trpc/execute`);
      expect(request?.headers['authorization']).toBe('Bearer test_api_key');
      expect(request?.headers['x-org-id']).toBe('org_test');
      expect(requestJson(request)).toEqual({
        tool_slug: 'GMAIL_SEND_EMAIL',
        arguments: { recipient: 'a' },
        session: { manage_connections: { enable: true } },
      });
      // The Dashboard owns the session: none is created or executed on the backend.
      expect(viaDashboard.toolRouterCalls).toEqual([]);

      expect(Exit.isSuccess(dashboardRun.exit)).toBe(true);
      expect(lastJson(dashboardRun.lines)).toEqual({
        successful: true,
        data: { id: 'msg_1' },
        error: null,
        logId: 'log_test',
      });
      expect(dashboardRun.lines).toEqual(backendRun.lines);
    })
  );

  it.effect('keeps the backend transport for a custom backend with no web URL', () =>
    Effect.gen(function* () {
      const world = makeWorld({ env: backendOnlyEnv });

      const { exit } = yield* world.run(EXECUTE_GMAIL);

      expect(Exit.isSuccess(exit)).toBe(true);
      expect(world.dashboardRequests).toEqual([]);
      expect(world.toolRouterCalls.map(call => call.method)).toEqual(['create', 'execute']);
      // An execution is never retried: a retry after the backend already acted
      // would duplicate the side effect.
      expect(world.toolRouterCalls.at(-1)?.requestOptions).toEqual({ maxRetries: 0 });
    })
  );

  it.effect('never retries a meta tool execution on the backend transport', () =>
    Effect.gen(function* () {
      const world = makeWorld({ env: backendOnlyEnv });

      yield* world.run(['execute', 'COMPOSIO_SEARCH_TOOLS', '-d', '{"query":"email"}']);

      expect(world.dashboardRequests).toEqual([]);
      expect(world.toolRouterCalls.at(-1)).toMatchObject({
        method: 'executeMeta',
        requestOptions: { maxRetries: 0 },
      });
    })
  );

  for (const webURL of [
    'https://dashboard.internal.example',
    'https://dashboard.internal.example/',
  ]) {
    it.effect(`uses the Dashboard at ${webURL} when both URLs are overridden`, () =>
      Effect.gen(function* () {
        // This is also the environment a `composio run` script's `execute()`
        // gives its child CLI: the parent forwards both URLs.
        const world = makeWorld({ env: { ...backendOnlyEnv, COMPOSIO_WEB_URL: webURL } });

        yield* world.run(EXECUTE_GMAIL);

        expect(world.dashboardRequests.map(request => request.url)).toEqual([
          'https://dashboard.internal.example/api/cli/trpc/execute',
        ]);
        expect(world.toolRouterCalls).toEqual([]);
      })
    );
  }

  it.effect('sends a meta tool to the executeMeta procedure', () =>
    Effect.gen(function* () {
      const world = makeWorld({});

      const { exit } = yield* world.run([
        'execute',
        'COMPOSIO_SEARCH_TOOLS',
        '-d',
        '{"query":"email"}',
      ]);

      expect(Exit.isSuccess(exit)).toBe(true);
      expect(world.dashboardRequests.map(request => request.url)).toEqual([
        `${DEFAULT_DASHBOARD}/api/cli/trpc/executeMeta`,
      ]);
      expect(requestJson(world.dashboardRequests[0])).toMatchObject({
        slug: 'COMPOSIO_SEARCH_TOOLS',
        arguments: { query: 'email' },
      });
      expect(world.toolRouterCalls).toEqual([]);
    })
  );

  it.effect('sends each parallel tool on its own and keeps the siblings of a failed one', () =>
    Effect.gen(function* () {
      const world = makeWorld({
        dashboard: request =>
          requestJson(request)?.tool_slug === 'GITHUB_CREATE_ISSUE'
            ? dashboardProcedureResult({
                ok: false,
                status: 400,
                error: {
                  message: 'Repository not found',
                  code: 1803,
                  slug: 'Tool_Failed',
                  status: 400,
                  request_id: 'req_parallel',
                },
              })
            : dashboardProcedureResult({
                ok: true,
                response: {
                  data: { ran: requestJson(request)?.tool_slug },
                  error: null,
                  log_id: 'log_parallel',
                },
              }),
      });

      const { exit, lines } = yield* world.run([
        'execute',
        '--parallel',
        '--skip-checks',
        'GMAIL_SEND_EMAIL',
        '-d',
        '{"recipient":"a"}',
        'GITHUB_CREATE_ISSUE',
        '-d',
        '{"title":"Bug"}',
        'GMAIL_CREATE_EMAIL_DRAFT',
        '-d',
        '{"recipient":"b"}',
      ]);

      expect(Exit.isFailure(exit)).toBe(true);
      expect(
        world.dashboardRequests.map(request => requestJson(request)?.tool_slug).sort()
      ).toEqual(['GITHUB_CREATE_ISSUE', 'GMAIL_CREATE_EMAIL_DRAFT', 'GMAIL_SEND_EMAIL']);
      expect(world.toolRouterCalls).toEqual([]);
      expect(lastJson(lines).results).toEqual([
        expect.objectContaining({ slug: 'GMAIL_SEND_EMAIL', successful: true }),
        { slug: 'GITHUB_CREATE_ISSUE', successful: false, error: 'Repository not found' },
        expect.objectContaining({ slug: 'GMAIL_CREATE_EMAIL_DRAFT', successful: true }),
      ]);
    })
  );

  it.effect('keeps `dev playground-execute` on the backend', () =>
    Effect.gen(function* () {
      const world = makeWorld({});

      const { exit, output } = yield* world.run([
        'dev',
        'playground-execute',
        'GMAIL_SEND_EMAIL',
        '--skip-connection-check',
        '-d',
        '{"recipient":"a"}',
      ]);

      expect(output).toContain('msg_1');
      expect(Exit.isSuccess(exit)).toBe(true);
      expect(world.dashboardRequests).toEqual([]);
      expect(world.toolRouterCalls.map(call => call.method)).toEqual(['create', 'execute']);
    })
  );

  it.effect('resolves the project and uploads files on the backend before the Dashboard call', () =>
    Effect.gen(function* () {
      const events: Array<string> = [];
      const tempFile = path.join(os.tmpdir(), `composio-upload-${crypto.randomUUID()}.txt`);
      fs.writeFileSync(tempFile, 'hello from cli upload', 'utf8');
      const originalFetch = globalThis.fetch;
      vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url === 'https://s3.test.composio.dev/upload') {
          events.push('backend:file-upload');
          return Promise.resolve(new Response(null, { status: 200 }));
        }
        return originalFetch(input, init);
      });

      const world = makeWorld({
        dashboard: () => {
          events.push('dashboard:execute');
          return dashboardProcedureResult({
            ok: true,
            response: { data: {}, error: null, log_id: 'log_upload' },
          });
        },
        input: {
          accountData: { onRequest: request => events.push(`backend:${request.operation}`) },
          toolkitsData: {
            tools: [
              {
                name: 'Send Email',
                slug: 'GMAIL_SEND_EMAIL',
                description: 'Send an email with attachment',
                tags: ['email'],
                available_versions: ['20260316_00'],
                input_parameters: {
                  type: 'object',
                  properties: {
                    recipient_email: { type: 'string' },
                    attachment: { file_uploadable: true, title: 'Attachment' },
                  },
                },
                output_parameters: { type: 'object', properties: {} },
              },
            ],
          } satisfies TestLiveInput['toolkitsData'],
        },
      });

      const { exit } = yield* world.run([
        'execute',
        'GMAIL_SEND_EMAIL',
        '-d',
        JSON.stringify({ recipient_email: 'a@b.com', attachment: tempFile }),
      ]);
      fs.rmSync(tempFile, { force: true });

      expect(Exit.isSuccess(exit)).toBe(true);
      expect(events).toContain('backend:org.consumer.project.resolve');
      expect(events).toContain('backend:file-upload');
      expect(events.at(-1)).toBe('dashboard:execute');
      expect(events.filter(event => event === 'dashboard:execute')).toHaveLength(1);
      // The Dashboard receives the uploaded file reference, not the local path.
      expect(requestJson(world.dashboardRequests[0])?.arguments).toEqual({
        recipient_email: 'a@b.com',
        attachment: {
          name: path.basename(tempFile),
          mimetype: 'application/octet-stream',
          s3key: `uploads/${path.basename(tempFile)}`,
        },
      });
    })
  );

  it.effect('sends nothing to the Dashboard when the permission gate denies the tool', () =>
    Effect.gen(function* () {
      // Enhanced controls ask before every call; with no one to answer the
      // prompt (as under test), the gate denies.
      vi.spyOn(toolPermissions, 'getConsumerPermissionSnapshot').mockImplementation(params =>
        Effect.succeed({
          orgId: params.orgId,
          projectId: params.projectId,
          consumerUserId: params.consumerUserId,
          enhancedControlsEnabled: true,
          permissions: { default: 'ask_every_call' as const, overrides: {} },
          connectedAccountIds: [],
          fetchedAt: 1_767_225_600_000,
        })
      );
      const world = makeWorld({});

      const { exit, output } = yield* world.run(EXECUTE_GMAIL);

      expect(Exit.isFailure(exit)).toBe(true);
      expect(output).toContain('requires interactive approval');
      expect(world.dashboardRequests).toEqual([]);
      expect(world.toolRouterCalls).toEqual([]);
    })
  );

  it.effect('reports a relayed wallet failure exactly as the backend transport does', () =>
    Effect.gen(function* () {
      const viaDashboard = makeWorld({
        dashboard: () =>
          dashboardProcedureResult({ ok: false, status: 402, error: walletExhausted }),
      });
      const viaBackend = makeWorld({
        env: backendOnlyEnv,
        backendExecute: () =>
          Promise.reject(
            APIError.generate(402, { error: walletExhausted }, undefined, new Headers())
          ),
      });

      const dashboardRun = yield* viaDashboard.run(EXECUTE_GMAIL);
      const backendRun = yield* viaBackend.run(EXECUTE_GMAIL);

      expect(Exit.isFailure(dashboardRun.exit)).toBe(true);
      expect(dashboardRun.output).toContain(walletExhausted.message);
      expect(dashboardRun.output).toContain('Error details');
      expect(dashboardRun.output).toContain(walletExhausted.suggested_fix);
      expect(lastJson(dashboardRun.lines)).toEqual({
        successful: false,
        error: walletExhausted.message,
        slug: walletExhausted.slug,
      });
      expect(dashboardRun.lines).toEqual(backendRun.lines);
      expect(viaDashboard.dashboardRequests).toHaveLength(1);
    })
  );

  it.effect('shows the `composio link` tip for a relayed missing-connection error', () =>
    Effect.gen(function* () {
      const world = makeWorld({
        dashboard: () =>
          dashboardProcedureResult({
            ok: false,
            status: 400,
            error: {
              message: "No active connection found for toolkit(s) 'gmail' in this session",
              code: 4302,
              slug: 'ToolRouterV2_NoActiveConnection',
              status: 400,
              request_id: 'req_no_connection',
            },
          }),
      });

      const { exit, output } = yield* world.run(EXECUTE_GMAIL);

      expect(Exit.isFailure(exit)).toBe(true);
      expect(output).toContain('Run `composio link gmail`, then retry.');
      expect(output).toContain('Tips');
    })
  );

  it.effect('suggests `composio login` when the Dashboard rejects the credentials', () =>
    Effect.gen(function* () {
      const world = makeWorld({
        dashboard: () =>
          dashboardProcedureError({
            code: 'UNAUTHORIZED',
            httpStatus: 401,
            message: 'Invalid API key',
          }),
      });

      const { exit, lines, output } = yield* world.run(EXECUTE_GMAIL);

      expect(Exit.isFailure(exit)).toBe(true);
      expect(output).toContain('Authentication failed: Invalid API key');
      expect(output).toContain('composio login');
      expect(lastJson(lines)).toMatchObject({ successful: false });
      expect(world.dashboardRequests).toHaveLength(1);
      expect(world.toolRouterCalls).toEqual([]);
    })
  );

  const unreachable: ReadonlyArray<{
    readonly name: string;
    readonly dashboard: () => Response | Promise<Response>;
  }> = [
    {
      name: 'the Dashboard cannot be reached',
      dashboard: () => Promise.reject(new Error('connect ECONNREFUSED')),
    },
    {
      name: 'the Dashboard answers with something other than JSON',
      dashboard: () => new Response('<html>Bad gateway</html>', { status: 502 }),
    },
  ];

  for (const testCase of unreachable) {
    it.effect(`names the Dashboard and does not resend or fall back when ${testCase.name}`, () =>
      Effect.gen(function* () {
        const world = makeWorld({ dashboard: testCase.dashboard });

        const { exit, output } = yield* world.run(EXECUTE_GMAIL);

        expect(Exit.isFailure(exit)).toBe(true);
        expect(output).toContain('dashboard.composio.dev');
        expect(output).toContain('was not retried');
        expect(world.dashboardRequests).toHaveLength(1);
        expect(world.toolRouterCalls).toEqual([]);
      })
    );
  }
});
