from composio import Composio
from claude_agent_sdk import query, ClaudeAgentOptions
import asyncio

composio = Composio()
session = composio.create(
    user_id="user_123",
)


async def main():
    options = ClaudeAgentOptions(
        system_prompt="You are an expert Python developer",
        permission_mode="bypassPermissions",
        mcp_servers={"composio": session.mcp},
    )

    async for message in query(
        prompt="Fetch my last email and summarize it.", options=options
    ):
        print(message)


asyncio.run(main())
