import { describe, expect, it } from 'vitest';
import { Array as Arr, Option, pipe } from 'effect';
import { nextAgentCommand } from 'src/services/onboarding-next-command';
import type { NextCommandContext } from 'src/services/onboarding-next-command';
import { resolveOnboardingState } from 'src/services/onboarding-state';
import type { HostWiringFact, OnboardingFacts } from 'src/services/onboarding-state';
import { ONBOARD_TASKS, onboardToolkitSlugs } from 'src/services/onboarding-tasks';

const NO_HOSTS: HostWiringFact = { kind: 'inspected', hosts: [] };

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

const stepFor = (overrides: Partial<OnboardingFacts> = {}, context: NextCommandContext = {}) => {
  const input = facts(overrides);
  return nextAgentCommand(resolveOnboardingState(input), input.requestedToolkit, context);
};

describe('nextAgentCommand', () => {
  it('reports done once every blocking gate passes', () => {
    const step = stepFor({
      requestedToolkit: Option.some('github'),
      connectedToolkits: ['github'],
      hasExecuted: EXECUTED,
    });

    expect(step).toStrictEqual({ kind: 'done' });
  });

  describe('login gate', () => {
    it('resumes with --poll once this invocation minted a session', () => {
      const step = stepFor({ loggedIn: false }, { loginUrl: 'https://app.composio.dev/l/abc' });

      expect(step.kind).toBe('blocked');
      if (step.kind !== 'blocked') return;
      expect(step.reason).toBe('browser_login_required');
      expect(step.command).toBe('composio login --poll');
      expect(step.command).not.toBe('composio login');
    });

    it('asks for a session first when no login URL was minted', () => {
      // `--status` advances nothing and a failed login delegate leaves nothing behind, so `--poll`
      // here would hand back a command that fails with "No pending login found" and moves no fact.
      const step = stepFor({ loggedIn: false });

      expect(step.kind).toBe('blocked');
      if (step.kind !== 'blocked') return;
      expect(step.reason).toBe('browser_login_required');
      expect(step.command).toBe('composio login --no-wait');
      expect(step.humanAction).toContain('composio login --no-wait');
    });

    it('interpolates the login URL when this invocation minted one', () => {
      const step = stepFor({ loggedIn: false }, { loginUrl: 'https://app.composio.dev/l/abc' });

      expect(step.kind).toBe('blocked');
      if (step.kind !== 'blocked') return;
      expect(step.humanAction).toContain('https://app.composio.dev/l/abc');
      expect(step.humanAction).toContain('composio login --poll');
    });

    it('describes the URL generically rather than emitting a placeholder', () => {
      const step = stepFor({ loggedIn: false });

      expect(step.kind).toBe('blocked');
      if (step.kind !== 'blocked') return;
      expect(step.humanAction).not.toContain('<');
      expect(step.humanAction).not.toContain('>');
    });
  });

  describe('connect gate', () => {
    it('returns the link command when the caller named a toolkit', () => {
      const step = stepFor({ requestedToolkit: Option.some('github') });

      expect(step).toStrictEqual({
        kind: 'command',
        command: 'composio link github --no-wait --no-browser',
      });
    });

    it('blocks with no command while a browser authorization is outstanding', () => {
      const step = stepFor({
        requestedToolkit: Option.some('github'),
        pendingLinks: [
          {
            toolkit: 'github',
            connectedAccountId: 'ca_pending',
            redirectUrl: Option.some('https://auth.example.com/github'),
          },
        ],
      });

      expect(step.kind).toBe('blocked');
      if (step.kind !== 'blocked') return;
      expect(step.reason).toBe('browser_authorization_required');
      expect(step.humanAction).toContain('https://auth.example.com/github');
      expect(step.humanAction).toContain('github');
      // A command here would reproduce the same state and loop the agent forever.
      expect(step.command).toBeUndefined();
    });

    it('points at composio link when the pending authorization has no URL to reopen', () => {
      const step = stepFor({
        requestedToolkit: Option.some('github'),
        pendingLinks: [
          {
            toolkit: 'github',
            connectedAccountId: 'ca_pending',
            redirectUrl: Option.none(),
          },
        ],
      });

      expect(step.kind).toBe('blocked');
      if (step.kind !== 'blocked') return;
      expect(step.reason).toBe('browser_authorization_required');
      expect(step.humanAction).toContain('composio link github');
      expect(step.command).toBeUndefined();
    });

    it('blocks with no command when the connection check failed', () => {
      const step = stepFor({
        requestedToolkit: Option.some('github'),
        connectedToolkits: 'unknown',
      });

      expect(step.kind).toBe('blocked');
      if (step.kind !== 'blocked') return;
      expect(step.reason).toBe('connection_check_failed');
      expect(step.command).toBeUndefined();
    });

    it('blocks with the curated slugs as data when no toolkit was requested', () => {
      const step = stepFor();

      expect(step.kind).toBe('blocked');
      if (step.kind !== 'blocked') return;
      expect(step.reason).toBe('toolkit_required');
      expect(step.command).toBeUndefined();
      expect(step.availableToolkits).toStrictEqual(onboardToolkitSlugs());
    });
  });

  describe('execute gate', () => {
    it('returns the curated demo execute with its registry arguments', () => {
      const step = stepFor({
        requestedToolkit: Option.some('gmail'),
        connectedToolkits: ['gmail'],
      });

      expect(step.kind).toBe('command');
      if (step.kind !== 'command') return;
      expect(step.command).toContain('composio execute "GMAIL_FETCH_EMAILS"');
      expect(step.command).toContain('"max_results":3');
    });

    it('blocks when the connect gate was skipped without a toolkit ever being named', () => {
      const step = stepFor({ invocationSkips: ['connect'] });

      expect(step.kind).toBe('blocked');
      if (step.kind !== 'blocked') return;
      expect(step.reason).toBe('toolkit_required');
      expect(step.command).toBeUndefined();
    });

    it('blocks when the demo ran on this invocation and did not succeed', () => {
      const step = stepFor(
        { requestedToolkit: Option.some('gmail'), connectedToolkits: ['gmail'] },
        { failedDemo: { toolSlug: 'GMAIL_FETCH_EMAILS', reason: null } }
      );

      expect(step.kind).toBe('blocked');
      if (step.kind !== 'blocked') return;
      expect(step.reason).toBe('demo_execution_failed');
      expect(step.humanAction).toContain('GMAIL_FETCH_EMAILS');
      // Re-issuing the call that just failed is what turns a polling caller into a loop.
      expect(step.command).toBeUndefined();
      expect(step.humanAction).not.toContain('<');
    });

    it('sends a revoked connection to `composio link`, not to `connections list`', () => {
      const step = stepFor(
        { requestedToolkit: Option.some('slack'), connectedToolkits: ['slack'] },
        { failedDemo: { toolSlug: 'SLACK_LIST_ALL_CHANNELS', reason: 'revoked_connection' } }
      );

      expect(step.kind).toBe('blocked');
      if (step.kind !== 'blocked') return;
      // Both traps, or the guidance is still unusable: the account reads ACTIVE so the diagnosis
      // looks wrong, and `composio link` on its own refuses while the dead account exists.
      expect(step.humanAction).toContain('ACTIVE');
      expect(step.humanAction).toContain('composio connections remove slack');
      expect(step.humanAction).toContain('composio link slack');
      expect(step.humanAction.indexOf('composio connections remove slack')).toBeLessThan(
        step.humanAction.lastIndexOf('composio link slack')
      );
    });

    it('sends a missing connection to `composio link` without the revoked wording', () => {
      const step = stepFor(
        { requestedToolkit: Option.some('slack'), connectedToolkits: ['slack'] },
        { failedDemo: { toolSlug: 'SLACK_LIST_ALL_CHANNELS', reason: 'no_active_connection' } }
      );

      expect(step.kind).toBe('blocked');
      if (step.kind !== 'blocked') return;
      expect(step.humanAction).toContain('composio link slack');
      expect(step.humanAction).not.toContain('ACTIVE');
      // A missing connection has nothing to remove; only the revoked branch names that step.
      expect(step.humanAction).not.toContain('connections remove');
    });

    it('names no command for a failure it could not classify', () => {
      const step = stepFor(
        { requestedToolkit: Option.some('slack'), connectedToolkits: ['slack'] },
        { failedDemo: { toolSlug: 'SLACK_LIST_ALL_CHANNELS', reason: null } }
      );

      expect(step.kind).toBe('blocked');
      if (step.kind !== 'blocked') return;
      // `composio connections list` reports ACTIVE for the one failure this branch is most likely
      // to be covering, so an unclassified failure gets no command rather than a plausible one.
      expect(step.humanAction).not.toContain('composio connections list');
      expect(step.humanAction).not.toContain('composio link');
    });

    it('defers with prose rather than a command for a non-curated toolkit', () => {
      const step = stepFor({
        requestedToolkit: Option.some('hubspot'),
        connectedToolkits: ['hubspot'],
      });

      expect(step.kind).toBe('deferred');
      if (step.kind !== 'deferred') return;
      expect(step.humanAction).toContain('composio search');
      expect(step.humanAction).toContain('hubspot');
    });
  });

  describe('the requested toolkit is echoed, never replaced', () => {
    it('never names a curated toolkit for a caller that asked for something else', () => {
      const step = stepFor({ requestedToolkit: Option.some('hubspot') });

      expect(step.kind).toBe('command');
      if (step.kind !== 'command') return;
      expect(step.command).toBe('composio link hubspot --no-wait --no-browser');
      for (const toolkit of onboardToolkitSlugs()) {
        expect(step.command).not.toContain(toolkit);
      }
    });

    it('never names any toolkit for a caller that asked for nothing', () => {
      const step = stepFor();

      expect(step.kind).toBe('blocked');
      if (step.kind !== 'blocked') return;
      for (const toolkit of onboardToolkitSlugs()) {
        expect(step.humanAction).not.toContain(toolkit);
      }
    });
  });

  describe('invariants over every Table A state', () => {
    const cases = pipe(
      Arr.Do,
      Arr.bind('loggedIn', () => [true, false] as const),
      Arr.bind(
        'connectedToolkits',
        () =>
          [['github'], ['gmail'], [], 'unknown'] as ReadonlyArray<ReadonlyArray<string> | 'unknown'>
      ),
      Arr.bind('hasExecuted', () => [EXECUTED, Option.none()] as const),
      Arr.bind(
        'requestedToolkit',
        () =>
          [Option.some('github'), Option.some('hubspot'), Option.none<string>()] as ReadonlyArray<
            Option.Option<string>
          >
      ),
      Arr.bind(
        'pendingLinks',
        () =>
          [
            [],
            [
              {
                toolkit: 'github',
                connectedAccountId: 'ca_pending',
                redirectUrl: Option.some('https://auth.example.com/github'),
              },
            ],
            // A newer link for a different toolkit must not hide the github one behind it.
            [
              {
                toolkit: 'gmail',
                connectedAccountId: 'ca_gmail_pending',
                redirectUrl: Option.none<string>(),
              },
              {
                toolkit: 'github',
                connectedAccountId: 'ca_pending',
                redirectUrl: Option.some('https://auth.example.com/github'),
              },
            ],
          ] as OnboardingFacts['pendingLinks'][]
      ),
      Arr.bind(
        'invocationSkips',
        () => [[], ['connect'], ['execute']] as ReadonlyArray<ReadonlyArray<'connect' | 'execute'>>
      )
    );

    it('never emits a command string containing a placeholder', () => {
      for (const axes of cases) {
        const step = stepFor(axes);
        const command =
          step.kind === 'command'
            ? step.command
            : step.kind === 'blocked'
              ? step.command
              : undefined;
        if (command === undefined) continue;

        expect(command).not.toContain('<');
        expect(command).not.toContain('>');
      }
    });

    it('never emits a human action containing a placeholder', () => {
      for (const axes of cases) {
        const step = stepFor(axes);
        if (step.kind !== 'blocked' && step.kind !== 'deferred') continue;

        expect(step.humanAction).not.toContain('<');
        expect(step.humanAction).not.toContain('>');
      }
    });

    it('never returns a command while the connect gate is blocked or unknown', () => {
      for (const axes of cases) {
        const input = facts(axes);
        const state = resolveOnboardingState(input);
        if (state.gates.connect.status !== 'blocked' && state.gates.connect.status !== 'unknown') {
          continue;
        }
        if (state.nextGate !== 'connect') continue;

        const step = nextAgentCommand(state, input.requestedToolkit);
        expect(step.kind).toBe('blocked');
        if (step.kind !== 'blocked') continue;
        expect(step.command).toBeUndefined();
      }
    });

    it('reports done for every onboarded state', () => {
      let onboardedCases = 0;

      for (const axes of cases) {
        const input = facts(axes);
        const state = resolveOnboardingState(input);
        if (!state.onboarded) continue;

        onboardedCases += 1;
        expect(nextAgentCommand(state, input.requestedToolkit).kind).toBe('done');
      }

      expect(onboardedCases).toBeGreaterThan(0);
    });

    it('never reports done while a blocking gate is outstanding', () => {
      for (const axes of cases) {
        const input = facts(axes);
        const state = resolveOnboardingState(input);
        if (nextAgentCommand(state, input.requestedToolkit).kind !== 'done') continue;

        expect(state.nextGate).toBeNull();
      }
    });

    it('never reports done while onboarding is unfinished', () => {
      // `done` produces a document with `blocked: false`, `human_action: null` and
      // `next_command: null`. Paired with `onboarded: false` — which `--skip` produces — that is a
      // document a polling caller can neither act on nor exit on.
      for (const axes of cases) {
        const input = facts(axes);
        const state = resolveOnboardingState(input);
        if (nextAgentCommand(state, input.requestedToolkit).kind !== 'done') continue;

        expect(state.onboarded).toBe(true);
      }
    });

    it('states the reason when a skip left onboarding unfinished', () => {
      const step = stepFor({
        requestedToolkit: Option.some('github'),
        connectedToolkits: ['github'],
        invocationSkips: ['execute'],
      });

      expect(step.kind).toBe('deferred');
      if (step.kind !== 'deferred') return;
      expect(step.humanAction).toContain('--skip');
      expect(step.humanAction).toContain('composio onboard');
    });

    /**
     * The no-loop property: every command must change at least one fact in `OnboardingFacts`, so
     * an agent that runs it makes progress rather than re-reading the same state.
     */
    const FACT_CHANGED_BY: ReadonlyArray<{
      readonly matches: (command: string) => boolean;
      readonly fact: keyof OnboardingFacts;
    }> = [
      { matches: command => command.startsWith('composio login'), fact: 'loggedIn' },
      { matches: command => command.startsWith('composio link'), fact: 'pendingLinks' },
      { matches: command => command.startsWith('composio execute'), fact: 'hasExecuted' },
    ];

    it('maps every emitted command to a fact it mutates', () => {
      const emitted = new Set<string>();

      for (const axes of cases) {
        const step = stepFor(axes);
        const command =
          step.kind === 'command'
            ? step.command
            : step.kind === 'blocked'
              ? step.command
              : undefined;
        if (command === undefined) continue;
        emitted.add(command);

        const entry = FACT_CHANGED_BY.find(candidate => candidate.matches(command));
        expect(entry, `no fact is mutated by "${command}"`).toBeDefined();
      }

      // Guards against the property passing because nothing was emitted at all.
      expect(emitted.size).toBeGreaterThan(0);
    });

    it('never suggests a command that onboard itself would run again', () => {
      for (const axes of cases) {
        const step = stepFor(axes);
        const command =
          step.kind === 'command'
            ? step.command
            : step.kind === 'blocked'
              ? step.command
              : undefined;
        if (command === undefined) continue;

        expect(command).not.toContain('composio onboard');
      }
    });

    it('offers only curated toolkits when it offers any', () => {
      for (const axes of cases) {
        const step = stepFor(axes);
        if (step.kind !== 'blocked' || step.availableToolkits === undefined) continue;

        expect(step.availableToolkits).toStrictEqual(ONBOARD_TASKS.map(task => task.toolkit));
      }
    });
  });
});
