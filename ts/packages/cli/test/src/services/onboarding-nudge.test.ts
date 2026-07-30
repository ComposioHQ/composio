import { describe, expect, it } from 'vitest';
import { getLocalOnboardNudge } from 'src/services/onboarding-nudge';

describe('getLocalOnboardNudge', () => {
  it('says nothing once an execution has been recorded', () => {
    expect(getLocalOnboardNudge({ loggedIn: true, hasExecuted: true })).toBeUndefined();
    expect(getLocalOnboardNudge({ loggedIn: false, hasExecuted: true })).toBeUndefined();
  });

  it('points a logged-out user at onboard', () => {
    const nudge = getLocalOnboardNudge({ loggedIn: false, hasExecuted: false });

    expect(nudge).toContain('composio onboard');
    expect(nudge).toContain('log in');
  });

  it('tells a logged-in user what is still missing', () => {
    const nudge = getLocalOnboardNudge({ loggedIn: true, hasExecuted: false });

    expect(nudge).toContain('composio onboard');
    expect(nudge).toContain('logged in');
  });

  it('never emits a placeholder', () => {
    for (const loggedIn of [true, false]) {
      const nudge = getLocalOnboardNudge({ loggedIn, hasExecuted: false });
      expect(nudge).not.toContain('<');
      expect(nudge).not.toContain('>');
    }
  });
});
