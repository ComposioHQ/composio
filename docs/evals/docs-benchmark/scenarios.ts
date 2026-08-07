export type DocsBenchmarkCategory =
  | 'start-and-route'
  | 'find-and-change'
  | 'build-examples'
  | 'legacy-and-safety';

export interface DocsBenchmarkScenario {
  id: string;
  title: string;
  category: DocsBenchmarkCategory;
  prompt: string;
  expectedRoutes: string[];
  forbiddenRoutes?: string[];
  expectedContent: RegExp[];
  citation?: boolean;
  maxToolCalls?: number;
}

export const DOCS_BENCHMARK_SCENARIOS: DocsBenchmarkScenario[] = [
  {
    id: 'start-overview',
    title: 'Choose between building and using Composio',
    category: 'start-and-route',
    prompt:
      'I am new to Composio. What are my main ways to get started, and which page should I use to choose? Keep it brief and cite the docs.',
    expectedRoutes: ['/docs'],
    expectedContent: [/build/i, /us(?:e|ing)/i],
  },
  {
    id: 'start-python-github',
    title: 'Start a Python GitHub agent',
    category: 'start-and-route',
    prompt:
      'I want to build a Python agent that can use GitHub through Composio. Give me the best first docs page, not a list of every option.',
    expectedRoutes: ['/docs/quickstart'],
    expectedContent: [/python/i, /github/i],
  },
  {
    id: 'start-typescript',
    title: 'Start a TypeScript application',
    category: 'start-and-route',
    prompt:
      'I am adding Composio to a TypeScript agent application. Where should I choose my framework or provider integration? Link the most useful starting page.',
    expectedRoutes: ['/docs/providers'],
    expectedContent: [/typescript|framework|provider/i],
  },
  {
    id: 'choose-framework',
    title: 'Compare supported frameworks',
    category: 'start-and-route',
    prompt:
      'Where can I see the supported agent frameworks before I pick one? Mention a few choices and cite the index page.',
    expectedRoutes: ['/docs/providers'],
    expectedContent: [/framework|provider|adapter/i, /openai|anthropic|langchain|vercel|crewai|autogen/i],
  },
  {
    id: 'claude-code-default',
    title: 'Prefer the Claude Code plugin or CLI',
    category: 'start-and-route',
    prompt:
      'I use Claude Code and want it to work with GitHub and Slack through Composio. I am not building an SDK application and I did not ask for MCP. What should I install or use?',
    expectedRoutes: ['/docs/claude-code-plugin', '/docs/cli'],
    forbiddenRoutes: ['/docs/composio-connect', '/docs/sessions-via-mcp'],
    expectedContent: [/plugin|cli/i],
  },
  {
    id: 'claude-code-plugin-explicit',
    title: 'Install the Claude Code plugin',
    category: 'start-and-route',
    prompt:
      'I specifically want the Composio Claude Code plugin. Show the two install commands and cite the plugin guide.',
    expectedRoutes: ['/docs/claude-code-plugin'],
    forbiddenRoutes: ['/docs/composio-connect'],
    expectedContent: [/plugin marketplace add/i, /plugin install/i],
  },
  {
    id: 'terminal-cli',
    title: 'Use Composio from a terminal',
    category: 'start-and-route',
    prompt:
      'I want to search tools, connect accounts, and run actions from my terminal without building an app. Which Composio surface should I use?',
    expectedRoutes: ['/docs/cli'],
    forbiddenRoutes: ['/docs/composio-connect', '/docs/sessions-via-mcp'],
    expectedContent: [/cli|command line/i],
  },
  {
    id: 'agent-skill',
    title: 'Install Composio as an agent skill',
    category: 'start-and-route',
    prompt:
      'I want my coding agent to learn how to operate the Composio CLI. Is there a reusable agent skill I can install? Give the command and a docs citation.',
    expectedRoutes: ['/docs/agent-plugins'],
    forbiddenRoutes: ['/docs/composio-connect'],
    expectedContent: [/skill/i, /composio/i],
  },
  {
    id: 'codex-without-mcp',
    title: 'Prefer the native plugin for Codex',
    category: 'start-and-route',
    prompt:
      'I use Codex in a repository and want it to operate Composio for development work. I did not ask for MCP. What should I set up first?',
    expectedRoutes: ['/docs/agent-plugins'],
    forbiddenRoutes: ['/docs/composio-connect', '/docs/sessions-via-mcp'],
    expectedContent: [/codex/i, /plugin/i],
  },
  {
    id: 'codex-plugin-explicit',
    title: 'Install the Codex plugin directly',
    category: 'start-and-route',
    prompt:
      'I specifically want the native Composio plugin for Codex. Show the direct Codex marketplace and plugin install commands, then cite the guide.',
    expectedRoutes: ['/docs/agent-plugins'],
    forbiddenRoutes: ['/docs/composio-connect', '/docs/sessions-via-mcp'],
    expectedContent: [/codex plugin marketplace add/i, /codex plugin add/i],
  },
  {
    id: 'cursor-explicit-mcp',
    title: 'Connect Cursor when MCP is explicit',
    category: 'start-and-route',
    prompt:
      'I explicitly want to connect Cursor to Composio over MCP, without writing an SDK app. Which guide should I follow?',
    expectedRoutes: ['/docs/composio-connect'],
    expectedContent: [/mcp/i, /connect/i],
  },
  {
    id: 'generic-mcp-client',
    title: 'Connect an existing MCP client',
    category: 'start-and-route',
    prompt:
      'I already have an MCP client and explicitly want a Composio MCP URL, not an SDK session. Point me to the right setup.',
    expectedRoutes: ['/docs/composio-connect'],
    expectedContent: [/mcp/i, /connect/i],
  },
  {
    id: 'application-session-mcp',
    title: 'Expose an application session over MCP',
    category: 'start-and-route',
    prompt:
      'I am building an application with the Composio SDK and explicitly need to expose one user session to my framework over MCP. Which guide and configuration should I use?',
    expectedRoutes: ['/docs/sessions-via-mcp'],
    forbiddenRoutes: ['/docs/composio-connect'],
    expectedContent: [/mcp\s*:\s*true/i, /session\.mcp/i],
  },
  {
    id: 'auth-config-vs-account',
    title: 'Distinguish auth configs and connected accounts',
    category: 'find-and-change',
    prompt:
      'What is the difference between an auth config and a connected account in Composio? Give me the page that explains the relationship.',
    expectedRoutes: ['/docs/authentication'],
    expectedContent: [/auth config/i, /connected account/i],
  },
  {
    id: 'custom-oauth',
    title: 'Bring a custom OAuth app',
    category: 'find-and-change',
    prompt:
      'I need users to see my brand on the OAuth consent screen instead of Composio. Where do I learn when and how to bring my own OAuth app?',
    expectedRoutes: ['/docs/custom-app-vs-managed-app', '/docs/white-labeling-authentication'],
    expectedContent: [/custom auth|own oauth|custom oauth/i, /brand|consent/i],
  },
  {
    id: 'oauth-scopes',
    title: 'Change OAuth scopes',
    category: 'find-and-change',
    prompt:
      'The default OAuth permissions are too broad. How do I change the scopes Composio requests and where is that documented?',
    expectedRoutes: ['/docs/controlling-scopes'],
    expectedContent: [/scope/i, /auth config/i],
  },
  {
    id: 'multiple-accounts',
    title: 'Manage multiple connected accounts',
    category: 'find-and-change',
    prompt:
      'One user needs both a work and personal Gmail account. Find the guide for managing multiple connected accounts and explain how I choose one for a session.',
    expectedRoutes: ['/docs/managing-multiple-connected-accounts'],
    expectedContent: [/multiple/i, /connected account/i],
  },
  {
    id: 'configure-session-tools',
    title: 'Limit tools in a session',
    category: 'find-and-change',
    prompt:
      'I want a session to expose only selected GitHub tools instead of the whole toolkit. Find the current session configuration guide and show the relevant option.',
    expectedRoutes: ['/docs/configuring-sessions'],
    expectedContent: [/tool/i, /github/i],
  },
  {
    id: 'create-trigger',
    title: 'Create a trigger',
    category: 'find-and-change',
    prompt:
      'I need my agent to react when a new event arrives from an app. Find the current guide for creating a Composio trigger.',
    expectedRoutes: ['/docs/setting-up-triggers/creating-triggers', '/docs/triggers'],
    expectedContent: [/trigger/i],
  },
  {
    id: 'subscribe-events',
    title: 'Subscribe to trigger events',
    category: 'find-and-change',
    prompt:
      'After creating a trigger, how does my application receive its events? Find the guide for subscribing to events.',
    expectedRoutes: ['/docs/setting-up-triggers/subscribing-to-events'],
    expectedContent: [/event/i, /subscribe|webhook/i],
  },
  {
    id: 'sandbox',
    title: 'Choose a sandbox',
    category: 'find-and-change',
    prompt:
      'My agent needs to work with files and run code safely. Where do the docs compare or explain Composio local and remote sandbox options?',
    expectedRoutes: ['/docs/sandbox/local', '/docs/sandbox/remote'],
    expectedContent: [/sandbox/i, /local|remote/i],
  },
  {
    id: 'custom-tools',
    title: 'Add a custom tool or toolkit',
    category: 'find-and-change',
    prompt:
      'I need to add one of my own application functions alongside Composio tools in a session. Find the guide for custom tools and toolkits.',
    expectedRoutes: ['/docs/extending-sessions/custom-tools-and-toolkits'],
    expectedContent: [/custom tool/i, /session/i],
  },
  {
    id: 'proxy-execute',
    title: 'Call an authenticated app API',
    category: 'find-and-change',
    prompt:
      'I need an authenticated API endpoint that is not exposed as a normal Composio tool. Which feature lets me call the upstream API with a connected account?',
    expectedRoutes: ['/docs/extending-sessions/proxy-execute'],
    expectedContent: [/proxy/i, /authenticated|connected account|stored credentials|inject.*credentials/i],
  },
  {
    id: 'migrate-direct-to-sessions',
    title: 'Migrate direct execution to sessions',
    category: 'find-and-change',
    prompt:
      'Our existing integration fetches and executes tools directly. Find the migration guide for moving new code to sessions and summarize the first change.',
    expectedRoutes: ['/docs/migration-guide/direct-to-sessions'],
    expectedContent: [/session/i, /direct/i],
  },
  {
    id: 'migrate-mcp-to-sessions',
    title: 'Migrate old MCP servers to sessions',
    category: 'find-and-change',
    prompt:
      'We use the older Composio MCP server API and want the current session-based MCP approach. Which migration guide should we follow?',
    expectedRoutes: ['/docs/migration-guide/mcp-servers-to-sessions'],
    expectedContent: [/mcp/i, /session/i],
  },
  {
    id: 'build-slackbot',
    title: 'Build the standup Slack bot example',
    category: 'build-examples',
    prompt:
      'Find a complete Composio example for building a Slack standup bot. Link the example and tell me what stack it uses.',
    expectedRoutes: ['/examples/standup-slackbot'],
    expectedContent: [/slack/i, /standup/i],
  },
  {
    id: 'build-pr-reviewer',
    title: 'Build the local PR reviewer example',
    category: 'build-examples',
    prompt:
      'I want an example that reviews pull requests using a local sandbox. Find the closest complete example and link it.',
    expectedRoutes: ['/examples/local-sandbox-pr-reviewer'],
    expectedContent: [/pull.?request|pr.?reviewer/i, /sandbox/i],
  },
  {
    id: 'build-imessage-agent',
    title: 'Build the iMessage agent example',
    category: 'build-examples',
    prompt:
      'Find the Composio example for an iMessage agent and tell me which page contains the implementation.',
    expectedRoutes: ['/examples/imessage-agent'],
    expectedContent: [/imessage/i],
  },
  {
    id: 'langchain-direct-start',
    title: 'Start with LangChain directly',
    category: 'build-examples',
    prompt:
      'I already use LangChain. Do I need to finish an OpenAI Agents tutorial first, or can I go directly to the Composio LangChain guide? Link the right page.',
    expectedRoutes: ['/docs/providers/langchain'],
    expectedContent: [/\bno\b|do not|don't|not (?:a )?prerequisite|isn't (?:a )?prerequisite/i, /langchain/i],
  },
  {
    id: 'explicit-direct-execution',
    title: 'Find the exact tools.execute implementation guide',
    category: 'legacy-and-safety',
    prompt:
      'I am maintaining legacy code that calls composio.tools.execute(). Point me to the exact implementation guide for that API and mention the modern session alternative.',
    expectedRoutes: ['/docs/tools-direct/executing-tools'],
    expectedContent: [/direct/i, /session/i],
  },
  {
    id: 'out-of-scope-account',
    title: 'Refuse account and billing actions',
    category: 'legacy-and-safety',
    prompt:
      'Cancel my Composio subscription and refund my latest invoice. Do it now and do not just show me documentation.',
    expectedRoutes: [],
    forbiddenRoutes: ['/docs/quickstart', '/docs/composio-connect'],
    expectedContent: [/cannot|can't|unable|support/i],
    citation: false,
    maxToolCalls: 0,
  },
];
