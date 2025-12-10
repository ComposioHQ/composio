"""
Langchain demo.
"""

from composio_langchain import LangchainProvider
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI

from composio import Composio


openai_client = ChatOpenAI(model="gpt-5")


def main():
    composio = Composio(provider=LangchainProvider())

    # Get All the tools
    tools = composio.tools.get(user_id="default", toolkits=["GITHUB"])

    # Define task
    task = "Star a repo composiohq/composio on GitHub"

    # Define agent
    agent = create_agent(
        model=openai_client, tools=tools, system_prompt="intelligent composio agent"
    )

    # Execute task
    result = agent.invoke({"messages": [{"role": "user", "content": task}]})

    print(result)


if __name__ == "__main__":
    main()
