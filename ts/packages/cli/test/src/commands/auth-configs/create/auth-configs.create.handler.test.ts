import { describe, expect, it } from '@effect/vitest';
import { Effect, Option } from 'effect';
import {
  buildAuthConfigCreateRequest,
  parseScopes,
  runAuthConfigsCreate,
  type AuthConfigsCreateParams,
} from 'src/commands/auth-configs/create/auth-configs.create.handler';
import { isUsageFailure } from 'src/commands/errors';
import { MockConsole } from 'test/__utils__';
import { exitCodeOf } from 'test/__utils__/exit-code';
import { AuthConfigsHandlerTest } from 'test/__utils__/layers/auth-configs';
import { notFoundError } from 'test/__utils__/layers/not-found';

const params: AuthConfigsCreateParams = {
  name: Option.none(),
  toolkit: 'gmail',
  authScheme: Option.none(),
  scopes: Option.none(),
  customCredentials: Option.none(),
};

const createResponse = {
  auth_config: { id: 'ac_created', auth_scheme: 'OAUTH2', is_composio_managed: false },
  toolkit: { slug: 'gmail' },
};

describe('parseScopes', () => {
  it.each([
    { name: 'no flag', input: Option.none<string>(), expected: undefined },
    { name: 'one scope', input: Option.some('send_email'), expected: ['send_email'] },
    {
      name: 'padded scopes and blanks',
      input: Option.some(' send_email, ,read_email ,'),
      expected: ['send_email', 'read_email'],
    },
    // An empty flag still sends an empty list, as before the move.
    { name: 'an empty flag', input: Option.some(''), expected: [] },
  ])('[Given] $name [Then] returns $expected', ({ input, expected }) => {
    expect(parseScopes(input)).toEqual(expected);
  });
});

describe('buildAuthConfigCreateRequest', () => {
  const base = {
    name: undefined,
    toolkit: 'gmail',
    authScheme: Option.none<string>(),
    scopes: undefined,
    customCredentials: undefined,
  };

  it.each([
    {
      name: 'no scheme',
      input: { ...base, name: 'mine' },
      expected: {
        toolkit: { slug: 'gmail' },
        auth_config: { type: 'use_composio_managed_auth', name: 'mine', credentials: undefined },
      },
    },
    {
      name: 'no scheme with scopes and custom credentials',
      input: { ...base, scopes: ['send_email'], customCredentials: { client_id: 'ignored' } },
      expected: {
        toolkit: { slug: 'gmail' },
        auth_config: {
          type: 'use_composio_managed_auth',
          name: undefined,
          credentials: { scopes: ['send_email'] },
        },
      },
    },
    {
      name: 'a scheme alone',
      input: { ...base, authScheme: Option.some('API_KEY') },
      expected: {
        toolkit: { slug: 'gmail' },
        auth_config: {
          type: 'use_custom_auth',
          authScheme: 'API_KEY',
          name: undefined,
          credentials: undefined,
        },
      },
    },
    {
      name: 'a scheme with custom credentials and scopes',
      input: {
        ...base,
        authScheme: Option.some('OAUTH2'),
        scopes: ['send_email'],
        customCredentials: { client_id: 'id', scopes: ['overridden'] },
      },
      expected: {
        toolkit: { slug: 'gmail' },
        auth_config: {
          type: 'use_custom_auth',
          authScheme: 'OAUTH2',
          name: undefined,
          credentials: { client_id: 'id', scopes: ['send_email'] },
        },
      },
    },
  ])('[Given] $name [Then] builds the matching request', ({ input, expected }) => {
    expect(buildAuthConfigCreateRequest(input)).toStrictEqual(expected);
  });
});

describe('runAuthConfigsCreate', () => {
  it.effect('[Given] a successful create [Then] prints the API response JSON to stdout', () => {
    const { layer, outputs } = AuthConfigsHandlerTest({
      authConfigsData: { createResponse },
    });
    return Effect.gen(function* () {
      yield* runAuthConfigsCreate(params);

      expect(outputs).toEqual([JSON.stringify(createResponse, null, 2)]);
      const decoration = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
      expect(decoration).toContain('Auth config created.');
      expect(decoration).toContain('[New Auth Config]');
    }).pipe(Effect.provide(layer));
  });

  it.effect.each([
    { name: 'malformed JSON', customCredentials: '{invalid json}' },
    { name: 'a JSON array', customCredentials: '["client_id"]' },
  ])(
    '[Given] $name in --custom-credentials [Then] fails with a usage error before any request',
    ({ customCredentials }) => {
      const { layer, outputs } = AuthConfigsHandlerTest({
        repository: { createAuthConfig: () => Effect.die('createAuthConfig must not be called') },
      });
      return Effect.gen(function* () {
        const failure = yield* runAuthConfigsCreate({
          ...params,
          authScheme: Option.some('OAUTH2'),
          customCredentials: Option.some(customCredentials),
        }).pipe(Effect.flip);

        expect(failure).toMatchObject({
          _tag: 'commands/CommandInputError',
          command: 'dev auth-configs create',
          option: '--custom-credentials',
          message: expect.stringMatching(
            /^Invalid JSON in --custom-credentials\. Please provide valid JSON\.\nExample:\n> composio dev auth-configs create /
          ),
        });
        // The invocation prints a usage failure on stderr and exits 1.
        expect(isUsageFailure(failure)).toBe(true);
        expect(yield* MockConsole.getLines()).toEqual([]);
        expect(outputs).toEqual([]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect('[Given] the API rejects the create [Then] hints at the toolkit and exits 1', () => {
    const { layer, outputs } = AuthConfigsHandlerTest({
      repository: {
        createAuthConfig: () => Effect.fail(notFoundError('Toolkit not found')),
      },
    });
    return Effect.gen(function* () {
      const exit = yield* Effect.exit(runAuthConfigsCreate({ ...params, toolkit: 'nope' }));

      const stderr = (yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true })).join(
        '\n'
      );
      expect(stderr).toContain('Failed to create auth config.');
      expect(stderr).toContain(
        'Check available auth schemes for "nope":\n> composio dev toolkits info "nope"'
      );
      expect(outputs).toEqual([]);
      expect(exitCodeOf(exit)).toBe(1);
    }).pipe(Effect.provide(layer));
  });
});
