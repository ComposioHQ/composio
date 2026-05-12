import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Console, Effect } from 'effect';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { extendConfigProvider } from 'src/services/config';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';

const parseJsonFromLines = (lines: ReadonlyArray<string>) => {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line) continue;
    try {
      return JSON.parse(line) as Record<string, Array<Record<string, string>>>;
    } catch {
      // continue
    }
  }
  throw new Error('Expected JSON output but none found');
};

const testConnections: ConnectedAccountItem[] = [
  {
    id: 'con_gmail_active',
    alias: null,
    word_id: null,
    status: 'ACTIVE',
    status_reason: null,
    is_disabled: false,
    user_id: 'consumer-user-org_test',
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
  },
  {
    id: 'con_github_work',
    alias: 'work',
    word_id: 'castle',
    status: 'ACTIVE',
    status_reason: null,
    is_disabled: false,
    user_id: 'consumer-user-org_test',
    toolkit: { slug: 'github' },
    auth_config: {
      id: 'ac_github_oauth',
      auth_scheme: 'OAUTH2',
      is_composio_managed: true,
      is_disabled: false,
    },
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-10T00:00:00Z',
    test_request_endpoint: '',
  },
  {
    id: 'con_github_personal',
    alias: 'personal',
    word_id: 'forest',
    status: 'FAILED',
    status_reason: 'Token expired',
    is_disabled: false,
    user_id: 'consumer-user-org_test',
    toolkit: { slug: 'github' },
    auth_config: {
      id: 'ac_github_oauth_2',
      auth_scheme: 'OAUTH2',
      is_composio_managed: true,
      is_disabled: false,
    },
    created_at: '2026-02-03T00:00:00Z',
    updated_at: '2026-02-12T00:00:00Z',
    test_request_endpoint: '',
  },
];

const connectedAccountsData = {
  items: testConnections,
} satisfies TestLiveInput['connectedAccountsData'];

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

const terminalUIWithConfirm = (confirmed: boolean) =>
  TerminalUI.of({
    output: data => Console.log(data),
    intro: title => Console.log(`-- ${title} --`),
    outro: message => Console.log(`-- ${message} --`),
    log: {
      info: message => Console.log(message),
      success: message => Console.log(message),
      warn: message => Console.warn(message),
      error: message => Console.error(message),
      step: message => Console.log(message),
      message: message => Console.log(message),
    },
    note: (message, title) => Console.log(title ? `[${title}] ${message}` : message),
    select: (_message, options) => Effect.succeed(options[0]!.value),
    confirm: () => Effect.succeed(confirmed),
    withSpinner: (message, effect, options) =>
      Effect.gen(function* () {
        const result = yield* effect;
        const successMsg =
          typeof options?.successMessage === 'function'
            ? options.successMessage(result)
            : (options?.successMessage ?? message);
        yield* Console.log(successMsg);
        return result;
      }),
    useMakeSpinner: (_message, use) =>
      use({
        message: (_msg: string) => Effect.void,
        stop: (msg?: string) => (msg ? Console.log(msg) : Effect.void),
        error: (msg?: string) => (msg ? Console.error(msg) : Effect.void),
      }),
  });

