import { TOOLKIT_COUNT_LABEL } from '@/lib/toolkit-count';
import { PROVIDERS } from '@/lib/providers';

export const revalidate = false;

/** Curated routing map; the exhaustive catalog lives at /llms-index.txt. */
export function GET() {
  // Keep the concise map focused; all adapters remain on the providers page.
  const providerGuides = PROVIDERS['ai-sdks']
    .filter(provider => provider.name === 'OpenAI' || provider.name === 'Anthropic')
    .map(provider => `- [${provider.name}](https://docs.composio.dev${provider.href}.md)`)
    .join('\n');
  return new Response(`# Composio Documentation

> Connect users to ${TOOLKIT_COUNT_LABEL} apps. Use Composio for auth with your own tools, or add tool discovery and execution to an agent.

Use Composio Platform when users or tenants connect accounts to your application. Use Composio For You for personal automation with your own accounts. Use the current session SDK. REST v3.1 is current; REST v3.0 is legacy.

## Search documentation via MCP

- [Documentation search MCP](https://mcp.docs.composio.dev/mcp): Prefer this for SDK signatures, REST APIs, sessions, and authentication implementation.
- [Website search MCP](https://mcp.composio.dev/mcp): Search product pages and articles.

Both servers use Streamable HTTP and expose a \`search\` tool with a \`query\` string. They provide public, read-only search without a Composio login or connected-app access. Use search to discover sources, then fetch the cited canonical Markdown pages for exact code and parameters.

For connected-app execution, [Composio Connect](https://connect.composio.dev/mcp) requires authentication and consent. Applications can instead create a [per-user session MCP endpoint](https://docs.composio.dev/docs/sessions-via-mcp.md) with their configured authentication and tool permissions.

## Before you implement

Inspect the project's framework, agent architecture, authentication, and user or tenant identity model. Explain where Composio fits. If the intended workflow is unclear, ask what the user wants their application or agent to accomplish with connected apps before making changes.

Load and follow the official [Composio Agent Skill](https://github.com/ComposioHQ/composio/blob/next/skills/composio/SKILL.md) for setup guidance and implementation patterns. If it is missing, install it for the project with \`npx skills add ComposioHQ/composio --skill composio\`, requesting approval if your host requires it. If skills are unsupported or installation fails, use the documentation linked below and report that fallback.

If unclear, distinguish application integration from connecting apps to the coding agent. Fetch Markdown below; use the complete index for other guides.

## Choose your path

- [Platform or For You](https://docs.composio.dev/docs.md): Choose between building an application and using your own connected apps.
- [Set up a coding agent](https://docs.composio.dev/docs/agent-setup.md): Install the Composio skill to add Composio to an existing project.
- [Auth for your own tools](https://docs.composio.dev/docs/authentication/managed-auth-for-custom-tools.md): Per-user OAuth with Connect Link + Proxy Execute. Keep your backend or MCP tools; receive responses, not tokens.
- [SDK quickstart](https://docs.composio.dev/docs/quickstart.md): Install Python or TypeScript packages, create a session, and run an agent.
- [Authenticate an unattended agent](https://docs.composio.dev/docs/agent-setup/unattended-authentication.md): When no human is available, use \`composio login --agent\`, configure a project API key, and verify a live tool call. Human account access still requires authorization.
- [Native agent plugins](https://docs.composio.dev/docs/agent-plugins.md): Use your own apps from Codex or Claude Code.
- [Connect an MCP client](https://docs.composio.dev/docs/composio-connect.md): Connect an existing client to your apps over MCP.

## Build an application

- [Sessions](https://docs.composio.dev/docs/sessions.md): Understand users, sessions, toolkits, and tool execution.
- [Authentication](https://docs.composio.dev/docs/authentication.md): Distinguish auth configs from connected accounts and connect your application's users.
- [B2B agents](https://docs.composio.dev/docs/b2b-agents.md): Tenant/member connection ownership and authorization.
- [Token custody](https://docs.composio.dev/docs/security/token-custody.md): Credentials, user isolation, redaction, BYOC, customer-managed keys.
- [Proxy Execute](https://docs.composio.dev/docs/extending-sessions/proxy-execute.md): Call provider endpoints that tools don't cover without retrieving the token.
- [Restrict tool access](https://docs.composio.dev/docs/sessions/tool-access.md): Select allowed toolkits, tools, tags, and approval rules.
- [SDKs and frameworks](https://docs.composio.dev/docs/providers.md): Choose a framework provider.
- [Sessions via MCP](https://docs.composio.dev/docs/sessions-via-mcp.md): Give an application-created session to an MCP-compatible framework.
- [Single-toolkit MCP](https://docs.composio.dev/docs/single-toolkit-mcp.md): Build an MCP server scoped to one toolkit.
- [Troubleshooting](https://docs.composio.dev/kb.md): Diagnose authentication, connection, and execution failures.
- [Production rate limits](https://docs.composio.dev/reference/rate-limits.md): Plan for request limits before deployment.

## Provider guides

${providerGuides}

## Session SDK reference

- [TypeScript session creation and reuse](https://docs.composio.dev/reference/sdk-reference/typescript/sessions.md): Look up the exact \`sessions.create()\` and \`sessions.use()\` signatures.
- [TypeScript Session methods and results](https://docs.composio.dev/reference/sdk-reference/typescript/session.md): Look up \`tools()\`, \`search()\`, \`execute()\`, \`update()\`, and returned properties.
- [Python Session methods and results](https://docs.composio.dev/reference/sdk-reference/python/session.md): Look up Python argument names, return types, and examples.
- [Update a session](https://docs.composio.dev/docs/sessions/updating-sessions.md): Patch session configuration and resolve update conflicts.

Fetch these Markdown pages directly for exact call shapes; search-result summaries may omit code. Use the installed package's version-matched reference when it differs from the current website.

## API Reference (v3.1, current)

- [Current REST API](https://docs.composio.dev/reference.md): Use the current base URL and browse endpoint groups.

## API Reference (v3.0, legacy)

- [Legacy REST API](https://docs.composio.dev/reference/v3.md): Maintain existing v3.0 integrations. Use v3.1 for new code.

## Optional

- [Changelog](https://docs.composio.dev/docs/changelog.md): Find dated release notes and read what changed.

- [Complete documentation index](https://docs.composio.dev/llms-index.txt): All guides, SDK references, endpoint groups, and toolkit pages, with legacy routes labeled.
- [Knowledge Base](https://docs.composio.dev/kb.md): Find support answers and toolkit-specific troubleshooting.
- [Examples](https://docs.composio.dev/examples.md): Browse complete application examples.
- [Full documentation](https://docs.composio.dev/llms-full.txt): Load all current page bodies when individual pages are insufficient.
`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
