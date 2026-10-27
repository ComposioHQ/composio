import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import * as tempy from 'tempy';
import { withHttpServer } from 'test/__utils__/http-server';

// Cases that run in-process go through `cli()` (test/src/invocation/invocation.test.ts); these need
// the real process: the bootstrap, the stored login a spawned CLI reads, real HTTP, and signals.
describe('CLI bootstrap', () => {
  it('normalizes telemetry debug before dispatching a background worker', () => {
    const configDirectory = tempy.temporaryDirectory();
    const encodedPayload = Buffer.from(
      JSON.stringify({
        event: 'worker_bootstrap_test',
        sentAt: '2026-08-14T00:00:00.000Z',
        source: 'cli',
        distinctId: 'install_test',
        installId: 'install_test',
      })
    ).toString('base64url');

    const result = spawnSync(
      'bun',
      ['run', 'src/bin.ts', '__analytics-worker', encodedPayload, '--telemetry-debug'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          CI: 'true',
          NO_COLOR: '1',
          COMPOSIO_CACHE_DIR: configDirectory,
        },
      }
    );

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('[telemetry-debug]');
    expect(`${result.stdout}\n${result.stderr}`).toContain('posthog_delivery_skipped');
  });
});

describe('CLI backend of a stored login', () => {
  const STAGING_BASE_URL = 'https://staging-backend.composio.dev';

  /** A cache dir holding a stored login issued by `baseURL`. */
  const storedLogin = (baseURL: string) => {
    const configDirectory = tempy.temporaryDirectory();
    fs.writeFileSync(
      path.join(configDirectory, 'user_data.json'),
      JSON.stringify({ api_key: 'uak_stored', base_url: baseURL, web_url: null, org_id: 'org_1' })
    );
    return configDirectory;
  };

  /** The environment of a spawned CLI: no backend variables from the host, telemetry off. */
  const cliEnv = (configDirectory: string, extra: Record<string, string> = {}) => {
    const {
      COMPOSIO_BASE_URL: _baseURL,
      COMPOSIO_WEB_URL: _webURL,
      COMPOSIO_ENVIRONMENT: _environment,
      COMPOSIO_USER_API_KEY: _apiKey,
      ...host
    } = process.env;
    return {
      ...host,
      CI: '1',
      NO_COLOR: '1',
      HOME: configDirectory,
      COMPOSIO_CACHE_DIR: configDirectory,
      COMPOSIO_CLI_TELEMETRY_DISABLED: '1',
      ...extra,
    };
  };

  it('warns on stderr only when an env var sends the stored key to another backend', () => {
    const configDirectory = storedLogin(STAGING_BASE_URL);

    const result = spawnSync('bun', ['run', 'src/bin.ts', '--version'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: cliEnv(configDirectory, { COMPOSIO_BASE_URL: 'http://127.0.0.1:9' }),
    });

    expect(result.status).toBe(0);
    const warning =
      'COMPOSIO_BASE_URL sends your stored API key to http://127.0.0.1:9, but it was issued by https://staging-backend.composio.dev.';
    expect(result.stderr.split(warning)).toHaveLength(2);
    expect(result.stdout).not.toContain('COMPOSIO_BASE_URL');

    const unset = spawnSync('bun', ['run', 'src/bin.ts', '--version'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: cliEnv(configDirectory),
    });
    expect(unset.stderr).not.toContain('sends your stored API key');
  });

  it('sends requests to the stored backend and explains a rejected key', async () => {
    const requests: Array<{ url?: string; key?: string | string[] }> = [];
    await withHttpServer(
      (req, res) => {
        requests.push({ url: req.url, key: req.headers['x-user-api-key'] });
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            error: {
              message: 'Invalid or revoked user API key',
              code: 1803,
              slug: 'UserApiKey_Unauthorized',
              status: 401,
            },
          })
        );
      },
      async baseURL => {
        const configDirectory = storedLogin(baseURL);
        const child = spawn('bun', ['run', 'src/bin.ts', 'orgs', 'list'], {
          cwd: process.cwd(),
          env: cliEnv(configDirectory),
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => (stdout += String(chunk)));
        child.stderr.on('data', chunk => (stderr += String(chunk)));
        const status = await new Promise<number | null>(resolve => child.on('close', resolve));

        expect(requests.length).toBeGreaterThan(0);
        expect(requests[0]?.key).toBe('uak_stored');
        expect(status).toBe(1);
        expect(stdout).toBe('');
        expect(stderr).toContain('Invalid or revoked user API key');
        expect(stderr).toContain(`composio logout && COMPOSIO_BASE_URL=${baseURL} composio login`);
      }
    );
  });
});

