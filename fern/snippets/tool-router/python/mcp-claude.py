import asyncio
from dotenv import load_dotenv
from claude_agent_sdk.client import ClaudeSDKClient
from claude_agent_sdk.types import (
    ClaudeAgentOptions,
    AssistantMessage,
    TextBlock,
    ToolUseBlock,
)
from composio import Composio

load_dotenv()

# Initialize Composio (API key from env var COMPOSIO_API_KEY or pass explicitly)
composio = Composio()

# Unique identifier of the user
user_id = "user_123"
# Create a tool router session for the user
session = composio.create(user_id=user_id)

# Configure Claude with Composio MCP server
options = ClaudeAgentOptions(
    system_prompt=(
        "You are a helpful assistant with access to external tools. "
        "Always use the available tools to complete user requests."
    ),
    mcp_servers={
        "composio": {
            "type": "http",
            "url": session.mcp.url,
            "headers": session.mcp.headers,  # Authentication headers for the Composio MCP server
        }
    },
    permission_mode="bypassPermissions",  # Auto-approve tools (demo only)
)

async def main():
    print("""
What task would you like me to help you with?
I can use tools like Gmail, GitHub, Linear, Notion, and more.
(Type 'exit' to exit)
Example tasks:
  • 'Summarize my emails from today'
  • 'List all open issues on the composio github repository and create a notion page with the issues'
""")

    async with ClaudeSDKClient(options) as client:
        # Multi-turn conversation with agentic tool calling
        while True:
            user_input = input("\nYou: ").strip()
            if user_input.lower() == "exit":
                break
            
            print("\nClaude: ", end="", flush=True)
            try:
                await client.query(user_input)
                async for msg in client.receive_response():
                    if isinstance(msg, AssistantMessage):
                        for block in msg.content:
                            if isinstance(block, ToolUseBlock):
                                print(f"\n[Using tool: {block.name}]", end="")
                            elif isinstance(block, TextBlock):
                                print(block.text, end="", flush=True)
            except Exception as e:
                print(f"\n[Error]: {e}")

if __name__ == "__main__":
    asyncio.run(main())