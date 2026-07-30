import { describe, expect, it } from 'vitest';
import { Array as Arr, Option, pipe } from 'effect';
import { resolveOnboardingState } from 'src/services/onboarding-state';
import type {
  HostWiringFact,
  OnboardingFacts,
  OnboardingSkip,
} from 'src/services/onboarding-state';

const NO_HOSTS: HostWiringFact = { kind: 'inspected', hosts: [] };

const UNWIRED_CLAUDE: HostWiringFact = {
  kind: 'inspected',
  hosts: [
    {
      target: 'claude',
      available: true,
      supported: true,
      pluginInstalled: false,
      pluginEnabled: false,
    },
  ],
};

const WIRED_CLAUDE: HostWiringFact = {
  kind: 'inspected',
  hosts: [
    {
      target: 'claude',
      available: true,
      supported: true,
      pluginInstalled: true,
      pluginEnabled: true,
    },
  ],
};

const facts = (overrides: Partial<OnboardingFacts> = {}): OnboardingFacts => ({
  loggedIn: true,
  email: Option.none(),
  orgId: Option.some('k2OiqRLMdHyM'),
  connectedToolkits: [],
  pendingLinks: [],
  hasExecuted: Option.none(),
  requestedToolkit: Option.none(),
  invocationSkips: [],
  hostWiring: NO_HOSTS,
  ...overrides,
});

const EXECUTED = Option.some({
  slug: 'GITHUB_GET_THE_AUTHENTICATED_USER',
  at: '2026-07-30T10:00:00.000Z',
});

