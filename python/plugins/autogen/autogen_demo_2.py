"""
Autogen demo using get_tools() approach.
"""

import os

import dotenv
from autogen import AssistantAgent, UserProxyAgent
from autogen_ext.models.openai import OpenAIChatCompletionClient

from composio_autogen import App, ComposioToolSet


def main():
    # Initialize toolset and get tools
    composio_toolset = ComposioToolSet()
    tools = composio_toolset.get_tools(apps=[App.GITHUB])

    model_client = OpenAIChatCompletionClient(
        model="gpt-4o",
    )
    # Create assistant agent with tools
    assistant = AssistantAgent(
        name="github_assistant",
        system_message=(
            "You are an AI assistant that helps with GitHub tasks. "
            "Use the provided tools to interact with GitHub."
        ),
        model_client=model_client,
        tools=tools,
    )

    # Create user proxy agent
    user_proxy = UserProxyAgent(
        name="user_proxy",
        human_input_mode="NEVER",
        code_execution_config={"work_dir": "coding"},
    )

    # Define task and initiate chat
    task = "Star the repository composiohq/composio on GitHub"
    user_proxy.initiate_chat(assistant, message=task)


if __name__ == "__main__":
    # Load environment variables from .env
    dotenv.load_dotenv()
    main()