// A stand-in for the backend and the Dashboard: the backend calls `composio execute` makes before
// it runs a tool get minimal answers, and the Dashboard's execute procedures answer per tool slug.
const DashboardRequest = Schema.fromJsonString(
  Schema.Struct({
    json: Schema.Struct({
      tool_slug: Schema.optional(Schema.String),
      slug: Schema.optional(Schema.String),
    }),
  })
);
const decodeDashboardRequest = Schema.decodeUnknownSync(DashboardRequest);

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const dashboardReply = (response: Record<string, unknown>) => ({
  result: { data: { json: { ok: true, response } } },
});

const fakeComposio = (req: IncomingMessage, res: ServerResponse) => {
  const { pathname } = new URL(req.url ?? '/', 'http://127.0.0.1');
  const chunks: Array<Buffer> = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    if (pathname.startsWith('/api/cli/trpc/')) {
      const { json } = decodeDashboardRequest(Buffer.concat(chunks).toString('utf8'));
      const slug = json.tool_slug ?? json.slug;
      if (slug === 'HACKERNEWS_GET_FRONTPAGE') {
        return sendJson(res, 200, dashboardReply({ result_type: 'completed', data: { ok: 1 } }));
      }
      if (slug === 'HACKERNEWS_GET_USER' || slug === 'COMPOSIO_SEARCH_TOOLS') {
        return sendJson(
          res,
          200,
          dashboardReply({ result_type: 'failed', data: {}, error: 'User not found' })
        );
      }
      return sendJson(res, 503, { error: { message: 'Service unavailable' } });
    }
    if (pathname.endsWith('/org/consumer/project/resolve')) {
      return sendJson(res, 200, {
        org_id: 'org_test',
        project_id: 'proj_test',
        project_nano_id: 'pr_test',
        project_name: 'consumer',
        consumer_user_id: 'consumer-user-test',
      });
    }
    const toolSlug = /^\/api\/v3\.1\/tools\/([A-Z_]+)$/u.exec(pathname)?.[1];
    if (toolSlug !== undefined) {
      return sendJson(res, 200, {
        slug: toolSlug,
        name: toolSlug,
        description: '',
        available_versions: ['20260101_00'],
        input_parameters: { type: 'object', properties: {} },
        output_parameters: {},
        tags: [],
      });
    }
    if (pathname.endsWith('/toolkits') || pathname.endsWith('/connected_accounts')) {
      return sendJson(res, 200, { items: [], next_cursor: null, total_pages: 1, current_page: 1 });
    }
    return sendJson(res, 404, { error: { message: `Not found: ${pathname}` } });
  });
};

/** Shorter than the tests' 30s timeout. */
const CLI_DEADLINE_MS = 20_000;

