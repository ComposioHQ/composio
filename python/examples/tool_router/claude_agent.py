from composio import Composio
from claude_agent_sdk import query, ClaudeAgentOptions
import asyncio
import os

composio = Composio()
session = composio.experimental.create(
    user_id="user_123",
)


async def main():
    options = ClaudeAgentOptions(
        system_prompt="You are an expert Python developer",
        permission_mode="bypassPermissions",
        mcp_servers={
            "composio": {
                "type": "http",
                "url": session.mcp.url,
                "headers": {
                    "x-api-key": os.getenv("COMPOSIO_API_KEY"),
                },
            }
        },
    )

    async for message in query(
        prompt="Fetch my last email and summarize it.", options=options
    ):
        print(message)


asyncio.run(main())
