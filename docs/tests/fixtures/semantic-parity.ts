import assert from 'node:assert/strict';

// Reviewed expectations, independent of the converter and its shared constants.
// Keep commands with their arguments and warnings with their limiting condition.
export const parityPages = [
  {
    url: '/docs',
    facts: [
      ['platform-choice', 'Platform'],
      ['for-you-choice', 'For You'],
      ['build-destination', '/docs/quickstart'],
      ['use-destination', '/docs/agent-plugins'],
    ],
  },
  {
    url: '/docs/quickstart',
    facts: [
      ['typescript-install', 'npm install @composio/core @composio/openai-agents @openai/agents'],
      ['python-install', 'uv add python-dotenv composio composio-openai-agents openai-agents'],
      ['package-choice', 'Use @composio/slim for a smaller install with the same API.'],
      ['legacy-package-warning', 'it calls deprecated APIs and does not work with sessions'],
      ['python-session-example', 'session = composio.sessions.create(user_id=user_id)'],
      ['typescript-session-example', 'const session = await composio.create(userId);'],
    ],
  },
  {
    url: '/docs/providers/anthropic',
    facts: [
      ['typescript-provider-install', 'npm install @composio/core @composio/anthropic @anthropic-ai/sdk'],
      ['python-provider-install', 'pip install composio composio_anthropic anthropic'],
      ['provider-loop-example', 'results = composio.provider.handle_tool_calls(response=response, session=session)'],
      ['provider-version-condition', 'newer than 0.19.0'],
    ],
  },
  {
    url: '/docs/agent-plugins',
    facts: [
      ['cli-install', 'curl -fsSL https://composio.dev/install | sh'],
      ['login-and-setup', 'composio login\ncomposio setup --target auto'],
      ['noninteractive-setup', 'composio setup --target auto --yes'],
      ['sdk-alternative', '/docs/quickstart'],
    ],
  },
  {
    url: '/docs/agent-setup/clients',
    facts: [
      ['codex-project-skill', 'npx skills add ComposioHQ/composio --skill composio --agent codex'],
      ['codex-prompt', 'Use the $composio skill'],
      ['claude-prompt', 'Use the /composio skill'],
    ],
  },
  {
    url: '/reference/api-reference/tools',
    facts: [
      ['current-list-endpoint', '`/api/v3.1/tools`'],
      ['toolkit-version-requirement', 'Manual tool execution requires an explicit toolkit version.'],
      ['proxy-security-boundary', 'Proxy execute rejects cross-domain requests'],
      ['typescript-proxy-example', "connectedAccountId: 'ca_github_user_123'"],
    ],
  },
  {
    url: '/reference/v3/api-reference/tools',
    facts: [
      ['legacy-list-endpoint', '`/api/v3/tools`'],
      ['legacy-execute-endpoint', '`/api/v3/tools/execute/{tool_slug}`'],
    ],
  },
] as const;

export type ParityPage = (typeof parityPages)[number];

export function assertPageFacts(text: string, page: ParityPage, surface: string) {
  for (const [id, expected] of page.facts) {
    assert.ok(text.includes(expected), `${surface} ${page.url} lost fact ${id}: ${expected}`);
  }
}

// Scope corpus assertions to one page so another page cannot hide missing facts.
export function corpusPages(text: string): Map<string, string> {
  const headings = [...text.matchAll(/^# [^\n]+ \((\/[^\s)]+)\)\r?$/gm)];
  return new Map(headings.map((heading, index) => [
    heading[1],
    text.slice(heading.index, headings[index + 1]?.index ?? text.length),
  ]));
}