describe('CLI: composio connections list', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(it => {
    it.scoped('[Given] no filter [Then] prints connection JSON with aliases for duplicates', () =>
      Effect.gen(function* () {
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        yield* cli(['connections', 'list']);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const parsed = parseJsonFromLines(lines);

        expect(parsed).toEqual({
          gmail: [{ status: 'ACTIVE' }],
          github: [
            { status: 'ACTIVE', alias: 'work', word_id: 'castle' },
            { status: 'FAILED', alias: 'personal', word_id: 'forest' },
          ],
        });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData,
      stdin: { isTTY: true, data: '' },
    })
  )(it => {
    it.scoped('[Given] interactive stdout [Then] still prints the JSON payload', () =>
      Effect.gen(function* () {
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        yield* cli(['connections', 'list']);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const parsed = parseJsonFromLines(lines);

        expect(parsed).toEqual({
          gmail: [{ status: 'ACTIVE' }],
          github: [
            { status: 'ACTIVE', alias: 'work', word_id: 'castle' },
            { status: 'FAILED', alias: 'personal', word_id: 'forest' },
          ],
        });
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider, connectedAccountsData }))(it => {
    it.scoped('[Given] --toolkit github [Then] filters the JSON output', () =>
      Effect.gen(function* () {
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        yield* cli(['connections', 'list', '--toolkit', 'github']);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const parsed = parseJsonFromLines(lines);

        expect(parsed).toEqual({
          github: [
            { status: 'ACTIVE', alias: 'work', word_id: 'castle' },
            { status: 'FAILED', alias: 'personal', word_id: 'forest' },
          ],
        });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: {
        items: [
          ...testConnections,
          {
            id: 'con_slack_dev_only',
            alias: null,
            word_id: null,
            status: 'ACTIVE',
            status_reason: null,
            is_disabled: false,
            user_id: 'developer-user-org_test',
            toolkit: { slug: 'slack' },
            auth_config: {
              id: 'ac_slack_oauth',
              auth_scheme: 'OAUTH2',
              is_composio_managed: true,
              is_disabled: false,
            },
            created_at: '2026-03-01T00:00:00Z',
            updated_at: '2026-03-05T00:00:00Z',
            test_request_endpoint: '',
          },
        ],
      },
    })
  )(it => {
    it.scoped('[Given] mixed user scopes [Then] only consumer-project connections are listed', () =>
      Effect.gen(function* () {
        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        yield* cli(['connections', 'list']);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const parsed = parseJsonFromLines(lines);

        expect(parsed).not.toHaveProperty('slack');
      })
    );
  });
});

describe('CLI: composio connections remove', () => {
  const confirmedDeleteCalls: string[] = [];
  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: {
        items: testConnections,
        onDelete: nanoid => confirmedDeleteCalls.push(nanoid),
      },
      terminalUI: terminalUIWithConfirm(true),
    })
  )(it => {
    it.scoped('[Given] a unique toolkit selector and consent [Then] removes that connection', () =>
      Effect.gen(function* () {
        confirmedDeleteCalls.length = 0;

        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        yield* cli(['connections', 'remove', 'gmail']);

        expect(confirmedDeleteCalls).toEqual(['con_gmail_active']);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        expect(lines.join('\n')).toContain('Removed gmail connection.');
      })
    );
  });

  const deniedDeleteCalls: string[] = [];
  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: {
        items: testConnections,
        onDelete: nanoid => deniedDeleteCalls.push(nanoid),
      },
      terminalUI: terminalUIWithConfirm(false),
    })
  )(it => {
    it.scoped('[Given] consent is denied [Then] does not remove the connection', () =>
      Effect.gen(function* () {
        deniedDeleteCalls.length = 0;

        const userContext = yield* ComposioUserContext;
        yield* userContext.login('test_api_key', 'org_test');
        yield* cli(['connections', 'remove', 'work']);

        expect(deniedDeleteCalls).toEqual([]);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        expect(lines.join('\n')).toContain('No connection removed.');
      })
    );
  });

  const ambiguousDeleteCalls: string[] = [];
  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      connectedAccountsData: {
        items: testConnections,
        onDelete: nanoid => ambiguousDeleteCalls.push(nanoid),
      },
      terminalUI: terminalUIWithConfirm(true),
    })
  )(it => {
    it.scoped(
      '[Given] a selector matches multiple accounts [Then] asks for a unique selector',
      () =>
        Effect.gen(function* () {
          ambiguousDeleteCalls.length = 0;

          const userContext = yield* ComposioUserContext;
          yield* userContext.login('test_api_key', 'org_test');
          yield* cli(['connections', 'remove', 'github']);

          expect(ambiguousDeleteCalls).toEqual([]);

          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          expect(lines.join('\n')).toContain('Multiple connections matched "github"');
        })
    );
  });
});
