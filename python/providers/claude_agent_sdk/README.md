# composio-claude-agent-sdk

Adapts Composio tools to the [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/python), exposing them to Claude through an in-process MCP server.

## Installation

```bash
pip install composio composio-claude-agent-sdk claude-agent-sdk
```

The Claude Agent SDK also requires the Claude Code CLI: `npm install -g @anthropic-ai/claude-code`.

Set `COMPOSIO_API_KEY` (from the [dashboard](https://dashboard.composio.dev/settings)) and `ANTHROPIC_API_KEY` in your environment.

## Quickstart

```python
import asyncio

from composio import Composio
from composio_claude_agent_sdk import ClaudeAgentSDKProvider
from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    TextBlock,
    create_sdk_mcp_server,
    query,
)

composio = Composio(provider=ClaudeAgentSDKProvider())

# Each session is scoped to one of your users
session = composio.create(user_id="user_123")
tools = session.tools()

server = create_sdk_mcp_server(name="composio", version="1.0.0", tools=tools)


async def main():
    options = ClaudeAgentOptions(
        system_prompt="You are a helpful assistant. Use tools to complete tasks.",
        permission_mode="bypassPermissions",
        mcp_servers={"composio": server},
    )
    async for message in query(prompt="Summarize my emails from today", options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    print(block.text)


asyncio.run(main())
```

For multi-turn use, store `session.session_id` and reuse it with `composio.use(session_id)` instead of calling `create()` again.

## How tools are exposed

`session.tools()` returns `SdkMcpTool` objects that plug straight into `create_sdk_mcp_server`. The provider also ships `composio.provider.create_mcp_server(tools)` if you prefer a preconfigured server (name `composio`, customizable via `ClaudeAgentSDKProvider(server_name=..., server_version=...)`).

## Links

- [Quickstart](https://docs.composio.dev/docs/quickstart)
- [Composio documentation](https://docs.composio.dev)
