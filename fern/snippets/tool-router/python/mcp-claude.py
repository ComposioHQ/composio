import asyncio
import os
from dotenv import load_dotenv
from claude_agent_sdk.client import ClaudeSDKClient
from claude_agent_sdk.types import ClaudeAgentOptions, AssistantMessage, TextBlock, ToolUseBlock
from composio import Composio

load_dotenv()

# Initialize Composio and create a Tool Router session
composio = Composio(api_key=os.environ["COMPOSIO_API_KEY"])
user_id = "user_123"  # Your user's unique identifier
session = composio.create(user_id=user_id)

# Configure Claude with Composio MCP server
options = ClaudeAgentOptions(
    system_prompt=("You are a helpful assistant with access to external tools. "
                   "Always use the available tools to complete user requests."),
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
    print("Starting Claude agent with Composio Tool Router...\n")
    
    async with ClaudeSDKClient(options) as client:
        # Initial task
        query = ("Fetch all open issues from the composio/composio GitHub repository "
                 "and create a Google Sheet with issue number, title, labels, and author")
        
        print(f"Task: {query}\n")
        print("Claude: ", end="")
        
        await client.query(query)
        async for msg in client.receive_response():
            if isinstance(msg, AssistantMessage):
                for block in msg.content:
                    if isinstance(block, ToolUseBlock):
                        print(f"\n[🔧 Using tool: {block.name}]")
                    elif isinstance(block, TextBlock):
                        print(block.text, end="")
        print("\n")
        
        # If authentication is needed, Claude will provide a link
        # You can paste it back or type 'quit' to exit
        user_input = input("\nYou (confirm connection or new task or quit): ").strip()
        
        if user_input.lower() not in ("quit", "exit") and user_input:
            await client.query(user_input)
            print("\nClaude: ", end="")
            async for msg in client.receive_response():
                if isinstance(msg, AssistantMessage):
                    for block in msg.content:
                        if isinstance(block, TextBlock):
                            print(block.text, end="")
            print()


if __name__ == "__main__":
    asyncio.run(main())