const runCliAgainst = (
  baseUrl: string,
  args: ReadonlyArray<string>,
  options: {
    /** Writes files into the CLI's cache directory before it starts. */
    readonly seed?: (configDirectory: string) => void;
    readonly env?: Readonly<Record<string, string>>;
  } = {}
) => {
  const configDirectory = tempy.temporaryDirectory();
  options.seed?.(configDirectory);
  fs.writeFileSync(
    path.join(configDirectory, 'user_data.json'),
    JSON.stringify({
      api_key: 'uak_test_api_key',
      base_url: baseUrl,
      web_url: baseUrl,
      org_id: 'org_test',
      test_user_id: null,
    })
  );
  // A host key would replace the stored one.
  const {
    COMPOSIO_USER_API_KEY: _apiKey,
    COMPOSIO_ENVIRONMENT: _environment,
    ...host
  } = process.env;
  // Asynchronous: the fake server answers from this process's event loop.
  return new Promise<{ status: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn('bun', ['run', 'src/bin.ts', ...args], {
        cwd: process.cwd(),
        env: {
          ...host,
          CI: '1',
          NO_COLOR: '1',
          COMPOSIO_CACHE_DIR: configDirectory,
          COMPOSIO_BASE_URL: baseUrl,
          COMPOSIO_WEB_URL: baseUrl,
          COMPOSIO_CLI_TELEMETRY_DISABLED: '1',
          ...options.env,
        },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
      // Stop a hung CLI before the test times out, so the fake server can close.
      const deadline = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`CLI did not exit within ${CLI_DEADLINE_MS}ms\nstderr:\n${stderr}`));
      }, CLI_DEADLINE_MS);
      child.once('error', error => {
        clearTimeout(deadline);
        reject(error);
      });
      child.once('close', status => {
        clearTimeout(deadline);
        resolve({ status, stdout, stderr });
      });
    }
  );
};

describe('reported tool execution failures', () => {
  it.each([
    {
      name: 'a tool that reports a failure',
      args: ['execute', 'HACKERNEWS_GET_USER', '-d', '{"username":"nobody"}'],
      stdout: { successful: false, data: {}, error: 'User not found' },
    },
    {
      name: 'a Dashboard outage',
      args: ['execute', 'HACKERNEWS_GET_ITEM', '-d', '{"id":1}'],
      stdout: { successful: false, error: expect.stringContaining('(HTTP 503)') },
    },
    {
      name: 'a meta tool that reports a failure',
      args: ['execute', 'COMPOSIO_SEARCH_TOOLS', '-d', '{"queries":[]}'],
      stdout: { successful: false, data: {}, error: 'User not found' },
    },
    {
      name: 'a parallel run with one failed call',
      args: [
        'execute',
        '--parallel',
        'HACKERNEWS_GET_FRONTPAGE',
        '-d',
        '{}',
        'HACKERNEWS_GET_USER',
        '-d',
        '{"username":"nobody"}',
      ],
      stdout: {
        successful: false,
        parallel: true,
        results: [
          { slug: 'HACKERNEWS_GET_FRONTPAGE', successful: true },
          { slug: 'HACKERNEWS_GET_USER', successful: false, error: 'User not found' },
        ],
      },
    },
  ])(
    '[Given] $name [Then] prints only the JSON result and exits 1',
    ({ args, stdout }) =>
      withHttpServer(fakeComposio, async baseUrl => {
        const result = await runCliAgainst(baseUrl, args);

        expect(JSON.parse(result.stdout)).toMatchObject(stdout);
        expect(result.stderr).toBe('');
        expect(result.status).toBe(1);
      }),
    30_000
  );

  it.each([
    {
      name: 'a successful call',
      args: ['execute', 'HACKERNEWS_GET_FRONTPAGE', '-d', '{}'],
    },
    {
      name: 'a parallel run where every call succeeds',
      args: [
        'execute',
        '--parallel',
        'HACKERNEWS_GET_FRONTPAGE',
        '-d',
        '{}',
        'HACKERNEWS_GET_FRONTPAGE',
        '-d',
        '{}',
      ],
    },
  ])(
    '[Given] $name [Then] exits 0',
    ({ args }) =>
      withHttpServer(fakeComposio, async baseUrl => {
        const result = await runCliAgainst(baseUrl, args);

        expect(JSON.parse(result.stdout)).toMatchObject({ successful: true });
        expect(result.stderr).toBe('');
        expect(result.status).toBe(0);
      }),
    30_000
  );
});

