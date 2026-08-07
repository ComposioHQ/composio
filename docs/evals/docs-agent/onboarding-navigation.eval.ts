import { defineEval } from 'eve/evals';

const cases = [
  {
    description: 'Routes a Python app builder to the Quickstart.',
    prompt:
      'I want to build a Python agent that can use GitHub through Composio. Which single docs page should I start with? Answer briefly and link it.',
    expectedSignals: [/python/i, /github/i, /\/docs\/quickstart\b/],
  },
  {
    description: 'Routes a Claude Code user without requiring an SDK app.',
    prompt:
      'I want to use the Composio Claude Code plugin specifically, not the general MCP setup or an SDK app. Which guide should I follow? Answer briefly and link it.',
    expectedSignals: [/claude\s+code/i, /\/docs\/claude-code-plugin\b/],
  },
  {
    description: 'Explains the build versus use starting paths.',
    prompt:
      'Open the Welcome page. What exact two headings does it use to separate the ways to start with Composio? Place SDK or frameworks, an MCP client, and the CLI under the right heading, then cite the starting docs.',
    expectedSignals: [
      /build with composio/i,
      /use composio/i,
      /sdk|framework/i,
      /mcp/i,
      /cli/i,
      /\/docs\/(?:quickstart|composio-connect|cli|sessions-via-mcp)\b/,
    ],
  },
  {
    description: 'Does not require completing one framework before choosing another.',
    prompt:
      'I already use LangChain. Do I need to finish the OpenAI Agents quickstart before trying Composio with LangChain? Answer directly and cite the docs.',
    expectedSignals: [
      /\bno\b|do not|don't|not need/i,
      /langchain/i,
      /\/docs\/(?:quickstart|providers\/langchain)\b/,
    ],
  },
] as const;

export default cases.map(row =>
  defineEval({
    description: row.description,
    tags: ['docs-agent', 'onboarding', 'navigation'],
    metadata: {
      suite: 'docs-agent-onboarding-navigation',
      prompt: row.prompt,
    },
    async test(t) {
      await t.send(row.prompt);

      t.succeeded();
      t.noFailedActions();
      t.maxToolCalls(3);

      for (const signal of row.expectedSignals) {
        t.messageIncludes(signal);
      }
    },
  })
);
