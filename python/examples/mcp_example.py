import asyncio
import os

from composio import SESSION_PRESET_DIRECT_TOOLS, Composio
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

composio = Composio()

# Slack auth config and user id (raise KeyError when unset)
slack_auth_config_id = os.environ["COMPOSIO_EXAMPLES_SLACK_AUTH_CONFIG_ID"]
user_id = os.environ["COMPOSIO_EXAMPLES_USER_ID"]


async def langchain_mcp(message: str):
    session = composio.sessions.create(
        user_id=user_id,
        auth_configs={"slack": slack_auth_config_id},
        toolkits=["slack"],
        tools={
            "slack": {"enable": ["SLACK_LIST_ALL_CHANNELS", "SLACK_SEARCH_MESSAGES"]}
        },
        session_preset=SESSION_PRESET_DIRECT_TOOLS,
        mcp=True,
    )
    try:
        client = MultiServerMCPClient(
            {
                "composio": {
                    "url": session.mcp.url,
                    "transport": "streamable_http",
                    "headers": {
                        name: value
                        for name, value in (session.mcp.headers or {}).items()
                        if value is not None
                    },
                }
            }
        )
        tools = await client.get_tools()
        agent = create_react_agent("openai:gpt-4.1", tools)
        return await agent.ainvoke({"messages": message})
    finally:
        session.delete()


mcp_response = asyncio.run(langchain_mcp("Show me 20 most used slack channels"))
