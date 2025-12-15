# Execute AI tasks with Claude using Composio Tool Router

import asyncio
from claude_agent_sdk.client import ClaudeSDKClient
from claude_agent_sdk.types import ClaudeAgentOptions
from composio import Composio
import os

# Initialize Composio and create a Tool Router session
composio = Composio(api_key=os.environ["COMPOSIO_API_KEY"])
user_id = "user_123"  # Your user's unique identifier
session = composio.create(user_id=user_id)

# Configure Claude with Composio MCP server
options = ClaudeAgentOptions(
    system_prompt="You are a helpful assistant with access to external tools. Always use the available tools to complete user requests instead of just explaining how to do them.",
    mcp_servers={
        "composio": {
            "type": "http",
            "url": session.mcp.url,
            "headers": {"x-api-key": os.environ["COMPOSIO_API_KEY"]},
        }
    },
    permission_mode="bypassPermissions",
)


async def execute_task(task: str):
    """Execute a single task using Claude with MCP tools"""
    async with ClaudeSDKClient(options) as client:
        # Send the task to Claude
        await client.query(task)
        
        # Collect the complete response
        response = ""
        async for msg in client.receive_response():
            if hasattr(msg, 'message'):
                for block in msg.message.content:
                    if block.type == "text":
                        response += block.text
        
        return response


# Example usage
async def main():
    # Execute a task that requires tools
    result = await execute_task(
        "Get the top story from Hacker News and summarize it"
    )
    print(result)
    
    # Execute another task
    result = await execute_task(
        "Create a GitHub issue in composio/composio repo about improving documentation"
    )
    print(result)


if __name__ == "__main__":
    asyncio.run(main())