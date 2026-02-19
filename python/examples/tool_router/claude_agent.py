import asyncio

from claude_agent_sdk import ClaudeAgentOptions, query
from composio_claude_agent_sdk import ClaudeAgentSDKProvider

from composio import Composio

composio = Composio(provider=ClaudeAgentSDKProvider())
session = composio.create(
    user_id="user_123",
)


async def main():
    options = ClaudeAgentOptions(
        system_prompt="You are an expert Python developer",
        permission_mode="bypassPermissions",
        mcp_servers={
            "composio": {
                "type": session.mcp.type,
                "url": session.mcp.url,
                "headers": session.mcp.headers,
            }
        },
    )

    async for message in query(
        prompt="Fetch my last email and summarize it.", options=options
    ):
        print(message)


asyncio.run(main())
