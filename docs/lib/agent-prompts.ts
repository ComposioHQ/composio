export type AgentFirstPromptProps = {
  agent:
  | 'claude-code'
  | 'cline'
  | 'codex'
  | 'cursor'
  | 'gemini-cli'
  | 'github-copilot'
  | 'grok'
  | 'openclaw'
  | 'opencode';
};

const SKILL_INSTRUCTION: Record<AgentFirstPromptProps['agent'], string> = {
  'claude-code': 'Use the /composio skill to get Composio working in this codebase.',
  cline: 'Use the composio agent skill to get Composio working in this codebase.',
  codex: 'Use the $composio skill to get Composio working in this codebase.',
  cursor: 'Use the composio agent skill to get Composio working in this codebase.',
  'gemini-cli': 'Use the composio agent skill to get Composio working in this codebase.',
  'github-copilot': 'Use /composio to get Composio working in this codebase.',
  grok: 'Use the composio agent skill to get Composio working in this codebase.',
  openclaw: 'Use the composio agent skill to get Composio working in this codebase.',
  opencode: 'Use the composio agent skill to get Composio working in this codebase.',
};

export const promptFor = (agent: AgentFirstPromptProps['agent']) => `${SKILL_INSTRUCTION[agent]}

Help me connect an integration and make my first real tool call.
When it works, show me what changed and what I can try next.`;

export const SETUP_PROMPT = `Help me add Composio to this project. First, inspect the codebase to understand its framework, agent architecture, authentication, and user or tenant identity model.

Check whether the official \`composio\` Agent Skill is installed. If it is missing, install it for this project with:

\`npx skills add ComposioHQ/composio --skill composio\`

Then load and follow the skill. If installation requires approval, ask for it. If the host does not support skills or installation fails, use the current documentation at [https://docs.composio.dev](https://docs.composio.dev) and report that fallback.

Default to Composio Platform for application codebases. Use Composio For You only when the project clearly configures a personal agent or automation for the developer’s own accounts.

Based on the codebase, explain briefly where Composio would fit. Then ask what I want my users or agent to accomplish with connected apps. If the project suggests likely use cases, offer a few relevant options. If it is not clear whether I want to build Composio into the application or connect it to my coding agent, ask me before making changes.`;

