import asyncio
import os
from dotenv import load_dotenv
from claude_agent_sdk.client import ClaudeSDKClient
from claude_agent_sdk.types import (
    ClaudeAgentOptions, 
    ResultMessage, 
    AssistantMessage, 
    TextBlock, 
    ToolUseBlock
)
from composio import Composio

# Load environment variables from .env file
load_dotenv()

# Initialize Composio and create a Tool Router session
composio = Composio(api_key=os.environ["COMPOSIO_API_KEY"])
user_id = "user_123"  # Your user's unique identifier
session = composio.create(user_id=user_id)

# Configure Claude with Composio MCP server
options = ClaudeAgentOptions(
    system_prompt=(
        "You are a helpful assistant with access to external tools. "
        "Always use the available tools to complete user requests instead of just explaining how to do them."
    ),
    mcp_servers={
        "composio": {
            "type": "http",
            "url": session.mcp.url,
            "headers": {"x-api-key": os.environ["COMPOSIO_API_KEY"]},
        }
    },
    permission_mode="bypassPermissions",
)


async def main():
    async with ClaudeSDKClient(options) as client:
        while True:
            user_input = input("You: ").strip()
            if user_input.lower() in ("quit", "exit"):
                break

            await client.query(user_input)
            async for msg in client.receive_response():
                if isinstance(msg, AssistantMessage):
                    for block in msg.content:
                        if isinstance(block, ToolUseBlock):
                            print(f"[Using tool: {block.name}]")
                        elif isinstance(block, TextBlock):
                            print(block.text, end="")
                elif isinstance(msg, ResultMessage) and msg.result:
                    print(f"\n{msg.result}\n")


if __name__ == "__main__":
    asyncio.run(main())