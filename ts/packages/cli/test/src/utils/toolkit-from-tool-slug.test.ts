import { describe, expect, it } from '@effect/vitest';
import {
  guessToolkitFromToolSlug,
  longestPrefix,
  matchToolkitFromToolSlug,
} from 'src/utils/toolkit-from-tool-slug';

describe('guessToolkitFromToolSlug', () => {
  it('takes the text before the first underscore', () => {
    expect(guessToolkitFromToolSlug('GITHUB_CREATE_ISSUE')).toBe('github');
  });

  it('lowercases a slug without underscores', () => {
    expect(guessToolkitFromToolSlug('GITHUB')).toBe('github');
  });

  it('returns undefined for composio meta slugs', () => {
    expect(guessToolkitFromToolSlug('COMPOSIO_ENABLE_TRIGGER')).toBeUndefined();
  });

  it('cannot recover multi-word toolkit slugs', () => {
    expect(guessToolkitFromToolSlug('GOOGLE_ANALYTICS_RUN_REPORT')).toBe('google');
  });
});

describe('longestPrefix', () => {
  it('tries candidates longest-first at each underscore boundary', () => {
    const known = ['a', 'a_b', 'a_b_c'];
    expect(longestPrefix('A_B_C_D', known)).toBe('a_b_c');
    expect(longestPrefix('A_B_X_Y', known)).toBe('a_b');
    expect(longestPrefix('A_X_Y_Z', known)).toBe('a');
  });

  it('returns undefined when no candidate is known', () => {
    expect(longestPrefix('A_B_C_D', ['other'])).toBeUndefined();
    expect(longestPrefix('A_B_C_D', [])).toBeUndefined();
  });

  it('never matches the whole tool slug as a toolkit', () => {
    expect(longestPrefix('A_B', ['a_b'])).toBeUndefined();
  });

  it('applies no policy: the composio candidate is returned as-is', () => {
    expect(longestPrefix('COMPOSIO_ENABLE_TRIGGER', ['composio'])).toBe('composio');
  });
});

describe('matchToolkitFromToolSlug', () => {
  const knownToolkits = [
    'github',
    'google',
    'google_analytics',
    'gmail',
    'microsoft',
    'microsoft_teams',
  ];

  it('resolves multi-word toolkits by longest known prefix', () => {
    expect(matchToolkitFromToolSlug('GOOGLE_ANALYTICS_RUN_REPORT', knownToolkits)).toBe(
      'google_analytics'
    );
    expect(matchToolkitFromToolSlug('MICROSOFT_TEAMS_SEND_MESSAGE', knownToolkits)).toBe(
      'microsoft_teams'
    );
  });

  it('tries candidates longest-first at each underscore boundary', () => {
    const known = ['reddit', 'reddit_ads'];
    expect(matchToolkitFromToolSlug('REDDIT_ADS_GET_CAMPAIGN', known)).toBe('reddit_ads');
    expect(matchToolkitFromToolSlug('REDDIT_GET_POST', known)).toBe('reddit');
  });

  it('resolves single-word toolkits', () => {
    expect(matchToolkitFromToolSlug('GITHUB_CREATE_ISSUE', knownToolkits)).toBe('github');
  });

  it('is independent of the known-list order', () => {
    expect(
      matchToolkitFromToolSlug('MICROSOFT_TEAMS_SEND_MESSAGE', [...knownToolkits].reverse())
    ).toBe('microsoft_teams');
  });

  it('falls back to the guess when no known toolkit matches', () => {
    expect(matchToolkitFromToolSlug('NOTION_CREATE_PAGE', knownToolkits)).toBe('notion');
  });

  it('falls back to the guess with an empty known list', () => {
    expect(matchToolkitFromToolSlug('GOOGLE_ANALYTICS_RUN_REPORT', [])).toBe('google');
  });

  it('returns undefined for composio meta slugs even when composio is known', () => {
    expect(matchToolkitFromToolSlug('COMPOSIO_ENABLE_TRIGGER', ['composio'])).toBeUndefined();
  });

  it('prefers a longer composio-prefixed toolkit over the meta guard', () => {
    expect(
      matchToolkitFromToolSlug('COMPOSIO_SEARCH_NEWS_SEARCH', ['composio', 'composio_search'])
    ).toBe('composio_search');
  });
});
