"""
Autogen demo using get_tools() approach.
"""

import asyncio
import os

import dotenv
from autogen_agentchat.agents import AssistantAgent
from autogen_core import CancellationToken
from autogen_ext.models.openai import OpenAIChatCompletionClient

from composio_autogen import App, ComposioToolSet


async def main():
    # Initialize toolset and get tools
    composio_toolset = ComposioToolSet()
    tools = composio_toolset.get_tools(apps=[App.GITHUB])

    model_client = OpenAIChatCompletionClient(
        model="gpt-4",
        api_key=os.environ["OPENAI_API_KEY"],
    )
    # Create assistant agent with tools
    assistant = AssistantAgent(
        name="github_assistant",
        system_message=(
            "You are an AI assistant that helps with GitHub tasks. "
            "Use the provided tools to interact with GitHub."
        ),
        model_client=model_client,
        tools=list(tools),
    )

    # Define task and initiate chat
    task = "Star the repository composiohq/composio on GitHub"
    result = await assistant.run(task=task, cancellation_token=CancellationToken())
    print(result)


if __name__ == "__main__":
    # Load environment variables from .env
    dotenv.load_dotenv()
    asyncio.run(main())
