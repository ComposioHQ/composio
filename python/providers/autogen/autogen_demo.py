import os

import dotenv
from autogen import AssistantAgent, UserProxyAgent
from composio_autogen import AutogenProvider

from composio import Composio

# Load environment variables from .env
dotenv.load_dotenv()


def is_termination_msg(content: dict) -> bool:
    """Check if a message contains termination message."""
    return "TERMINATE" in (content.get("content", "") or "")


def main():
    # Initialize tools.
    chatbot = AssistantAgent(
        "chatbot",
        system_message="Reply TERMINATE when the task is done or when user's content is empty",
        llm_config={
            "config_list": [
                {"model": "gpt-5", "api_key": os.environ["OPENAI_API_KEY"]},
            ]
        },
    )

    # Create a user proxy agent
    user_proxy = UserProxyAgent(
        "user_proxy",
        is_termination_msg=is_termination_msg,
        human_input_mode="NEVER",
        code_execution_config={"use_docker": False},
    )

    # Get composio tools
    composio = Composio(provider=AutogenProvider())
    tools = composio.tools.get(user_id="default", toolkits=["GITHUB"])

    # Register the preferred Applications, with right executor.
    composio.provider.register_tools(
        caller=chatbot,
        executor=user_proxy,
        tools=tools,
    )

    # Define task.
    task = "Star a repo composiohq/composio on GitHub"

    # Execute task.
    response = user_proxy.initiate_chat(chatbot, message=task)

    # Print response
    print(response.chat_history)


if __name__ == "__main__":
    main()