describe('failures a command reports itself', () => {
  it(
    '[Given] a request failure the command reports [Then] prints it once, exits 1, and records the command as failed',
    () =>
      withHttpServer(
        (_req, res) => sendJson(res, 503, { error: { message: 'Service unavailable' } }),
        async baseUrl => {
          const result = await runCliAgainst(baseUrl, ['dev', 'toolkits', 'list'], {
            env: { COMPOSIO_CLI_TELEMETRY_DEBUG: '1' },
          });

          expect(result.status).toBe(1);
          expect(result.stdout).toBe('[]\n');
          expect(result.stderr).toContain('CLI_COMMAND_FAILED');
          expect(result.stderr).not.toContain('CLI_COMMAND_SUCCEEDED');
          expect(result.stderr).not.toContain('ReportedFailure');
        }
      ),
    30_000
  );
});

describe('account selection errors', () => {
  it(
    '[Given] an `--account` that matches no connected account [Then] prints the message as one line and exits 1',
    () =>
      withHttpServer(fakeComposio, async baseUrl => {
        const result = await runCliAgainst(baseUrl, [
          'execute',
          'GMAIL_FETCH_EMAILS',
          '--account',
          'does-not-exist-xyz',
          '-d',
          '{}',
        ]);

        expect(result.status).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr.trim()).toBe(
          'No connected account matched "does-not-exist-xyz" for toolkit "gmail". No active connected accounts were found for that toolkit.'
        );
        expect(result.stderr).not.toContain('💥');
        expect(result.stderr).not.toContain('ConnectedAccountResolutionError');
        expect(result.stderr).not.toContain('composio-cli');
      }),
    30_000
  );
});

describe('expected failures without the crash banner', () => {
  /**
   * The connected-toolkits cache turned on, and fresh with no toolkit connected for the consumer
   * user `fakeComposio` resolves.
   */
  const noConnectedToolkits = {
    env: { COMPOSIO_DISABLE_CONNECTED_ACCOUNT_CACHE: 'false' },
    seed: (configDirectory: string) =>
      fs.writeFileSync(
        path.join(configDirectory, 'consumer-short-term-cache.json'),
        JSON.stringify({
          'org_test:consumer-user-test': {
            toolkits: [],
            // The spawned CLI reads the real clock, so the entry must outlive any test run.
            expiresAt: '2999-01-01T00:00:00.000Z',
          },
        })
      ),
  };

  /** `fakeComposio`, except the consumer project has no consumer user. */
  const withoutConsumerUser = (req: IncomingMessage, res: ServerResponse) =>
    new URL(req.url ?? '/', 'http://127.0.0.1').pathname.endsWith('/org/consumer/project/resolve')
      ? sendJson(res, 200, {
          org_id: 'org_test',
          project_id: 'proj_test',
          project_nano_id: 'pr_test',
          project_name: 'consumer',
          consumer_user_id: '',
        })
      : fakeComposio(req, res);

  const notConnected = (toolkit: string) =>
    `Toolkit "${toolkit}" is not connected for this user (cached within the last 5 minutes). If you just connected the account, use --skip-connection-check.`;

  it.each([
    {
      name: '`login --poll` without a pending login',
      args: ['login', '--poll'],
      setup: {},
      server: fakeComposio,
      tag: 'PendingLoginError',
      message: 'No pending login found. Run `composio login < /dev/null` first.',
    },
    {
      name: '`execute --file` for a tool without a file input',
      args: ['execute', 'GMAIL_FETCH_EMAILS', '--file', 'report.pdf', '-d', '{}'],
      setup: {},
      server: fakeComposio,
      tag: 'ToolExecutionError',
      message:
        'Tool "GMAIL_FETCH_EMAILS" has no file_uploadable input. Remove --file or pass JSON via -d.',
    },
    {
      name: '`proxy` without a consumer user',
      args: [
        'proxy',
        'https://gmail.googleapis.com/gmail/v1/users/me/profile',
        '--toolkit',
        'gmail',
      ],
      setup: {},
      server: withoutConsumerUser,
      tag: 'ProxyCommandError',
      message: 'No consumer project user is available for proxy execution in this context.',
    },
  ])(
    '[Given] $name [Then] prints the message without the banner and exits 1',
    ({ args, setup, server, tag, message }) =>
      withHttpServer(server, async baseUrl => {
        const result = await runCliAgainst(baseUrl, args, setup);

        expect(result.status).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr.trim()).toBe(message);
        expect(result.stderr).not.toContain('💥');
        expect(result.stderr).not.toContain(tag);
        expect(result.stderr).not.toContain('composio-cli');
      }),
    30_000
  );

  it.each([
    {
      name: '`execute` with a toolkit that is not connected',
      args: ['execute', 'GMAIL_FETCH_EMAILS', '-d', '{}'],
    },
    {
      name: '`proxy` with a toolkit that is not connected',
      args: [
        'proxy',
        'https://gmail.googleapis.com/gmail/v1/users/me/profile',
        '--toolkit',
        'gmail',
      ],
    },
  ])(
    '[Given] $name [Then] prints only the failed result and exits 1',
    ({ args }) =>
      withHttpServer(fakeComposio, async baseUrl => {
        const result = await runCliAgainst(baseUrl, args, noConnectedToolkits);

        expect(result.status).toBe(1);
        expect(JSON.parse(result.stdout)).toMatchObject({
          successful: false,
          error: notConnected('gmail'),
        });
        expect(result.stderr).toBe('');
      }),
    30_000
  );
});