describe('resolveOnboardingState', () => {
  describe('Table A — fact to gate resolution', () => {
    it('S1: logged out resumes at login', () => {
      const state = resolveOnboardingState(facts({ loggedIn: false }));

      expect(state.nextGate).toBe('login');
      expect(state.onboarded).toBe(false);
      expect(state.gates.login.status).toBe('unsatisfied');
      // Not `unknown`: a logged-out user is a different recovery from a failed connection check.
      expect(state.gates.connect.status).toBe('unsatisfied');
    });

    it('S1: stays at login even when a toolkit was named', () => {
      const state = resolveOnboardingState(
        facts({ loggedIn: false, requestedToolkit: Option.some('github') })
      );

      expect(state.nextGate).toBe('login');
      expect(state.gates.login.status).toBe('unsatisfied');
    });

    it('S2: logged in with a curated toolkit and no connection resumes at connect', () => {
      const state = resolveOnboardingState(facts({ requestedToolkit: Option.some('github') }));

      expect(state.nextGate).toBe('connect');
      expect(state.onboarded).toBe(false);
      expect(state.gates.login.status).toBe('satisfied');
      expect(state.gates.connect.status).toBe('unsatisfied');
      expect(state.gates.connect.toolkit).toBe('github');
      expect(state.toolkit).toBe('github');
      expect(state.task).toBe('check-my-github');
    });

    it('S3: no toolkit argument leaves the toolkit unresolved', () => {
      const state = resolveOnboardingState(facts());

      expect(state.nextGate).toBe('connect');
      expect(state.toolkit).toBeNull();
      expect(state.task).toBeNull();
      expect(state.gates.connect.status).toBe('unsatisfied');
      expect(state.gates.connect.toolkit).toBeNull();
    });

    it('S4: an outstanding browser authorization blocks the connect gate', () => {
      const state = resolveOnboardingState(
        facts({
          requestedToolkit: Option.some('github'),
          pendingLinks: [
            {
              toolkit: 'github',
              connectedAccountId: 'ca_pending',
              redirectUrl: Option.some('https://auth.example.com/github'),
            },
          ],
        })
      );

      expect(state.nextGate).toBe('connect');
      expect(state.gates.connect.status).toBe('blocked');
      expect(state.gates.connect.connectedAccountId).toBe('ca_pending');
      expect(state.gates.connect.redirectUrl).toBe('https://auth.example.com/github');
    });

    it('S4: a pending link found without a redirect URL still blocks', () => {
      const state = resolveOnboardingState(
        facts({
          requestedToolkit: Option.some('github'),
          pendingLinks: [
            {
              toolkit: 'github',
              connectedAccountId: 'ca_pending',
              redirectUrl: Option.none(),
            },
          ],
        })
      );

      expect(state.gates.connect.status).toBe('blocked');
      expect(state.gates.connect.redirectUrl).toBeNull();
    });

    it('S7: a connected curated toolkit that has never executed resumes at execute', () => {
      const state = resolveOnboardingState(
        facts({ requestedToolkit: Option.some('github'), connectedToolkits: ['github'] })
      );

      expect(state.nextGate).toBe('execute');
      expect(state.onboarded).toBe(false);
      expect(state.gates.connect.status).toBe('satisfied');
      expect(state.gates.execute.status).toBe('unsatisfied');
      expect(state.gates.execute.toolSlug).toBe('GITHUB_GET_THE_AUTHENTICATED_USER');
    });

    it('S8: a connected non-curated toolkit defers the execute gate', () => {
      const state = resolveOnboardingState(
        facts({ requestedToolkit: Option.some('hubspot'), connectedToolkits: ['hubspot'] })
      );

      expect(state.nextGate).toBeNull();
      expect(state.onboarded).toBe(false);
      expect(state.gates.connect.status).toBe('satisfied');
      expect(state.gates.execute.status).toBe('deferred');
      expect(state.gates.execute.toolSlug).toBeNull();
      expect(state.task).toBeNull();
    });

    it('S9: connected and executed means every blocking gate passes', () => {
      const state = resolveOnboardingState(
        facts({
          requestedToolkit: Option.some('github'),
          connectedToolkits: ['github'],
          hasExecuted: EXECUTED,
        })
      );

      expect(state.nextGate).toBeNull();
      expect(state.onboarded).toBe(true);
      expect(state.gates.execute.status).toBe('satisfied');
      expect(state.gates.execute.lastExecutedAt).toBe('2026-07-30T10:00:00.000Z');
    });

    it('S9: adopts a connected curated toolkit when none was requested', () => {
      const state = resolveOnboardingState(
        facts({ connectedToolkits: ['github'], hasExecuted: EXECUTED })
      );

      expect(state.onboarded).toBe(true);
      expect(state.toolkit).toBe('github');
    });

    it('S11: a different connected toolkit still leaves connect unsatisfied for the requested one', () => {
      const state = resolveOnboardingState(
        facts({ requestedToolkit: Option.some('github'), connectedToolkits: ['gmail'] })
      );

      expect(state.nextGate).toBe('connect');
      expect(state.gates.connect.status).toBe('unsatisfied');
      expect(state.gates.connect.toolkit).toBe('github');
      expect(state.gates.connect.connectedToolkits).toStrictEqual(['gmail']);
    });

    it('S12: --skip connect makes the gate non-blocking and moves on to execute', () => {
      const state = resolveOnboardingState(
        facts({ requestedToolkit: Option.some('github'), invocationSkips: ['connect'] })
      );

      expect(state.nextGate).toBe('execute');
      expect(state.onboarded).toBe(false);
      expect(state.gates.connect.status).toBe('skipped');
    });

    it('S13: a failed connection check blocks with an unknown connect gate', () => {
      const state = resolveOnboardingState(
        facts({ requestedToolkit: Option.some('github'), connectedToolkits: 'unknown' })
      );

      expect(state.nextGate).toBe('connect');
      expect(state.gates.connect.status).toBe('unknown');
      expect(state.gates.connect.connectedToolkits).toStrictEqual([]);
      expect(state.onboarded).toBe(false);
    });

    it('S15: an unwired host is an advisory and never becomes the next gate', () => {
      const loggedOut = resolveOnboardingState(
        facts({ loggedIn: false, hostWiring: UNWIRED_CLAUDE })
      );
      const atExecute = resolveOnboardingState(
        facts({
          requestedToolkit: Option.some('github'),
          connectedToolkits: ['github'],
          hostWiring: UNWIRED_CLAUDE,
        })
      );
      const done = resolveOnboardingState(
        facts({
          requestedToolkit: Option.some('github'),
          connectedToolkits: ['github'],
          hasExecuted: EXECUTED,
          hostWiring: UNWIRED_CLAUDE,
        })
      );

      for (const state of [loggedOut, atExecute, done]) {
        expect(state.gates.hostWiring.status).toBe('advisory');
        expect(state.gates.hostWiring.blocking).toBe(false);
        expect(state.advisories).toHaveLength(1);
        expect(state.advisories[0]).toContain('Claude Code');
        expect(state.advisories[0]).toContain('composio setup');
      }

      expect(loggedOut.nextGate).toBe('login');
      expect(atExecute.nextGate).toBe('execute');
      expect(done.nextGate).toBeNull();
      expect(done.onboarded).toBe(true);
    });
  });

  describe('host wiring', () => {
    it('reports not_applicable when no supported host is installed', () => {
      const state = resolveOnboardingState(facts({ hostWiring: NO_HOSTS }));

      expect(state.gates.hostWiring.status).toBe('not_applicable');
      expect(state.advisories).toStrictEqual([]);
    });

    it('reports not_applicable when the probe failed or timed out', () => {
      const state = resolveOnboardingState(facts({ hostWiring: { kind: 'not_applicable' } }));

      expect(state.gates.hostWiring.status).toBe('not_applicable');
      expect(state.gates.hostWiring.hosts).toStrictEqual([]);
      expect(state.advisories).toStrictEqual([]);
    });

    it('reports satisfied when the plugin is installed and enabled', () => {
      const state = resolveOnboardingState(facts({ hostWiring: WIRED_CLAUDE }));

      expect(state.gates.hostWiring.status).toBe('satisfied');
      expect(state.advisories).toStrictEqual([]);
    });

    it('distinguishes an installed-but-disabled plugin from a missing one', () => {
      const state = resolveOnboardingState(
        facts({
          hostWiring: {
            kind: 'inspected',
            hosts: [
              {
                target: 'codex',
                available: true,
                supported: true,
                pluginInstalled: true,
                pluginEnabled: false,
              },
            ],
          },
        })
      );

      expect(state.gates.hostWiring.status).toBe('advisory');
      expect(state.advisories[0]).toContain('not enabled');
    });

    it('ignores hosts that are not available', () => {
      const state = resolveOnboardingState(
        facts({
          hostWiring: {
            kind: 'inspected',
            hosts: [
              {
                target: 'claude',
                available: false,
                supported: false,
                pluginInstalled: false,
                pluginEnabled: false,
              },
            ],
          },
        })
      );

      expect(state.gates.hostWiring.status).toBe('not_applicable');
      expect(state.advisories).toStrictEqual([]);
    });
  });

  describe('invariants', () => {
    const loggedInChoices = [true, false] as const;
    const connectionChoices: ReadonlyArray<ReadonlyArray<string> | 'unknown'> = [
      ['github'],
      [],
      'unknown',
    ];
    const executedChoices = [EXECUTED, Option.none()] as const;
    const toolkitChoices = [
      Option.some('github'),
      Option.some('hubspot'),
      Option.none<string>(),
    ] as const;
    const skipChoices: ReadonlyArray<ReadonlyArray<OnboardingSkip>> = [
      [],
      ['connect'],
      ['execute'],
      ['connect', 'execute'],
    ];
    const hostChoices: ReadonlyArray<HostWiringFact> = [
      NO_HOSTS,
      UNWIRED_CLAUDE,
      WIRED_CLAUDE,
      { kind: 'not_applicable' },
    ];

    const cases = pipe(
      Arr.Do,
      Arr.bind('loggedIn', () => loggedInChoices),
      Arr.bind('connectedToolkits', () => connectionChoices),
      Arr.bind('hasExecuted', () => executedChoices),
      Arr.bind('requestedToolkit', () => toolkitChoices),
      Arr.bind('invocationSkips', () => skipChoices),
      Arr.bind('hostWiring', () => hostChoices)
    );

    it('covers every combination of the independent fact axes', () => {
      expect(cases.length).toBe(
        loggedInChoices.length *
          connectionChoices.length *
          executedChoices.length *
          toolkitChoices.length *
          skipChoices.length *
          hostChoices.length
      );
    });

    it('never reports onboarded with a next gate outstanding', () => {
      for (const axes of cases) {
        const state = resolveOnboardingState(facts(axes));
        if (state.onboarded) {
          expect(state.nextGate).toBeNull();
        }
      }
    });

    it('never reports onboarded while a blocking gate is unsatisfied, blocked, or unknown', () => {
      const unfinished = ['unsatisfied', 'blocked', 'unknown'];

      for (const axes of cases) {
        const state = resolveOnboardingState(facts(axes));
        if (!state.onboarded) continue;

        expect(unfinished).not.toContain(state.gates.login.status);
        expect(unfinished).not.toContain(state.gates.connect.status);
        expect(unfinished).not.toContain(state.gates.execute.status);
      }
    });

    // Host wiring can never be elected as the next gate, and can never report itself as blocking:
    // `nextGate`'s type does not include it and `hostWiring.blocking` is the literal `false`. Both
    // are compile-time guarantees, so there is nothing here for a runtime sweep to add.

    it('never resumes past login while logged out', () => {
      for (const axes of cases) {
        const state = resolveOnboardingState(facts({ ...axes, loggedIn: false }));
        expect(state.nextGate).toBe('login');
        expect(state.onboarded).toBe(false);
      }
    });

    it('never resolves a toolkit the caller did not ask for and has no live account for', () => {
      for (const axes of cases) {
        const state = resolveOnboardingState(
          facts({ ...axes, requestedToolkit: Option.none(), pendingLinks: [] })
        );
        if (state.toolkit === null) continue;

        const live = axes.connectedToolkits === 'unknown' ? [] : axes.connectedToolkits;
        expect(live).toContain(state.toolkit);
      }
    });
  });

  describe('pending link derivation', () => {
    it('prefers an ACTIVE account over an INITIATED sibling for the same toolkit', () => {
      // This is the case that replaces the old "the pending link is now ACTIVE" reconciliation
      // row: both facts come from one list call, so there is nothing to reconcile.
      const state = resolveOnboardingState(
        facts({
          requestedToolkit: Option.some('github'),
          connectedToolkits: ['github'],
          pendingLinks: [
            {
              toolkit: 'github',
              connectedAccountId: 'ca_pending',
              redirectUrl: Option.none(),
            },
          ],
        })
      );

      expect(state.gates.connect.status).toBe('satisfied');
      expect(state.gates.connect.connectedAccountId).toBeNull();
    });

    it('ignores a pending link for a different toolkit than the requested one', () => {
      const state = resolveOnboardingState(
        facts({
          requestedToolkit: Option.some('github'),
          pendingLinks: [
            {
              toolkit: 'gmail',
              connectedAccountId: 'ca_gmail_pending',
              redirectUrl: Option.none(),
            },
          ],
        })
      );

      expect(state.gates.connect.status).toBe('unsatisfied');
      expect(state.gates.connect.toolkit).toBe('github');
    });

    it('finds the requested toolkit behind a newer link for another toolkit', () => {
      // Reduced to "the most recent INITIATED overall", the gmail link hides the github one: the
      // gate reads `unsatisfied` instead of `blocked` and mints another github link on every run —
      // which the link command's duplicate guard cannot stop, since it only lists ACTIVE accounts.
      const state = resolveOnboardingState(
        facts({
          requestedToolkit: Option.some('github'),
          pendingLinks: [
            {
              toolkit: 'gmail',
              connectedAccountId: 'ca_gmail_pending',
              redirectUrl: Option.none(),
            },
            {
              toolkit: 'github',
              connectedAccountId: 'ca_github_pending',
              redirectUrl: Option.some('https://auth.example.com/github'),
            },
          ],
        })
      );

      expect(state.gates.connect.status).toBe('blocked');
      expect(state.gates.connect.connectedAccountId).toBe('ca_github_pending');
      expect(state.gates.connect.redirectUrl).toBe('https://auth.example.com/github');
    });

    it('adopts the newest pending link toolkit when nothing was requested', () => {
      const state = resolveOnboardingState(
        facts({
          pendingLinks: [
            {
              toolkit: 'gmail',
              connectedAccountId: 'ca_gmail_pending',
              redirectUrl: Option.some('https://auth.example.com/gmail'),
            },
          ],
        })
      );

      expect(state.toolkit).toBe('gmail');
      expect(state.gates.connect.status).toBe('blocked');
      expect(state.gates.connect.redirectUrl).toBe('https://auth.example.com/gmail');
    });
  });

  describe('login gate', () => {
    it('echoes the email and org id it was given', () => {
      const state = resolveOnboardingState(
        facts({ email: Option.some('a@b.com'), orgId: Option.some('org_1') })
      );

      expect(state.gates.login.status).toBe('satisfied');
      expect(state.gates.login.email).toBe('a@b.com');
      expect(state.gates.login.orgId).toBe('org_1');
    });

    it('reports a null email rather than inventing one', () => {
      const state = resolveOnboardingState(facts({ email: Option.none() }));

      expect(state.gates.login.email).toBeNull();
    });
  });
});
