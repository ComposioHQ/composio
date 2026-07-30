import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect, Option } from 'effect';
import { beforeEach, vi } from 'vitest';
import { extendConfigProvider } from 'src/services/config';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { cli, TestLive } from 'test/__utils__';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';

const tracked = vi.hoisted(() => ({
  events: [] as Array<{ readonly name: string; readonly properties?: Record<string, unknown> }>,
}));

vi.mock('src/analytics/dispatch', async importOriginal => {
  const actual = await importOriginal<typeof import('src/analytics/dispatch')>();
  const { Effect } = await import('effect');
  return {
    ...actual,
    trackCliEventEffect: (
      event: { readonly name: string; readonly properties?: Record<string, unknown> } | null
    ) =>
      Effect.sync(() => {
        if (event) tracked.events.push(event);
      }),
  };
});

const eventsNamed = (name: string) => tracked.events.filter(event => event.name === name);

const loggedInConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

const githubAccount: ConnectedAccountItem = {
  id: 'con_gh_telemetry',
  alias: 'default',
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
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-15T00:00:00Z',
  test_request_endpoint: '',
};

const loginTestOrg = Effect.gen(function* () {
  const userContext = yield* ComposioUserContext;
  yield* userContext.login('test_api_key', 'org_test');
});

const interactiveUI = TerminalUI.of({
  ...terminalUITestImpl,
  capabilities: Effect.succeed({
    stdinIsTTY: true,
    stdoutIsTTY: true,
    stderrIsTTY: true,
    canPrompt: true,
    canDecorate: true,
  }),
  confirm: () => Effect.succeed(true),
  text: () => Effect.succeed(Option.none()),
});

describe('CLI: composio onboard telemetry', () => {
  beforeEach(() => {
    tracked.events.length = 0;
  });

  layer(TestLive())('non-interactive fresh install', it => {
    it.scoped('emits CLI_ONBOARD_STARTED once on the non-interactive path', () =>
      Effect.gen(function* () {
        yield* cli(['onboard']);
        const started = eventsNamed('CLI_ONBOARD_STARTED');
        expect(started).toHaveLength(1);
        expect(started[0]!.properties).toMatchObject({ mode: 'non_interactive' });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      connectedAccountsData: { items: [githubAccount] },
      cliUserConfig: { onboardHasExecuted: true },
    })
  )('already complete', it => {
    it.scoped('does not emit CLI_ONBOARD_STARTED for a status view', () =>
      Effect.gen(function* () {
        yield* loginTestOrg;
        yield* cli(['onboard']);
        expect(eventsNamed('CLI_ONBOARD_STARTED')).toHaveLength(0);
        expect(eventsNamed('CLI_ONBOARD_STATUS_VIEWED')).toHaveLength(1);
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      connectedAccountsData: { items: [githubAccount] },
      terminalUI: interactiveUI,
    })
  )('interactive run', it => {
    it.scoped('emits CLI_ONBOARD_STARTED exactly once (not double) on the interactive path', () =>
      Effect.gen(function* () {
        yield* loginTestOrg;
        yield* cli(['onboard']);
        const started = eventsNamed('CLI_ONBOARD_STARTED');
        expect(started).toHaveLength(1);
        expect(started[0]!.properties).toMatchObject({ mode: 'interactive' });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      connectedAccountsData: { items: [githubAccount] },
      terminalUI: interactiveUI,
    })
  )('interactive execute funnel', it => {
    it.scoped('emits the per-step funnel through execute, create offer, and completion', () =>
      Effect.gen(function* () {
        yield* loginTestOrg;
        yield* cli(['onboard']);
        const stepStarted = eventsNamed('CLI_ONBOARD_STEP_STARTED');
        expect(stepStarted.map(event => event.properties?.step)).toEqual(['execute', 'create']);
        expect(stepStarted[0]!.properties).toMatchObject({
          slug: 'GITHUB_GET_THE_AUTHENTICATED_USER',
        });
        const stepCompleted = eventsNamed('CLI_ONBOARD_STEP_COMPLETED');
        expect(stepCompleted.map(event => event.properties?.step)).toEqual(['execute']);
        const stepSkipped = eventsNamed('CLI_ONBOARD_STEP_SKIPPED');
        expect(stepSkipped.map(event => event.properties)).toEqual([
          expect.objectContaining({ step: 'create', origin: 'missing_arg' }),
        ]);
        expect(eventsNamed('CLI_ONBOARD_COMPLETED')).toHaveLength(1);
      })
    );
  });

  layer(TestLive({ baseConfigProvider: loggedInConfigProvider }))(
    'non-interactive connect funnel',
    it => {
      it.scoped('emits STEP_STARTED connect (and no completion) when driving a link', () =>
        Effect.gen(function* () {
          yield* loginTestOrg;
          yield* cli(['onboard', '--toolkit', 'github']);
          const stepStarted = eventsNamed('CLI_ONBOARD_STEP_STARTED');
          expect(stepStarted.map(event => event.properties)).toEqual([
            expect.objectContaining({
              step: 'connect',
              toolkit: 'github',
              mode: 'non_interactive',
            }),
          ]);
          expect(eventsNamed('CLI_ONBOARD_STEP_COMPLETED')).toHaveLength(0);
          expect(eventsNamed('CLI_ONBOARD_COMPLETED')).toHaveLength(0);
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: loggedInConfigProvider }))('skip-flag funnel', it => {
    it.scoped('emits STEP_SKIPPED with origin flag for a fresh --skip', () =>
      Effect.gen(function* () {
        yield* loginTestOrg;
        yield* cli(['onboard', '--skip', 'connect']);
        const stepSkipped = eventsNamed('CLI_ONBOARD_STEP_SKIPPED');
        expect(stepSkipped.map(event => event.properties)).toEqual([
          expect.objectContaining({ step: 'connect', origin: 'flag' }),
        ]);
      })
    );
  });

  const decliningUI = TerminalUI.of({
    ...interactiveUI,
    confirm: () => Effect.succeed(false),
  });

  layer(
    TestLive({
      baseConfigProvider: loggedInConfigProvider,
      connectedAccountsData: { items: [githubAccount] },
      terminalUI: decliningUI,
    })
  )('declined demo run', it => {
    it.scoped('emits STEP_SKIPPED execute with origin prompt and never completes', () =>
      Effect.gen(function* () {
        yield* loginTestOrg;
        yield* cli(['onboard']);
        const stepSkipped = eventsNamed('CLI_ONBOARD_STEP_SKIPPED');
        expect(stepSkipped.map(event => event.properties)).toEqual([
          expect.objectContaining({ step: 'execute', origin: 'prompt' }),
        ]);
        expect(eventsNamed('CLI_ONBOARD_STEP_COMPLETED')).toHaveLength(0);
        expect(eventsNamed('CLI_ONBOARD_COMPLETED')).toHaveLength(0);
      })
    );
  });
});
