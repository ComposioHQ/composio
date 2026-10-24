import assert from 'node:assert/strict';

// Reviewed expectations, independent of the converter and its shared constants.
// Keep commands with their arguments and warnings with their limiting condition.
export const parityPages = [
  {
    url: '/docs',
    facts: [
      ['platform-choice', 'Platform'],
      ['for-you-choice', 'For You'],
      ['platform-selection', 'Add Composio into your agent or app.'],
      ['for-you-selection', 'Use Composio yourself with agents you already have.'],
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
      ['current-python-package', 'The current Python package is `composio`. The package `composio-core` is the legacy v1 SDK'],
      ['python-session-example', 'session = composio.sessions.create(user_id=user_id)'],
      ['typescript-session-example', 'const session = await composio.create(userId);'],
    ],
  },
  {
    url: '/docs/providers/anthropic',
    facts: [
      ['typescript-provider-install', 'npm install @composio/core @composio/anthropic @anthropic-ai/sdk'],
      ['python-provider-install', 'pip install composio composio_anthropic anthropic'],
      ['provider-version-condition', 'requires `composio` newer than 0.19.0 (Python) or `@composio/core` ≥ 0.17.0 with `@composio/anthropic` ≥ 0.11.0 (TypeScript)'],
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
      ['typescript-proxy-example', "const { status, data } = await composio.tools.proxyExecute({\n  endpoint: '/repos/composiohq/composio/issues/1',\n  method: 'GET',\n  connectedAccountId: 'ca_github_user_123',\n  parameters: [{ name: 'Accept', value: 'application/vnd.github.v3+json', in: 'header' }],\n});"],
    ],
  },
  {
    url: '/reference/v3/api-reference/tools',
    facts: [
      ['legacy-list-endpoint', '`/api/v3/tools`'],
      ['legacy-execute-endpoint', '`/api/v3/tools/execute/{tool_slug}`'],
    ],
  },
  {
    url: '/examples/standup-slackbot',
    facts: [
      ['toolkit-selection', 'Rule of thumb: posting *as the bot* uses `slackbot`; doing something *as a person* uses `slack`.'],
      ['selection-image', '![Choosing the Slackbot toolkit, not Slack](/images/standup-slackbot/auth-config-slackbot.png)\n*Pick Slackbot, not Slack*'],
      ['staged-setup-example', "const session = await composio.create('default', {\n    authConfigs: { slackbot: AUTH_CONFIG },\n  });"],
      ['repository-availability-warning', 'The standup bot browser is a documentation snapshot; a public repository is not available.'],
      ['setup-command', 'npx tsx scripts/setup.ts'],
    ],
  },
] as const;

export type ParityPage = (typeof parityPages)[number];

export function assertPageFacts(text: string, page: ParityPage, surface: string) {
  // Line wrapping and paragraph separators can change during ingestion.
  // Keep every non-whitespace character, including command flags and API versions.
  const normalized = text.replace(/\s+/g, ' ');
  const failures = page.facts
    .filter(([, expected]) => !normalized.includes(expected.replace(/\s+/g, ' ')))
    .map(([id, expected]) => `${surface} ${page.url} lost fact ${id}: ${expected}`);
  assert.equal(failures.length, 0, failures.join('\n'));
}

// Scope corpus assertions to one page so another page cannot hide missing facts.
export function corpusPages(text: string): Map<string, string> {
  const headings = [...text.matchAll(/^# [^\n]+ \((\/[^\s)]+)\)\r?$/gm)];
  return new Map(headings.map((heading, index) => [
    heading[1],
    text.slice(heading.index, headings[index + 1]?.index ?? text.length),
  ]));
}
