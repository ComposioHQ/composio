# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "composio>=0.17.1",
#     "langchain[mcp]>=1.4,<2",
#     "langchain-openai",
# ]
# ///
"""Read a public Hacker News profile through a Composio MCP session.

Set COMPOSIO_API_KEY, OPENAI_API_KEY, and COMPOSIO_EXAMPLES_USER_ID, then run
from the repository root:
    uv run --script python/examples/tool_router/langchain_agent.py

The script declares its dependencies so it runs independently of the SDK's
development environment. LangChain's MCPAdapter API is currently in beta.
"""

import asyncio
import os

from composio import Composio, SESSION_PRESET_DIRECT_TOOLS
from fastmcp.client.transports import StreamableHttpTransport
from langchain.agents import create_agent
from langchain.mcp import MCPAdapter
from langchain_openai import ChatOpenAI


async def main():
    composio = Composio(api_key=os.environ["COMPOSIO_API_KEY"])
    session = composio.create(
        user_id=os.environ["COMPOSIO_EXAMPLES_USER_ID"],
        toolkits=["hackernews"],
        tools={"hackernews": {"enable": ["HACKERNEWS_GET_USER"]}},
        session_preset=SESSION_PRESET_DIRECT_TOOLS,
        mcp=True,
    )
    try:
        transport = StreamableHttpTransport(
            url=session.mcp.url,
            headers=session.mcp.headers,
        )
        async with MCPAdapter(transport) as adapter:
            tools = await adapter.list_tools()
            agent = create_agent(
                model=ChatOpenAI(model="gpt-5.2"),
                tools=tools,
            )
            result = await agent.ainvoke(
                {
                    "messages": [
                        {
                            "role": "user",
                            "content": (
                                "Look up the Hacker News user pg with the available tool. "
                                "Report their current karma and summarize their bio if present. "
                                "Include https://news.ycombinator.com/user?id=pg as the source. "
                                "If the lookup fails, report the error instead of guessing."
                            ),
                        }
                    ]
                }
            )
            print(result["messages"][-1].content)
    finally:
        session.delete()


if __name__ == "__main__":
    asyncio.run(main())
