import asyncio
import os
import time

from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

from composio import Composio

composio = Composio()

# Slack auth config and user id (raise KeyError when unset)
slack_auth_config_id = os.environ["COMPOSIO_EXAMPLES_SLACK_AUTH_CONFIG_ID"]
user_id = os.environ["COMPOSIO_EXAMPLES_USER_ID"]

mcp_config = composio.mcp.create(
    # Named `examples-<label>-<unix-seconds>` so the provisioning script's --gc
    # can tell this throwaway config from one created by hand. The API caps
    # this name at 30 characters, so the label stays short.
    name=f"examples-lc-slack-{int(time.time())}",
    toolkits=[{"toolkit": "slack", "auth_config_id": slack_auth_config_id}],
    # Keep the exposed tool list small; LLM providers cap tools per request
    allowed_tools=["SLACK_LIST_ALL_CHANNELS", "SLACK_SEARCH_MESSAGES"],
)

mcp_server = mcp_config.generate(user_id=user_id)  # type: ignore[call-arg]  # generate is typed as a bare Callable; runtime accepts the user_id keyword

client = MultiServerMCPClient(
    {
        "composio": {
            "url": mcp_server["url"],
            "transport": "streamable_http",
            # The MCP endpoint authenticates with your Composio API key
            "headers": {"x-api-key": os.environ["COMPOSIO_API_KEY"]},
        }
    }
)


async def langchain_mcp(message: str):
    tools = await client.get_tools()
    agent = create_react_agent("openai:gpt-4.1", tools)
    response = await agent.ainvoke({"messages": message})
    return response


mcp_response = asyncio.run(langchain_mcp("Show me 20 most used slack channels"))
