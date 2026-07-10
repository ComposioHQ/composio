<p align="center">
  <a href="https://composio.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://brand.composio.dev/logos/Logomark-White.svg">
      <img alt="Composio logo" src="https://brand.composio.dev/logos/Logomark-Black.svg" width="96">
    </picture>
  </a>
</p>

# Composio Python SDK

Composio gives your AI agents 1000+ pre-authenticated toolkits, per-user sessions, authentication, triggers, and a sandbox. This package is the Python SDK.

- [Documentation](https://docs.composio.dev)
- [Quickstart](https://docs.composio.dev/docs/quickstart)
- [Dashboard](https://dashboard.composio.dev) (grab your `COMPOSIO_API_KEY` from [Settings](https://dashboard.composio.dev/settings))

## Install

Requires Python 3.10+.

```bash
pip install composio
```

## Quickstart

Create a session for one of your users and hand its tools to your agent:

```python
from composio import Composio

composio = Composio()  # reads COMPOSIO_API_KEY, or pass api_key=...

session = composio.create(user_id="user_123")
tools = session.tools()  # OpenAI-format tool definitions by default
```

By default a session gets meta tools that discover, authenticate, and execute app tools at runtime, so you don't load hundreds of tool definitions into context. Store `session.session_id` and reuse the session across turns:

```python
session = composio.use(session_id)
```

See [how Composio works](https://docs.composio.dev/docs/how-composio-works) for sessions and meta tools, and [configuring sessions](https://docs.composio.dev/docs/configuring-sessions) for restricting `toolkits`, `tools`, `auth_configs`, and `connected_accounts` on `composio.create()`.

## Use with an agent framework

Provider packages adapt `session.tools()` to your framework's native tool format. With [OpenAI Agents](https://github.com/ComposioHQ/composio/tree/next/python/providers/openai_agents):

```bash
pip install composio composio-openai-agents openai-agents
```

```python
from composio import Composio
from composio_openai_agents import OpenAIAgentsProvider
from agents import Agent, Runner

composio = Composio(provider=OpenAIAgentsProvider())

session = composio.create(user_id="user_123")
tools = session.tools()

agent = Agent(
    name="Personal Assistant",
    instructions="You are a helpful assistant. Use Composio tools to take action.",
    tools=tools,
)

result = Runner.run_sync(starting_agent=agent, input="Summarize my emails from today")
print(result.final_output)
```

Other Python providers: [`composio-openai`](https://github.com/ComposioHQ/composio/tree/next/python/providers/openai), [`composio-anthropic`](https://github.com/ComposioHQ/composio/tree/next/python/providers/anthropic), [`composio-claude-agent-sdk`](https://github.com/ComposioHQ/composio/tree/next/python/providers/claude_agent_sdk), [`composio-langchain`](https://github.com/ComposioHQ/composio/tree/next/python/providers/langchain), [`composio-langgraph`](https://github.com/ComposioHQ/composio/tree/next/python/providers/langgraph), [`composio-llamaindex`](https://github.com/ComposioHQ/composio/tree/next/python/providers/llamaindex), [`composio-crewai`](https://github.com/ComposioHQ/composio/tree/next/python/providers/crewai), [`composio-autogen`](https://github.com/ComposioHQ/composio/tree/next/python/providers/autogen), [`composio-gemini`](https://github.com/ComposioHQ/composio/tree/next/python/providers/gemini), [`composio-google`](https://github.com/ComposioHQ/composio/tree/next/python/providers/google), [`composio-google-adk`](https://github.com/ComposioHQ/composio/tree/next/python/providers/google_adk). Don't see yours? [Build a custom provider](https://docs.composio.dev/docs/providers/custom-providers).

## MCP

Every session also exposes a hosted MCP endpoint. Pass `mcp=True` and point Claude, Cursor, or any MCP client at it:

```python
from composio import Composio

composio = Composio()

session = composio.create(user_id="user_123", mcp=True)
print(session.mcp.url)      # MCP endpoint for this session
print(session.mcp.headers)  # auth headers for the endpoint
```

See [sessions via MCP](https://docs.composio.dev/docs/sessions-via-mcp).

## Authentication

Sessions manage connections for you by default; the agent walks the user through OAuth with the session's meta tools. To drive the flow yourself, authorize a toolkit from the session:

```python
connection_request = session.authorize("gmail")
print(connection_request.redirect_url)  # send the user here to approve access
connection_request.wait_for_connection()
```

See [authentication](https://docs.composio.dev/docs/authentication) for auth configs, custom OAuth apps, and connection lifecycle.

## Triggers

Subscribe to events from connected apps (new email, new commit, and so on) and react to them:

```python
from composio import Composio

composio = Composio()

trigger = composio.triggers.create(
    slug="GITHUB_COMMIT_EVENT",
    user_id="user_123",
    trigger_config={"owner": "composiohq", "repo": "composio"},
)

subscription = composio.triggers.subscribe()

@subscription.handle(trigger_id=trigger.trigger_id)
def handle_event(data):
    print("Event received:", data)

subscription.wait_forever()
```

`subscribe()` streams events over a WebSocket for local development. In production, register a webhook URL and parse deliveries with `composio.triggers.parse()`. See [setting up triggers](https://docs.composio.dev/docs/setting-up-triggers/creating-triggers).

## Development

This package lives in the [Composio SDK monorepo](https://github.com/ComposioHQ/composio) under `python/`. See the [contribution guidelines](https://github.com/ComposioHQ/composio/blob/next/CONTRIBUTING.md) to get set up.

## Support

- [Documentation](https://docs.composio.dev)
- [Python SDK reference](https://docs.composio.dev/reference/sdk-reference/python)
- [Discord community](https://discord.gg/composio)
- [Open an issue](https://github.com/ComposioHQ/composio/issues)
- [support@composio.dev](mailto:support@composio.dev)
