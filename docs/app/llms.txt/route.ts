import { TOOLKIT_COUNT_LABEL } from '@/lib/toolkit-count';

export const revalidate = false;

/** Curated routing map; the exhaustive catalog lives at /llms-index.txt. */
export function GET() {
  return new Response(`# Composio Documentation

> Build and operate agents with authentication, tool discovery, execution, and ${TOOLKIT_COUNT_LABEL} toolkits.

Use Platform to build Composio into your application. Use For You to connect your own apps to an existing agent. Start with the current session-based SDK. REST v3.1 is current; REST v3.0 is legacy and is not the starting point for new code.

## Choose your path

- [Platform or For You](https://docs.composio.dev/docs.md): Choose between building an application and using your own connected apps.
- [Set up a coding agent](https://docs.composio.dev/docs/agent-setup.md): Install the Composio skill to add Composio to an existing project.
- [SDK quickstart](https://docs.composio.dev/docs/quickstart.md): Install Python or TypeScript packages, create a session, and run an agent.
- [Native agent plugins](https://docs.composio.dev/docs/agent-plugins.md): Use your own apps from Codex or Claude Code.
- [Connect an MCP client](https://docs.composio.dev/docs/composio-connect.md): Connect an existing client to your apps over MCP.

## Build an application

- [Core concepts](https://docs.composio.dev/docs/how-composio-works.md): Understand users, sessions, toolkits, and tool execution.
- [Authentication](https://docs.composio.dev/docs/authentication.md): Distinguish auth configs from connected accounts and connect your application's users.
- [Configure sessions](https://docs.composio.dev/docs/configuring-sessions.md): Select toolkits, auth configs, and connected accounts for a user.
- [SDKs and frameworks](https://docs.composio.dev/docs/providers.md): Choose the provider for your agent framework.
- [Sessions via MCP](https://docs.composio.dev/docs/sessions-via-mcp.md): Give an application-created session to an MCP-compatible framework.
- [Single-toolkit MCP](https://docs.composio.dev/docs/single-toolkit-mcp.md): Build an MCP server scoped to one toolkit.
- [Troubleshooting](https://docs.composio.dev/kb.md): Diagnose authentication, connection, and execution failures.
- [Production rate limits](https://docs.composio.dev/reference/rate-limits.md): Plan for request limits before deployment.

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
