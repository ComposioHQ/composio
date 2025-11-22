"""
Langchain demo.
"""

from composio_langchain import LangchainProvider
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI

from composio import Composio

# Initialize tools.
openai_client = ChatOpenAI(model="gpt-4o")


def main():
    composio = Composio(provider=LangchainProvider())

    # Get All the tools
    tools = composio.tools.get(user_id="default", toolkits=["GITHUB"])

    # Define task
    task = "Star a repo composiohq/composio on GitHub"

    # Define agent
    agent = create_agent(
        model=openai_client,
        tools=tools,
        system_prompt="You are a helpful assistant.",
        name="GitHub Agent",
    )

    # Execute using agent
    agent.invoke({"messages": [{"role": "user", "content": task}]})


if __name__ == "__main__":
    main()