describe('signals', () => {
  /**
   * Runs `composio orgs list` against a backend that never answers, sends `signal` once the
   * request arrives, and reports how the process ended.
   */
  const signalBlockedCommand = async (signal: NodeJS.Signals) => {
    let child: ReturnType<typeof spawn> | undefined;
    let ended: { code: number | null; signal: NodeJS.Signals | null } | undefined;
    // Holds every request open: the command blocks until the signal ends it.
    await withHttpServer(
      () => child?.kill(signal),
      async baseUrl => {
        const configDirectory = tempy.temporaryDirectory();
        fs.writeFileSync(
          path.join(configDirectory, 'user_data.json'),
          JSON.stringify({ api_key: 'uak_test', base_url: baseUrl, web_url: baseUrl, org_id: null })
        );
        const {
          COMPOSIO_USER_API_KEY: _apiKey,
          COMPOSIO_ENVIRONMENT: _environment,
          ...host
        } = process.env;
        const spawned = spawn('bun', ['run', 'src/bin.ts', 'orgs', 'list'], {
          cwd: process.cwd(),
          env: {
            ...host,
            CI: '1',
            NO_COLOR: '1',
            COMPOSIO_CACHE_DIR: configDirectory,
            COMPOSIO_BASE_URL: baseUrl,
            COMPOSIO_CLI_TELEMETRY_DISABLED: '1',
          },
          stdio: 'ignore',
        });
        child = spawned;
        ended = await new Promise((resolve, reject) => {
          const deadline = setTimeout(() => {
            spawned.kill('SIGKILL');
            reject(new Error(`CLI did not exit within ${CLI_DEADLINE_MS}ms after ${signal}`));
          }, CLI_DEADLINE_MS);
          spawned.once('close', (code, endSignal) => {
            clearTimeout(deadline);
            resolve({ code, signal: endSignal });
          });
        });
      }
    );
    return ended;
  };

  it.each([
    { signal: 'SIGINT', code: 130 },
    { signal: 'SIGTERM', code: 143 },
    { signal: 'SIGHUP', code: 129 },
  ] as const)(
    '[Given] a one-shot command waiting on the backend [When] it receives $signal [Then] it exits $code',
    async ({ signal, code }) => {
      expect(await signalBlockedCommand(signal)).toEqual({ code, signal: null });
    },
    30_000
  );
});
