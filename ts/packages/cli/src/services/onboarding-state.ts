import { Match } from 'effect';
import { type CuratedToolkit, curatedToolkitSlugs } from 'src/services/onboarding-tasks';

export type OnboardingFacts = {
  readonly loggedIn: boolean;
  readonly toolkit: CuratedToolkit | null;
  readonly connection: 'none' | 'pending' | 'active';
  readonly hasExecuted: boolean;
};

export type OnboardingGate = 'login' | 'connect' | 'execute';
export type OnboardingBlockedReason = 'login_required' | 'toolkit_required' | 'oauth_required';

export type OnboardStateDocument = {
  readonly kind: 'onboard_state';
  readonly version: 1;
  readonly onboarded: boolean;
  readonly next_gate: OnboardingGate | null;
  readonly blocked: boolean;
  readonly blocked_reason: OnboardingBlockedReason | null;
  readonly human_action: string | null;
  readonly next_command: string | null;
  readonly toolkit: CuratedToolkit | null;
  readonly available_toolkits?: ReadonlyArray<CuratedToolkit>;
};

const state = (
  facts: OnboardingFacts,
  nextGate: OnboardingGate | null,
  blockedReason: OnboardingBlockedReason | null,
  humanAction: string | null,
  nextCommand: string | null
): OnboardStateDocument => ({
  kind: 'onboard_state',
  version: 1,
  onboarded: nextGate === null,
  next_gate: nextGate,
  blocked: blockedReason !== null,
  blocked_reason: blockedReason,
  human_action: humanAction,
  next_command: nextCommand,
  toolkit: facts.toolkit,
});

export const resolveOnboardingState = (facts: OnboardingFacts): OnboardStateDocument => {
  if (!facts.loggedIn) {
    return state(facts, 'login', 'login_required', 'Sign in to Composio.', 'composio login');
  }

  if (facts.toolkit === null) {
    return {
      ...state(facts, 'connect', 'toolkit_required', 'Choose a toolkit to try.', null),
      available_toolkits: curatedToolkitSlugs(),
    };
  }

  return Match.value(facts.connection).pipe(
    Match.when('none', () =>
      state(
        facts,
        'connect',
        null,
        `Connect ${facts.toolkit} to Composio.`,
        `composio link ${facts.toolkit}`
      )
    ),
    Match.when('pending', () =>
      state(facts, 'connect', 'oauth_required', null, `composio link ${facts.toolkit}`)
    ),
    Match.when('active', () =>
      facts.hasExecuted
        ? state(facts, null, null, null, null)
        : state(facts, 'execute', null, null, `composio onboard --toolkit ${facts.toolkit}`)
    ),
    Match.exhaustive
  );
};
