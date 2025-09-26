from composio import Composio
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

composio = Composio()

mcp_config = composio.mcp.create(
    name="langchain-slack-mcp",
    toolkits=[{"toolkit": "slack", "auth_config_id": "<auth-config-id>"}],
)

mcp_server = mcp_config.generate(user_id='<user-id>')

client = MultiServerMCPClient(
    {
        "composio": {
            "url": mcp_server["url"],
            "transport": "streamable_http",
        }
    }
)

async def langchain_mcp(message: str):
    tools = await client.get_tools()
    agent = create_react_agent("openai:gpt-4.1", tools)
    response = await agent.ainvoke({"messages": message})
    return response

mcp_response = await langchain_mcp("Show me 20 most used slack channels")

