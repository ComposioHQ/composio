import os

import dotenv
from autogen import AssistantAgent, LLMConfig, UserProxyAgent
from composio_ag2 import AG2Provider

from composio import Composio

# Load environment variables from .env
dotenv.load_dotenv()


def is_termination_msg(content: dict) -> bool:
    """Check if a message contains termination message."""
    return "TERMINATE" in (content.get("content", "") or "")


def main() -> None:
    # Initialize tools.
    config_value = os.environ.get("OAI_CONFIG_LIST", "").strip()
    if config_value:
        if os.path.exists(config_value):
            llm_config = LLMConfig.from_json(path=config_value)
        elif config_value.startswith("[") or config_value.startswith("{"):
            llm_config = LLMConfig.from_json(env="OAI_CONFIG_LIST")
        else:
            raise ValueError(
                "OAI_CONFIG_LIST must be a JSON string or a path to a JSON file."
            )
    else:
        if "OPENAI_API_KEY" not in os.environ:
            raise ValueError(
                "Set OPENAI_API_KEY or provide OAI_CONFIG_LIST as a JSON string or file path."
            )
        llm_config = LLMConfig(
            {
                "model": "gpt-5",
                "api_key": os.environ["OPENAI_API_KEY"],
                "api_type": "openai",
            }
        )

    assistant = AssistantAgent(
        "assistant",
        system_message=(
            "You have access to tools. Use the tools to complete the task. "
            "Reply TERMINATE when the task is done or when user's content is empty."
        ),
        llm_config=llm_config,
    )

    # Create a user proxy agent
    user_proxy = UserProxyAgent(
        "user_proxy",
        is_termination_msg=is_termination_msg,
        human_input_mode="NEVER",
        code_execution_config={"use_docker": False},
    )

    # Get composio tools
    composio = Composio(provider=AG2Provider())
    tools = composio.tools.get(user_id="default", toolkits=["GITHUB"])

    # Register the preferred Applications, with right executor.
    composio.provider.register_tools(
        caller=assistant,
        executor=user_proxy,
        tools=tools,
    )

    # Define task.
    task = "Star a repo composiohq/composio on GitHub"

    # Execute task.
    user_proxy.initiate_chat(assistant, message=task, max_turns=3)


if __name__ == "__main__":
    main()
