import os

import dotenv
from autogen import AssistantAgent, UserProxyAgent

from composio_autogen import App, ComposioToolSet


# Load environment variables from .env
dotenv.load_dotenv()


# Initialize tools.
chatbot = AssistantAgent(
    "chatbot",
    system_message="Reply TERMINATE when the task is done or when user's content is empty",
    llm_config={
        "config_list": [
            {"model": "gpt-4-turbo", "api_key": os.environ["OPENAI_API_KEY"]},
        ]
    },
)


def is_termination_msg(content: dict) -> bool:
    """Check if a message contains termination message."""
    return "TERMINATE" in (content.get("content", "") or "")


def main():
    composio_toolset = ComposioToolSet()
    # Create a user proxy agent
    user_proxy = UserProxyAgent(
        "user_proxy",
        is_termination_msg=is_termination_msg,
        human_input_mode="NEVER",
        code_execution_config={"use_docker": False},
    )

    # Register the preferred Applications, with right executor.
    composio_toolset.register_tools(
        apps=[App.GITHUB], caller=chatbot, executor=user_proxy
    )

    # Define task.
    task = "Star a repo composiohq/composio on GitHub"

    # Execute task.
    response = user_proxy.initiate_chat(chatbot, message=task)

    # Print response
    print(response.chat_history)


if __name__ == "__main__":
    main()
