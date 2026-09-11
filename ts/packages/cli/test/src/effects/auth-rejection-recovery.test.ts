import { describe, expect, it, layer } from '@effect/vitest';
import { afterEach, vi } from 'vitest';
import { ConfigProvider, DateTime, Effect } from 'effect';
import * as FileSystem from 'effect/FileSystem';
import path from 'node:path';
import * as constants from 'src/constants';
import { reloginWithBrowser } from 'src/commands/login.cmd';
import {
  decideAuthRejectionRecovery,
  reportAuthRejection,
} from 'src/effects/auth-rejection-recovery';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { type AuthRejection, AuthRejectionRecorder } from 'src/services/auth-rejection';
import { ComposioSessionRepository, HttpServerError } from 'src/services/composio-clients';
import { extendConfigProvider } from 'src/services/config';
import { getTerminalCapabilities, TerminalUI } from 'src/services/terminal-ui';
import { type BackendOverrides, resolveBackend } from 'src/utils/backend-resolution';
import { MockConsole, TestLive } from 'test/__utils__';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';

vi.mock('open', () => ({
  default: vi.fn(async () => undefined),
}));

vi.mock('src/analytics/dispatch', async importOriginal => {
  const actual = await importOriginal<typeof import('src/analytics/dispatch')>();
  const { Effect } = await import('effect');
  return {
    ...actual,
    analyticsIdentityLinkingEnabled: Effect.succeed(false),
    linkApolloIdentityForAnalytics: (() =>
      Effect.void) as unknown as typeof actual.linkApolloIdentityForAnalytics,
  };
});

const { DEFAULT_BASE_URL, STAGING_BASE_URL, STAGING_WEB_URL } = constants;
const CUSTOM_BASE_URL = 'http://localhost:9900';

const noOverrides: BackendOverrides = {
  baseURL: undefined,
  webURL: undefined,
  environment: undefined,
};

const storedStaging = { baseURL: STAGING_BASE_URL, webURL: STAGING_WEB_URL };

describe('decideAuthRejectionRecovery', () => {
  const decide = (params: {
    readonly rejection: AuthRejection;
    readonly overrides?: BackendOverrides;
    readonly stored?: { readonly baseURL: string; readonly webURL: string };
    readonly canPromptForLogin?: boolean;
    readonly invocationOrigin?: string;
  }) =>
    decideAuthRejectionRecovery({
      rejection: params.rejection,
      backend: resolveBackend({
        overrides: params.overrides ?? noOverrides,
        stored: params.stored ?? storedStaging,
        keySource: params.rejection.keySource,
      }),
      canPromptForLogin: params.canPromptForLogin ?? false,
      invocationOrigin: params.invocationOrigin,
    });

  it('Covers AE5. [Given] a rejected stored staging key and no prompt [Then] spells out the staging login', () => {
    const recovery = decide({ rejection: { baseURL: STAGING_BASE_URL, keySource: 'stored' } });

    expect(recovery.kind).toBe('message');
    expect(recovery.message).toBe(
      'The Composio API at staging-backend.composio.dev rejected your stored API key.'
    );
    expect(recovery.nextStep).toContain('`COMPOSIO_ENVIRONMENT=staging composio login`');
  });

  it('[Given] a rejected stored production key [Then] suggests a bare composio login', () => {
    const recovery = decide({
      rejection: { baseURL: DEFAULT_BASE_URL, keySource: 'stored' },
      stored: { baseURL: DEFAULT_BASE_URL, webURL: constants.DEFAULT_WEB_URL },
    });

    expect(recovery.nextStep).toContain('Run `composio login` to log in again');
  });

  it('[Given] a rejected key stored for a custom host [Then] spells out COMPOSIO_BASE_URL', () => {
    const recovery = decide({
      rejection: { baseURL: CUSTOM_BASE_URL, keySource: 'stored' },
      stored: { baseURL: CUSTOM_BASE_URL, webURL: 'http://localhost:3000/' },
    });

    expect(recovery.nextStep).toContain(`\`COMPOSIO_BASE_URL=${CUSTOM_BASE_URL} composio login\``);
  });

  it('[Given] an interactive session [Then] offers re-login against the stored backend', () => {
    const recovery = decide({
      rejection: { baseURL: STAGING_BASE_URL, keySource: 'stored' },
      canPromptForLogin: true,
    });

    expect(recovery).toMatchObject({ kind: 'offer-relogin', target: storedStaging });
  });

  it('Covers AE3. [Given] COMPOSIO_BASE_URL points away from the stored backend [Then] explains the mismatch without re-login', () => {
    const recovery = decide({
      rejection: { baseURL: DEFAULT_BASE_URL, keySource: 'stored' },
      overrides: { ...noOverrides, baseURL: DEFAULT_BASE_URL },
      canPromptForLogin: true,
    });

    expect(recovery.kind).toBe('message');
    expect(recovery.message).toContain('backend.composio.dev');
    expect(recovery.message).toContain('staging-backend.composio.dev');
    expect(recovery.message).toContain('COMPOSIO_BASE_URL');
    expect(recovery.nextStep).toBe('Unset COMPOSIO_BASE_URL to use that login.');
  });

  it('Covers AE6. [Given] a rejected COMPOSIO_USER_API_KEY [Then] asks to replace it without re-login', () => {
    const recovery = decide({
      rejection: { baseURL: DEFAULT_BASE_URL, keySource: 'env' },
      canPromptForLogin: true,
    });

    expect(recovery.kind).toBe('message');
    expect(recovery.message).toContain('COMPOSIO_USER_API_KEY');
    expect(recovery.nextStep).toBe('Replace its value with a valid user API key.');
  });

  it('Covers AE8. [Given] a composio run child call [Then] asks to run composio login', () => {
    const recovery = decide({
      rejection: { baseURL: STAGING_BASE_URL, keySource: 'env' },
      invocationOrigin: 'run',
      canPromptForLogin: true,
    });

    expect(recovery.kind).toBe('message');
    expect(recovery.nextStep).toContain('`COMPOSIO_ENVIRONMENT=staging composio login`');
    expect(`${recovery.message} ${recovery.nextStep}`).not.toContain('COMPOSIO_USER_API_KEY');
  });

  it('[Given] a stored key rejected inside composio run [Then] never offers re-login', () => {
    const recovery = decide({
      rejection: { baseURL: STAGING_BASE_URL, keySource: 'stored' },
      invocationOrigin: 'run',
      canPromptForLogin: true,
    });

    expect(recovery.kind).toBe('message');
  });
});

