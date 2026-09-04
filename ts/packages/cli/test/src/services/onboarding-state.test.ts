import { describe, expect, it } from '@effect/vitest';
import {
  type OnboardingFacts,
  type OnboardStateDocument,
  resolveOnboardingState,
} from 'src/services/onboarding-state';

const facts = (overrides: Partial<OnboardingFacts> = {}): OnboardingFacts => ({
  loggedIn: true,
  toolkit: 'github',
  connection: 'active',
  hasExecuted: false,
  ...overrides,
});

describe('resolveOnboardingState', () => {
  const cases = [
    {
      name: 'requires login first',
      facts: facts({ loggedIn: false }),
      expected: {
        next_gate: 'login',
        blocked_reason: 'login_required',
        toolkit: 'github',
      },
    },
    {
      name: 'requires an explicit curated toolkit',
      facts: facts({ toolkit: null }),
      expected: {
        next_gate: 'connect',
        blocked_reason: 'toolkit_required',
        toolkit: null,
      },
    },
    {
      name: 'connects when no account exists',
      facts: facts({ connection: 'none' }),
      expected: { next_gate: 'connect', blocked_reason: null, toolkit: 'github' },
    },
    {
      name: 'waits for a pending authorization',
      facts: facts({ connection: 'pending' }),
      expected: {
        next_gate: 'connect',
        blocked_reason: 'oauth_required',
        toolkit: 'github',
      },
    },
    {
      name: 'executes after an active connection',
      facts: facts(),
      expected: { next_gate: 'execute', blocked_reason: null, toolkit: 'github' },
    },
    {
      name: 'finishes after the curated demo succeeds',
      facts: facts({ hasExecuted: true }),
      expected: { next_gate: null, blocked_reason: null, toolkit: 'github' },
    },
  ] as const;

  it.each(cases)('$name', ({ facts: input, expected }) => {
    const state = resolveOnboardingState(input);

    expect(state).toMatchObject(expected);
    expect(state.onboarded).toBe(expected.next_gate === null);
    expect(state.blocked).toBe(expected.blocked_reason !== null);
  });

  it('returns the complete flat v1 document contract', () => {
    expect(resolveOnboardingState(facts({ toolkit: null }))).toEqual({
      kind: 'onboard_state',
      version: 1,
      onboarded: false,
      next_gate: 'connect',
      blocked: true,
      blocked_reason: 'toolkit_required',
      human_action: 'Choose a toolkit to try.',
      next_command: null,
      toolkit: null,
      available_toolkits: ['github', 'gmail', 'slack', 'linear', 'notion'],
    } satisfies OnboardStateDocument);
  });
});
