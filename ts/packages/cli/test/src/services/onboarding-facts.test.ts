import { describe, expect, layer } from '@effect/vitest';
import { vi } from 'vitest';
import { CommandExecutor } from '@effect/platform';
import { ConfigProvider, Effect, Option } from 'effect';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { extendConfigProvider } from 'src/services/config';
import { CommandRunner } from 'src/services/command-runner';
import { gatherOnboardingFacts } from 'src/services/onboarding-facts';
import * as setup from 'src/services/setup';
import * as commandProject from 'src/services/command-project';
import { TestLive } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';

const CONSUMER_USER_ID = 'consumer-user-org_test';

const account = (
  overrides: Partial<ConnectedAccountItem> & Pick<ConnectedAccountItem, 'id' | 'status'>
): ConnectedAccountItem => ({
  alias: null,
  word_id: null,
  status_reason: null,
  is_disabled: false,
  user_id: CONSUMER_USER_ID,
  toolkit: { slug: 'github' },
  auth_config: {
    id: 'ac_oauth',
    auth_scheme: 'OAUTH2',
    is_composio_managed: true,
    is_disabled: false,
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  test_request_endpoint: '',
  ...overrides,
});

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

const BARE = {
  requestedToolkit: Option.none<string>(),
  invocationSkips: [],
} as const;

/** Exit 127 is "command not found", so the probe reports no available agent host. */
const noHostsRunner = new CommandRunner({
  run: () => Effect.succeed(CommandExecutor.ExitCode(127)),
  capture: () => Effect.succeed({ exitCode: 127, stdout: '', stderr: 'command not found' }),
});

describe('gatherOnboardingFacts', () => {
  layer(TestLive({ commandRunner: noHostsRunner }))(
    '[Given] no API key [Then] the facts report a logged-out user',
    it => {
      it.scoped('never asks the API about connections', () =>
        Effect.gen(function* () {
          const facts = yield* gatherOnboardingFacts(BARE);

          expect(facts.loggedIn).toBe(false);
          expect(facts.connectedToolkits).toBe('unknown');
          expect(facts.pendingLink).toStrictEqual(Option.none());
          expect(facts.hasExecuted).toStrictEqual(Option.none());
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      commandRunner: noHostsRunner,
      connectedAccountsData: {
        items: [
          account({ id: 'con_gmail', status: 'ACTIVE', toolkit: { slug: 'gmail' } }),
          account({ id: 'con_github', status: 'ACTIVE', toolkit: { slug: 'github' } }),
          account({
            id: 'con_linear_pending',
            status: 'INITIATED',
            toolkit: { slug: 'linear' },
            created_at: '2026-03-01T00:00:00Z',
          }),
          account({
            id: 'con_notion_pending',
            status: 'INITIATED',
            toolkit: { slug: 'notion' },
            created_at: '2026-02-01T00:00:00Z',
          }),
          account({ id: 'con_slack_failed', status: 'FAILED', toolkit: { slug: 'slack' } }),
        ],
      } satisfies TestLiveInput['connectedAccountsData'],
    })
  )('[Given] live connections [Then] both facts come from one list call', it => {
    it.scoped('reports ACTIVE toolkits and the most recent pending link', () =>
      Effect.gen(function* () {
        const facts = yield* gatherOnboardingFacts(BARE);

        expect(facts.loggedIn).toBe(true);
        expect(facts.connectedToolkits).toStrictEqual(['gmail', 'github']);
        expect(Option.getOrThrow(facts.pendingLink)).toMatchObject({
          toolkit: 'linear',
          connectedAccountId: 'con_linear_pending',
        });
        // The list endpoint does not expose the redirect URL.
        expect(Option.getOrThrow(facts.pendingLink).redirectUrl).toStrictEqual(Option.none());
      })
    );

    it.scoped('echoes the requested toolkit and invocation skips unchanged', () =>
      Effect.gen(function* () {
        const facts = yield* gatherOnboardingFacts({
          requestedToolkit: Option.some('hubspot'),
          invocationSkips: ['connect'],
        });

        expect(facts.requestedToolkit).toStrictEqual(Option.some('hubspot'));
        expect(facts.invocationSkips).toStrictEqual(['connect']);
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      commandRunner: noHostsRunner,
      connectedAccountsData: {
        items: [
          account({ id: 'con_github', status: 'ACTIVE' }),
          account({
            id: 'con_github_pending',
            status: 'INITIATED',
            created_at: '2026-03-01T00:00:00Z',
          }),
        ],
      } satisfies TestLiveInput['connectedAccountsData'],
    })
  )(
    '[Given] an ACTIVE and an INITIATED account for one toolkit [Then] the pending link is dropped',
    it => {
      it.scoped('suppresses a pending link whose toolkit already has an active account', () =>
        Effect.gen(function* () {
          const facts = yield* gatherOnboardingFacts(BARE);

          expect(facts.connectedToolkits).toStrictEqual(['github']);
          expect(facts.pendingLink).toStrictEqual(Option.none());
        })
      );
    }
  );

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      commandRunner: noHostsRunner,
      connectedAccountsData: {
        items: [account({ id: 'con_github_disabled', status: 'ACTIVE', is_disabled: true })],
      } satisfies TestLiveInput['connectedAccountsData'],
    })
  )('[Given] a disabled account [Then] it does not satisfy the connect gate', it => {
    it.scoped('ignores disabled accounts', () =>
      Effect.gen(function* () {
        const facts = yield* gatherOnboardingFacts(BARE);

        expect(facts.connectedToolkits).toStrictEqual([]);
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      commandRunner: noHostsRunner,
      connectedAccountsData: {
        items: [account({ id: 'con_other_user', status: 'ACTIVE', user_id: 'someone-else' })],
      } satisfies TestLiveInput['connectedAccountsData'],
    })
  )('[Given] an account belonging to another user [Then] it is filtered out', it => {
    it.scoped('scopes the list call to the consumer user id', () =>
      Effect.gen(function* () {
        const facts = yield* gatherOnboardingFacts(BARE);

        expect(facts.connectedToolkits).toStrictEqual([]);
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      commandRunner: noHostsRunner,
      cliUserConfig: {
        onboarding: {
          hasExecuted: true,
          lastExecution: { slug: 'GITHUB_GET_THE_AUTHENTICATED_USER', at: '2026-07-01T00:00:00Z' },
        },
      },
    })
  )('[Given] a persisted execution [Then] the has-executed fact is set', it => {
    it.scoped('reads the durable flag from the config', () =>
      Effect.gen(function* () {
        const facts = yield* gatherOnboardingFacts(BARE);

        expect(Option.getOrThrow(facts.hasExecuted)).toStrictEqual({
          slug: 'GITHUB_GET_THE_AUTHENTICATED_USER',
          at: '2026-07-01T00:00:00Z',
        });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      commandRunner: noHostsRunner,
      connectedAccountsData: {
        items: [account({ id: 'con_github', status: 'ACTIVE' })],
      } satisfies TestLiveInput['connectedAccountsData'],
    })
  )('[Given] a failing connection check [Then] the fact degrades instead of aborting', it => {
    it.scoped('reports unknown connections and still resolves the other facts', () =>
      Effect.gen(function* () {
        const projectSpy = vi
          .spyOn(commandProject, 'resolveCommandProject')
          .mockReturnValue(Effect.die('the API is unreachable'));

        try {
          const facts = yield* gatherOnboardingFacts(BARE);

          expect(facts.connectedToolkits).toBe('unknown');
          expect(facts.pendingLink).toStrictEqual(Option.none());
          // The other fact sources are unaffected — neither aborts the other.
          expect(facts.loggedIn).toBe(true);
          expect(facts.hostWiring).toStrictEqual({ kind: 'inspected', hosts: [] });
        } finally {
          projectSpy.mockRestore();
        }
      })
    );

    it.scoped('degrades a host probe failure to not_applicable without touching connections', () =>
      Effect.gen(function* () {
        const detectSpy = vi
          .spyOn(setup, 'detectSetupTargets')
          .mockReturnValue(Effect.die('claude binary is wedged'));

        try {
          const facts = yield* gatherOnboardingFacts(BARE);

          expect(facts.hostWiring).toStrictEqual({ kind: 'not_applicable' });
          // The other fact source is unaffected — neither aborts the other.
          expect(facts.connectedToolkits).toStrictEqual(['github']);
        } finally {
          detectSpy.mockRestore();
        }
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      commandRunner: noHostsRunner,
    })
  )('[Given] an unreachable API [Then] connections read as unknown', it => {
    it.scoped('never throws out of fact gathering', () =>
      Effect.gen(function* () {
        const inspectSpy = vi
          .spyOn(setup, 'inspectSetupTargets')
          .mockReturnValue(Effect.die('inspection blew up'));

        try {
          const facts = yield* gatherOnboardingFacts(BARE);
          expect(facts.hostWiring).toStrictEqual({ kind: 'not_applicable' });
        } finally {
          inspectSpy.mockRestore();
        }
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      commandRunner: noHostsRunner,
      connectedAccountsData: {
        items: [],
      } satisfies TestLiveInput['connectedAccountsData'],
    })
  )('[Given] a link the list call has not caught up with [Then] the fact still exists', it => {
    it.scoped('stands in for the pending link from what the create returned', () =>
      Effect.gen(function* () {
        const facts = yield* gatherOnboardingFacts({
          ...BARE,
          requestedToolkit: Option.some('github'),
          mintedRedirectUrl: Option.some({
            toolkit: 'github',
            url: 'https://app.composio.dev/link?token=lt_fresh',
            connectedAccountId: 'con_github_pending',
          }),
        });

        // Dropping this would leave the connect gate unsatisfied and invite another link.
        expect(Option.getOrThrow(facts.pendingLink)).toStrictEqual({
          toolkit: 'github',
          connectedAccountId: 'con_github_pending',
          redirectUrl: Option.some('https://app.composio.dev/link?token=lt_fresh'),
        });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      commandRunner: noHostsRunner,
      connectedAccountsData: {
        items: [account({ id: 'con_github', status: 'ACTIVE' })],
      } satisfies TestLiveInput['connectedAccountsData'],
    })
  )('[Given] the authorization completed during the create [Then] the live fact wins', it => {
    it.scoped('never revives a pending link for an already active toolkit', () =>
      Effect.gen(function* () {
        const facts = yield* gatherOnboardingFacts({
          ...BARE,
          requestedToolkit: Option.some('github'),
          mintedRedirectUrl: Option.some({
            toolkit: 'github',
            url: 'https://app.composio.dev/link?token=lt_fresh',
            connectedAccountId: 'con_github_pending',
          }),
        });

        expect(facts.connectedToolkits).toStrictEqual(['github']);
        expect(facts.pendingLink).toStrictEqual(Option.none());
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      commandRunner: noHostsRunner,
      connectedAccountsData: {
        items: [account({ id: 'con_github_pending', status: 'INITIATED' })],
      } satisfies TestLiveInput['connectedAccountsData'],
    })
  )('[Given] the list already shows the link [Then] the URL is attached to it', it => {
    it.scoped('keeps the live account id and fills in the withheld URL', () =>
      Effect.gen(function* () {
        const facts = yield* gatherOnboardingFacts({
          ...BARE,
          requestedToolkit: Option.some('github'),
          mintedRedirectUrl: Option.some({
            toolkit: 'github',
            url: 'https://app.composio.dev/link?token=lt_fresh',
            connectedAccountId: 'con_github_pending',
          }),
        });

        expect(Option.getOrThrow(facts.pendingLink)).toStrictEqual({
          toolkit: 'github',
          connectedAccountId: 'con_github_pending',
          redirectUrl: Option.some('https://app.composio.dev/link?token=lt_fresh'),
        });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      fixture: 'global-test-user-id',
      commandRunner: new CommandRunner({
        run: () => Effect.succeed(CommandExecutor.ExitCode(0)),
        capture: () => Effect.succeed({ exitCode: 0, stdout: '[]', stderr: '' }),
      }),
    })
  )('[Given] a host on PATH [Then] the wiring fact carries its plugin state', it => {
    it.scoped('inspects rather than installs', () =>
      Effect.gen(function* () {
        const installSpy = vi.spyOn(setup, 'installSetupTargets');

        try {
          const facts = yield* gatherOnboardingFacts(BARE);

          expect(['inspected', 'not_applicable']).toContain(facts.hostWiring.kind);
          // Gate 0 inspects and never mutates the host's plugin configuration.
          expect(installSpy).not.toHaveBeenCalled();
        } finally {
          installSpy.mockRestore();
        }
      })
    );
  });
});
