from composio import Composio
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.agents import create_agent
from langchain_openai.chat_models import ChatOpenAI
import os
import asyncio

composio = Composio()
session = composio.experimental.create(
    user_id="user_123",
)


async def main():
    try:
        mcp_client = MultiServerMCPClient(
            {
                "composio": {
                    "transport": "streamable_http",
                    "url": session.mcp.url,
                    "headers": {
                        "x-api-key": os.getenv("COMPOSIO_API_KEY"),
                    },
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
    except Exception as e:
        print(e)


if __name__ == "__main__":
    asyncio.run(main())
