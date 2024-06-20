import dotenv
from composio_llamaindex import Action, ComposioToolSet  # pylint: disable=import-error
from llama_index.core.agent import (  # pylint: disable=import-error
    FunctionCallingAgentWorker,
)
from llama_index.core.llms import ChatMessage  # pylint: disable=import-error
from llama_index.llms.openai import OpenAI  # pylint: disable=import-error


# Load environment variables from .env
dotenv.load_dotenv()

llm = OpenAI(model="gpt-4o")


def main():
    # Get All the tools
    composio_toolset = ComposioToolSet()
    tools = composio_toolset.get_actions(
        actions=[Action.GITHUB_ACTIVITY_STAR_REPO_FOR_AUTHENTICATED_USER]
    )

    prefix_messages = [
        ChatMessage(
            role="system",
            content=(
                "You are now a integration agent, and what  ever you are requested, you will try to execute utilizing your toools."
            ),
        )
    ]

    agent = FunctionCallingAgentWorker(
        tools=tools,
        llm=llm,
        prefix_messages=prefix_messages,
        max_function_calls=10,
        allow_parallel_tool_calls=False,
        verbose=True,
    ).as_agent()

    response = agent.chat("Hello! I would like to star a repo SamparkAI/docs on GitHub")
    print("Response:", response)


if __name__ == "__main__":
    main()
