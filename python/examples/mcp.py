from composio import Composio
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent
from langchain_openai import OpenAI
import asyncio

composio = Composio()

import random
import string

def random_string(length=8):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

random_name = f"test{random_string()}"
random_user_id = random_string(10)

mcp_config = composio.mcp.create(
    name=random_name,
    toolkits=[{"toolkit": "slack", "auth_config_id": "ac_wEPhC-hweiUj"}],
)

mcp_server = mcp_config.generate(user_id=random_user_id)

client = MultiServerMCPClient(
    {
        "composio": {
            # Make sure you start your weather server on port 8000
            "url": mcp_server["url"],
            "transport": "streamable_http",
        }
    }
)

async def langchain_mcp():
    tools = await client.get_tools()
    print("tools", tools)
    agent = create_react_agent("openai:gpt-4.1", tools)
    print("agent", agent)
    response = await agent.ainvoke({"messages": "Show me 20 most used slack channels"})
    print("response", response)
    return response

x = langchain_mcp()