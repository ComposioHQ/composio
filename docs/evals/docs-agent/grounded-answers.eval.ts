import { defineEval } from 'eve/evals';

const cases = [
  {
    description: 'Explains session creation with current TypeScript APIs.',
    prompt:
      'In TypeScript, how do I create a Composio session for user `alice` with GitHub tools? Include the relevant docs link.',
    expectedSignals: [/composio\.(create|sessions\.create)/i, /github/i],
  },
  {
    description: 'Distinguishes auth configs from connected accounts.',
    prompt:
      'What is the difference between an auth config and a connected account in Composio? Keep it short and cite the docs.',
    expectedSignals: [/auth config/i, /connected account/i],
  },
  {
    description: 'Explains the session-based MCP setup path.',
    prompt:
      'How do I expose Composio session tools over MCP? Include the recommended `mcp: true` shape and cite the docs.',
    expectedSignals: [/mcp/i, /mcp\s*:\s*true/i],
  },
] as const;

export default cases.map(row =>
  defineEval({
    description: row.description,
    tags: ['docs-agent', 'model-flow', 'grounded-answer'],
    metadata: {
      suite: 'docs-agent-model-flow',
      prompt: row.prompt,
    },
    async test(t) {
      await t.send(row.prompt);

      t.completed();
      t.noFailedActions();
      t.calledTool('read_doc');
      t.maxToolCalls(6);
      t.messageIncludes(/\]\(\/(?:docs|reference)\//);

      for (const signal of row.expectedSignals) {
        t.messageIncludes(signal);
      }
    },
  })
);
