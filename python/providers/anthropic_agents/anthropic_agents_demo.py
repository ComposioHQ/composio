"""
Anthropic Agents SDK demo with Composio tools.
"""

import asyncio
import os

from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient, create_sdk_mcp_server

from composio import Composio
from composio_anthropic_agents import AnthropicAgentsProvider


async def main():
    """
    Demonstrate how to use Composio tools inside the Claude Agents SDK.
    """
    # Ensure the required environment variables are present
    if not os.getenv("COMPOSIO_API_KEY"):
        raise RuntimeError("COMPOSIO_API_KEY env var is required.")
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise RuntimeError("ANTHROPIC_API_KEY env var is required.")

    sdk = Composio(provider=AnthropicAgentsProvider())

    # Fetch Composio tools – this example scopes to GitHub actions.
    composio_tools = sdk.tools.get(
        user_id="default",
        toolkits=["GITHUB"],
    )

    # Wrap the tools in an in-process MCP server for Claude Agents.
    composio_server = create_sdk_mcp_server(
        name="composio",
        tools=composio_tools,
    )

    options = ClaudeAgentOptions(
        allowed_tools=[tool.name for tool in composio_tools],
        mcp_servers={"composio": composio_server},
        permission_mode="acceptEdits",
    )

    client = ClaudeSDKClient()

    async with client.connect(options=options) as session:
        async for event in session.send_and_iter_responses(
            prompt="Star the repository composiohq/composio on GitHub."
        ):
            print(event)


if __name__ == "__main__":
    asyncio.run(main())