describe('reportAuthRejection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const stagingLogin = {
    api_key: 'uak_old',
    base_url: STAGING_BASE_URL,
    web_url: STAGING_WEB_URL,
    org_id: 'org_prev',
    test_user_id: 'pg-test-prev',
  };

  const stagingRejection: AuthRejection = { baseURL: STAGING_BASE_URL, keySource: 'stored' };

  const confirmCalls: string[] = [];
  // `ui.output` is the stdout data channel; the test UI's other methods also
  // log through `Console.log`, so stdout writes are captured here instead.
  const stdoutWrites: string[] = [];
  const interactiveUI = (answer: boolean) =>
    TerminalUI.of({
      ...terminalUITestImpl,
      output: data =>
        Effect.sync(() => {
          stdoutWrites.push(data);
        }),
      capabilities: Effect.succeed(
        getTerminalCapabilities({
          stdin: { isTTY: true },
          stdout: { isTTY: true },
          stderr: { isTTY: true },
        })
      ),
      confirm: message =>
        Effect.sync(() => {
          confirmCalls.push(message);
          return answer;
        }),
    });

  const report = reportAuthRejection({ relogin: target => reloginWithBrowser({ target }) });

  const recordThenReport = (rejection: AuthRejection) =>
    Effect.gen(function* () {
      const recorder = yield* AuthRejectionRecorder;
      yield* recorder.record(rejection);
      yield* report;
    });

  const readStoredUserConfig = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const cacheDir = yield* setupCacheDir;
    return JSON.parse(
      yield* fs.readFileString(path.join(cacheDir, constants.USER_CONFIG_FILE_NAME), 'utf8')
    ) as Record<string, unknown>;
  });

  const sessionInfoFor = (orgId: string, memberId: string) => ({
    project: {
      name: 'Project',
      id: `project_${orgId}`,
      org_id: orgId,
      nano_id: `pr_${orgId}`,
      email: 'project@example.com',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      org: { id: orgId, name: `Org ${orgId}`, plan: 'enterprise' },
    },
    org_member: {
      id: memberId,
      user_id: 'user_new',
      email: 'cli@example.com',
      name: 'CLI User',
      role: 'admin',
    },
    api_key: null,
  });

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  // Session info succeeds for the default org; for `x-org-id` it succeeds only
  // when `previousOrgAccessible`.
  const mockSessionInfo = (params: { readonly previousOrgAccessible: boolean }) => {
    const requestedOrigins: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      requestedOrigins.push(new URL(url).origin);
      const orgId = new Headers(init?.headers).get('x-org-id');
      if (orgId === null) return jsonResponse(sessionInfoFor('org_default', 'member_default'));
      return params.previousOrgAccessible
        ? jsonResponse(sessionInfoFor(orgId, 'member_prev'))
        : jsonResponse({ error: { message: 'Forbidden', status: 403 } }, 403);
    });
    return requestedOrigins;
  };

  const linkedSessionRepository = (params: { readonly failCreate?: boolean } = {}) =>
    Effect.gen(function* () {
      const expiresAt = DateTime.add(yield* DateTime.now, { minutes: 10 });
      const createCalls: Array<string | undefined> = [];
      const repository = ComposioSessionRepository.of({
        createSession: options => {
          createCalls.push(options?.baseURL);
          return params.failCreate
            ? Effect.fail(new HttpServerError({ status: 503, cause: 'unavailable' }))
            : Effect.succeed({
                id: 'relogin-session',
                code: '001122',
                expiresAt,
                status: 'pending',
              });
        },
        getSession: () =>
          Effect.succeed({
            id: 'relogin-session',
            code: '001122',
            expiresAt,
            status: 'linked',
            api_key: 'uak_new',
            account: { id: 'account', name: 'CLI User', email: 'cli@example.com' },
          }),
        getRealtimeCredentials: () => Effect.die(new Error('test: unused')),
        authRealtimeChannel: () => Effect.die(new Error('test: unused')),
      });
      return { repository, createCalls };
    });

  layer(TestLive({ userData: stagingLogin }))(it => {
    it.effect('[Given] no recorded rejection [Then] prints nothing', () =>
      Effect.gen(function* () {
        yield* report;
        expect(yield* MockConsole.getLines()).toEqual([]);
      })
    );
  });

  layer(TestLive({ userData: stagingLogin }))(it => {
    it.effect(
      'Covers AE5. [Given] stderr is not a terminal [Then] writes one undecorated line with the staging login step',
      () =>
        Effect.gen(function* () {
          yield* recordThenReport(stagingRejection);

          const stderr = yield* MockConsole.getLines({ stream: 'stderr' });
          expect(stderr).toEqual([
            'The Composio API at staging-backend.composio.dev rejected your stored API key. Run `COMPOSIO_ENVIRONMENT=staging composio login` to log in again, then re-run the command.',
          ]);
          expect(yield* MockConsole.getLines({ stream: 'stdout' })).toEqual([]);
        })
    );
  });

  layer(TestLive({ userData: stagingLogin, terminalUI: interactiveUI(true) }))(it => {
    it.effect('[Given] CI or Vitest with a terminal [Then] does not prompt', () =>
      Effect.gen(function* () {
        vi.stubEnv('CI', 'true');
        confirmCalls.length = 0;

        yield* recordThenReport(stagingRejection);

        expect(confirmCalls).toEqual([]);
        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain('COMPOSIO_ENVIRONMENT=staging composio login');
      })
    );
  });

  const stagingOverrideToProduction = ConfigProvider.fromEnvRecord({
    COMPOSIO_BASE_URL: DEFAULT_BASE_URL,
  }).pipe(extendConfigProvider);

  layer(
    TestLive({
      userData: stagingLogin,
      terminalUI: interactiveUI(true),
      baseConfigProvider: stagingOverrideToProduction,
    })
  )(it => {
    it.effect(
      'Covers AE3. [Given] a mismatch in a terminal [Then] explains it and never prompts',
      () =>
        Effect.gen(function* () {
          vi.stubEnv('COMPOSIO_DISABLE_PERMISSION_UI', '0');
          confirmCalls.length = 0;

          yield* recordThenReport({ baseURL: DEFAULT_BASE_URL, keySource: 'stored' });

          expect(confirmCalls).toEqual([]);
          const output = (yield* MockConsole.getLines()).join('\n');
          expect(output).toContain('COMPOSIO_BASE_URL points the CLI at backend.composio.dev');
          expect(output).toContain('Unset COMPOSIO_BASE_URL');
        })
    );
  });

  layer(TestLive({ userData: stagingLogin, terminalUI: interactiveUI(true) }))(it => {
    it.effect(
      'Covers AE4. [Given] an accepted re-login [Then] replaces the key, keeps staging and the org, and asks to re-run',
      () =>
        Effect.gen(function* () {
          vi.stubEnv('COMPOSIO_DISABLE_PERMISSION_UI', '0');
          confirmCalls.length = 0;
          stdoutWrites.length = 0;
          const requestedOrigins = mockSessionInfo({ previousOrgAccessible: true });
          const { repository, createCalls } = yield* linkedSessionRepository();

          yield* recordThenReport(stagingRejection).pipe(
            Effect.provideService(ComposioSessionRepository, repository)
          );

          expect(confirmCalls).toEqual(['Log in again to staging-backend.composio.dev?']);
          expect(createCalls).toEqual([STAGING_BASE_URL]);
          expect(new Set(requestedOrigins)).toEqual(new Set([STAGING_BASE_URL]));
          expect(yield* readStoredUserConfig).toMatchObject({
            api_key: 'uak_new',
            base_url: STAGING_BASE_URL,
            web_url: STAGING_WEB_URL,
            org_id: 'org_prev',
            test_user_id: 'pg-test-prev',
          });
          const output = (yield* MockConsole.getLines()).join('\n');
          expect(output).toContain(
            'Logged in again to staging-backend.composio.dev. Re-run the command.'
          );
          expect(output).toContain(`${STAGING_WEB_URL}?cliKey=relogin-session`);
          expect(stdoutWrites).toEqual([]);
        })
    );
  });

  layer(TestLive({ userData: stagingLogin, terminalUI: interactiveUI(true) }))(it => {
    it.effect(
      '[Given] the previous org is not accessible [Then] uses the default org and says so',
      () =>
        Effect.gen(function* () {
          vi.stubEnv('COMPOSIO_DISABLE_PERMISSION_UI', '0');
          mockSessionInfo({ previousOrgAccessible: false });
          const { repository } = yield* linkedSessionRepository();

          yield* recordThenReport(stagingRejection).pipe(
            Effect.provideService(ComposioSessionRepository, repository)
          );

          expect(yield* readStoredUserConfig).toMatchObject({
            api_key: 'uak_new',
            org_id: 'org_default',
            test_user_id: 'pg-test-user_new',
          });
          const output = (yield* MockConsole.getLines()).join('\n');
          expect(output).toContain(
            'Your previous org is not available to this account. Using "Org org_default".'
          );
        })
    );
  });

  layer(TestLive({ userData: stagingLogin, terminalUI: interactiveUI(false) }))(it => {
    it.effect('Covers AE4. [Given] a declined re-login [Then] keeps the stored credentials', () =>
      Effect.gen(function* () {
        vi.stubEnv('COMPOSIO_DISABLE_PERMISSION_UI', '0');
        confirmCalls.length = 0;

        yield* recordThenReport(stagingRejection);

        expect(confirmCalls).toHaveLength(1);
        expect(yield* readStoredUserConfig).toMatchObject(stagingLogin);
        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain('COMPOSIO_ENVIRONMENT=staging composio login');
      })
    );
  });

  layer(TestLive({ userData: stagingLogin, terminalUI: interactiveUI(true) }))(it => {
    it.effect('Covers AE4. [Given] a failed re-login [Then] keeps the stored credentials', () =>
      Effect.gen(function* () {
        vi.stubEnv('COMPOSIO_DISABLE_PERMISSION_UI', '0');
        const { repository } = yield* linkedSessionRepository({ failCreate: true });

        yield* recordThenReport(stagingRejection).pipe(
          Effect.provideService(ComposioSessionRepository, repository)
        );

        expect(yield* readStoredUserConfig).toMatchObject(stagingLogin);
        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain('Login did not complete. Your stored credentials are unchanged.');
      })
    );
  });

  const envKey = ConfigProvider.fromEnvRecord({ COMPOSIO_USER_API_KEY: 'uak_env' }).pipe(
    extendConfigProvider
  );

  layer(TestLive({ baseConfigProvider: envKey, terminalUI: interactiveUI(true) }))(it => {
    it.effect(
      'Covers AE6. [Given] a rejected env key [Then] names the env var and never prompts',
      () =>
        Effect.gen(function* () {
          vi.stubEnv('COMPOSIO_DISABLE_PERMISSION_UI', '0');
          confirmCalls.length = 0;

          yield* recordThenReport({ baseURL: DEFAULT_BASE_URL, keySource: 'env' });

          expect(confirmCalls).toEqual([]);
          const output = (yield* MockConsole.getLines()).join('\n');
          expect(output).toContain('rejected the API key in COMPOSIO_USER_API_KEY');
        })
    );
  });

  const runChild = ConfigProvider.fromEnvRecord({
    COMPOSIO_USER_API_KEY: 'uak_parent',
    COMPOSIO_BASE_URL: STAGING_BASE_URL,
    COMPOSIO_CLI_INVOCATION_ORIGIN: 'run',
  }).pipe(extendConfigProvider);

  layer(TestLive({ baseConfigProvider: runChild }))(it => {
    it.effect(
      'Covers AE8. [Given] a composio run child call [Then] asks to run composio login',
      () =>
        Effect.gen(function* () {
          yield* recordThenReport({ baseURL: STAGING_BASE_URL, keySource: 'env' });

          const output = (yield* MockConsole.getLines()).join('\n');
          expect(output).toContain('`COMPOSIO_ENVIRONMENT=staging composio login`');
          expect(output).not.toContain('Replace its value');
        })
    );
  });
});
