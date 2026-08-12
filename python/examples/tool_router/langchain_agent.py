import asyncio
import os

from langchain.agents import create_agent
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_openai.chat_models import ChatOpenAI

from composio import Composio

composio = Composio()
session = composio.create(
    # A user with a connected Gmail account (raises KeyError when unset)
    user_id=os.environ["COMPOSIO_EXAMPLES_USER_ID"],
    # mcp=True surfaces session.mcp on the returned type
    mcp=True,
)


async def main():
    mcp_client = MultiServerMCPClient(
        {
            "composio": {
                "transport": "streamable_http",
                "url": session.mcp.url,
                "headers": session.mcp.headers,
            }
        }
    )

    tools = await mcp_client.get_tools()

    agent = create_agent(
        tools=tools,
        model=ChatOpenAI(model="gpt-4o"),
    )

    result = await agent.ainvoke(
        {
            "messages": [
                {"role": "user", "content": "Fetch my last email and summarize?"}
            ]
        }
    )

    print(result)


if __name__ == "__main__":
    asyncio.run(main())
