import { describe, expect, it } from '@effect/vitest';
import { Option } from 'effect';
import { CURATED_ONBOARDING_TASKS, findCuratedOnboardingTask } from 'src/services/onboarding-tasks';

describe('curated onboarding tasks', () => {
  it('contains exactly the five reviewed read-only demos and fixed arguments', () => {
    expect(
      CURATED_ONBOARDING_TASKS.map(({ toolkit, tool, args }) => ({ toolkit, tool, args }))
    ).toEqual([
      { toolkit: 'github', tool: 'GITHUB_GET_THE_AUTHENTICATED_USER', args: {} },
      {
        toolkit: 'gmail',
        tool: 'GMAIL_FETCH_EMAILS',
        args: { max_results: 3, verbose: false },
      },
      { toolkit: 'slack', tool: 'SLACK_LIST_ALL_CHANNELS', args: { limit: 10 } },
      { toolkit: 'linear', tool: 'LINEAR_LIST_LINEAR_ISSUES', args: { first: 5 } },
      {
        toolkit: 'notion',
        tool: 'NOTION_SEARCH_NOTION_PAGE',
        args: { query: '', page_size: 5 },
      },
    ]);
  });

  it('returns only allowlisted summaries from provider payloads', () => {
    const payloads = [
      { data: { login: 'octocat', email: 'private@example.com' } },
      { data: { messages: [{ subject: 'secret' }, { subject: 'private' }] } },
      { data: { channels: [{ name: 'private-channel' }] } },
      { data: { issues: [{ title: 'confidential issue' }] } },
      { data: { results: [{ title: 'private page' }, { title: 'another page' }] } },
    ];

    expect(CURATED_ONBOARDING_TASKS.map((task, index) => task.summarize(payloads[index]))).toEqual([
      'Signed in to GitHub as octocat.',
      'Read 2 message(s) from Gmail.',
      'Found 1 Slack channel(s).',
      'Found 1 Linear issue(s).',
      'Found 2 Notion result(s).',
    ]);
  });

  it('rejects empty and unsupported toolkit slugs', () => {
    expect(Option.isNone(findCuratedOnboardingTask(''))).toBe(true);
    expect(Option.isNone(findCuratedOnboardingTask('hubspot'))).toBe(true);
    expect(Option.isSome(findCuratedOnboardingTask(' GitHub '))).toBe(true);
  });
});
