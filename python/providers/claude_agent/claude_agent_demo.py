"""
Claude Agent SDK Demo.

This demo demonstrates how to use Composio tools with Claude Agent SDK.
It shows how to:
1. Initialize Composio with Claude Agent SDK provider
2. Fetch tools (Gmail Get Profile in this example)
3. Create an MCP server with the tools
4. Configure and use Claude Agent SDK client
"""

import asyncio
import os

from claude_agent_sdk import (
    ClaudeAgentOptions,
    ClaudeSDKClient,
    create_sdk_mcp_server,
)

from composio import Composio
from composio_claude_agent import ClaudeAgentSDKProvider
from dotenv import load_dotenv

ENV_FILE = (
    ".env"  # path to env file, where COMPOSIO_API_KEY and ANTHROPIC_API_KEY are stored
)
load_dotenv(ENV_FILE)


async def main():
    """
    Main demo function showing Claude Agent SDK integration with Composio.
    """
    # Initialize Composio with Claude Agent SDK provider
    # You can optionally provide an API key: Composio(api_key="your-key", provider=...)
    composio = Composio(provider=ClaudeAgentSDKProvider())

    # Get the Gmail Get Profile tool
    # Replace "default" with your actual user_id
    user_id = "default"
    tools = composio.tools.get(
        user_id=user_id,
        tools=["GMAIL_GET_PROFILE"],
    )

    print(f"✅ Fetched {len(tools)} tool(s):")
    for tool in tools:
        # SdkMcpTool uses .name instead of .slug
        tool_name = getattr(tool, "name", getattr(tool, "__name__", str(tool)))
        tool_desc = getattr(tool, "description", "No description available")
        print(f"   - {tool_name}: {tool_desc}")

    # Create MCP server with the decorated tools
    # This makes the Composio tools available to Claude Agent SDK
    mcp_server = create_sdk_mcp_server(
        name="composio_tools",
        version="1.0.0",
        tools=tools,
    )

    # Configure Claude Agent Options
    # The MCP server is registered with the name "composio"
    # Tools will be accessible as "mcp__composio__<tool_name>"
    options = ClaudeAgentOptions(
        system_prompt=(
            "You are a helpful assistant that can use Composio tools to interact "
            "with various services. When asked to get Gmail profile information, "
            "use the Gmail Get Profile tool."
        ),
        mcp_servers={"composio": mcp_server},
        allowed_tools=[f"mcp__composio__{tool.name}" for tool in tools],
        permission_mode="bypassPermissions",  # Auto-approve tool usage
    )

    # Run the Claude Agent SDK client
    print("\n🤖 Starting Claude Agent SDK session...")
    async with ClaudeSDKClient(options=options) as client:
        print("\n>>> Asking Claude Agent to get Gmail profile...")

        # Query Claude Agent to get Gmail profile
        await client.query("Get my Gmail profile using the Gmail Get Profile tool.")

        # Process and display responses
        print("\n📨 Claude Agent Responses:")
        print("-" * 60)
        async for message in client.receive_response():
            print(f"\n{message}")
        print("-" * 60)

    print("\n✅ Demo completed!")


if __name__ == "__main__":
    # Check if ANTHROPIC_API_KEY is set (required for Claude Agent SDK)
    if os.environ.get("COMPOSIO_API_KEY") is None:
        print("COMPOSIO_API_KEY is not set")
        # os.environ["COMPOSIO_API_KEY"] = "Your composio api key"
        raise Exception("COMPOSIO_API_KEY is not set")
    if os.environ.get("ANTHROPIC_API_KEY") is None:
        print("ANTHROPIC_API_KEY is not set")
        # os.environ["ANTHROPIC_API_KEY"] = "Your anthropic api key"
        raise Exception("ANTHROPIC_API_KEY is not set")

    # Run the async main function
    asyncio.run(main())
