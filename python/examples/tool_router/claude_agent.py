import asyncio
import os

from claude_agent_sdk import ClaudeAgentOptions, query
from composio_claude_agent_sdk import ClaudeAgentSDKProvider

from composio import Composio

composio = Composio(provider=ClaudeAgentSDKProvider())
session = composio.create(
    # A user with a connected Gmail account (raises KeyError when unset)
    user_id=os.environ["COMPOSIO_EXAMPLES_USER_ID"],
    # mcp=True surfaces session.mcp on the returned type
    mcp=True,
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
