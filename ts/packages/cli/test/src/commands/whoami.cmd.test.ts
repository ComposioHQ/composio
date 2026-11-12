import { AuthenticationError, InternalServerError } from '@composio/client/effect';
import { assert, describe, expect, layer } from '@effect/vitest';
import { isUsageFailure } from 'src/commands/errors';
import { ConfigProvider, Effect } from 'effect';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import { exitCodeOf } from 'test/__utils__/exit-code';
import { makeSessionInfo } from 'test/__utils__/models/account';
import { redirectedTerminalUI } from 'test/__utils__/services/redirected-terminal-ui';

describe('CLI: composio whoami', () => {
  layer(TestLive())('without a login', it => {
    it.effect('[Given] no API key [Then] fails with NotLoggedInError and prints its message', () =>
      Effect.gen(function* () {
        const failure = yield* cli(['whoami']).pipe(Effect.flip);

        expect(failure).toMatchObject({
          _tag: 'commands/NotLoggedInError',
          message: 'You are not logged in yet. Please run `composio login`.',
        });
        // The invocation prints the message on stderr, and nothing else.
        assert(isUsageFailure(failure));
        expect(yield* MockConsole.getLines()).toEqual([failure.message]);
      })
    );
  });

  const testConfigProvider = ConfigProvider.fromEnv({
    env: { COMPOSIO_USER_API_KEY: 'api_key_from_test_config_provider' },
  });

  const readableSession = makeSessionInfo({
    orgId: 'org_123',
    orgName: 'Acme Org',
    orgMemberId: 'om_123',
    email: 'person@example.com',
    name: 'Test Person',
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      accountData: { sessionInfo: readableSession },
    })
  )('with config override', it => {
    it.effect('[Given] `COMPOSIO_USER_API_KEY` [Then] prints global user context JSON', () =>
      Effect.gen(function* () {
        const args = ['whoami'];
        yield* cli(args);

        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).not.toContain(`api_key_from_test_config_provider`);
        expect(output).not.toContain(`global_user_api_key`);
        expect(output).toContain(`"email":"person@example.com"`);
        expect(output).not.toContain(`"test_user_id"`);
      })
    );
  });

  layer(
    TestLive({ fixture: 'user-config-example', accountData: { sessionInfo: readableSession } })
  )('with fixture', it => {
    it.effect('[Given] user_data.json in fixture [Then] prints global user context JSON', () =>
      Effect.gen(function* () {
        const args = ['whoami'];
        yield* cli(args);

        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).not.toContain(`api_key_from_test_fixture`);
        expect(output).not.toContain(`global_user_api_key`);
        expect(output).toContain(`"email":"person@example.com"`);
        expect(output).not.toContain(`"test_user_id"`);
      })
    );
  });

  // A 401 that is not the backend's `UserApiKey_Unauthorized`: the CLI cannot tell which
  // credential it is about, so it names the login as the likely way out.
  const rejectedKey = new AuthenticationError({
    message: '401 Invalid API key',
    method: 'GET',
    url: 'https://mock.invalid/api/v3.1/auth/session/info',
    status: 401,
    requestId: undefined,
    details: { message: 'Invalid API key', code: 401, slug: 'Auth_InvalidApiKey', status: 401 },
    body: undefined,
  });

  layer(
    TestLive({
      fixture: 'user-config-example',
      accountData: {
        sessionInfo: () => {
          throw rejectedKey;
        },
      },
    })
  )('with a stored key the backend rejects', it => {
    it.effect('[Then] exits 1 with nothing on stdout and names `composio login` on stderr', () =>
      Effect.gen(function* () {
        const terminal = redirectedTerminalUI();
        const exit = yield* Effect.exit(cli(['whoami']).pipe(Effect.provide(terminal.layer)));

        expect(exitCodeOf(exit)).toBe(1);
        expect(terminal.stdout()).toBe('');
        expect(terminal.stderr()).toBe(
          'Invalid API key\nIf your login expired, log in again, then retry:\n> composio logout && composio login\n'
        );
      })
    );
  });

  // A backend that cannot answer: the command cannot vouch for the login, so it fails.
  const serverError = new InternalServerError({
    message: '500 Internal Server Error',
    method: 'GET',
    url: 'https://mock.invalid/api/v3.1/auth/session/info',
    status: 500,
    requestId: undefined,
    details: { message: 'Internal Server Error', code: 500, slug: 'Internal', status: 500 },
    body: undefined,
  });

  layer(
    TestLive({
      fixture: 'user-config-example',
      accountData: {
        sessionInfo: () => {
          throw serverError;
        },
      },
    })
  )('when the backend fails to answer', it => {
    it.effect('[Then] exits 1 with nothing on stdout and the failure on stderr', () =>
      Effect.gen(function* () {
        const terminal = redirectedTerminalUI();
        const exit = yield* Effect.exit(cli(['whoami']).pipe(Effect.provide(terminal.layer)));

        expect(exitCodeOf(exit)).toBe(1);
        expect(terminal.stdout()).toBe('');
        expect(terminal.stderr()).toContain('Internal Server Error');
      })
    );
  });

  // A session the CLI cannot fully read (org-level credentials have no project): the key
  // works, so the fields print as unknown.
  layer(
    TestLive({
      fixture: 'user-config-example',
      accountData: { sessionInfo: { ...readableSession, project: null } },
    })
  )('with a session the CLI cannot fully read', it => {
    it.effect('[Then] exits 0 and prints the fields as unknown', () =>
      Effect.gen(function* () {
        yield* cli(['whoami']);

        const output = (yield* MockConsole.getLines()).join('\n');
        expect(output).toContain(`"email":null`);
        expect(output).toContain(`"current_org_name":null`);
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      accountData: {
        sessionInfo: makeSessionInfo({
          orgId: 'org_123',
          orgName: 'Acme Org',
          orgMemberId: 'om_123',
          email: 'person@example.com',
          name: 'Test Person',
        }),
      },
    })
  )('with session info', it => {
    it.effect('[Given] session info is available [Then] prints email and org name', () =>
      Effect.gen(function* () {
        yield* cli(['whoami']);

        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain(`"email":"person@example.com"`);
        expect(output).toContain(`"current_org_name":"Acme Org"`);
        expect(output).toContain('Current Org: Acme Org');
        expect(output).not.toContain('Default Org');
        expect(output).not.toContain('Test User ID');
      })
    );
  });
});
